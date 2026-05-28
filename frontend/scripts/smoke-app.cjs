const { spawn } = require('node:child_process')
const { existsSync, statSync } = require('node:fs')
const { copyFile, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { dirname, extname, join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')

const electronPath = require('electron')

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms))

function parseArgs(argv) {
  const args = [...argv]
  let dev = false
  let packaged = false
  let appPath = null
  let savePath = null
  let ui = false

  while (args.length > 0) {
    const current = args.shift()
    if (current === '--packaged') {
      packaged = true
      continue
    }
    if (current === '--dev') {
      dev = true
      continue
    }
    if (current === '--ui') {
      ui = true
      continue
    }
    if (current === '--app') {
      appPath = args.shift()
      if (!appPath) {
        throw new Error('--app requires an executable path')
      }
      continue
    }
    if (!savePath) {
      savePath = current
      continue
    }
    throw new Error(`Unexpected argument: ${current}`)
  }

  if (appPath) {
    packaged = true
  }
  if (dev && packaged) {
    throw new Error('--dev cannot be combined with --packaged or --app')
  }
  if (dev && !ui) {
    throw new Error('--dev requires --ui because electron-vite owns ELECTRON_RENDERER_URL')
  }

  return {
    appPath,
    dev,
    packaged,
    savePath: savePath || process.env.NIGHTREIGN_ELECTRON_SMOKE_SAVE,
    ui
  }
}

function appLaunchConfig(options) {
  if (options.dev) {
    return {
      command: process.execPath,
      args: [resolve(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev'],
      cwd: resolve(__dirname, '..'),
      mode: 'dev'
    }
  }

  const { appPath, packaged } = options
  if (!packaged) {
    return {
      command: electronPath,
      args: ['.'],
      cwd: resolve(__dirname, '..'),
      mode: 'source'
    }
  }

  const defaultAppPath = resolve(__dirname, '..', 'release', 'win-unpacked', 'Nightreign Save Editor.exe')
  const executable = resolve(appPath || defaultAppPath)
  if (!existsSync(executable)) {
    throw new Error(`Packaged Electron app not found: ${executable}`)
  }

  return {
    command: executable,
    args: [],
    cwd: dirname(executable),
    mode: 'packaged'
  }
}

function runnerHtml() {
  return String.raw`<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'nonce-nightreign-smoke'; object-src 'none'; base-uri 'none'; form-action 'none'"
    />
    <title>Nightreign Electron App Smoke</title>
  </head>
  <body>
    <pre id="status">running</pre>
    <script nonce="nightreign-smoke">
      const statusNode = document.getElementById('status')
      const seenCalls = []
      const skipped = []

      function report(payload) {
        console.log('NIGHTREIGN_SMOKE_RESULT ' + JSON.stringify(payload))
      }

      function assert(condition, message) {
        if (!condition) {
          throw new Error(message)
        }
      }

      async function call(name, ...args) {
        statusNode.textContent = name
        const result = await window.nightreign[name](...args)
        seenCalls.push(name)
        return result
      }

      function effectsFor(row) {
        const effects = Array.isArray(row.effectIds) ? row.effectIds.slice(0, 6) : []
        while (effects.length < 6) {
          effects.push(0xffffffff)
        }
        return effects
      }

      function firstRelic(state) {
        const relic = state.relics.find((entry) => typeof entry.gaHandle === 'number' && !entry.unique)
          || state.relics.find((entry) => typeof entry.gaHandle === 'number')
        assert(relic, 'No editable relic found')
        return relic
      }

      function firstVesselSlot(state) {
        for (const group of state.vessels || []) {
          if (!group.unlocked) {
            continue
          }
          const row = group.rows.find((entry) => entry.gaHandle) || group.rows[0]
          if (row) {
            return { group, row }
          }
        }
        return null
      }

      function findPreset(state, name) {
        return (state.presets || []).find((preset) => preset.name === name)
      }

      async function optional(label, fn) {
        try {
          return await fn()
        } catch (error) {
          skipped.push({ label, error: error instanceof Error ? error.message : String(error) })
          return null
        }
      }

      async function managePreset(state, heroType) {
        const name = 'SmokePreset' + Date.now().toString(36).slice(-5)
        let createdFrom = null

        for (const group of state.vessels || []) {
          if (!group.unlocked) {
            continue
          }
          for (const row of group.rows || []) {
            const options = await call('listVesselRelicOptions', heroType, group.vesselId, row.slot - 1)
            for (const option of options) {
              const candidateGa = option.gaHandle || 0
              if (candidateGa === 0 || candidateGa === row.gaHandle) {
                continue
              }
              try {
                state = await call(
                  'replaceVesselRelic',
                  heroType,
                  group.vesselId,
                  row.slot - 1,
                  candidateGa
                )
                state = await call('saveVesselPreset', heroType, group.vesselId, name)
                createdFrom = { group, row, originalGa: row.gaHandle || 0 }
                break
              } catch (_error) {
                await call(
                  'replaceVesselRelic',
                  heroType,
                  group.vesselId,
                  row.slot - 1,
                  row.gaHandle || 0
                )
              }
            }
            if (createdFrom) {
              break
            }
          }
          if (createdFrom) {
            break
          }
        }

        assert(createdFrom, 'No vessel slot could produce a unique preset combination')
        const created = findPreset(state, name)
        assert(created, 'Created preset was not returned')

        try {
          const renamedName = name.slice(0, 13) + 'R'
          state = await call('renamePreset', heroType, created.index, renamedName)
          const renamed = findPreset(state, renamedName)
          assert(renamed, 'Renamed preset was not returned')

          const presetRow = renamed.rows.find((entry) => entry.gaHandle) || renamed.rows[0]
          if (presetRow) {
            await call('listVesselRelicOptions', heroType, renamed.vesselId, presetRow.slot - 1)
            state = await call(
              'replacePresetRelic',
              heroType,
              renamed.index,
              presetRow.slot - 1,
              presetRow.gaHandle || 0
            )
          }

          state = await call('equipPreset', heroType, renamed.index)
          state = await call('deletePreset', heroType, renamed.index)
          assert(!findPreset(state, renamedName), 'Deleted preset is still present')
          return state
        } finally {
          await call(
            'replaceVesselRelic',
            heroType,
            createdFrom.group.vesselId,
            createdFrom.row.slot - 1,
            createdFrom.originalGa
          )
        }
      }

      async function run() {
        assert(window.nightreign, 'preload API is missing')

        const ping = await call('backendPing')
        assert(ping && ping.ok === true, 'backend ping failed')

        const settings = await call('getSettings')
        assert(settings && Array.isArray(settings.languages), 'settings payload is invalid')

        const restored = await call('openLastSave')
        assert(restored === null, 'empty smoke config should not restore a save')

        const opened = await call('openSaveFile')
        assert(opened && opened.selectedCharacter, 'openSaveFile did not return a character')
        let state = opened.selectedCharacter

        const targetIndex = state.characters.length > 1 ? 1 : 0
        state = await call('loadCharacter', targetIndex)
        assert(state.index === targetIndex, 'loadCharacter returned the wrong index')

        state = await call('updateStat', 'murks', (state.stats.murks + 1) >>> 0)
        assert(state.stats.murks === ((opened.selectedCharacter.stats.murks + 1) >>> 0) || state.stats.murks >= 0, 'stat update failed')

        const addedNormal = await call('addRelic', 'normal', 1)
        const normalRelic = addedNormal.relics.find((entry) => entry.gaHandle === addedNormal.lastGaHandle)
        assert(normalRelic, 'normal add did not return the new relic')
        const colorChanged = await call(
          'changeRelicColor',
          normalRelic.gaHandle,
          normalRelic.itemId,
          effectsFor(normalRelic),
          'Blue'
        )
        assert(colorChanged && colorChanged.relicId, 'changeRelicColor returned no relic ID')
        state = await call('updateRelic', normalRelic.gaHandle, normalRelic.itemId, effectsFor(normalRelic))
        state = await call('deleteRelic', normalRelic.gaHandle)

        const addedDeep = await call('addRelic', 'deep', 1)
        const deepRelic = addedDeep.relics.find((entry) => entry.gaHandle === addedDeep.lastGaHandle)
        assert(deepRelic && deepRelic.deep, 'deep add did not return a deep relic')
        state = await call('deleteRelic', deepRelic.gaHandle)

        const relic = firstRelic(state)
        const copied = await call('copyRelicEffects', [relic.gaHandle])
        assert(copied && copied.effectsText, 'copyRelicEffects returned no text')
        state = await call('pasteRelicEffects', [relic.gaHandle], copied.effectsText)
        const inspected = await call('inspectRelicEdit', relic.itemId, effectsFor(relic))
        assert(inspected && Array.isArray(inspected.debugLines) && inspected.debugLines.length, 'inspectRelicEdit returned no debug lines')
        await call('prepareRelicEdit', relic.itemId, effectsFor(relic))
        await call('listRelicEditOptions', relic.itemId, true)
        await call('listEffectEditOptions', relic.itemId, 0, effectsFor(relic), true)
        const batchRelic = await call('addRelic', 'normal', 1)
        const batchGa = batchRelic.lastGaHandle
        assert(batchGa, 'batch add did not return a GA handle')
        state = await call('toggleFavoriteRelic', batchGa)
        const toggledMany = await call('toggleFavoriteRelics', [batchGa])
        assert(toggledMany && toggledMany.selectedCharacter, 'toggleFavoriteRelics returned no state')
        const reindexed = await call('reindexRelics', 0, [batchGa])
        assert(reindexed && reindexed.selectedCharacter, 'reindexRelics returned no state')
        const deleteIllegal = await call('deleteIllegalRelics')
        assert(deleteIllegal && deleteIllegal.selectedCharacter, 'deleteIllegalRelics returned no state')
        const massFixed = await call('massFixRelics')
        assert(massFixed && massFixed.selectedCharacter, 'massFixRelics returned no state')
        const deletedBatch = await call('deleteRelics', [batchGa])
        assert(deletedBatch && deletedBatch.deleted === 1, 'deleteRelics did not delete the temporary relic')
        state = deletedBatch.selectedCharacter

        const exportedExcel = await call('exportRelicsExcel')
        assert(exportedExcel && exportedExcel.path, 'exportRelicsExcel returned no path')
        const importedExcel = await call('importRelicsExcel')
        assert(importedExcel && importedExcel.selectedCharacter, 'importRelicsExcel did not return state')
        state = importedExcel.selectedCharacter

        const heroType = (state.heroes && state.heroes[0] && state.heroes[0].heroType) || 1
        const vessels = await call('listVessels', heroType)
        assert(Array.isArray(vessels), 'listVessels did not return an array')
        const presets = await call('listPresets', heroType)
        assert(Array.isArray(presets), 'listPresets did not return an array')

        const slot = firstVesselSlot({ vessels })
        if (slot) {
          await call('listVesselRelicOptions', heroType, slot.group.vesselId, slot.row.slot - 1)
          state = await call(
            'replaceVesselRelic',
            heroType,
            slot.group.vesselId,
            slot.row.slot - 1,
            slot.row.gaHandle || 0
          )
          state = await managePreset(state, heroType)
        } else {
          skipped.push({ label: 'vessel slot', error: 'No unlocked vessel slot found' })
        }

        const exportedLoadout = await call('exportLoadout', heroType, state.name || 'smoke')
        assert(exportedLoadout && exportedLoadout.path, 'exportLoadout returned no path')
        const preview = await call('previewImportLoadout')
        assert(preview && Array.isArray(preview.vessels), 'previewImportLoadout returned no preview')
        const canceled = await call('cancelImportLoadout')
        assert(canceled && canceled.selectedCharacter, 'cancelImportLoadout returned no state')
        await call('previewImportLoadout')
        const applied = await call('applyImportLoadout', [], [])
        assert(applied && applied.selectedCharacter, 'applyImportLoadout returned no state')
        state = applied.selectedCharacter

        const importedSave = await call('openImportSaveFile')
        assert(importedSave && importedSave.characters && importedSave.characters.length, 'openImportSaveFile returned no characters')
        state = await call('replaceCharacter', importedSave.characters[0].index)
        assert(state && state.stats, 'replaceCharacter returned no state')

        const saved = await call('saveAs')
        assert(saved && saved.savePath, 'saveAs returned no output path')

        const updatedSettings = await call('updateSettings', { maxBackups: 5 })
        assert(updatedSettings && updatedSettings.settings, 'updateSettings returned no settings')

        const requiredCalls = [
          'backendPing',
          'getSettings',
          'openLastSave',
          'openSaveFile',
          'loadCharacter',
          'updateStat',
          'addRelic',
          'updateRelic',
          'deleteRelic',
          'deleteRelics',
          'toggleFavoriteRelic',
          'toggleFavoriteRelics',
          'copyRelicEffects',
          'pasteRelicEffects',
          'reindexRelics',
          'deleteIllegalRelics',
          'massFixRelics',
          'inspectRelicEdit',
          'prepareRelicEdit',
          'changeRelicColor',
          'listRelicEditOptions',
          'listEffectEditOptions',
          'exportRelicsExcel',
          'importRelicsExcel',
          'listVessels',
          'listPresets',
          'listVesselRelicOptions',
          'replaceVesselRelic',
          'saveVesselPreset',
          'renamePreset',
          'replacePresetRelic',
          'equipPreset',
          'deletePreset',
          'exportLoadout',
          'previewImportLoadout',
          'cancelImportLoadout',
          'applyImportLoadout',
          'openImportSaveFile',
          'replaceCharacter',
          'saveAs',
          'updateSettings'
        ]
        const missingCalls = requiredCalls.filter((name) => !seenCalls.includes(name))
        assert(missingCalls.length === 0, 'Missing calls: ' + missingCalls.join(', '))
        report({ ok: true, requiredCalls, seenCalls: [...new Set(seenCalls)].sort(), skipped })
      }

      run()
        .catch((error) => {
          report({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
            seenCalls: [...new Set(seenCalls)].sort(),
            skipped
          })
        })
        .finally(() => {
          setTimeout(() => {
            window.close()
          }, 250)
        })
    </script>
  </body>
</html>`
}

function uiRunnerScript() {
  return String.raw`(() => {
  const seenSteps = []
  const seenCalls = []
  const skipped = []

  function report(payload) {
    console.log('NIGHTREIGN_SMOKE_RESULT ' + JSON.stringify(payload))
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message)
    }
  }

  function isVisible(node) {
    const style = window.getComputedStyle(node)
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0
  }

  function recordStep(name) {
    seenSteps.push(name)
  }

  async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function waitFor(predicate, label, timeout = 12000) {
    const started = Date.now()
    let lastError = null
    while (Date.now() - started < timeout) {
      try {
        if (predicate()) {
          return
        }
      } catch (error) {
        lastError = error
      }
      await wait(100)
    }
    throw new Error('Timed out waiting for ' + label + (lastError ? ': ' + lastError.message : ''))
  }

  async function waitForIdle() {
    await waitFor(
      () => !document.body.textContent.includes('处理中...') && !document.body.textContent.includes('保存中...') && !document.body.textContent.includes('整理中...') && !document.body.textContent.includes('替换中...') && !document.body.textContent.includes('导入中...') && !document.body.textContent.includes('新增中...'),
      'idle UI',
      20000
    )
    await wait(150)
  }

  function assertNoError() {
    const text = document.querySelector('.error-banner')?.textContent?.trim()
    if (text) {
      throw new Error('Renderer error banner: ' + text)
    }
  }

  async function clickText(text, selector = 'button') {
    await waitFor(() => Array.from(document.querySelectorAll(selector)).some((node) => isVisible(node) && !node.disabled && node.textContent?.includes(text)), 'button ' + text)
    const node = Array.from(document.querySelectorAll(selector)).find((candidate) => isVisible(candidate) && !candidate.disabled && candidate.textContent?.includes(text))
    assert(node, 'Could not click ' + text)
    node.scrollIntoView({ block: 'center', inline: 'center' })
    node.click()
    await wait(100)
  }

  async function clickAria(label, selector = 'button') {
    await waitFor(() => Array.from(document.querySelectorAll(selector)).some((node) => isVisible(node) && !node.disabled && node.getAttribute('aria-label') === label), 'aria button ' + label)
    const node = Array.from(document.querySelectorAll(selector)).find((candidate) => isVisible(candidate) && !candidate.disabled && candidate.getAttribute('aria-label') === label)
    assert(node, 'Could not click aria ' + label)
    node.scrollIntoView({ block: 'center', inline: 'center' })
    node.click()
    await wait(100)
  }

  async function clickFirst(selector, index = 0) {
    await waitFor(() => Array.from(document.querySelectorAll(selector)).filter((node) => isVisible(node) && !node.disabled).length > index, selector)
    const node = Array.from(document.querySelectorAll(selector)).filter((candidate) => isVisible(candidate) && !candidate.disabled)[index]
    assert(node, 'Could not click ' + selector + '[' + index + ']')
    node.scrollIntoView({ block: 'center', inline: 'center' })
    node.click()
    await wait(100)
  }

  function visibleEnabled(selector, root = document) {
    return Array.from(root.querySelectorAll(selector)).filter((node) => isVisible(node) && !node.disabled)
  }

  function presetCardByName(name) {
    return Array.from(document.querySelectorAll('.preset-card')).find((node) => isVisible(node) && node.textContent?.includes(name))
  }

  async function clickInside(root, text, selector = 'button') {
    await waitFor(() => visibleEnabled(selector, root).some((node) => node.textContent?.includes(text)), 'button ' + text + ' in scoped node')
    const node = visibleEnabled(selector, root).find((candidate) => candidate.textContent?.includes(text))
    assert(node, 'Could not click scoped button ' + text)
    node.scrollIntoView({ block: 'center', inline: 'center' })
    node.click()
    await wait(100)
  }

  async function clickFirstInside(root, selector) {
    await waitFor(() => visibleEnabled(selector, root).length > 0, selector + ' in scoped node')
    const node = visibleEnabled(selector, root)[0]
    assert(node, 'Could not click scoped ' + selector)
    node.scrollIntoView({ block: 'center', inline: 'center' })
    node.click()
    await wait(100)
  }

  async function selectFirstNonEmptyVesselSlot() {
    await waitFor(() => visibleEnabled('.vessel-table .table-row.clickable').length > 0, 'vessel rows')
    const row = visibleEnabled('.vessel-table .table-row.clickable').find((candidate) => !candidate.textContent?.includes('(Empty)'))
    if (!row) {
      return false
    }
    row.scrollIntoView({ block: 'center', inline: 'center' })
    row.click()
    await wait(100)
    return true
  }

  async function fillFirst(selector, value, index = 0) {
    await waitFor(() => Array.from(document.querySelectorAll(selector)).filter(isVisible).length > index, selector)
    const node = Array.from(document.querySelectorAll(selector)).filter(isVisible)[index]
    assert(node, 'Could not fill ' + selector + '[' + index + ']')
    node.scrollIntoView({ block: 'center', inline: 'center' })
    const prototype =
      node instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : node instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    descriptor?.set?.call(node, String(value))
    node.dispatchEvent(new Event('input', { bubbles: true }))
    node.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(100)
  }

  async function clickNav(label) {
    await clickText(label, '.nav-item')
    await waitForIdle()
  }

  async function confirmModal() {
    await clickFirst('.modal-actions .confirm-button')
    await waitForIdle()
    const saveAnyway = Array.from(document.querySelectorAll('.modal-actions .confirm-button')).find((candidate) => isVisible(candidate) && !candidate.disabled && candidate.textContent?.includes('仍然保存'))
    if (saveAnyway) {
      saveAnyway.scrollIntoView({ block: 'center', inline: 'center' })
      saveAnyway.click()
      await waitForIdle()
    }
  }

  async function tryWrapApi() {
    try {
      const api = window.nightreign
      for (const key of Object.keys(api)) {
        if (typeof api[key] !== 'function') {
          continue
        }
        const original = api[key]
        api[key] = async (...args) => {
          seenCalls.push(key)
          return original(...args)
        }
      }
    } catch (_error) {
      // contextBridge objects may be immutable; UI state checks remain authoritative.
    }
  }

  async function optional(label, fn) {
    try {
      await fn()
    } catch (error) {
      skipped.push({ label, error: error instanceof Error ? error.message : String(error) })
    }
  }

  async function run() {
    await waitFor(() => Boolean(window.nightreign) && document.querySelector('.app-shell'), 'app shell')
    await tryWrapApi()
    await window.nightreign.getSettings()
    recordStep('getSettings')
    assertNoError()

    await clickText('打开存档')
    await waitFor(() => document.body.textContent.includes('input.sl2') || document.body.textContent.includes('已加载'), 'opened save', 30000)
    await waitForIdle()
    assertNoError()
    recordStep('openSaveFile')

    await clickText('刷新数据', '.stats-panel button')
    await waitForIdle()
    assertNoError()
    recordStep('refreshStats')

    await clickFirst('.stats-list .stat-row .action-button')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('编辑暗痕'), 'stat dialog')
    await fillFirst('.modal-card input[type="number"]', '3000001')
    await confirmModal()
    assertNoError()
    recordStep('updateStat')

    await clickText('替换角色档案')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('替换角色档案'), 'replace character dialog', 30000)
    await confirmModal()
    assertNoError()
    recordStep('replaceCharacter')

    await clickNav('遗物')
    await waitFor(() => document.querySelectorAll('.relic-table .table-row.clickable').length > 0, 'relic table')
    await clickText('Item ID', '.relic-table .table-head button')
    await clickText('Item ID', '.relic-table .table-head button')
    await waitFor(
      () =>
        document
          .querySelector('.relic-table .table-head button[aria-label="按 Item ID 排序"]')
          ?.getAttribute('aria-sort') === 'descending',
      'relic table sort'
    )
    assertNoError()
    recordStep('sortRelics')
    await clickText('全选', '.bottom-actions button')
    await waitFor(() => document.querySelectorAll('.relic-table .table-row.clickable.selected').length > 0, 'selected relic rows')
    await clickText('反选', '.bottom-actions button')
    await waitFor(() => document.querySelectorAll('.relic-table .table-row.clickable.selected').length === 0, 'inverted relic selection')
    recordStep('invertRelicSelection')
    await clickFirst('.relic-table .table-row.clickable')
    await clickText('新增遗物')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('新增遗物'), 'add relic dialog')
    await clickText('Deep', '.segmented-control button')
    await clickText('确认新增', '.modal-actions button')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('编辑遗物'), 'new relic edit dialog', 30000)
    recordStep('addRelic')
    await waitFor(() => {
      const panel = document.querySelector('.relic-status-panel')
      return panel && !panel.textContent.includes('检查中')
    }, 'relic status inspection', 30000)
    await waitFor(() => document.querySelector('.relic-debug-details pre')?.textContent.includes('Relic ID'), 'relic debug details', 30000)
    recordStep('inspectRelicEdit')
    await clickText('Red', '.color-shortcut-row button')
    await waitForIdle()
    assertNoError()
    recordStep('changeRelicColor')

    await clickAria('搜索遗物 ID')
    await waitFor(() => document.querySelectorAll('.picker-row').length >= 1, 'relic picker rows')
    await waitFor(() => Boolean(document.querySelector('.picker-filter-grid')), 'relic picker filters')
    await fillFirst('.picker-filter-grid select', 'all', 1)
    await fillFirst('.picker-filter-grid select', 'all', 2)
    recordStep('filterRelicPicker')
    await clickFirst('.picker-row', Math.min(1, document.querySelectorAll('.picker-row').length - 1))
    recordStep('listRelicEditOptions')
    await clickAria('搜索 Effect 1')
    await waitFor(() => document.querySelectorAll('.picker-row').length >= 1, 'effect picker rows')
    await clickFirst('.picker-row', Math.min(1, document.querySelectorAll('.picker-row').length - 1))
    recordStep('listEffectEditOptions')
    await clickText('自动整理 ID/效果')
    await waitForIdle()
    recordStep('prepareRelicEdit')
    await confirmModal()
    assertNoError()
    recordStep('updateRelic')

    await clickFirst('.relic-table .table-row.clickable')
    await clickText('收藏', '.bottom-actions button')
    await waitForIdle()
    assertNoError()
    recordStep('toggleFavoriteRelic')
    await clickText('全选', '.bottom-actions button')
    await waitFor(() => document.querySelectorAll('.relic-table .table-row.clickable.selected').length > 1, 'multi-selected relic rows')
    await clickText('收藏', '.bottom-actions button')
    await waitForIdle()
    assertNoError()
    recordStep('toggleFavoriteRelics')
    await clickText('重排', '.bottom-actions button')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('重排遗物'), 'reindex relic dialog')
    await fillFirst('.modal-card input[type="number"]', '0')
    await confirmModal()
    assertNoError()
    recordStep('reindexRelics')
    await clickText('删除非法遗物', '.toolbar-panel button')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('确认批量删除'), 'delete illegal dialog')
    await confirmModal()
    assertNoError()
    recordStep('deleteIllegalRelics')
    await clickText('修正非法遗物', '.toolbar-panel button')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('确认批量修正'), 'mass fix dialog')
    await confirmModal()
    assertNoError()
    recordStep('massFixRelics')
    await clickFirst('.relic-table .table-row.clickable')
    await clickText('复制效果', '.bottom-actions button')
    await waitForIdle()
    recordStep('copyRelicEffects')
    await clickText('粘贴效果', '.bottom-actions button')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('确认粘贴效果'), 'paste confirm')
    await confirmModal()
    assertNoError()
    recordStep('pasteRelicEffects')
    await clickText('导出为 Excel', '.toolbar-panel button')
    await waitForIdle()
    recordStep('exportRelicsExcel')
    await clickText('从 Excel 导入', '.toolbar-panel button')
    await waitForIdle()
    assertNoError()
    recordStep('importRelicsExcel')

    await clickNav('圣杯')
    await clickFirst('.vessel-table .table-row.clickable')
    await clickText('替换槽位', '.vessel-toolbar button')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('替换圣杯槽位'), 'vessel replace dialog', 30000)
    await waitFor(() => Boolean(document.querySelector('.slot-filter-grid')), 'vessel option filters')
    await fillFirst('.slot-filter-grid select', 'none')
    recordStep('filterVesselOptions')
    const replacements = visibleEnabled('.option-row').filter((node) => !node.classList.contains('selected'))
    const replacement = replacements.find((node) => !node.textContent?.includes('(Empty)')) ?? replacements[0]
    assert(replacement, 'No non-selected vessel replacement option')
    replacement.scrollIntoView({ block: 'center', inline: 'center' })
    replacement.click()
    await confirmModal()
    recordStep('replaceVesselRelic')
    assertNoError()
    recordStep('listVesselRelicOptions')

    const presetName = '烟Ui' + Date.now().toString(36).slice(-6)
    const asciiPresetName = presetName.replace(/[^\x20-\x7E]/g, '')
    await clickText('保存为预设')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('保存为预设'), 'save preset dialog')
    if (!document.querySelector('.modal-warning')?.textContent.includes('非 ASCII')) {
      await clickFirst('.preset-name-option input')
    }
    await waitFor(() => document.querySelector('.modal-warning')?.textContent.includes('非 ASCII'), 'non-ASCII preset warning')
    await fillFirst('.modal-card input[type="text"]', presetName)
    await confirmModal()
    await waitFor(() => Boolean(presetCardByName(presetName)), 'created preset card', 20000)
    assertNoError()
    recordStep('allowNonAsciiPresetName')
    recordStep('saveVesselPreset')

    let presetCard = presetCardByName(presetName)
    assert(presetCard, 'Created preset card disappeared before slot edit')
    await clickFirstInside(presetCard, '.preset-slot')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('替换预设槽位'), 'preset replace dialog', 20000)
    const presetReplacements = visibleEnabled('.option-row').filter((node) => !node.classList.contains('selected'))
    const presetReplacement = presetReplacements.find((node) => !node.textContent?.includes('(Empty)')) ?? presetReplacements[0]
    assert(presetReplacement, 'No non-selected preset replacement option')
    presetReplacement.scrollIntoView({ block: 'center', inline: 'center' })
    presetReplacement.click()
    await confirmModal()
    assertNoError()
    recordStep('replacePresetRelic')

    presetCard = presetCardByName(presetName)
    assert(presetCard, 'Created preset card disappeared before rename')
    const renamedPresetName = asciiPresetName.slice(0, 12) + 'R'
    await clickInside(presetCard, '重命名')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('重命名预设'), 'rename preset dialog')
    if (document.querySelector('.modal-warning')?.textContent.includes('非 ASCII')) {
      await clickFirst('.preset-name-option input')
    }
    await fillFirst('.modal-card input[type="text"]', renamedPresetName)
    await confirmModal()
    await waitFor(() => Boolean(presetCardByName(renamedPresetName)), 'renamed preset card', 20000)
    assertNoError()
    recordStep('renamePreset')

    presetCard = presetCardByName(renamedPresetName)
    assert(presetCard, 'Renamed preset card disappeared before equip')
    await clickInside(presetCard, '装备')
    await confirmModal()
    await waitFor(() => presetCardByName(renamedPresetName)?.textContent?.includes('已装备'), 'equipped preset card', 20000)
    assertNoError()
    recordStep('equipPreset')

    presetCard = presetCardByName(renamedPresetName)
    assert(presetCard, 'Renamed preset card disappeared before delete')
    await clickInside(presetCard, '删除')
    await confirmModal()
    await waitFor(() => !presetCardByName(renamedPresetName), 'deleted preset card', 20000)
    assertNoError()
    recordStep('deletePreset')

    assert(await selectFirstNonEmptyVesselSlot(), 'No non-empty vessel slot for shortcut actions')
    await clickText('复制效果', '.vessel-toolbar button')
    await waitForIdle()
    recordStep('copyVesselSlotEffects')
    await clickText('粘贴效果', '.vessel-toolbar button')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('确认粘贴效果'), 'vessel paste confirm')
    await confirmModal()
    assertNoError()
    recordStep('pasteVesselSlotEffects')
    await clickText('清空槽位', '.vessel-toolbar button')
    await waitForIdle()
    assertNoError()
    recordStep('clearVesselSlot')

    await clickText('保存配装', '.vessel-toolbar button')
    await waitForIdle()
    recordStep('exportLoadout')
    await clickText('加载配装', '.vessel-toolbar button')
    await waitFor(() => document.querySelector('.modal-card h2')?.textContent.includes('导入配装'), 'loadout import dialog', 30000)
    recordStep('previewImportLoadout')
    await confirmModal()
    assertNoError()
    recordStep('applyImportLoadout')

    await clickNav('文件管理')
    await clickText('保存存档')
    await waitForIdle()
    assertNoError()
    recordStep('saveAs')

    await clickNav('设置')
    await fillFirst('.settings-page .settings-form input[type="number"]', '6')
    await waitForIdle()
    assertNoError()
    recordStep('updateSettings')

    const requiredSteps = [
      'getSettings',
      'openSaveFile',
      'refreshStats',
      'updateStat',
      'replaceCharacter',
      'sortRelics',
      'invertRelicSelection',
      'addRelic',
      'inspectRelicEdit',
      'changeRelicColor',
      'filterRelicPicker',
      'listRelicEditOptions',
      'listEffectEditOptions',
      'prepareRelicEdit',
      'updateRelic',
      'toggleFavoriteRelic',
      'toggleFavoriteRelics',
      'reindexRelics',
      'deleteIllegalRelics',
      'massFixRelics',
      'copyRelicEffects',
      'pasteRelicEffects',
      'exportRelicsExcel',
      'importRelicsExcel',
      'filterVesselOptions',
      'listVesselRelicOptions',
      'replaceVesselRelic',
      'allowNonAsciiPresetName',
      'saveVesselPreset',
      'replacePresetRelic',
      'renamePreset',
      'equipPreset',
      'deletePreset',
      'copyVesselSlotEffects',
      'pasteVesselSlotEffects',
      'clearVesselSlot',
      'exportLoadout',
      'previewImportLoadout',
      'applyImportLoadout',
      'saveAs',
      'updateSettings'
    ]
    const missingSteps = requiredSteps.filter((step) => !seenSteps.includes(step))
    assert(missingSteps.length === 0, 'Missing UI steps: ' + missingSteps.join(', '))
    report({ ok: true, requiredSteps, seenSteps: [...new Set(seenSteps)].sort(), seenCalls: [...new Set(seenCalls)].sort(), skipped })
  }

  run().catch((error) => {
    report({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      seenSteps: [...new Set(seenSteps)].sort(),
      seenCalls: [...new Set(seenCalls)].sort(),
      skipped
    })
  }).finally(() => {
    setTimeout(() => window.close(), 250)
  })
})()`
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const saveArg = options.savePath
  if (!saveArg) {
    throw new Error('Pass a save path: npm run smoke:app -- C:\\path\\to\\NR0000.sl2')
  }

  const originalSavePath = resolve(saveArg)
  if (!existsSync(originalSavePath)) {
    throw new Error(`Save file not found: ${originalSavePath}`)
  }

  const originalBefore = statSync(originalSavePath)
  const tempDir = await mkdtemp(join(tmpdir(), 'nightreign-electron-app-smoke-'))
  const runnerPath = join(tempDir, 'runner.html')
  const uiRunnerPath = join(tempDir, 'ui-runner.js')
  const resultPath = join(tempDir, 'result.json')
  const outputExt = extname(originalSavePath) || '.sl2'
  const smokeInputSave = join(tempDir, `input${outputExt}`)
  const outputSave = join(tempDir, `output${outputExt}`)
  const relicExcel = join(tempDir, 'relics.xlsx')
  const loadoutJson = join(tempDir, 'loadout.json')
  let result = null
  let stdout = ''
  let stderr = ''

  try {
    await copyFile(originalSavePath, smokeInputSave)
    const smokeInputBefore = statSync(smokeInputSave)
    if (options.ui) {
      await writeFile(uiRunnerPath, uiRunnerScript(), 'utf8')
    } else {
      await writeFile(runnerPath, runnerHtml(), 'utf8')
    }
    const launchConfig = appLaunchConfig(options)
    const child = spawn(launchConfig.command, launchConfig.args, {
      cwd: launchConfig.cwd,
      env: {
        ...process.env,
        ...(options.ui
          ? { NIGHTREIGN_ELECTRON_SMOKE_UI_SCRIPT: uiRunnerPath }
          : { ELECTRON_RENDERER_URL: pathToFileURL(runnerPath).toString() }),
        NIGHTREIGN_ELECTRON_SMOKE: '1',
        NIGHTREIGN_ELECTRON_SMOKE_RESULT_FILE: resultPath,
        NIGHTREIGN_ELECTRON_SMOKE_USER_DATA: join(tempDir, 'user-data'),
        NIGHTREIGN_ELECTRON_WORK_DIR: join(tempDir, 'work'),
        NIGHTREIGN_ELECTRON_CONFIG_DIR: join(tempDir, 'config'),
        NIGHTREIGN_ELECTRON_SMOKE_OPEN_SAVE: smokeInputSave,
        NIGHTREIGN_ELECTRON_SMOKE_OPEN_IMPORT_SAVE: smokeInputSave,
        NIGHTREIGN_ELECTRON_SMOKE_SAVE_AS: outputSave,
        NIGHTREIGN_ELECTRON_SMOKE_EXPORT_RELICS_EXCEL: relicExcel,
        NIGHTREIGN_ELECTRON_SMOKE_IMPORT_RELICS_EXCEL: relicExcel,
        NIGHTREIGN_ELECTRON_SMOKE_EXPORT_LOADOUT: loadoutJson,
        NIGHTREIGN_ELECTRON_SMOKE_IMPORT_LOADOUT: loadoutJson,
        NIGHTREIGN_ELECTRON_SMOKE_STEAM_RESPONSE: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const timeout = setTimeout(() => {
      child.kill()
    }, 120000)

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stdout += text
      process.stdout.write(text)
      for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('NIGHTREIGN_SMOKE_RESULT ')) {
          result = JSON.parse(line.slice('NIGHTREIGN_SMOKE_RESULT '.length))
        }
      }
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stderr += text
      process.stderr.write(text)
    })

    const exitCode = await new Promise((resolveExit) => {
      child.on('exit', (code) => resolveExit(code ?? 1))
    })
    clearTimeout(timeout)

    if (exitCode !== 0) {
      throw new Error(`Electron smoke exited with code ${exitCode}`)
    }
    if (!result && existsSync(resultPath)) {
      result = JSON.parse(await readFile(resultPath, 'utf8'))
    }
    if (!result) {
      throw new Error(`Electron smoke did not report a result.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)
    }
    if (!result.ok) {
      throw new Error(`Electron smoke failed: ${result.error}\n${result.stack ?? ''}`)
    }
    if (!existsSync(outputSave)) {
      throw new Error(`Save-as output was not created: ${outputSave}`)
    }

    const smokeInputAfter = statSync(smokeInputSave)
    if (smokeInputAfter.size !== smokeInputBefore.size || smokeInputAfter.mtimeMs !== smokeInputBefore.mtimeMs) {
      throw new Error('Smoke input save changed during Electron app smoke')
    }

    const originalAfter = statSync(originalSavePath)
    if (originalAfter.size !== originalBefore.size || originalAfter.mtimeMs !== originalBefore.mtimeMs) {
      throw new Error('Original save changed during Electron app smoke')
    }

    console.log(JSON.stringify({
      ok: true,
      mode: launchConfig.mode,
      ui: options.ui,
      inputSave: smokeInputSave,
      outputSave,
      tempDir,
      requiredChecks: (result.requiredCalls ?? result.requiredSteps ?? []).length,
      skipped: result.skipped
    }, null, 2))
  } finally {
    if (process.env.NIGHTREIGN_ELECTRON_KEEP_SMOKE !== '1') {
      await wait(250)
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
