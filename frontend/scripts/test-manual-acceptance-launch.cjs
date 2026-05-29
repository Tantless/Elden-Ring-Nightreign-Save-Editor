const { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { createAcceptanceReportTemplate } = require('./manual-acceptance-report.cjs')
const {
  createManualAcceptanceLaunchPlan,
  launchManualAcceptanceApp,
  parseArgs
} = require('./manual-acceptance-launch.cjs')

const VERSION = '4.6.6'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function sourceMetadata(path) {
  const state = statSync(path)
  return {
    path,
    size: state.size,
    lastWriteTime: state.mtime.toISOString()
  }
}

function createFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'nightreign-acceptance-launch-'))
  const frontendRoot = join(repoRoot, 'frontend')
  const sourcePath = join(repoRoot, 'source.sl2')
  const copiedPath = join(frontendRoot, 'manual-acceptance', 'copy.sl2')
  const appPath = join(frontendRoot, 'release', 'win-unpacked', 'Nightreign Save Editor.exe')
  mkdirSync(join(frontendRoot, 'manual-acceptance'), { recursive: true })
  mkdirSync(join(appPath, '..'), { recursive: true })
  writeJson(join(frontendRoot, 'package.json'), { version: VERSION })
  writeFileSync(sourcePath, 'source-save-data', 'utf8')
  const timestamp = new Date('2026-05-27T14:56:14.000Z')
  utimesSync(sourcePath, timestamp, timestamp)
  copyFileSync(sourcePath, copiedPath)
  utimesSync(copiedPath, timestamp, timestamp)
  writeFileSync(appPath, 'app', 'utf8')

  const source = sourceMetadata(sourcePath)
  const report = createAcceptanceReportTemplate(VERSION, { exists: true, ...source })
  report.copiedSavePath = copiedPath
  report.automation = {
    acceptanceHandoff: true,
    verifyRelease: true,
    releaseCheckPreview: true,
    migrationAudit: true,
    promotionDryRun: true
  }
  const reportPath = join(frontendRoot, 'acceptance-report.json')
  writeJson(reportPath, report)
  return { appPath, copiedPath, frontendRoot, reportPath, repoRoot, source }
}

function main() {
  const cases = []

  const parsed = parseArgs(['--dry-run', '--report', 'report.json', '--app', 'app.exe'])
  assert(parsed.dryRun === true, '--dry-run should be captured')
  assert(parsed.reportPath === 'report.json', '--report should be captured')
  assert(parsed.appPath === 'app.exe', '--app should be captured')
  try {
    parseArgs(['--report'])
    throw new Error('missing report path should fail')
  } catch (error) {
    assert(String(error.message).includes('--report requires a path'), 'missing report path should be explicit')
  }
  cases.push({ name: 'argument parsing', ok: true })

  const fixture = createFixture()
  try {
    const plan = createManualAcceptanceLaunchPlan({
      frontendRoot: fixture.frontendRoot,
      version: VERSION,
      reportPath: fixture.reportPath,
      appPath: fixture.appPath
    })
    assert(plan.ok === true, 'launch plan should be ok')
    assert(plan.state === 'ready-for-human-acceptance', 'launch plan should require a ready report')
    assert(plan.copiedSavePath === fixture.copiedPath, 'launch plan should use copied save')
    assert(plan.sourceSave.path === fixture.source.path, 'launch plan should include source evidence')
    assert(plan.env.NIGHTREIGN_ELECTRON_WORK_DIR.includes('python-work'), 'launch plan should isolate Python work dir')
    assert(plan.env.NIGHTREIGN_ELECTRON_SMOKE_USER_DATA.includes('electron-user-data'), 'launch plan should isolate Electron userData')
    assert(plan.env.NIGHTREIGN_ELECTRON_SMOKE_OPEN_SAVE === fixture.copiedPath, 'open dialog guard should point at copied save')
    assert(plan.nextCheck.id === 'save-open-restore-character', 'launch plan should expose next manual check')
    assert(plan.commands.launch.includes('acceptance:launch'), 'launch plan should expose launch command')

    const dryRun = launchManualAcceptanceApp(plan, { dryRun: true })
    assert(dryRun.launched === false, 'dry run should not launch the app')
    assert(dryRun.pid === null, 'dry run should not assign a pid')
    cases.push({ name: 'launch plan dry run', ok: true })

    try {
      createManualAcceptanceLaunchPlan({
        frontendRoot: fixture.frontendRoot,
        version: VERSION,
        reportPath: fixture.reportPath,
        appPath: join(fixture.frontendRoot, 'missing.exe')
      })
      throw new Error('missing app should fail')
    } catch (error) {
      assert(String(error.message).includes('Packaged Electron app not found'), 'missing app should be explicit')
    }
    cases.push({ name: 'missing packaged app fails', ok: true })
  } finally {
    rmSync(fixture.repoRoot, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
