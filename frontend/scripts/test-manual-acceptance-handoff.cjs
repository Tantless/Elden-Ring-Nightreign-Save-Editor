const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const {
  createManualAcceptanceHandoffReport,
  manualAcceptanceChecks,
  parseArgs,
  sourceSaveState
} = require('./manual-acceptance-handoff.cjs')

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

function createFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'nightreign-acceptance-handoff-'))
  const frontendRoot = join(repoRoot, 'frontend')
  const savePath = join(repoRoot, 'copied-real-save.sl2')
  mkdirSync(join(frontendRoot, 'scripts'), { recursive: true })
  writeJson(join(frontendRoot, 'package.json'), { version: VERSION })
  writeJson(join(frontendRoot, 'release-policy.json'), {
    electronRelease: {
      channel: 'preview',
      defaultArtifact: false,
      promotedVersion: null,
      keepLegacyArtifacts: true
    }
  })
  writeFile(
    join(repoRoot, '.github', 'workflows', 'main.yml'),
    [
      'electron-preview:',
      'release:',
      '  steps:',
      '    - uses: actions/download-artifact@v8',
      '      with:',
      '        merge-multiple: true',
      '    - uses: softprops/action-gh-release@v2',
      '      with:',
      '        files: ./artifacts/*'
    ].join('\n')
  )
  for (const relativePath of [
    `release/${ARTIFACT_BASE}.exe`,
    `release/${ARTIFACT_BASE}.exe.blockmap`,
    `release/${ARTIFACT_BASE}.zip`,
    'release/electron-preview-manifest.json',
    'release/win-unpacked/Nightreign Save Editor.exe',
    'release/win-unpacked/resources/python/NightreignElectronBridge.exe'
  ]) {
    writeFile(join(frontendRoot, relativePath), 'artifact')
  }
  writeFile(savePath, 'save-data')
  return { repoRoot, frontendRoot, savePath }
}

function main() {
  const cases = []

  const parsed = parseArgs(['C:\\save\\NR0000.sl2'])
  assert(parsed.savePath === 'C:\\save\\NR0000.sl2', 'parseArgs should accept a save path')
  try {
    parseArgs(['one.sl2', 'two.sl2'])
    throw new Error('extra save paths should fail')
  } catch (error) {
    assert(String(error.message).includes('Unexpected argument'), 'extra args should fail explicitly')
  }
  cases.push({ name: 'argument parsing', ok: true })

  const missingSave = sourceSaveState(null)
  assert(missingSave.exists === false, 'missing save should not be accepted')
  assert(missingSave.reason.includes('Pass a real save path'), 'missing save should explain how to run handoff')
  cases.push({ name: 'missing save state', ok: true })

  const checks = manualAcceptanceChecks()
  assert(checks.length >= 10, 'handoff should cover all expected manual workflows')
  assert(checks.some((item) => item.id === 'relic-batch-utilities'), 'handoff should cover relic batch utilities')
  assert(checks.some((item) => item.id === 'replace-character'), 'handoff should cover replace-character flow')
  cases.push({ name: 'manual acceptance checklist coverage', ok: true })

  const fixture = createFixture()
  try {
    const report = createManualAcceptanceHandoffReport({
      frontendRoot: fixture.frontendRoot,
      repoRoot: fixture.repoRoot,
      savePath: fixture.savePath
    })
    assert(report.ok === true, 'handoff should pass with preview artifacts and copied real save')
    assert(report.sourceSave.exists === true, 'handoff should record source save metadata')
    assert(report.releasePolicy.channel === 'preview', 'handoff should report preview policy')
    assert(report.resolvedPolicy.artifactName === 'Nightreign_Save_Editor_Electron_WIN64_Preview', 'handoff should resolve preview artifact name')
    assert(report.artifacts.every((item) => item.exists && item.size > 0), 'handoff should report all preview artifacts')
    assert(report.releaseWiring.draftReleaseUploadsArtifacts === true, 'handoff should report draft release artifact wiring')
    assert(
      report.automationPrerequisites.some((item) => item.includes('verify:release')),
      'handoff should include release verification prerequisite'
    )
    assert(
      report.automationPrerequisites.some((item) => item.includes('release:preview-manifest')),
      'handoff should include preview manifest prerequisite'
    )
    assert(
      report.completionRule.includes('current source save size and lastWriteTime'),
      'handoff should require source-save immutability'
    )
    cases.push({ name: 'acceptance handoff with copied real save', ok: true })
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  }

  const fixtureWithoutSave = createFixture()
  try {
    const report = createManualAcceptanceHandoffReport({
      frontendRoot: fixtureWithoutSave.frontendRoot,
      repoRoot: fixtureWithoutSave.repoRoot,
      savePath: join(fixtureWithoutSave.repoRoot, 'missing.sl2')
    })
    assert(report.ok === false, 'handoff should fail if copied real save is missing')
    cases.push({ name: 'missing copied real save blocks handoff', ok: true })
  } finally {
    rmSync(fixtureWithoutSave.repoRoot, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
