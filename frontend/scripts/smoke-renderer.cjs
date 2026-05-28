const { app, BrowserWindow } = require('electron')
const { mkdir, writeFile } = require('node:fs/promises')
const { join } = require('node:path')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function evaluate(window, fn, ...args) {
  return window.webContents.executeJavaScript(
    `(${fn.toString()})(...${JSON.stringify(args)})`,
    true
  )
}

async function waitFor(window, fn, label, timeout = 5000, ...args) {
  const started = Date.now()
  let lastError = null

  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(window, fn, ...args)) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await wait(100)
  }

  throw new Error(
    `Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`
  )
}

async function getCalls(window) {
  return evaluate(window, () => window.nightreignSmoke.calls())
}

async function waitForCall(window, name, minCount = 1, timeout = 5000) {
  await waitFor(
    window,
    (callName, count) =>
      window.nightreignSmoke.calls().filter((call) => call.name === callName).length >= count,
    `call ${name} x${minCount}`,
    timeout,
    name,
    minCount
  )
}

async function assertNoError(window) {
  const errorText = await evaluate(
    window,
    () => document.querySelector('.error-banner')?.textContent?.trim() ?? ''
  )
  if (errorText) {
    throw new Error(`Renderer error banner: ${errorText}`)
  }
}

async function clickText(window, text, selector = 'button') {
  const result = await evaluate(
    window,
    (targetText, targetSelector) => {
      const isVisible = (node) => {
        const style = window.getComputedStyle(node)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          node.getClientRects().length > 0
        )
      }
      const nodes = Array.from(document.querySelectorAll(targetSelector))
      const node = nodes.find(
        (candidate) =>
          isVisible(candidate) &&
          !candidate.disabled &&
          candidate.textContent?.includes(targetText)
      )
      if (!node) {
        return {
          ok: false,
          candidates: nodes
            .filter((candidate) => isVisible(candidate) && !candidate.disabled)
            .slice(0, 20)
            .map((candidate) => candidate.textContent?.trim())
        }
      }
      node.scrollIntoView({ block: 'center', inline: 'center' })
      node.click()
      return { ok: true, text: node.textContent?.trim() ?? '' }
    },
    text,
    selector
  )

  if (!result.ok) {
    throw new Error(
      `Could not click "${text}" using ${selector}. Candidates: ${JSON.stringify(
        result.candidates
      )}`
    )
  }
}

async function clickAria(window, label, selector = 'button') {
  const result = await evaluate(
    window,
    (targetLabel, targetSelector) => {
      const isVisible = (node) => {
        const style = window.getComputedStyle(node)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          node.getClientRects().length > 0
        )
      }
      const nodes = Array.from(document.querySelectorAll(targetSelector))
      const node = nodes.find(
        (candidate) =>
          isVisible(candidate) &&
          !candidate.disabled &&
          candidate.getAttribute('aria-label') === targetLabel
      )
      if (!node) {
        return {
          ok: false,
          labels: nodes
            .filter((candidate) => isVisible(candidate) && !candidate.disabled)
            .map((candidate) => candidate.getAttribute('aria-label'))
            .filter(Boolean)
        }
      }
      node.scrollIntoView({ block: 'center', inline: 'center' })
      node.click()
      return { ok: true }
    },
    label,
    selector
  )

  if (!result.ok) {
    throw new Error(
      `Could not click aria-label "${label}" using ${selector}. Labels: ${JSON.stringify(
        result.labels
      )}`
    )
  }
}

async function clickFirst(window, selector, index = 0) {
  const result = await evaluate(
    window,
    (targetSelector, targetIndex) => {
      const isVisible = (node) => {
        const style = window.getComputedStyle(node)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          node.getClientRects().length > 0
        )
      }
      const nodes = Array.from(document.querySelectorAll(targetSelector)).filter(
        (candidate) => isVisible(candidate) && !candidate.disabled
      )
      const node = nodes[targetIndex]
      if (!node) {
        return {
          ok: false,
          count: nodes.length,
          candidates: nodes.slice(0, 20).map((candidate) => candidate.textContent?.trim())
        }
      }
      node.scrollIntoView({ block: 'center', inline: 'center' })
      node.click()
      return { ok: true, text: node.textContent?.trim() ?? '' }
    },
    selector,
    index
  )

  if (!result.ok) {
    throw new Error(
      `Could not click ${selector}[${index}]. Count: ${result.count}. Candidates: ${JSON.stringify(
        result.candidates
      )}`
    )
  }
}

async function fillFirst(window, selector, value, index = 0) {
  const result = await evaluate(
    window,
    (targetSelector, nextValue, targetIndex) => {
      const isVisible = (node) => {
        const style = window.getComputedStyle(node)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          node.getClientRects().length > 0
        )
      }
      const nodes = Array.from(document.querySelectorAll(targetSelector)).filter(isVisible)
      const node = nodes[targetIndex]
      if (!node) {
        return { ok: false, count: nodes.length }
      }

      node.scrollIntoView({ block: 'center', inline: 'center' })
      const prototype =
        node instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : node instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
      descriptor?.set?.call(node, String(nextValue))
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true }
    },
    selector,
    value,
    index
  )

  if (!result.ok) {
    throw new Error(`Could not fill ${selector}[${index}]. Count: ${result.count}`)
  }
}

async function clickNav(window, label) {
  await clickText(window, label, '.nav-item')
}

async function capture(window, name) {
  await mkdir('out', { recursive: true })
  const image = await window.webContents.capturePage()
  await writeFile(join('out', `${name}.png`), image.toPNG())
}

async function run(window) {
  await waitFor(window, () => Boolean(window.nightreignSmoke), 'smoke preload')
  await waitForCall(window, 'getSettings')
  await assertNoError(window)

  await clickText(window, '打开存档')
  await waitForCall(window, 'openSaveFile')
  await waitFor(
    window,
    () => document.body.textContent.includes('mock/NR0000.sl2'),
    'loaded save path'
  )
  await assertNoError(window)

  await clickText(window, '刷新数据', '.stats-panel button')
  await waitForCall(window, 'loadCharacter')
  await assertNoError(window)

  await clickFirst(window, '.stats-list .stat-row .action-button')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('编辑暗痕'), 'stat dialog')
  await fillFirst(window, '.modal-card input[type="number"]', '3000001')
  await clickText(window, '保存修改', '.modal-actions button')
  await waitForCall(window, 'updateStat')
  await assertNoError(window)

  await clickText(window, '替换角色档案')
  await waitForCall(window, 'openImportSaveFile')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('替换角色档案'), 'replace character dialog')
  await clickText(window, '确认替换', '.modal-actions button')
  await waitForCall(window, 'replaceCharacter')
  await assertNoError(window)

  await clickNav(window, '遗物')
  await waitFor(window, () => document.querySelectorAll('.relic-table .table-row.clickable').length > 0, 'relic table')
  await clickText(window, 'Item ID', '.relic-table .table-head button')
  await clickText(window, 'Item ID', '.relic-table .table-head button')
  await waitFor(
    window,
    () =>
      document
        .querySelector('.relic-table .table-head button[aria-label="按 Item ID 排序"]')
        ?.getAttribute('aria-sort') === 'descending',
    'relic table sort'
  )
  await clickText(window, '全选', '.bottom-actions button')
  await waitFor(window, () => document.querySelectorAll('.relic-table .table-row.clickable.selected').length > 0, 'selected relic rows')
  await clickText(window, '反选', '.bottom-actions button')
  await waitFor(window, () => document.querySelectorAll('.relic-table .table-row.clickable.selected').length === 0, 'inverted relic selection')
  await clickFirst(window, '.relic-table .table-row.clickable')
  await clickText(window, '新增遗物')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('新增遗物'), 'add relic dialog')
  await clickText(window, 'Deep', '.segmented-control button')
  await clickText(window, '确认新增', '.modal-actions button')
  await waitForCall(window, 'addRelic')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('编辑遗物'), 'new relic edit dialog')
  await waitForCall(window, 'inspectRelicEdit')
  await waitFor(
    window,
    () => document.querySelector('.relic-debug-details pre')?.textContent.includes('Relic ID'),
    'relic debug details'
  )
  await clickText(window, 'Red', '.color-shortcut-row button')
  await waitForCall(window, 'changeRelicColor')

  await clickAria(window, '搜索遗物 ID')
  await waitForCall(window, 'listRelicEditOptions')
  await waitFor(window, () => Boolean(document.querySelector('.picker-filter-grid')), 'relic picker filters')
  await fillFirst(window, '.picker-filter-grid select', 'all', 1)
  await fillFirst(window, '.picker-filter-grid select', 'all', 2)
  await waitFor(window, () => document.querySelectorAll('.picker-row').length >= 1, 'relic picker rows')
  await clickFirst(window, '.picker-row')
  await clickAria(window, '搜索 Effect 1')
  await waitForCall(window, 'listEffectEditOptions')
  await waitFor(window, () => document.querySelectorAll('.picker-row').length >= 2, 'effect picker rows')
  await clickFirst(window, '.picker-row', 1)
  await clickText(window, '自动整理 ID/效果')
  await waitForCall(window, 'prepareRelicEdit')
  await clickText(window, '保存修改', '.modal-actions button')
  await waitForCall(window, 'updateRelic')
  await assertNoError(window)

  await clickFirst(window, '.relic-table .table-row.clickable')
  await clickText(window, '收藏', '.bottom-actions button')
  await waitForCall(window, 'toggleFavoriteRelic')
  await assertNoError(window)
  await clickText(window, '全选', '.bottom-actions button')
  await waitFor(window, () => document.querySelectorAll('.relic-table .table-row.clickable.selected').length > 1, 'multi-selected relic rows')
  await clickText(window, '收藏', '.bottom-actions button')
  await waitForCall(window, 'toggleFavoriteRelics')
  await assertNoError(window)
  await clickText(window, '重排', '.bottom-actions button')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('重排遗物'), 'reindex relic dialog')
  await fillFirst(window, '.modal-card input[type="number"]', '0')
  await clickText(window, '确认重排', '.modal-actions button')
  await waitForCall(window, 'reindexRelics')
  await assertNoError(window)
  await clickText(window, '删除非法遗物', '.toolbar-panel button')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('确认批量删除'), 'delete illegal dialog')
  await clickText(window, '删除非法遗物', '.modal-actions button')
  await waitForCall(window, 'deleteIllegalRelics')
  await assertNoError(window)
  await clickText(window, '修正非法遗物', '.toolbar-panel button')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('确认批量修正'), 'mass fix dialog')
  await clickText(window, '批量修正', '.modal-actions button')
  await waitForCall(window, 'massFixRelics')
  await assertNoError(window)
  await clickFirst(window, '.relic-table .table-row.clickable')
  await clickText(window, '复制效果', '.bottom-actions button')
  await waitForCall(window, 'copyRelicEffects')
  await waitForCall(window, 'writeClipboard')
  await clickText(window, '粘贴效果', '.bottom-actions button')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('确认粘贴效果'), 'paste confirm dialog')
  await clickText(window, '粘贴效果', '.modal-actions button')
  await waitForCall(window, 'pasteRelicEffects')
  await clickText(window, '导出为 Excel', '.toolbar-panel button')
  await waitForCall(window, 'exportRelicsExcel')
  await clickText(window, '从 Excel 导入', '.toolbar-panel button')
  await waitForCall(window, 'importRelicsExcel')
  await assertNoError(window)

  await clickNav(window, '圣杯')
  await waitFor(window, () => document.querySelectorAll('.vessel-table .table-row.clickable').length > 0, 'vessel table')
  await clickFirst(window, '.vessel-table .table-row.clickable')
  await clickText(window, '替换槽位', '.vessel-toolbar button')
  await waitForCall(window, 'listVesselRelicOptions')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('替换圣杯槽位'), 'vessel replace dialog')
  await waitFor(window, () => Boolean(document.querySelector('.slot-filter-grid')), 'vessel option filters')
  await fillFirst(window, '.slot-filter-grid select', 'none')
  await waitFor(window, () => document.querySelectorAll('.option-row').length >= 2, 'filtered vessel options')
  await clickFirst(window, '.option-row', 1)
  await clickText(window, '确认替换', '.modal-actions button')
  await waitForCall(window, 'replaceVesselRelic')
  await assertNoError(window)

  await clickText(window, '保存为预设')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('保存为预设'), 'preset name dialog')
  if (
    !(await evaluate(
      window,
      () => document.querySelector('.modal-warning')?.textContent.includes('非 ASCII') ?? false
    ))
  ) {
    await clickFirst(window, '.preset-name-option input')
  }
  await waitFor(window, () => document.querySelector('.modal-warning')?.textContent.includes('非 ASCII'), 'non-ASCII preset warning')
  await fillFirst(window, '.modal-card input[type="text"]', '烟SmokePreset')
  await clickText(window, '保存预设', '.modal-actions button')
  await waitForCall(window, 'saveVesselPreset')
  await assertNoError(window)

  await clickFirst(window, '.preset-slot')
  await waitForCall(window, 'listVesselRelicOptions', 2)
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('替换预设槽位'), 'preset replace dialog')
  await clickFirst(window, '.option-row', 1)
  await clickText(window, '确认替换', '.modal-actions button')
  await waitForCall(window, 'replacePresetRelic')
  await assertNoError(window)

  await clickText(window, '重命名', '.preset-actions button')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('重命名预设'), 'rename preset dialog')
  await fillFirst(window, '.modal-card input[type="text"]', 'SmokePresetR')
  await clickText(window, '保存预设', '.modal-actions button')
  await waitForCall(window, 'renamePreset')
  await assertNoError(window)

  await clickText(window, '装备', '.preset-actions button')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('确认装备预设'), 'equip preset dialog')
  await clickText(window, '装备预设', '.modal-actions button')
  await waitForCall(window, 'equipPreset')
  await assertNoError(window)

  await clickText(window, '删除', '.preset-actions button')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('确认删除预设'), 'delete preset dialog')
  await clickText(window, '删除预设', '.modal-actions button')
  await waitForCall(window, 'deletePreset')
  await assertNoError(window)

  await clickText(window, '保存配装', '.vessel-toolbar button')
  await waitForCall(window, 'exportLoadout')
  await clickText(window, '加载配装', '.vessel-toolbar button')
  await waitForCall(window, 'previewImportLoadout')
  await waitFor(window, () => document.querySelector('.modal-card h2')?.textContent.includes('导入配装'), 'loadout import dialog')
  await clickText(window, '导入 2 项', '.modal-actions button')
  await waitForCall(window, 'applyImportLoadout')
  await assertNoError(window)

  await clickNav(window, '设置')
  await waitFor(window, () => Boolean(document.querySelector('.settings-page .settings-form')), 'settings page')
  await fillFirst(window, '.settings-page .settings-form select', 'Light', 1)
  await waitForCall(window, 'updateSettings')
  await assertNoError(window)

  const calls = await getCalls(window)
  const seenCalls = [...new Set(calls.map((call) => call.name))].sort()
  const requiredCalls = [
    'openSaveFile',
    'loadCharacter',
    'updateStat',
    'openImportSaveFile',
    'replaceCharacter',
    'addRelic',
    'inspectRelicEdit',
    'listRelicEditOptions',
    'listEffectEditOptions',
    'prepareRelicEdit',
    'updateRelic',
    'toggleFavoriteRelic',
    'toggleFavoriteRelics',
    'copyRelicEffects',
    'pasteRelicEffects',
    'reindexRelics',
    'deleteIllegalRelics',
    'massFixRelics',
    'exportRelicsExcel',
    'importRelicsExcel',
    'changeRelicColor',
    'listVesselRelicOptions',
    'replaceVesselRelic',
    'saveVesselPreset',
    'replacePresetRelic',
    'renamePreset',
    'equipPreset',
    'deletePreset',
    'exportLoadout',
    'previewImportLoadout',
    'applyImportLoadout',
    'updateSettings'
  ]
  const missingCalls = requiredCalls.filter((name) => !seenCalls.includes(name))
  const summary = { requiredCalls, seenCalls, missingCalls }
  console.log(JSON.stringify(summary, null, 2))

  if (missingCalls.length > 0) {
    throw new Error(`Missing renderer smoke calls: ${missingCalls.join(', ')}`)
  }

  await capture(window, 'smoke-renderer-final')
}

app.whenReady().then(async () => {
  const failSafe = setTimeout(() => {
    console.error('renderer smoke timed out')
    app.exit(1)
  }, 45000)

  const window = new BrowserWindow({
    width: 1672,
    height: 937,
    show: false,
    backgroundColor: '#070b14',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(process.cwd(), 'scripts', 'smoke-preload.cjs'),
      offscreen: true,
      sandbox: false
    }
  })

  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`renderer failed to load: ${code} ${description}`)
  })

  try {
    await window.loadFile(join(process.cwd(), 'out', 'renderer', 'index.html'))
    await run(window)
    clearTimeout(failSafe)
    app.quit()
  } catch (error) {
    clearTimeout(failSafe)
    console.error(error)
    try {
      await capture(window, 'smoke-renderer-failure')
    } catch (captureError) {
      console.error(captureError)
    }
    app.exit(1)
  }
})
