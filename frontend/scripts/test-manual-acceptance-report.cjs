const {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { manualAcceptanceChecks } = require('./manual-acceptance-handoff.cjs')
const {
  applyAcceptanceReportMarks,
  createAcceptanceReportTemplate,
  createAcceptanceReportStatus,
  parseArgs,
  readAcceptancePreflightState,
  readAcceptanceReportState,
  validateAcceptancePreflight,
  validateAcceptanceReport,
  writeAcceptanceReportTemplate
} = require('./manual-acceptance-report.cjs')

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

function createSourceSave(root, name = 'source.sl2') {
  const path = join(root, name)
  writeFileSync(path, 'source-save-data', 'utf8')
  const timestamp = new Date('2026-05-27T14:56:14.000Z')
  utimesSync(path, timestamp, timestamp)
  return sourceMetadata(path)
}

function createCopiedSave(root, source, name = 'copied.sl2') {
  const path = join(root, name)
  copyFileSync(source.path, path)
  const timestamp = new Date(source.lastWriteTime)
  utimesSync(path, timestamp, timestamp)
  return sourceMetadata(path)
}

function validReport(source = {
  path: 'C:\\Users\\Tantless\\AppData\\Roaming\\Nightreign\\76561198323907504\\NR0000.sl2',
  size: 19531312,
  lastWriteTime: '2026-05-27T14:56:14.174Z'
}, overrides = {}) {
  const before = source
  return {
    version: VERSION,
    accepted: true,
    reviewer: 'tantless',
    completedAt: '2026-05-28T12:00:00.000Z',
    copiedSavePath: 'C:\\Temp\\nightreign-acceptance\\input.sl2',
    sourceSave: {
      before,
      after: { ...before }
    },
    automation: {
      acceptanceHandoff: true,
      verifyRelease: true,
      releaseCheckPreview: true,
      migrationAudit: true,
      promotionDryRun: true
    },
    checks: manualAcceptanceChecks().map((item) => ({
      id: item.id,
      status: 'pass',
      notes: 'passed'
    })),
    notes: '',
    ...overrides
  }
}

function main() {
  const cases = []
  const reportRoot = mkdtempSync(join(tmpdir(), 'nightreign-acceptance-report-source-'))
  const source = createSourceSave(reportRoot)

  try {
    const parsedTemplate = parseArgs(['--template'])
    assert(parsedTemplate.mode === 'template', '--template should select template mode')
    const parsedReport = parseArgs(['--check', '--report', 'acceptance.json'])
    assert(parsedReport.mode === 'check', '--check should select check mode')
    assert(parsedReport.reportPath === 'acceptance.json', '--report should capture path')
    const parsedPreflight = parseArgs(['--preflight'])
    assert(parsedPreflight.mode === 'preflight', '--preflight should select preflight mode')
    const parsedStatus = parseArgs(['--status'])
    assert(parsedStatus.mode === 'status', '--status should select status mode')
    const parsedMark = parseArgs([
      '--mark',
      '--mark-pass',
      'save-open-restore-character',
      '--reviewer',
      'tantless',
      '--check-notes',
      'manual pass'
    ])
    assert(parsedMark.mode === 'mark', '--mark should select mark mode')
    assert(parsedMark.markPassIds[0] === 'save-open-restore-character', '--mark-pass should capture check id')
    assert(parsedMark.reviewer === 'tantless', '--reviewer should capture reviewer')
    assert(parsedMark.checkNotes === 'manual pass', '--check-notes should capture notes')
    const parsedInit = parseArgs([
      '--template',
      '--write',
      '--force',
      '--source-save',
      'source.sl2',
      '--report',
      'acceptance-report.json'
    ])
    assert(parsedInit.mode === 'template', 'template init should stay in template mode')
    assert(parsedInit.write === true, '--write should be captured')
    assert(parsedInit.force === true, '--force should be captured')
    assert(parsedInit.sourceSavePath === 'source.sl2', '--source-save should capture path')
    try {
      parseArgs(['--report'])
      throw new Error('missing report path should fail')
    } catch (error) {
      assert(String(error.message).includes('--report requires a path'), 'missing report path should be explicit')
    }
    cases.push({ name: 'argument parsing', ok: true })

    const template = createAcceptanceReportTemplate(VERSION)
    assert(template.version === VERSION, 'template should use current version')
    assert(template.accepted === false, 'template should not mark acceptance complete')
    assert(template.checks.length === manualAcceptanceChecks().length, 'template should include all manual checks')
    cases.push({ name: 'template generation', ok: true })

    const sourceTemplate = createAcceptanceReportTemplate(VERSION, { exists: true, ...source })
    assert(sourceTemplate.accepted === false, 'source-prefilled template should not mark acceptance complete')
    assert(sourceTemplate.sourceSave.before.path === source.path, 'source-prefilled template should include source path')
    assert(sourceTemplate.sourceSave.after.lastWriteTime === source.lastWriteTime, 'source-prefilled template should include source mtime')
    assert(sourceTemplate.checks.every((item) => item.status === 'pending'), 'source-prefilled checks should remain pending')
    cases.push({ name: 'source-prefilled template generation', ok: true })

    const copied = createCopiedSave(reportRoot, source)
    const preflightReport = createAcceptanceReportTemplate(VERSION, { exists: true, ...source })
    preflightReport.copiedSavePath = copied.path
    preflightReport.automation = {
      acceptanceHandoff: true,
      verifyRelease: true,
      releaseCheckPreview: true,
      migrationAudit: true,
      promotionDryRun: true
    }
    const preflight = validateAcceptancePreflight(preflightReport, VERSION)
    assert(preflight.ok === true, 'preflight should pass when automation and copied save are ready')
    assert(preflight.pendingIds.length === manualAcceptanceChecks().length, 'preflight should keep manual checks pending')
    assert(preflight.copiedSave.size === source.size, 'preflight should expose copied save metadata')

    const sourceAsCopy = validateAcceptancePreflight({ ...preflightReport, copiedSavePath: source.path }, VERSION)
    assert(sourceAsCopy.ok === false, 'preflight should reject the source save as copied save')
    assert(
      sourceAsCopy.errors.some((item) => item.includes('not the source save')),
      'preflight should explain copied save must differ from source'
    )

    const changedCopyPath = join(reportRoot, 'changed-copy.sl2')
    writeFileSync(changedCopyPath, 'changed-copy-data', 'utf8')
    const changedCopyTime = new Date(source.lastWriteTime)
    utimesSync(changedCopyPath, changedCopyTime, changedCopyTime)
    const changedCopy = validateAcceptancePreflight({ ...preflightReport, copiedSavePath: changedCopyPath }, VERSION)
    assert(changedCopy.ok === false, 'preflight should reject a copied save with different size')
    assert(
      changedCopy.errors.some((item) => item.includes('copied save size')),
      'preflight should report copied save size mismatch'
    )
    cases.push({ name: 'acceptance preflight validation', ok: true })

    const completedReport = validReport(source, { copiedSavePath: copied.path })
    const valid = validateAcceptanceReport(completedReport, VERSION)
    assert(valid.ok === true, 'valid acceptance report should pass')
    assert(valid.passedIds.length === manualAcceptanceChecks().length, 'valid report should pass all checks')
    assert(valid.liveSourceSave.size === source.size, 'valid report should include live source metadata')
    assert(valid.copiedSave.size === copied.size, 'valid report should include copied save metadata')

    const completedWithSourcePath = validateAcceptanceReport(validReport(source, { copiedSavePath: source.path }), VERSION)
    assert(completedWithSourcePath.ok === false, 'completed report should reject the source save as copied save')
    assert(
      completedWithSourcePath.errors.some((item) => item.includes('not the source save')),
      'completed report should explain copied save must differ from source'
    )

    const missingCopied = validateAcceptanceReport(validReport(source, { copiedSavePath: join(reportRoot, 'missing.sl2') }), VERSION)
    assert(missingCopied.ok === false, 'completed report should require copied save path to exist')
    assert(
      missingCopied.errors.some((item) => item.includes('completed acceptance')),
      'completed report should identify missing copied save'
    )
    cases.push({ name: 'valid report', ok: true })

    const stale = validateAcceptanceReport(validReport(source, { copiedSavePath: copied.path, version: '0.0.0' }), VERSION)
    assert(stale.ok === false, 'stale version should fail')
    assert(stale.errors.some((item) => item.includes(`"${VERSION}"`)), 'stale version should name expected version')
    cases.push({ name: 'stale version fails', ok: true })

    const mutatedSource = validReport(source, {
      copiedSavePath: copied.path,
      sourceSave: {
        before: source,
        after: {
          ...source,
          lastWriteTime: '2026-05-28T12:00:00.000Z'
        }
      }
    })
    const mutated = validateAcceptanceReport(mutatedSource, VERSION)
    assert(mutated.ok === false, 'source metadata mutation should fail')
    assert(
      mutated.errors.some((item) => item.includes('lastWriteTime')),
      'source metadata mutation should report lastWriteTime mismatch'
    )
    cases.push({ name: 'source metadata mutation fails', ok: true })

    const liveSourceChangedPath = join(reportRoot, 'live-source-changed.sl2')
    writeFileSync(liveSourceChangedPath, 'source-save-data', 'utf8')
    const originalTime = new Date('2026-05-27T14:56:14.000Z')
    utimesSync(liveSourceChangedPath, originalTime, originalTime)
    const staleLiveSource = sourceMetadata(liveSourceChangedPath)
    const changedTime = new Date('2026-05-28T14:56:14.000Z')
    utimesSync(liveSourceChangedPath, changedTime, changedTime)
    const liveChanged = validateAcceptanceReport(validReport(staleLiveSource, { copiedSavePath: copied.path }), VERSION)
    assert(liveChanged.ok === false, 'live source mutation should fail report')
    assert(
      liveChanged.errors.some((item) => item.includes('current source save lastWriteTime')),
      'live source mutation should report current source mtime mismatch'
    )
    cases.push({ name: 'live source metadata mutation fails', ok: true })

    const failedCheck = validReport(source, {
      copiedSavePath: copied.path,
      checks: manualAcceptanceChecks().map((item, index) => ({
        id: item.id,
        status: index === 0 ? 'fail' : 'pass',
        notes: ''
      }))
    })
    const failed = validateAcceptanceReport(failedCheck, VERSION)
    assert(failed.ok === false, 'failed manual check should fail report')
    assert(
      failed.errors.some((item) => item.includes(manualAcceptanceChecks()[0].id)),
      'failed manual check should be identified'
    )
    cases.push({ name: 'failed manual check fails', ok: true })

    const repoRoot = mkdtempSync(join(tmpdir(), 'nightreign-acceptance-report-'))
    try {
      const frontendRoot = join(repoRoot, 'frontend')
      mkdirSync(frontendRoot, { recursive: true })
      writeJson(join(frontendRoot, 'package.json'), { version: VERSION })
      const missing = readAcceptanceReportState({ frontendRoot, version: VERSION })
      assert(missing.ok === false, 'missing report should fail')
      assert(missing.exists === false, 'missing report should be marked missing')

      const reportPath = join(frontendRoot, 'custom-acceptance.json')
      writeJson(reportPath, completedReport)
      const state = readAcceptanceReportState({ frontendRoot, version: VERSION, reportPath })
      assert(state.ok === true, 'custom valid report should pass')
      assert(state.summary.reviewer === 'tantless', 'state should expose report summary')
      assert(state.summary.liveSourceSave.size === source.size, 'state should expose live source metadata')
      writeJson(reportPath, preflightReport)
      const preflightState = readAcceptancePreflightState({ frontendRoot, version: VERSION, reportPath })
      assert(preflightState.ok === true, 'custom preflight report should pass readiness')
      assert(preflightState.readyForHumanAcceptance === true, 'preflight state should identify human acceptance readiness')
      const statusState = createAcceptanceReportStatus({ frontendRoot, version: VERSION, reportPath })
      assert(statusState.ok === true, 'status should pass for preflight-ready report')
      assert(statusState.state === 'ready-for-human-acceptance', 'status should identify human acceptance state')
      assert(statusState.pendingChecks.length === manualAcceptanceChecks().length, 'status should expose pending checks')
      assert(statusState.nextCheck.id === manualAcceptanceChecks()[0].id, 'status should expose next manual check')
      assert(
        statusState.commands.markNextPass.includes(`--mark-pass ${manualAcceptanceChecks()[0].id}`),
        'status should include next pass command'
      )
      assert(statusState.commands.launch.includes('acceptance:launch'), 'status should include launch command')
      const missingStatus = createAcceptanceReportStatus({
        frontendRoot,
        version: VERSION,
        reportPath: join(frontendRoot, 'missing-status.json')
      })
      assert(missingStatus.exists === false, 'status should report missing acceptance report')
      assert(missingStatus.commands.init.includes('acceptance:report:init'), 'missing status should include init command')
      cases.push({ name: 'report file state', ok: true })

      const initPath = join(frontendRoot, 'acceptance-report.json')
      const initReport = createAcceptanceReportTemplate(VERSION, { exists: true, ...source })
      const written = writeAcceptanceReportTemplate(initPath, initReport)
      assert(written === initPath, 'template write should return output path')
      const initialized = readAcceptanceReportState({ frontendRoot, version: VERSION, reportPath: initPath })
      assert(initialized.exists === true, 'initialized report should exist')
      assert(initialized.ok === false, 'initialized report should not pass before human acceptance')
      assert(
        initialized.errors.some((item) => item.includes('accepted=true')),
        'initialized report should still require accepted=true'
      )
      const automationFailureCount = initialized.errors.filter((item) =>
        item.startsWith('automation.acceptanceHandoff')
      ).length
      assert(automationFailureCount === 1, 'initialized report should not duplicate automation failures')
      try {
        writeAcceptanceReportTemplate(initPath, initReport)
        throw new Error('second write should fail without force')
      } catch (error) {
        assert(String(error.message).includes('--force'), 'overwrite should require --force')
      }
      writeAcceptanceReportTemplate(initPath, initReport, { force: true })
      cases.push({ name: 'template write keeps acceptance incomplete', ok: true })

      const markPath = join(frontendRoot, 'mark-report.json')
      const markReport = createAcceptanceReportTemplate(VERSION, { exists: true, ...source })
      markReport.copiedSavePath = copied.path
      markReport.automation = {
        acceptanceHandoff: true,
        verifyRelease: true,
        releaseCheckPreview: true,
        migrationAudit: true,
        promotionDryRun: true
      }
      writeJson(markPath, markReport)
      const markedOne = applyAcceptanceReportMarks({
        frontendRoot,
        version: VERSION,
        reportPath: markPath,
        markPassIds: ['save-open-restore-character'],
        reviewer: 'tantless',
        checkNotes: 'manual pass'
      })
      assert(markedOne.ok === true, 'single mark should write successfully')
      assert(markedOne.completed === false, 'single mark should not complete acceptance')
      assert(markedOne.validation.readyForHumanAcceptance === true, 'single mark should keep preflight ready')
      assert(
        markedOne.validation.passedChecks.includes('save-open-restore-character'),
        'single mark should pass selected check'
      )
      const oneReport = JSON.parse(readFileSync(markPath, 'utf8'))
      assert(oneReport.accepted === false, 'single mark should keep accepted false')
      assert(oneReport.completedAt === '', 'single mark should keep completedAt empty')
      assert(
        oneReport.checks.find((item) => item.id === 'save-open-restore-character').notes === 'manual pass',
        'single mark should store check notes'
      )

      try {
        applyAcceptanceReportMarks({
          frontendRoot,
          version: VERSION,
          reportPath: markPath,
          complete: true
        })
        throw new Error('complete should fail when checks are pending')
      } catch (error) {
        assert(
          String(error.message).includes('requires every manual check to pass'),
          'complete should reject pending checks'
        )
      }

      const completePath = join(frontendRoot, 'complete-report.json')
      const completeReport = createAcceptanceReportTemplate(VERSION, { exists: true, ...source })
      completeReport.copiedSavePath = copied.path
      completeReport.automation = {
        acceptanceHandoff: true,
        verifyRelease: true,
        releaseCheckPreview: true,
        migrationAudit: true,
        promotionDryRun: true
      }
      writeJson(completePath, completeReport)
      try {
        applyAcceptanceReportMarks({
          frontendRoot,
          version: VERSION,
          reportPath: completePath,
          markPassIds: ['all'],
          complete: true
        })
        throw new Error('complete without reviewer should fail')
      } catch (error) {
        assert(String(error.message).includes('requires --reviewer'), 'complete should require reviewer')
      }
      const completed = applyAcceptanceReportMarks({
        frontendRoot,
        version: VERSION,
        reportPath: completePath,
        markPassIds: ['all'],
        reviewer: 'tantless',
        notes: 'manual acceptance finished',
        complete: true,
        now: new Date('2026-05-29T02:00:00.000Z')
      })
      assert(completed.completed === true, 'complete should mark report accepted')
      assert(completed.validation.ok === true, 'completed report should pass final validation')
      assert(completed.validation.passedChecks.length === manualAcceptanceChecks().length, 'complete should pass all checks')
      const completedMarkedReport = JSON.parse(readFileSync(completePath, 'utf8'))
      assert(completedMarkedReport.accepted === true, 'completed report should set accepted')
      assert(completedMarkedReport.completedAt === '2026-05-29T02:00:00.000Z', 'completed report should set timestamp')
      assert(completedMarkedReport.sourceSave.after.lastWriteTime === source.lastWriteTime, 'complete should record live source state')
      assert(completedMarkedReport.notes === 'manual acceptance finished', 'complete should store report notes')
      const completedStatus = createAcceptanceReportStatus({ frontendRoot, version: VERSION, reportPath: completePath })
      assert(completedStatus.completionReady === true, 'status should identify completed report')
      assert(completedStatus.state === 'accepted', 'status should mark accepted report')
      assert(completedStatus.pendingChecks.length === 0, 'completed status should have no pending checks')

      try {
        applyAcceptanceReportMarks({
          frontendRoot,
          version: VERSION,
          reportPath: completePath,
          markPassIds: ['missing-check']
        })
        throw new Error('unknown check should fail')
      } catch (error) {
        assert(String(error.message).includes('unknown manual acceptance check'), 'unknown check should be rejected')
      }
      const reopened = applyAcceptanceReportMarks({
        frontendRoot,
        version: VERSION,
        reportPath: completePath,
        markFailIds: ['settings-preferences']
      })
      assert(reopened.completed === false, 'marking a failure should reopen accepted report')
      const reopenedReport = JSON.parse(readFileSync(completePath, 'utf8'))
      assert(reopenedReport.accepted === false, 'reopened report should clear accepted')
      assert(reopenedReport.completedAt === '', 'reopened report should clear completedAt')
      cases.push({ name: 'report marking workflow', ok: true })
      cases.push({ name: 'report status guidance', ok: true })
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  } finally {
    rmSync(reportRoot, { recursive: true, force: true })
  }

  console.log(JSON.stringify({ ok: true, cases }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
