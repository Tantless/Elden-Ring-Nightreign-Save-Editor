const { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { dirname, isAbsolute, join, resolve } = require('node:path')
const {
  readPackageVersion,
  readReleasePolicyState,
  resolveReleasePolicyState
} = require('./release-policy.cjs')

const DEFAULT_MANIFEST_PATH = 'release/electron-preview-manifest.json'

function parseArgs(argv) {
  let write = false
  let outputPath = DEFAULT_MANIFEST_PATH
  const args = [...argv]

  while (args.length > 0) {
    const current = args.shift()
    if (current === '--write') {
      write = true
      continue
    }
    if (current === '--output') {
      const value = args.shift()
      if (!value) {
        throw new Error('--output requires a path')
      }
      outputPath = value
      continue
    }
    throw new Error(`Unexpected argument: ${current}`)
  }

  return { write, outputPath }
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

function artifactSpecs(version) {
  const artifactBase = `Nightreign-Save-Editor-Electron-${version}-win-x64`
  return [
    {
      label: 'Windows installer',
      relativePath: `release/${artifactBase}.exe`,
      publish: true
    },
    {
      label: 'Windows installer blockmap',
      relativePath: `release/${artifactBase}.exe.blockmap`,
      publish: true
    },
    {
      label: 'Windows portable zip',
      relativePath: `release/${artifactBase}.zip`,
      publish: true
    },
    {
      label: 'Unpacked app executable',
      relativePath: 'release/win-unpacked/Nightreign Save Editor.exe',
      publish: false
    },
    {
      label: 'Packaged Python sidecar',
      relativePath: 'release/win-unpacked/resources/python/NightreignElectronBridge.exe',
      publish: false
    }
  ]
}

async function artifactState(frontendRoot, spec, failures) {
  const absolutePath = join(frontendRoot, spec.relativePath)
  const exists = existsSync(absolutePath)
  const size = exists ? statSync(absolutePath).size : 0
  const ok = exists && size > 0
  if (!ok) {
    failures.push(`${spec.label} missing or empty: ${spec.relativePath}`)
  }

  return {
    ...spec,
    exists,
    size,
    sha256: ok ? await sha256File(absolutePath) : null
  }
}

async function createPreviewManifestReport({ frontendRoot, generatedAt = new Date().toISOString() }) {
  const failures = []
  const version = readPackageVersion(frontendRoot)
  const releasePolicy = readReleasePolicyState(frontendRoot, version)
  let resolvedPolicy = null

  if (!releasePolicy.valid) {
    failures.push(...releasePolicy.errors.map((error) => `Invalid release policy: ${error}`))
  } else {
    resolvedPolicy = resolveReleasePolicyState(releasePolicy)
    if (resolvedPolicy.channel !== 'preview') {
      failures.push('Preview manifest requires release-policy.json channel="preview".')
    }
  }

  const artifacts = []
  for (const spec of artifactSpecs(version)) {
    artifacts.push(await artifactState(frontendRoot, spec, failures))
  }

  const publishArtifacts = artifacts.filter((artifact) => artifact.publish)
  return {
    ok: failures.length === 0,
    schemaVersion: 1,
    kind: 'nightreign-electron-preview-manifest',
    generatedAt,
    version,
    releasePolicy,
    resolvedPolicy,
    publication: {
      artifactUploadName: resolvedPolicy?.artifactName ?? null,
      defaultPublicPathChanged: resolvedPolicy?.channel === 'default',
      draftReleaseArtifactPattern: './artifacts/*'
    },
    artifacts,
    publishArtifacts,
    failures
  }
}

function resolveOutputPath(frontendRoot, outputPath) {
  return isAbsolute(outputPath) ? outputPath : join(frontendRoot, outputPath)
}

function writePreviewManifest(frontendRoot, outputPath, report) {
  const absolutePath = resolveOutputPath(frontendRoot, outputPath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return absolutePath
}

async function main() {
  const { write, outputPath } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const report = await createPreviewManifestReport({ frontendRoot })

  if (write && report.ok) {
    const manifestPath = resolveOutputPath(frontendRoot, outputPath)
    report.manifestPath = manifestPath
    writePreviewManifest(frontendRoot, outputPath, report)
  }

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
  DEFAULT_MANIFEST_PATH,
  artifactSpecs,
  createPreviewManifestReport,
  parseArgs,
  resolveOutputPath,
  writePreviewManifest
}
