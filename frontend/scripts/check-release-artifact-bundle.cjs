const { createReadStream, existsSync, readdirSync, readFileSync, statSync } = require('node:fs')
const { basename, join, resolve } = require('node:path')
const { createHash } = require('node:crypto')
const { readPackageVersion } = require('./release-policy.cjs')

const MANIFEST_NAME = 'electron-preview-manifest.json'

function parseArgs(argv) {
  const args = [...argv]
  let artifactDir = null
  while (args.length > 0) {
    const current = args.shift()
    if (!artifactDir) {
      artifactDir = current
      continue
    }
    throw new Error(`Unexpected argument: ${current}`)
  }
  return { artifactDir }
}

function walkFiles(root) {
  if (!existsSync(root)) {
    return []
  }
  const entries = readdirSync(root, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(path))
    } else if (entry.isFile()) {
      files.push(path)
    }
  }
  return files
}

function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolveHash(hash.digest('hex')))
  })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readLegacyArtifactNames(repoRoot) {
  const workflowPath = join(repoRoot, '.github', 'workflows', 'main.yml')
  if (!existsSync(workflowPath)) {
    return []
  }
  const workflowText = readFileSync(workflowPath, 'utf8')
  return [...workflowText.matchAll(/^\s*artifact:\s*([A-Za-z0-9_.-]+)\s*$/gm)]
    .map((match) => match[1])
    .filter((name) => !name.includes('Electron'))
}

function findUniqueByBasename(files, name, failures, label) {
  const matches = files.filter((file) => basename(file) === name)
  if (matches.length === 0) {
    failures.push(`${label} missing from release artifact bundle: ${name}`)
    return null
  }
  if (matches.length > 1) {
    failures.push(`${label} appears more than once in release artifact bundle: ${name}`)
    return null
  }
  return matches[0]
}

function findLegacyArtifact(files, artifactName, failures) {
  const matches = files.filter((file) => basename(file).startsWith(artifactName))
  if (matches.length === 0) {
    failures.push(`Legacy artifact missing from release artifact bundle: ${artifactName}`)
    return null
  }
  return {
    artifactName,
    files: matches.map((file) => ({
      path: file,
      name: basename(file),
      size: statSync(file).size
    }))
  }
}

async function verifyElectronArtifact(files, artifact, failures) {
  const name = basename(artifact.relativePath)
  const path = findUniqueByBasename(files, name, failures, artifact.label)
  if (!path) {
    return {
      label: artifact.label,
      name,
      ok: false,
      path: null,
      expectedSize: artifact.size,
      actualSize: 0,
      expectedSha256: artifact.sha256,
      actualSha256: null
    }
  }

  const actualSize = statSync(path).size
  const actualSha256 = await sha256File(path)
  const ok = actualSize === artifact.size && actualSha256 === artifact.sha256
  if (!ok) {
    failures.push(`${artifact.label} size or SHA-256 mismatch in release artifact bundle: ${name}`)
  }
  return {
    label: artifact.label,
    name,
    ok,
    path,
    expectedSize: artifact.size,
    actualSize,
    expectedSha256: artifact.sha256,
    actualSha256
  }
}

async function createPublicationBundleReport({
  repoRoot,
  frontendRoot = join(repoRoot, 'frontend'),
  artifactDir,
  generatedAt = new Date().toISOString()
}) {
  const failures = []
  const version = readPackageVersion(frontendRoot)
  const resolvedArtifactDir = resolve(artifactDir || join(repoRoot, 'artifacts'))
  const files = walkFiles(resolvedArtifactDir)

  if (files.length === 0) {
    failures.push(`Release artifact bundle is missing or empty: ${resolvedArtifactDir}`)
  }

  const manifestPath = findUniqueByBasename(files, MANIFEST_NAME, failures, 'Electron preview manifest')
  let manifest = null
  if (manifestPath) {
    try {
      manifest = readJson(manifestPath)
    } catch (error) {
      failures.push(`Electron preview manifest is invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (manifest) {
    if (manifest.kind !== 'nightreign-electron-preview-manifest') {
      failures.push('Electron preview manifest has an unexpected kind.')
    }
    if (manifest.version !== version) {
      failures.push(`Electron preview manifest version ${manifest.version} does not match package version ${version}.`)
    }
    if (manifest.resolvedPolicy?.channel !== 'preview') {
      failures.push('Electron preview manifest must resolve to preview channel.')
    }
    if (manifest.publication?.defaultPublicPathChanged !== false) {
      failures.push('Electron preview manifest must prove the default public path was not changed.')
    }
  }

  const publishArtifacts = Array.isArray(manifest?.publishArtifacts) ? manifest.publishArtifacts : []
  if (manifest && publishArtifacts.length === 0) {
    failures.push('Electron preview manifest does not list publishArtifacts.')
  }
  const electronArtifacts = []
  for (const artifact of publishArtifacts) {
    electronArtifacts.push(await verifyElectronArtifact(files, artifact, failures))
  }

  const legacyArtifactNames = readLegacyArtifactNames(repoRoot)
  if (legacyArtifactNames.length === 0) {
    failures.push('No legacy artifact names found in .github/workflows/main.yml.')
  }
  const legacyArtifacts = legacyArtifactNames
    .map((artifactName) => findLegacyArtifact(files, artifactName, failures))
    .filter(Boolean)

  return {
    ok: failures.length === 0,
    schemaVersion: 1,
    kind: 'nightreign-release-artifact-bundle',
    generatedAt,
    version,
    artifactDir: resolvedArtifactDir,
    fileCount: files.length,
    manifestPath,
    electronPreview: {
      artifactUploadName: manifest?.publication?.artifactUploadName ?? null,
      defaultPublicPathChanged: manifest?.publication?.defaultPublicPathChanged ?? null,
      publishArtifacts: electronArtifacts
    },
    legacyArtifacts,
    failures
  }
}

async function main() {
  const { artifactDir } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const repoRoot = resolve(frontendRoot, '..')
  const report = await createPublicationBundleReport({ repoRoot, frontendRoot, artifactDir })
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

module.exports = {
  MANIFEST_NAME,
  createPublicationBundleReport,
  parseArgs,
  readLegacyArtifactNames
}
