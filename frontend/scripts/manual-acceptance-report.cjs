const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs')
const { dirname, join, resolve } = require('node:path')
const { manualAcceptanceChecks } = require('./manual-acceptance-handoff.cjs')
const { readPackageVersion } = require('./release-policy.cjs')

const DEFAULT_REPORT_PATH = 'acceptance-report.json'
const REQUIRED_AUTOMATION = [
  'acceptanceHandoff',
  'verifyRelease',
  'releaseCheckPreview',
  'migrationAudit',
  'promotionDryRun'
]

function parseArgs(argv) {
  let mode = 'check'
  let reportPath = null
  let sourceSavePath = null
  let write = false
  let force = false
  let complete = false
  let reviewer = null
  let notes = null
  let checkNotes = null
  const markPassIds = []
  const markFailIds = []
  const clearCheckIds = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--template') {
      mode = 'template'
      continue
    }
    if (arg === '--check') {
      mode = 'check'
      continue
    }
    if (arg === '--preflight') {
      mode = 'preflight'
      continue
    }
    if (arg === '--mark') {
      mode = 'mark'
      continue
    }
    if (arg === '--mark-pass') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--mark-pass requires a check id or "all"')
      }
      mode = 'mark'
      markPassIds.push(next)
      i += 1
      continue
    }
    if (arg === '--mark-fail') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--mark-fail requires a check id')
      }
      mode = 'mark'
      markFailIds.push(next)
      i += 1
      continue
    }
    if (arg === '--clear-check') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--clear-check requires a check id or "all"')
      }
      mode = 'mark'
      clearCheckIds.push(next)
      i += 1
      continue
    }
    if (arg === '--reviewer') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--reviewer requires a name')
      }
      mode = 'mark'
      reviewer = next
      i += 1
      continue
    }
    if (arg === '--complete') {
      mode = 'mark'
      complete = true
      continue
    }
    if (arg === '--notes') {
      const next = argv[i + 1]
      if (next === undefined) {
        throw new Error('--notes requires text')
      }
      mode = 'mark'
      notes = next
      i += 1
      continue
    }
    if (arg === '--check-notes') {
      const next = argv[i + 1]
      if (next === undefined) {
        throw new Error('--check-notes requires text')
      }
      mode = 'mark'
      checkNotes = next
      i += 1
      continue
    }
    if (arg === '--report') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--report requires a path')
      }
      reportPath = next
      i += 1
      continue
    }
    if (arg === '--source-save') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--source-save requires a path')
      }
      sourceSavePath = next
      i += 1
      continue
    }
    if (arg === '--write') {
      write = true
      continue
    }
    if (arg === '--force') {
      force = true
      continue
    }
    throw new Error(`Unexpected argument: ${arg}`)
  }
  return {
    mode,
    reportPath,
    sourceSavePath,
    write,
    force,
    complete,
    reviewer,
    notes,
    checkNotes,
    markPassIds,
    markFailIds,
    clearCheckIds
  }
}

function defaultReportPath(frontendRoot) {
  return join(frontendRoot, DEFAULT_REPORT_PATH)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sourceSaveFileState(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    return {
      path: '',
      exists: false,
      size: 0,
      lastWriteTime: ''
    }
  }

  const absolutePath = resolve(sourcePath)
  if (!existsSync(absolutePath)) {
    return {
      path: absolutePath,
      exists: false,
      size: 0,
      lastWriteTime: ''
    }
  }

  const state = statSync(absolutePath)
  return {
    path: absolutePath,
    exists: true,
    size: state.size,
    lastWriteTime: state.mtime.toISOString()
  }
}

function createAcceptanceReportTemplate(version, sourceSave = null) {
  const source = sourceSave?.exists
    ? {
        path: sourceSave.path,
        size: sourceSave.size,
        lastWriteTime: sourceSave.lastWriteTime
      }
    : {
        path: '',
        size: 0,
        lastWriteTime: ''
      }
  return {
    version,
    accepted: false,
    reviewer: '',
    completedAt: '',
    copiedSavePath: '',
    sourceSave: {
      before: { ...source },
      after: { ...source }
    },
    automation: {
      acceptanceHandoff: false,
      verifyRelease: false,
      releaseCheckPreview: false,
      migrationAudit: false,
      promotionDryRun: false
    },
    checks: manualAcceptanceChecks().map((item) => ({
      id: item.id,
      status: 'pending',
      notes: ''
    })),
    notes: ''
  }
}

function writeAcceptanceReportTemplate(reportPath, report, { force = false } = {}) {
  const absolutePath = resolve(reportPath)
  if (existsSync(absolutePath) && !force) {
    throw new Error(`Acceptance report already exists: ${absolutePath}. Re-run with --force to overwrite.`)
  }
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return absolutePath
}

function reportSaveFileState(state) {
  return {
    path: state.path,
    size: state.size,
    lastWriteTime: state.lastWriteTime
  }
}

function sameResolvedPath(left, right) {
  const leftPath = resolve(left)
  const rightPath = resolve(right)
  if (process.platform === 'win32') {
    return leftPath.toLowerCase() === rightPath.toLowerCase()
  }
  return leftPath === rightPath
}

function validateCopiedSavePath(report, errors, before, { phase = 'report', requireInitialMatch = false } = {}) {
  let copiedSave = null
  const copiedPath = report.copiedSavePath
  if (typeof copiedPath !== 'string' || copiedPath.trim() === '') {
    errors.push(
      phase === 'preflight'
        ? 'acceptance preflight requires copiedSavePath for the tested copy.'
        : 'acceptance report requires copiedSavePath for the tested copy.'
    )
    return copiedSave
  }

  copiedSave = sourceSaveFileState(copiedPath)
  if (!copiedSave.exists) {
    errors.push(
      phase === 'preflight'
        ? `copiedSavePath must exist for manual acceptance: ${copiedSave.path}`
        : `copiedSavePath must exist for completed acceptance: ${copiedSave.path}`
    )
    return copiedSave
  }

  if (typeof before.path === 'string' && before.path.trim() !== '' && sameResolvedPath(before.path, copiedSave.path)) {
    errors.push('copiedSavePath must point to a copied save, not the source save.')
  }

  if (requireInitialMatch) {
    if (Number.isInteger(before.size) && before.size > 0 && copiedSave.size !== before.size) {
      errors.push('copied save size must match sourceSave.before.size before manual acceptance.')
    }
    if (
      typeof before.lastWriteTime === 'string' &&
      before.lastWriteTime.trim() !== '' &&
      copiedSave.lastWriteTime !== before.lastWriteTime
    ) {
      errors.push('copied save lastWriteTime must match sourceSave.before.lastWriteTime before manual acceptance.')
    }
  }

  return copiedSave
}

function validateSourceSaveEvidence(report, errors, { verifySourceFile = true } = {}) {
  let liveSourceSave = null
  const before = report.sourceSave?.before || {}
  const after = report.sourceSave?.after || {}
  if (typeof before.path !== 'string' || before.path.trim() === '') {
    errors.push('acceptance report requires sourceSave.before.path.')
  }
  if (!Number.isInteger(before.size) || before.size <= 0) {
    errors.push('acceptance report requires sourceSave.before.size > 0.')
  }
  if (typeof before.lastWriteTime !== 'string' || before.lastWriteTime.trim() === '') {
    errors.push('acceptance report requires sourceSave.before.lastWriteTime.')
  }
  if (after.path !== before.path) {
    errors.push('sourceSave.after.path must match sourceSave.before.path.')
  }
  if (after.size !== before.size) {
    errors.push('sourceSave.after.size must match sourceSave.before.size.')
  }
  if (after.lastWriteTime !== before.lastWriteTime) {
    errors.push('sourceSave.after.lastWriteTime must match sourceSave.before.lastWriteTime.')
  }
  if (verifySourceFile && typeof before.path === 'string' && before.path.trim() !== '') {
    liveSourceSave = sourceSaveFileState(before.path)
    if (!liveSourceSave.exists) {
      errors.push(`sourceSave.before.path must exist for live verification: ${liveSourceSave.path}`)
    } else {
      if (liveSourceSave.size !== after.size) {
        errors.push('current source save size must match sourceSave.after.size.')
      }
      if (liveSourceSave.lastWriteTime !== after.lastWriteTime) {
        errors.push('current source save lastWriteTime must match sourceSave.after.lastWriteTime.')
      }
    }
  }
  return { before, after, liveSourceSave }
}

function validateAutomationEvidence(report, errors) {
  const automationFailures = new Set()
  for (const [key, value] of Object.entries(report.automation || {})) {
    if (value !== true) {
      automationFailures.add(key)
    }
  }
  for (const key of REQUIRED_AUTOMATION) {
    if (report.automation?.[key] !== true) {
      automationFailures.add(key)
    }
  }
  for (const key of automationFailures) {
    errors.push(`automation.${key} must be true.`)
  }
}

function validateAcceptancePreflight(report, version, expectedChecks = manualAcceptanceChecks(), options = {}) {
  const errors = []
  const expectedIds = expectedChecks.map((item) => item.id)
  const checkMap = new Map(Array.isArray(report?.checks) ? report.checks.map((item) => [item.id, item]) : [])
  const verifySourceFile = options.verifySourceFile !== false
  let liveSourceSave = null
  let copiedSave = null

  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    errors.push('acceptance report must be a JSON object.')
    return { ok: false, errors, expectedIds, pendingIds: [], passedIds: [], liveSourceSave, copiedSave }
  }
  if (report.version !== version) {
    errors.push(`acceptance report version must be "${version}".`)
  }
  if (report.accepted === true) {
    errors.push('acceptance preflight expects accepted=false; run acceptance:report:check for completed reports.')
  }

  const sourceEvidence = validateSourceSaveEvidence(report, errors, { verifySourceFile })
  liveSourceSave = sourceEvidence.liveSourceSave
  validateAutomationEvidence(report, errors)
  copiedSave = validateCopiedSavePath(report, errors, sourceEvidence.before, {
    phase: 'preflight',
    requireInitialMatch: true
  })

  for (const id of expectedIds) {
    const check = checkMap.get(id)
    if (!check) {
      errors.push(`missing manual acceptance check: ${id}`)
      continue
    }
    if (check.status === 'fail') {
      errors.push(`manual acceptance check is marked fail: ${id}`)
    }
  }

  const passedIds = expectedIds.filter((id) => checkMap.get(id)?.status === 'pass')
  const pendingIds = expectedIds.filter((id) => checkMap.get(id)?.status !== 'pass')
  return {
    ok: errors.length === 0,
    errors,
    expectedIds,
    pendingIds,
    passedIds,
    liveSourceSave,
    copiedSave
  }
}

function validateAcceptanceReport(report, version, expectedChecks = manualAcceptanceChecks(), options = {}) {
  const errors = []
  const expectedIds = expectedChecks.map((item) => item.id)
  const checkMap = new Map(Array.isArray(report?.checks) ? report.checks.map((item) => [item.id, item]) : [])
  const verifySourceFile = options.verifySourceFile !== false
  let liveSourceSave = null
  let copiedSave = null

  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    errors.push('acceptance report must be a JSON object.')
    return { ok: false, errors, expectedIds, passedIds: [], liveSourceSave, copiedSave }
  }
  if (report.version !== version) {
    errors.push(`acceptance report version must be "${version}".`)
  }
  if (report.accepted !== true) {
    errors.push('acceptance report requires accepted=true.')
  }
  if (typeof report.reviewer !== 'string' || report.reviewer.trim() === '') {
    errors.push('acceptance report requires a non-empty reviewer.')
  }
  if (typeof report.completedAt !== 'string' || Number.isNaN(Date.parse(report.completedAt))) {
    errors.push('acceptance report requires a valid completedAt timestamp.')
  }
  const sourceEvidence = validateSourceSaveEvidence(report, errors, { verifySourceFile })
  liveSourceSave = sourceEvidence.liveSourceSave
  copiedSave = validateCopiedSavePath(report, errors, sourceEvidence.before, { phase: 'report' })
  validateAutomationEvidence(report, errors)

  for (const id of expectedIds) {
    const check = checkMap.get(id)
    if (!check) {
      errors.push(`missing manual acceptance check: ${id}`)
      continue
    }
    if (check.status !== 'pass') {
      errors.push(`manual acceptance check must pass: ${id}`)
    }
  }

  const passedIds = expectedIds.filter((id) => checkMap.get(id)?.status === 'pass')
  return {
    ok: errors.length === 0,
    errors,
    expectedIds,
    passedIds,
    liveSourceSave,
    copiedSave
  }
}

function expandCheckIds(ids, expectedIds, label) {
  const expanded = []
  for (const id of ids) {
    if (id === 'all') {
      expanded.push(...expectedIds)
      continue
    }
    if (!expectedIds.includes(id)) {
      throw new Error(`${label} unknown manual acceptance check: ${id}`)
    }
    expanded.push(id)
  }
  return [...new Set(expanded)]
}

function applyAcceptanceReportMarks({
  frontendRoot,
  version = readPackageVersion(frontendRoot),
  reportPath = defaultReportPath(frontendRoot),
  markPassIds = [],
  markFailIds = [],
  clearCheckIds = [],
  reviewer = null,
  notes = null,
  checkNotes = null,
  complete = false,
  now = new Date()
}) {
  const absolutePath = resolve(reportPath)
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing manual acceptance report: ${absolutePath}`)
  }

  const report = readJson(absolutePath)
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('acceptance report must be a JSON object.')
  }
  if (!Array.isArray(report.checks)) {
    throw new Error('acceptance report requires a checks array.')
  }

  const expectedIds = manualAcceptanceChecks().map((item) => item.id)
  const checkMap = new Map(report.checks.map((item) => [item.id, item]))
  for (const id of expectedIds) {
    if (!checkMap.has(id)) {
      throw new Error(`acceptance report is missing manual acceptance check: ${id}`)
    }
  }

  const passIds = expandCheckIds(markPassIds, expectedIds, '--mark-pass')
  const failIds = expandCheckIds(markFailIds, expectedIds, '--mark-fail')
  const clearIds = expandCheckIds(clearCheckIds, expectedIds, '--clear-check')
  const changedIds = new Set([...passIds, ...failIds, ...clearIds])
  if (
    changedIds.size === 0 &&
    reviewer === null &&
    notes === null &&
    checkNotes === null &&
    complete === false
  ) {
    throw new Error(
      'No acceptance report updates requested. Use --mark-pass, --mark-fail, --clear-check, --reviewer, --notes, or --complete.'
    )
  }

  for (const id of clearIds) {
    checkMap.get(id).status = 'pending'
  }
  for (const id of failIds) {
    checkMap.get(id).status = 'fail'
  }
  for (const id of passIds) {
    checkMap.get(id).status = 'pass'
  }
  if (checkNotes !== null) {
    for (const id of changedIds) {
      checkMap.get(id).notes = checkNotes
    }
  }
  if (reviewer !== null) {
    const trimmedReviewer = reviewer.trim()
    if (!trimmedReviewer) {
      throw new Error('--reviewer requires a non-empty name')
    }
    report.reviewer = trimmedReviewer
  }
  if (notes !== null) {
    report.notes = notes
  }

  if (!complete) {
    report.accepted = false
    report.completedAt = ''
  } else {
    if (typeof report.reviewer !== 'string' || report.reviewer.trim() === '') {
      throw new Error('--complete requires --reviewer or an existing non-empty reviewer in the report.')
    }
    const incompleteIds = expectedIds.filter((id) => checkMap.get(id)?.status !== 'pass')
    if (incompleteIds.length > 0) {
      throw new Error(`--complete requires every manual check to pass. Pending/failing: ${incompleteIds.join(', ')}`)
    }
    const beforePath = report.sourceSave?.before?.path
    const liveSource = sourceSaveFileState(beforePath)
    if (!liveSource.exists) {
      throw new Error(`--complete requires live source save verification: ${liveSource.path}`)
    }
    report.sourceSave.after = reportSaveFileState(liveSource)
    report.accepted = true
    report.completedAt = now.toISOString()

    const completedValidation = validateAcceptanceReport(report, version)
    if (!completedValidation.ok) {
      throw new Error(`Completed acceptance report would not pass validation: ${completedValidation.errors.join('; ')}`)
    }
  }

  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  const validation = report.accepted
    ? readAcceptanceReportState({ frontendRoot, version, reportPath: absolutePath })
    : readAcceptancePreflightState({ frontendRoot, version, reportPath: absolutePath })

  return {
    ok: true,
    path: absolutePath,
    updatedChecks: [...changedIds],
    completed: report.accepted === true,
    validation
  }
}

function readAcceptanceReportState({
  frontendRoot,
  version = readPackageVersion(frontendRoot),
  reportPath = defaultReportPath(frontendRoot)
}) {
  const absolutePath = resolve(reportPath)
  if (!existsSync(absolutePath)) {
    return {
      path: absolutePath,
      exists: false,
      ok: false,
      errors: [`Missing manual acceptance report: ${absolutePath}`],
      expectedChecks: manualAcceptanceChecks().map((item) => item.id),
      passedChecks: []
    }
  }

  try {
    const report = readJson(absolutePath)
    const result = validateAcceptanceReport(report, version)
    return {
      path: absolutePath,
      exists: true,
      ok: result.ok,
      errors: result.errors,
      expectedChecks: result.expectedIds,
      passedChecks: result.passedIds,
      summary: {
        version: report.version,
        accepted: report.accepted === true,
        reviewer: typeof report.reviewer === 'string' ? report.reviewer : '',
        completedAt: typeof report.completedAt === 'string' ? report.completedAt : '',
        copiedSavePath: typeof report.copiedSavePath === 'string' ? report.copiedSavePath : '',
        sourceSaveBefore: report.sourceSave?.before || null,
        sourceSaveAfter: report.sourceSave?.after || null,
        liveSourceSave: result.liveSourceSave,
        copiedSave: result.copiedSave
      }
    }
  } catch (error) {
    return {
      path: absolutePath,
      exists: true,
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      expectedChecks: manualAcceptanceChecks().map((item) => item.id),
      passedChecks: []
    }
  }
}

function readAcceptancePreflightState({
  frontendRoot,
  version = readPackageVersion(frontendRoot),
  reportPath = defaultReportPath(frontendRoot)
}) {
  const absolutePath = resolve(reportPath)
  if (!existsSync(absolutePath)) {
    return {
      path: absolutePath,
      exists: false,
      ok: false,
      errors: [`Missing manual acceptance report: ${absolutePath}`],
      expectedChecks: manualAcceptanceChecks().map((item) => item.id),
      pendingChecks: manualAcceptanceChecks().map((item) => item.id),
      passedChecks: []
    }
  }

  try {
    const report = readJson(absolutePath)
    const result = validateAcceptancePreflight(report, version)
    return {
      path: absolutePath,
      exists: true,
      ok: result.ok,
      readyForHumanAcceptance: result.ok && result.pendingIds.length > 0,
      errors: result.errors,
      expectedChecks: result.expectedIds,
      pendingChecks: result.pendingIds,
      passedChecks: result.passedIds,
      summary: {
        version: report.version,
        accepted: report.accepted === true,
        copiedSavePath: typeof report.copiedSavePath === 'string' ? report.copiedSavePath : '',
        sourceSaveBefore: report.sourceSave?.before || null,
        sourceSaveAfter: report.sourceSave?.after || null,
        liveSourceSave: result.liveSourceSave,
        copiedSave: result.copiedSave
      }
    }
  } catch (error) {
    return {
      path: absolutePath,
      exists: true,
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      expectedChecks: manualAcceptanceChecks().map((item) => item.id),
      pendingChecks: manualAcceptanceChecks().map((item) => item.id),
      passedChecks: []
    }
  }
}

function main() {
  const {
    mode,
    reportPath,
    sourceSavePath,
    write,
    force,
    complete,
    reviewer,
    notes,
    checkNotes,
    markPassIds,
    markFailIds,
    clearCheckIds
  } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const version = readPackageVersion(frontendRoot)
  const resolvedReportPath = reportPath ? resolve(reportPath) : defaultReportPath(frontendRoot)

  if (mode === 'template') {
    const sourceSave = sourceSavePath ? sourceSaveFileState(sourceSavePath) : null
    if (sourceSavePath && !sourceSave.exists) {
      throw new Error(`Source save not found for template prefill: ${sourceSave.path}`)
    }
    const report = createAcceptanceReportTemplate(version, sourceSave)
    if (write) {
      const writtenPath = writeAcceptanceReportTemplate(resolvedReportPath, report, { force })
      console.log(JSON.stringify({ ok: true, path: writtenPath, report }, null, 2))
      return
    }
    console.log(JSON.stringify(report, null, 2))
    return
  }

  if (mode === 'mark') {
    const state = applyAcceptanceReportMarks({
      frontendRoot,
      version,
      reportPath: resolvedReportPath,
      markPassIds,
      markFailIds,
      clearCheckIds,
      reviewer,
      notes,
      checkNotes,
      complete
    })
    console.log(JSON.stringify(state, null, 2))
    return
  }

  if (mode === 'preflight') {
    const state = readAcceptancePreflightState({
      frontendRoot,
      version,
      reportPath: resolvedReportPath
    })
    console.log(JSON.stringify(state, null, 2))
    if (!state.ok) {
      process.exit(1)
    }
    return
  }

  const state = readAcceptanceReportState({
    frontendRoot,
    version,
    reportPath: resolvedReportPath
  })
  console.log(JSON.stringify(state, null, 2))
  if (!state.ok) {
    process.exit(1)
  }
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

module.exports = {
  applyAcceptanceReportMarks,
  createAcceptanceReportTemplate,
  defaultReportPath,
  parseArgs,
  readAcceptancePreflightState,
  readAcceptanceReportState,
  sourceSaveFileState,
  validateAcceptancePreflight,
  validateAcceptanceReport,
  writeAcceptanceReportTemplate
}
