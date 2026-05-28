const { existsSync, readFileSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')
const {
  readPackageVersion,
  readReleasePolicyState,
  resolveReleasePolicyState
} = require('./release-policy.cjs')

function parseArgs(argv) {
  let savePath = null
  for (const arg of argv) {
    if (!savePath) {
      savePath = arg
      continue
    }
    throw new Error(`Unexpected argument: ${arg}`)
  }
  return {
    savePath: savePath || process.env.NIGHTREIGN_ELECTRON_SMOKE_SAVE || null
  }
}

function fileState(root, relativePath) {
  const absolutePath = join(root, relativePath)
  const exists = existsSync(absolutePath)
  return {
    path: relativePath,
    exists,
    size: exists ? statSync(absolutePath).size : 0
  }
}

function sourceSaveState(savePath) {
  if (!savePath) {
    return {
      path: null,
      exists: false,
      size: 0,
      lastWriteTime: null,
      reason: 'Pass a real save path, or set NIGHTREIGN_ELECTRON_SMOKE_SAVE.'
    }
  }

  const absolutePath = resolve(savePath)
  const exists = existsSync(absolutePath)
  if (!exists) {
    return {
      path: absolutePath,
      exists: false,
      size: 0,
      lastWriteTime: null,
      reason: 'Save file does not exist.'
    }
  }

  const state = statSync(absolutePath)
  return {
    path: absolutePath,
    exists: true,
    size: state.size,
    lastWriteTime: state.mtime.toISOString(),
    reason: ''
  }
}

function manualAcceptanceChecks() {
  return [
    {
      id: 'save-open-restore-character',
      area: 'File',
      steps: 'Launch the packaged Electron preview, open a copied real save, restart, confirm last-save restore, and switch at least two characters.',
      passCriteria: 'No source save is touched; character names, murks, sigs, relic counts, and vessel counts look consistent after switching.'
    },
    {
      id: 'stats-save-as-reopen',
      area: 'File',
      steps: 'Edit murks or sigs on the copied save, save-as to a temporary output, reopen that output in Electron.',
      passCriteria: 'The edited value persists in the output save and the original source save size/mtime are unchanged.'
    },
    {
      id: 'relic-single-edit',
      area: 'Relics',
      steps: 'Add a normal relic and a deep relic, edit item/effect/curse values, use color helper, then delete a selected test relic.',
      passCriteria: 'Rows refresh after each operation, validation warnings are understandable, and equipped relic protections match legacy behavior.'
    },
    {
      id: 'relic-batch-utilities',
      area: 'Relics',
      steps: 'Use multi-select, select all/invert/clear, favorite toggle, copy/paste effects, reindex, delete illegal relics, and mass fix.',
      passCriteria: 'Batch operations report useful results, partial failures are visible, and no unexpected rows disappear.'
    },
    {
      id: 'relic-excel',
      area: 'Relics',
      steps: 'Export relics to Excel, import the exported file into the copied save, and inspect skipped/added counts.',
      passCriteria: 'The import/export flow completes without corrupting inventory state or adding duplicate unique relics.'
    },
    {
      id: 'vessel-slots',
      area: 'Vessels',
      steps: 'Switch heroes, replace a vessel slot, clear a slot, and use vessel-slot copy/paste effects shortcuts.',
      passCriteria: 'Candidate relic filtering matches vessel color/deep rules and equip bookkeeping remains consistent.'
    },
    {
      id: 'vessel-presets',
      area: 'Vessels',
      steps: 'Save a vessel preset, rename it, replace a preset relic slot, equip the preset, then delete it.',
      passCriteria: 'Preset names respect the legacy ASCII/default warning behavior, and preset changes survive refresh.'
    },
    {
      id: 'loadout-json',
      area: 'Vessels',
      steps: 'Export a loadout JSON, preview-import it, cancel once, preview-import again, apply selected entries.',
      passCriteria: 'Cancel restores the pre-preview in-memory state; apply updates only selected vessels/presets.'
    },
    {
      id: 'replace-character',
      area: 'File',
      steps: 'Use a copied import save to replace one character in the copied target save, then save-as and reopen.',
      passCriteria: 'Only the selected target slot changes, imported data is padded/truncated safely, and save-as output reopens.'
    },
    {
      id: 'settings-preferences',
      area: 'Settings',
      steps: 'Change language, theme, reduce-message-pop, auto-backup, and max backups, then restart the app.',
      passCriteria: 'Settings persist, language resources reload, and file-page preference controls stay in sync with settings.'
    }
  ]
}

function createManualAcceptanceHandoffReport({
  frontendRoot,
  repoRoot = resolve(frontendRoot, '..'),
  savePath = null
}) {
  const version = readPackageVersion(frontendRoot)
  const artifactBase = `Nightreign-Save-Editor-Electron-${version}-win-x64`
  const releasePolicy = readReleasePolicyState(frontendRoot, version)
  const resolvedPolicy = releasePolicy.valid ? resolveReleasePolicyState(releasePolicy) : null
  const sourceSave = sourceSaveState(savePath)
  const artifacts = [
    fileState(frontendRoot, `release/${artifactBase}.exe`),
    fileState(frontendRoot, `release/${artifactBase}.exe.blockmap`),
    fileState(frontendRoot, `release/${artifactBase}.zip`),
    fileState(frontendRoot, 'release/electron-preview-manifest.json'),
    fileState(frontendRoot, 'release/win-unpacked/Nightreign Save Editor.exe'),
    fileState(frontendRoot, 'release/win-unpacked/resources/python/NightreignElectronBridge.exe')
  ]
  const artifactsOk = artifacts.every((item) => item.exists && item.size > 0)
  const workflowPath = join(repoRoot, '.github', 'workflows', 'main.yml')
  const workflowText = existsSync(workflowPath) ? readFileSync(workflowPath, 'utf8') : ''
  const releaseWiring = {
    electronPreviewJob: workflowText.includes('electron-preview:'),
    draftReleaseDownloadsArtifacts: workflowText.includes('uses: actions/download-artifact@v8'),
    draftReleaseMergesArtifacts: workflowText.includes('merge-multiple: true'),
    draftReleaseUploadsArtifacts: workflowText.includes('files: ./artifacts/*')
  }
  const automationPrerequisites = [
    `npm run verify:release -- ${sourceSave.path || '<real-save-path>'}`,
    'npm run release:preview-manifest',
    'npm run release:check-preview',
    'npm run migration:audit',
    'npm run migration:audit:promotion-dry-run'
  ]
  const checks = manualAcceptanceChecks()

  return {
    ok: sourceSave.exists && releasePolicy.valid && artifactsOk,
    mode: 'manual-acceptance-handoff',
    version,
    sourceSave,
    sourceProtection:
      'Use a copied real save for manual destructive testing. Re-check the source save size and lastWriteTime after acceptance.',
    releasePolicy,
    resolvedPolicy,
    artifacts,
    releaseWiring,
    automationPrerequisites,
    manualAcceptanceChecks: checks,
    completionRule:
      'Human acceptance is complete only when every manualAcceptanceChecks item passes on a copied real save and acceptance:report:check can verify the current source save size and lastWriteTime still match the recorded before/after metadata.'
  }
}

function main() {
  const { savePath } = parseArgs(process.argv.slice(2))
  const frontendRoot = resolve(__dirname, '..')
  const report = createManualAcceptanceHandoffReport({ frontendRoot, savePath })
  console.log(JSON.stringify(report, null, 2))

  if (!report.ok) {
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
  createManualAcceptanceHandoffReport,
  manualAcceptanceChecks,
  parseArgs,
  sourceSaveState
}
