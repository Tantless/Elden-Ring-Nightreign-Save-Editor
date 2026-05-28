const { createHash } = require('node:crypto')
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const {
  createPreviewManifestReport,
  parseArgs,
  resolveOutputPath,
  writePreviewManifest
} = require('./preview-manifest.cjs')

const VERSION = '4.6.6'
const ARTIFACT_BASE = `Nightreign-Save-Editor-Electron-${VERSION}-win-x64`

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeFile(path, value = 'x') {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, value, 'utf8')
}

function previewPolicy() {
  return {
    electronRelease: {
      channel: 'preview',
      defaultArtifact: false,
      promotedVersion: null,
      keepLegacyArtifacts: true
    }
  }
}

function defaultPolicy() {
  return {
    electronRelease: {
      channel: 'default',
      defaultArtifact: true,
      promotedVersion: VERSION,
      keepLegacyArtifacts: true
    }
  }
}

function createFixture(policy = previewPolicy(), omitted = new Set()) {
  const frontendRoot = mkdtempSync(join(tmpdir(), 'nightreign-preview-manifest-'))
  writeJson(join(frontendRoot, 'package.json'), { version: VERSION })
  writeJson(join(frontendRoot, 'release-policy.json'), policy)

  const files = {
    [`release/${ARTIFACT_BASE}.exe`]: 'installer',
    [`release/${ARTIFACT_BASE}.exe.blockmap`]: 'blockmap',
    [`release/${ARTIFACT_BASE}.zip`]: 'zip',
    'release/win-unpacked/Nightreign Save Editor.exe': 'app',
    'release/win-unpacked/resources/python/NightreignElectronBridge.exe': 'sidecar'
  }
  for (const [relativePath, value] of Object.entries(files)) {
    if (!omitted.has(relativePath)) {
      writeFile(join(frontendRoot, relativePath), value)
    }
  }

  return frontendRoot
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function main() {
  const cases = []

  const parsed = parseArgs(['--write', '--output', 'release/custom-manifest.json'])
  assert(parsed.write === true, '--write should enable writing')
  assert(parsed.outputPath === 'release/custom-manifest.json', '--output should capture path')
  cases.push({ name: 'argument parsing', ok: true })

  const preview = createFixture()
  try {
    const report = await createPreviewManifestReport({
      frontendRoot: preview,
      generatedAt: '2026-05-28T00:00:00.000Z'
    })
    assert(report.ok === true, 'preview manifest should pass with preview artifacts')
    assert(report.version === VERSION, 'manifest should include package version')
    assert(report.resolvedPolicy.artifactName === 'Nightreign_Save_Editor_Electron_WIN64_Preview', 'manifest should use preview artifact name')
    assert(report.publishArtifacts.length === 3, 'manifest should publish installer, blockmap, and zip')
    const installer = report.artifacts.find((artifact) => artifact.label === 'Windows installer')
    assert(installer.sha256 === sha256('installer'), 'manifest should hash artifacts')

    const outputPath = resolveOutputPath(preview, 'release/electron-preview-manifest.json')
    const writeReport = { ...report, manifestPath: outputPath }
    const written = writePreviewManifest(preview, 'release/electron-preview-manifest.json', writeReport)
    const parsedManifest = JSON.parse(readFileSync(written, 'utf8'))
    assert(parsedManifest.ok === true, 'written manifest should be parseable')
    assert(parsedManifest.manifestPath === outputPath, 'written manifest should include output path')
    cases.push({ name: 'valid preview manifest', ok: true })
  } finally {
    rmSync(preview, { recursive: true, force: true })
  }

  const missingArtifact = createFixture(previewPolicy(), new Set([`release/${ARTIFACT_BASE}.zip`]))
  try {
    const report = await createPreviewManifestReport({ frontendRoot: missingArtifact })
    assert(report.ok === false, 'manifest should fail when a preview artifact is missing')
    assert(report.failures.some((failure) => failure.includes('.zip')), 'manifest should report missing zip')
    cases.push({ name: 'missing artifact fails', ok: true })
  } finally {
    rmSync(missingArtifact, { recursive: true, force: true })
  }

  const defaultRelease = createFixture(defaultPolicy())
  try {
    const report = await createPreviewManifestReport({ frontendRoot: defaultRelease })
    assert(report.ok === false, 'preview manifest should reject default policy')
    assert(report.failures.some((failure) => failure.includes('channel="preview"')), 'manifest should require preview policy')
    cases.push({ name: 'default policy fails', ok: true })
  } finally {
    rmSync(defaultRelease, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
