const { createHash } = require('node:crypto')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { basename, join } = require('node:path')
const { tmpdir } = require('node:os')
const {
  createPublicationBundleReport,
  parseArgs,
  readLegacyArtifactNames
} = require('./check-release-artifact-bundle.cjs')

const VERSION = '4.6.6'
const ELECTRON_EXE = `Nightreign-Save-Editor-Electron-${VERSION}-win-x64.exe`
const ELECTRON_BLOCKMAP = `${ELECTRON_EXE}.blockmap`
const ELECTRON_ZIP = `Nightreign-Save-Editor-Electron-${VERSION}-win-x64.zip`
const LEGACY_ARTIFACTS = [
  'Nightreign_Relic_Editor_WIN64',
  'Nightreign_Relic_Editor_WIN64_Onedir',
  'Nightreign_Relic_Editor_WIN32',
  'Nightreign_Relic_Editor_LINUX_x86_64',
  'Nightreign_Relic_Editor_MAC-Silicon',
  'Nightreign_Relic_Editor_MAC-Intel'
]

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeFile(path, value = 'x') {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, value, 'utf8')
}

function manifestArtifact(relativePath, value, label) {
  return {
    label,
    relativePath,
    publish: true,
    exists: true,
    size: Buffer.byteLength(value),
    sha256: sha256(value)
  }
}

function previewManifest(overrides = {}) {
  const artifacts = [
    manifestArtifact(`release/${ELECTRON_EXE}`, 'installer', 'Windows installer'),
    manifestArtifact(`release/${ELECTRON_BLOCKMAP}`, 'blockmap', 'Windows installer blockmap'),
    manifestArtifact(`release/${ELECTRON_ZIP}`, 'zip', 'Windows portable zip')
  ]
  return {
    ok: true,
    schemaVersion: 1,
    kind: 'nightreign-electron-preview-manifest',
    generatedAt: '2026-05-28T00:00:00.000Z',
    version: VERSION,
    resolvedPolicy: {
      channel: 'preview',
      artifactName: 'Nightreign_Save_Editor_Electron_WIN64_Preview'
    },
    publication: {
      artifactUploadName: 'Nightreign_Save_Editor_Electron_WIN64_Preview',
      defaultPublicPathChanged: false,
      draftReleaseArtifactPattern: './artifacts/*'
    },
    artifacts,
    publishArtifacts: artifacts,
    failures: [],
    ...overrides
  }
}

function createFixture({ omitElectron = null, omitLegacy = null, manifestOverrides = {} } = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'nightreign-release-bundle-'))
  const frontendRoot = join(repoRoot, 'frontend')
  const artifactDir = join(repoRoot, 'artifacts')
  mkdirSync(join(repoRoot, '.github', 'workflows'), { recursive: true })
  mkdirSync(frontendRoot, { recursive: true })
  mkdirSync(artifactDir, { recursive: true })
  writeJson(join(frontendRoot, 'package.json'), { version: VERSION })
  writeFile(
    join(repoRoot, '.github', 'workflows', 'main.yml'),
    LEGACY_ARTIFACTS.map((artifact) => `artifact: ${artifact}`).join('\n')
  )

  const electronFiles = {
    [ELECTRON_EXE]: 'installer',
    [ELECTRON_BLOCKMAP]: 'blockmap',
    [ELECTRON_ZIP]: 'zip'
  }
  for (const [name, value] of Object.entries(electronFiles)) {
    if (name !== omitElectron) {
      writeFile(join(artifactDir, 'electron', name), value)
    }
  }

  for (const artifact of LEGACY_ARTIFACTS) {
    if (artifact !== omitLegacy) {
      const extension = artifact.includes('LINUX') ? '' : '.zip'
      writeFile(join(artifactDir, `${artifact}${extension}`), artifact)
    }
  }

  writeJson(join(artifactDir, 'electron-preview-manifest.json'), previewManifest(manifestOverrides))
  return { repoRoot, frontendRoot, artifactDir }
}

async function main() {
  const cases = []

  const parsed = parseArgs(['./artifacts'])
  assert(parsed.artifactDir === './artifacts', 'parseArgs should accept artifact directory')
  try {
    parseArgs(['./artifacts', './other'])
    throw new Error('extra artifact dirs should fail')
  } catch (error) {
    assert(String(error.message).includes('Unexpected argument'), 'extra args should fail explicitly')
  }
  cases.push({ name: 'argument parsing', ok: true })

  const valid = createFixture()
  try {
    const names = readLegacyArtifactNames(valid.repoRoot)
    assert(names.length === LEGACY_ARTIFACTS.length, 'should read legacy artifact names from workflow')
    const report = await createPublicationBundleReport({
      repoRoot: valid.repoRoot,
      frontendRoot: valid.frontendRoot,
      artifactDir: valid.artifactDir,
      generatedAt: '2026-05-28T00:00:00.000Z'
    })
    assert(report.ok === true, 'valid release artifact bundle should pass')
    assert(report.electronPreview.publishArtifacts.length === 3, 'bundle should verify all Electron publish artifacts')
    assert(report.electronPreview.publishArtifacts.every((artifact) => artifact.ok), 'all Electron hashes should pass')
    assert(report.legacyArtifacts.length === LEGACY_ARTIFACTS.length, 'bundle should include every legacy artifact')
    cases.push({ name: 'valid release artifact bundle', ok: true })
  } finally {
    rmSync(valid.repoRoot, { recursive: true, force: true })
  }

  const missingElectron = createFixture({ omitElectron: ELECTRON_ZIP })
  try {
    const report = await createPublicationBundleReport({
      repoRoot: missingElectron.repoRoot,
      frontendRoot: missingElectron.frontendRoot,
      artifactDir: missingElectron.artifactDir
    })
    assert(report.ok === false, 'bundle should fail when Electron zip is missing')
    assert(
      report.failures.some((failure) => failure.includes(basename(ELECTRON_ZIP))),
      'bundle should report missing Electron zip'
    )
    cases.push({ name: 'missing Electron artifact fails', ok: true })
  } finally {
    rmSync(missingElectron.repoRoot, { recursive: true, force: true })
  }

  const missingLegacy = createFixture({ omitLegacy: 'Nightreign_Relic_Editor_MAC-Intel' })
  try {
    const report = await createPublicationBundleReport({
      repoRoot: missingLegacy.repoRoot,
      frontendRoot: missingLegacy.frontendRoot,
      artifactDir: missingLegacy.artifactDir
    })
    assert(report.ok === false, 'bundle should fail when legacy artifact is missing')
    assert(
      report.failures.some((failure) => failure.includes('Nightreign_Relic_Editor_MAC-Intel')),
      'bundle should report missing legacy artifact'
    )
    cases.push({ name: 'missing legacy artifact fails', ok: true })
  } finally {
    rmSync(missingLegacy.repoRoot, { recursive: true, force: true })
  }

  const defaultChanged = createFixture({
    manifestOverrides: {
      publication: {
        artifactUploadName: 'Nightreign_Save_Editor_Electron_WIN64_Preview',
        defaultPublicPathChanged: true,
        draftReleaseArtifactPattern: './artifacts/*'
      }
    }
  })
  try {
    const report = await createPublicationBundleReport({
      repoRoot: defaultChanged.repoRoot,
      frontendRoot: defaultChanged.frontendRoot,
      artifactDir: defaultChanged.artifactDir
    })
    assert(report.ok === false, 'bundle should fail if preview manifest changed the default path')
    assert(
      report.failures.some((failure) => failure.includes('default public path')),
      'bundle should report default public path changes'
    )
    cases.push({ name: 'default path change fails', ok: true })
  } finally {
    rmSync(defaultChanged.repoRoot, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
