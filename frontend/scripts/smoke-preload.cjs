const { contextBridge } = require('electron')

const EMPTY = 0xffffffff
const calls = []
let clipboardText = ''
let nextGaHandle = 5000

const settings = {
  configPath: 'mock/editor_config.json',
  lastFile: '',
  lastCharIndex: 0,
  language: 'zh_CN',
  languageName: 'Simplified Chinese',
  languages: [
    { code: 'en_US', name: 'English' },
    { code: 'zh_CN', name: 'Simplified Chinese' }
  ],
  theme: 'Dark',
  reduceMessagePop: true,
  autoBackup: true,
  maxBackups: 5
}

const heroes = [
  { heroType: 1, name: 'Wylder' },
  { heroType: 2, name: 'Guardian' }
]

const characters = [
  { index: 0, name: 'Tantless', path: 'mock/USERDATA_0', selected: true },
  { index: 1, name: 'Tant1e5s', path: 'mock/USERDATA_1', selected: false }
]

let relics = [
  relic(1, 4101, 100, 'Red Relic', 'Red', false, true, 'Wylder', [7000000, 7000100, 7000200]),
  relic(2, 4102, 2000000, 'Deep Relic', 'Blue', true, false, '-', [6630000, 7040000, 6610000, EMPTY, EMPTY, 6820000]),
  relic(3, 4103, 102, 'Green Relic', 'Green', false, false, '-', [7040200, 7031900, 7000800])
]

let vessels = [
  {
    index: 0,
    vesselId: 19000,
    heroType: 1,
    name: 'Mock Vessel',
    status: 'Unlocked',
    unlocked: true,
    rows: [
      vesselSlot(1, 'Normal', 'Red', relics[0]),
      vesselSlot(2, 'Normal', 'Green', relics[2]),
      vesselSlot(3, 'Deep', 'Blue', relics[1]),
      vesselSlot(4, 'Normal', 'Yellow', null),
      vesselSlot(5, 'Deep', 'Blue', null),
      vesselSlot(6, 'Normal', 'White', null)
    ]
  }
]

let presets = [
  {
    index: 0,
    heroPresetIndex: 0,
    heroType: 1,
    name: 'Preset A',
    vesselId: 19000,
    vesselName: 'Mock Vessel',
    relicCount: 3,
    equipped: false,
    rows: vessels[0].rows
  }
]

let state = makeState(0)

function record(name, detail) {
  calls.push({ name, detail: detail ?? null })
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function relic(order, gaHandle, itemId, name, color, deep, favorite, equippedByText, effectIds) {
  const paddedEffects = [...effectIds, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY].slice(0, 6)
  return {
    order,
    gaHandle,
    itemId,
    name,
    color,
    deep,
    favorite,
    equippedByText,
    effectIds: paddedEffects,
    effectNames: paddedEffects.map(effectName),
    illegal: false,
    curseIllegal: false,
    strictInvalid: false,
    unique: false
  }
}

function vesselSlot(slot, type, color, relicValue) {
  return {
    slot,
    type,
    color,
    requiredColor: color,
    gaHandle: relicValue?.gaHandle ?? 0,
    name: relicValue?.name ?? '(Empty)',
    itemId: relicValue?.itemId ?? null,
    effectIds: relicValue?.effectIds ?? [],
    effectNames: relicValue?.effectNames?.slice(0, 3) ?? ['-', '-', '-'],
    empty: !relicValue
  }
}

function makeState(index) {
  return {
    index,
    name: characters[index]?.name ?? 'Tantless',
    path: characters[index]?.path ?? 'mock/USERDATA_0',
    stats: { murks: 2995974 + index, sigs: 685 + index },
    characters: characters.map((character) => ({
      ...character,
      selected: character.index === index
    })),
    heroes,
    relics,
    vessels,
    presets
  }
}

function refreshState(extra = {}) {
  state = {
    ...state,
    characters: characters.map((character) => ({
      ...character,
      selected: character.index === state.index
    })),
    relics,
    vessels,
    presets,
    ...extra
  }
  return clone(state)
}

function effectName(effectId) {
  if (effectId === EMPTY || effectId === -1 || effectId === 0) {
    return '-'
  }
  return `Effect ${effectId}`
}

function selectedCharacterResult(savePath = 'mock/NR0000.sl2') {
  settings.lastFile = savePath
  settings.lastCharIndex = state.index
  return {
    savePath,
    characters: clone(characters),
    selectedCharacter: clone(state)
  }
}

function batchResult(message) {
  return {
    message,
    selectedCharacter: refreshState()
  }
}

function replaceSlot(gaHandle) {
  const selectedRelic = relics.find((entry) => entry.gaHandle === gaHandle) ?? null
  vessels = vessels.map((group) => ({
    ...group,
    rows: group.rows.map((row, index) => (index === 0 ? vesselSlot(1, 'Normal', 'Red', selectedRelic) : row))
  }))
  presets = presets.map((preset) => ({
    ...preset,
    rows: vessels[0].rows
  }))
  return refreshState()
}

const api = {
  openSaveFile: async () => {
    record('openSaveFile')
    state = makeState(0)
    return selectedCharacterResult()
  },
  openLastSave: async () => {
    record('openLastSave')
    return settings.lastFile ? selectedCharacterResult(settings.lastFile) : null
  },
  openImportSaveFile: async () => {
    record('openImportSaveFile')
    return {
      savePath: 'mock/import.sl2',
      characters: clone(characters)
    }
  },
  loadCharacter: async (index) => {
    record('loadCharacter', index)
    state = makeState(index)
    settings.lastCharIndex = index
    return clone(state)
  },
  replaceCharacter: async (importIndex) => {
    record('replaceCharacter', importIndex)
    return refreshState()
  },
  updateStat: async (field, value) => {
    record('updateStat', { field, value })
    state.stats[field] = value
    return refreshState()
  },
  saveCurrentCharacter: async () => {
    record('saveCurrentCharacter')
    return { path: state.path, stats: state.stats }
  },
  saveAs: async () => {
    record('saveAs')
    return {
      savePath: 'mock/output.sl2',
      selectedCharacter: refreshState()
    }
  },
  addRelic: async (relicType, count = 1) => {
    record('addRelic', { relicType, count })
    let lastGaHandle = 0
    for (let index = 0; index < count; index += 1) {
      lastGaHandle = nextGaHandle
      nextGaHandle += 1
      relics = [
        ...relics,
        relic(relics.length + 1, lastGaHandle, relicType === 'deep' ? 2000000 : 100, 'Added Relic', relicType === 'deep' ? 'Blue' : 'Red', relicType === 'deep', false, '-', [EMPTY, EMPTY, EMPTY])
      ]
    }
    return refreshState({ addedCount: count, lastGaHandle })
  },
  deleteRelic: async (gaHandle) => {
    record('deleteRelic', gaHandle)
    relics = relics.filter((entry) => entry.gaHandle !== gaHandle)
    return refreshState()
  },
  deleteRelics: async (gaHandles) => {
    record('deleteRelics', gaHandles)
    relics = relics.filter((entry) => !gaHandles.includes(entry.gaHandle))
    return batchResult(`Deleted ${gaHandles.length} relics`)
  },
  toggleFavoriteRelic: async (gaHandle) => {
    record('toggleFavoriteRelic', gaHandle)
    relics = relics.map((entry) =>
      entry.gaHandle === gaHandle ? { ...entry, favorite: !entry.favorite } : entry
    )
    return refreshState()
  },
  toggleFavoriteRelics: async (gaHandles) => {
    record('toggleFavoriteRelics', gaHandles)
    relics = relics.map((entry) =>
      gaHandles.includes(entry.gaHandle) ? { ...entry, favorite: !entry.favorite } : entry
    )
    return batchResult(`Toggled favorite mark on ${gaHandles.length} relics`)
  },
  copyRelicEffects: async (gaHandles) => {
    record('copyRelicEffects', gaHandles)
    return {
      effectsText: '7000000,7000100,7000200,-1,-1,-1',
      count: gaHandles.length,
      uniqueNames: []
    }
  },
  pasteRelicEffects: async (gaHandles, effectsText) => {
    record('pasteRelicEffects', { gaHandles, effectsText })
    return batchResult(`Effects pasted to ${gaHandles.length} relics`)
  },
  reindexRelics: async (targetIndex, gaHandles) => {
    record('reindexRelics', { targetIndex, gaHandles })
    return batchResult(`Moved ${gaHandles.length} relics after #${targetIndex}`)
  },
  deleteIllegalRelics: async () => {
    record('deleteIllegalRelics')
    return batchResult('No illegal relics found')
  },
  massFixRelics: async () => {
    record('massFixRelics')
    return batchResult('No fixable relics found')
  },
  updateRelic: async (gaHandle, relicId, effects) => {
    record('updateRelic', { gaHandle, relicId, effects })
    relics = relics.map((entry) =>
      entry.gaHandle === gaHandle
        ? {
            ...entry,
            itemId: relicId,
            effectIds: effects,
            effectNames: effects.map(effectName)
          }
        : entry
    )
    return refreshState()
  },
  prepareRelicEdit: async (relicId, effects) => {
    record('prepareRelicEdit', { relicId, effects })
    const normalized = [...effects].map((effectId) => (effectId <= 0 ? EMPTY : effectId))
    return {
      relicId,
      relicName: `Relic ${relicId}`,
      effects: normalized,
      effectNames: normalized.map(effectName),
      changedRelicId: false,
      invalidReason: 'NONE',
      strictInvalid: false
    }
  },
  inspectRelicEdit: async (relicId, effects) => {
    record('inspectRelicEdit', { relicId, effects })
    const normalized = [...effects].map((effectId) => (effectId <= 0 ? EMPTY : effectId))
    return {
      relicId,
      relicName: `Relic ${relicId}`,
      effects: normalized,
      effectNames: normalized.map(effectName),
      invalidReason: 'NONE',
      invalidIndex: -1,
      strictInvalid: false,
      strictReason: null,
      status: 'valid',
      title: 'VALID',
      detail: 'Mock relic configuration is legal.',
      color: 'Red',
      deep: relicId >= 2000000,
      effectSlots: 3,
      curseSlots: 0,
      debugLines: [
        `Relic ID: ${relicId}`,
        `Effects: ${JSON.stringify(normalized.slice(0, 3))}`,
        `Curses:  ${JSON.stringify(normalized.slice(3))}`,
        'invalid_reason(): NONE'
      ]
    }
  },
  changeRelicColor: async (gaHandle, relicId, effects, targetColor) => {
    record('changeRelicColor', { gaHandle, relicId, effects, targetColor })
    const colorIds = {
      Red: 100,
      Blue: 200,
      Yellow: 300,
      Green: 400
    }
    return {
      relicId: colorIds[targetColor] || relicId,
      relicName: `${targetColor} Relic`,
      color: targetColor,
      effects,
      changedRelicId: Boolean(colorIds[targetColor] && colorIds[targetColor] !== relicId),
      alreadyTarget: false
    }
  },
  listRelicEditOptions: async (relicId, safeMode) => {
    record('listRelicEditOptions', { relicId, safeMode })
    return [
      { id: relicId, name: `Relic ${relicId}`, color: 'Red', deep: relicId >= 2000000, effectSlots: 3, curseSlots: 0 },
      { id: relicId >= 2000000 ? 2000001 : 101, name: 'Search Result Relic', color: 'Blue', deep: relicId >= 2000000, effectSlots: 2, curseSlots: 0 }
    ]
  },
  listEffectEditOptions: async (relicId, slotIndex, effects, safeMode) => {
    record('listEffectEditOptions', { relicId, slotIndex, effects, safeMode })
    return [
      { id: EMPTY, name: '-', warning: false, needsCurse: false },
      { id: 7000000 + slotIndex, name: `Search Effect ${slotIndex + 1}`, warning: false, needsCurse: false },
      { id: 7100000 + slotIndex, name: `Warning Effect ${slotIndex + 1}`, warning: true, needsCurse: slotIndex < 3 }
    ]
  },
  exportRelicsExcel: async () => {
    record('exportRelicsExcel')
    return { path: 'mock/relics.xlsx', count: relics.length }
  },
  importRelicsExcel: async () => {
    record('importRelicsExcel')
    return {
      added: 0,
      failed: 0,
      existing: relics.length,
      skippedUnique: 0,
      selectedCharacter: refreshState()
    }
  },
  listVesselRelicOptions: async (heroType, vesselId, slotIndex) => {
    record('listVesselRelicOptions', { heroType, vesselId, slotIndex })
    return [
      { gaHandle: 0, itemId: null, name: '(Empty)', color: 'Red', deep: false, equippedByText: '-', effectNames: ['-', '-', '-'] },
      ...relics.map((entry) => ({
        gaHandle: entry.gaHandle,
        itemId: entry.itemId,
        name: entry.name,
        color: entry.color,
        deep: entry.deep,
        equippedByText: entry.equippedByText,
        effectNames: entry.effectNames.slice(0, 3)
      }))
    ]
  },
  listVessels: async (heroType) => {
    record('listVessels', heroType)
    return clone(vessels.map((group) => ({ ...group, heroType })))
  },
  listPresets: async (heroType) => {
    record('listPresets', heroType)
    return clone(presets.map((preset) => ({ ...preset, heroType })))
  },
  replaceVesselRelic: async (_heroType, _vesselId, _slotIndex, gaHandle) => {
    record('replaceVesselRelic', gaHandle)
    return replaceSlot(gaHandle)
  },
  replacePresetRelic: async (_heroType, _presetIndex, _slotIndex, gaHandle) => {
    record('replacePresetRelic', gaHandle)
    presets = presets.map((preset) => ({
      ...preset,
      rows: preset.rows.map((row, index) => (index === 0 ? vesselSlot(1, 'Normal', 'Red', relics.find((entry) => entry.gaHandle === gaHandle) ?? null) : row))
    }))
    return refreshState()
  },
  saveVesselPreset: async (heroType, vesselId, name) => {
    record('saveVesselPreset', { heroType, vesselId, name })
    presets = [
      ...presets,
      {
        index: presets.length,
        heroPresetIndex: presets.length,
        heroType,
        name,
        vesselId,
        vesselName: 'Mock Vessel',
        relicCount: 3,
        equipped: false,
        rows: vessels[0].rows
      }
    ]
    return refreshState()
  },
  equipPreset: async (heroType, presetIndex) => {
    record('equipPreset', { heroType, presetIndex })
    presets = presets.map((preset) => ({ ...preset, equipped: preset.index === presetIndex }))
    return refreshState()
  },
  deletePreset: async (heroType, presetIndex) => {
    record('deletePreset', { heroType, presetIndex })
    presets = presets.filter((preset) => preset.index !== presetIndex)
    return refreshState()
  },
  renamePreset: async (heroType, presetIndex, name) => {
    record('renamePreset', { heroType, presetIndex, name })
    presets = presets.map((preset) => (preset.index === presetIndex ? { ...preset, name } : preset))
    return refreshState()
  },
  exportLoadout: async (heroType, defaultName) => {
    record('exportLoadout', { heroType, defaultName })
    return { path: 'mock/loadout.json', heroType }
  },
  previewImportLoadout: async () => {
    record('previewImportLoadout')
    return {
      inputFile: 'mock/loadout.json',
      vessels: [{ index: 0, type: 'vessel', name: 'Mock Vessel', vesselId: 19000, vesselName: 'Mock Vessel', relicCount: 3, unlocked: true }],
      presets: [{ index: 0, type: 'preset', name: 'Preset A', vesselId: 19000, vesselName: 'Mock Vessel', relicCount: 3, unlocked: true }]
    }
  },
  applyImportLoadout: async (vesselIndices, presetIndices) => {
    record('applyImportLoadout', { vesselIndices, presetIndices })
    return { messages: ['imported'], selectedCharacter: refreshState() }
  },
  cancelImportLoadout: async () => {
    record('cancelImportLoadout')
    return { restored: true, selectedCharacter: refreshState() }
  },
  backendPing: async () => {
    record('backendPing')
    return { ok: true }
  },
  getSettings: async () => {
    record('getSettings')
    return clone(settings)
  },
  updateSettings: async (patch) => {
    record('updateSettings', patch)
    Object.assign(settings, patch)
    settings.languageName = settings.language === 'zh_CN' ? 'Simplified Chinese' : 'English'
    return { settings: clone(settings), selectedCharacter: clone(state) }
  },
  readClipboard: () => clipboardText,
  writeClipboard: (text) => {
    clipboardText = text
    record('writeClipboard', text)
  },
  minimize: async () => undefined,
  toggleMaximize: async () => undefined,
  close: async () => undefined
}

contextBridge.exposeInMainWorld('nightreign', api)
contextBridge.exposeInMainWorld('nightreignSmoke', {
  calls: () => clone(calls),
  state: () => clone(state)
})
