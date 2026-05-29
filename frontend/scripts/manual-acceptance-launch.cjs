const { spawn } = require('node:child_process')
const { existsSync, mkdirSync } = require('node:fs')
const { dirname, join, resolve } = require('node:path')
const {
  createAcceptanceReportStatus,
  defaultReportPath
} = require('./manual-acceptance-report.cjs')
const { readPackageVersion } = require('./release-policy.cjs')

function parseArgs(argv) {
  let reportPath = null
  let appPath = null
  let dryRun = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--report') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--report requires a path')
      }
      reportPath = next
      i += 1
      continue
    }
    if (arg === '--app') {
      const next = argv[i + 1]
      if (!next) {
        throw new Error('--app requires an executable path')
      }
      appPath = next
      i += 1
      continue
    }
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    throw new Error(`Unexpected argument: ${arg}`)
  }

  return { appPath, dryRun, reportPath }
}

function defaultPackagedAppPath(frontendRoot) {
  return join(frontendRoot, 'release', 'win-unpacked', 'Nightreign Save Editor.exe')
}

function createManualAcceptanceLaunchPlan({
  frontendRoot,
  version = readPackageVersion(frontendRoot),
  reportPath = defaultReportPath(frontendRoot),
  appPath = defaultPackagedAppPath(frontendRoot)
}) {
  const status = createAcceptanceReportStatus({ frontendRoot, version, reportPath })
  if (!status.exists) {
    throw new Error(`Manual acceptance report is missing: ${status.path}`)
  }
  if (!status.readyForHumanAcceptance && !status.completionReady) {
    throw new Error(`Manual acceptance report is not ready: ${status.errors.join('; ')}`)
  }

  const copiedSavePath = status.summary?.copiedSave?.path || status.summary?.copiedSavePath || ''
  if (!copiedSavePath || !existsSync(copiedSavePath)) {
    throw new Error(`Copied acceptance save is missing: ${copiedSavePath || '<empty>'}`)
  }

  const resolvedAppPath = resolve(appPath)
  if (!existsSync(resolvedAppPath)) {
    throw new Error(`Packaged Electron app not found: ${resolvedAppPath}`)
  }

  const acceptanceRoot = join(frontendRoot, 'manual-acceptance')
  const userDataDir = join(acceptanceRoot, 'electron-user-data')
  const pythonWorkDir = join(acceptanceRoot, 'python-work')
  mkdirSync(userDataDir, { recursive: true })
  mkdirSync(pythonWorkDir, { recursive: true })

  const env = {
    NIGHTREIGN_ELECTRON_ACCEPTANCE_SAVE: copiedSavePath,
    NIGHTREIGN_ELECTRON_SMOKE_OPEN_SAVE: copiedSavePath,
    NIGHTREIGN_ELECTRON_SMOKE_USER_DATA: userDataDir,
    NIGHTREIGN_ELECTRON_WORK_DIR: pythonWorkDir
  }

  return {
    ok: true,
    version,
    appPath: resolvedAppPath,
    cwd: dirname(resolvedAppPath),
    reportPath: status.path,
    state: status.state,
    copiedSavePath,
    sourceSave: status.summary?.sourceSaveBefore || null,
    userDataDir,
    pythonWorkDir,
    env,
    nextCheck: status.nextCheck,
    commands: status.commands,
    nextRequiredActions: [
      'Use the launched app for copied-save manual acceptance only.',
      `When the next check passes, record it with: ${status.commands.markNextPass}`,
      `If the next check fails, record it with: ${status.commands.markNextFail}`
    ]
  }
}

function launchManualAcceptanceApp(plan, { dryRun = false } = {}) {
  if (dryRun) {
    return {
      ...plan,
      dryRun: true,
      launched: false,
      pid: null
    }
  }

  const child = spawn(plan.appPath, [], {
    cwd: plan.cwd,
    detached: true,
    env: {
      ...process.env,
      ...plan.env
    },
    stdio: 'ignore',
    windowsHide: false
  })
  child.unref()

  return {
    ...plan,
    dryRun: false,
    launched: true,
    pid: child.pid
  }
}

function main() {
  const { appPath, dryRun, reportPath } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const plan = createManualAcceptanceLaunchPlan({
    frontendRoot,
    reportPath: reportPath ? resolve(reportPath) : defaultReportPath(frontendRoot),
    appPath: appPath ? resolve(appPath) : defaultPackagedAppPath(frontendRoot)
  })
  const result = launchManualAcceptanceApp(plan, { dryRun })
  console.log(JSON.stringify(result, null, 2))
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
  createManualAcceptanceLaunchPlan,
  defaultPackagedAppPath,
  launchManualAcceptanceApp,
  parseArgs
}
