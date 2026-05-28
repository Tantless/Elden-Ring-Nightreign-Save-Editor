import { clipboard, contextBridge, ipcRenderer } from 'electron'

const api = {
  openSaveFile: (): Promise<unknown | null> => ipcRenderer.invoke('dialog:open-save-file'),
  openLastSave: (): Promise<unknown | null> => ipcRenderer.invoke('save:open-last'),
  openImportSaveFile: (): Promise<unknown | null> =>
    ipcRenderer.invoke('dialog:open-import-save-file'),
  loadCharacter: (index: number): Promise<unknown> => ipcRenderer.invoke('character:load', index),
  replaceCharacter: (importIndex: number): Promise<unknown> =>
    ipcRenderer.invoke('character:replace', importIndex),
  updateStat: (field: string, value: number): Promise<unknown> =>
    ipcRenderer.invoke('stats:update', field, value),
  saveCurrentCharacter: (): Promise<unknown> => ipcRenderer.invoke('character:save-current'),
  saveAs: (): Promise<unknown | null> => ipcRenderer.invoke('dialog:save-as'),
  addRelic: (relicType: string, count = 1): Promise<unknown> =>
    ipcRenderer.invoke('relic:add', relicType, count),
  deleteRelic: (gaHandle: number): Promise<unknown> => ipcRenderer.invoke('relic:delete', gaHandle),
  deleteRelics: (gaHandles: number[]): Promise<unknown> =>
    ipcRenderer.invoke('relic:delete-many', gaHandles),
  toggleFavoriteRelic: (gaHandle: number): Promise<unknown> =>
    ipcRenderer.invoke('relic:toggle-favorite', gaHandle),
  toggleFavoriteRelics: (gaHandles: number[]): Promise<unknown> =>
    ipcRenderer.invoke('relic:toggle-favorite-many', gaHandles),
  copyRelicEffects: (gaHandles: number[]): Promise<unknown> =>
    ipcRenderer.invoke('relic:copy-effects', gaHandles),
  pasteRelicEffects: (gaHandles: number[], effectsText: string): Promise<unknown> =>
    ipcRenderer.invoke('relic:paste-effects', gaHandles, effectsText),
  reindexRelics: (targetIndex: number, gaHandles: number[]): Promise<unknown> =>
    ipcRenderer.invoke('relic:reindex', targetIndex, gaHandles),
  deleteIllegalRelics: (): Promise<unknown> => ipcRenderer.invoke('relic:delete-illegal'),
  massFixRelics: (): Promise<unknown> => ipcRenderer.invoke('relic:mass-fix'),
  updateRelic: (gaHandle: number, relicId: number, effects: number[]): Promise<unknown> =>
    ipcRenderer.invoke('relic:update', gaHandle, relicId, effects),
  prepareRelicEdit: (relicId: number, effects: number[]): Promise<unknown> =>
    ipcRenderer.invoke('relic:prepare-edit', relicId, effects),
  inspectRelicEdit: (relicId: number, effects: number[]): Promise<unknown> =>
    ipcRenderer.invoke('relic:inspect-edit', relicId, effects),
  changeRelicColor: (
    gaHandle: number,
    relicId: number,
    effects: number[],
    targetColor: string
  ): Promise<unknown> => ipcRenderer.invoke('relic:change-color', gaHandle, relicId, effects, targetColor),
  listRelicEditOptions: (relicId: number, safeMode: boolean): Promise<unknown> =>
    ipcRenderer.invoke('relic:list-edit-options', relicId, safeMode),
  listEffectEditOptions: (
    relicId: number,
    slotIndex: number,
    effects: number[],
    safeMode: boolean
  ): Promise<unknown> => ipcRenderer.invoke('relic:list-effect-options', relicId, slotIndex, effects, safeMode),
  exportRelicsExcel: (): Promise<unknown | null> => ipcRenderer.invoke('dialog:export-relics-excel'),
  importRelicsExcel: (): Promise<unknown | null> => ipcRenderer.invoke('dialog:import-relics-excel'),
  listVesselRelicOptions: (
    heroType: number,
    vesselId: number,
    slotIndex: number
  ): Promise<unknown> => ipcRenderer.invoke('vessel:list-relic-options', heroType, vesselId, slotIndex),
  listVessels: (heroType: number): Promise<unknown> => ipcRenderer.invoke('vessel:list', heroType),
  listPresets: (heroType: number): Promise<unknown> => ipcRenderer.invoke('preset:list', heroType),
  replaceVesselRelic: (
    heroType: number,
    vesselId: number,
    slotIndex: number,
    gaHandle: number
  ): Promise<unknown> =>
    ipcRenderer.invoke('vessel:replace-relic', heroType, vesselId, slotIndex, gaHandle),
  replacePresetRelic: (
    heroType: number,
    presetIndex: number,
    slotIndex: number,
    gaHandle: number
  ): Promise<unknown> =>
    ipcRenderer.invoke('preset:replace-relic', heroType, presetIndex, slotIndex, gaHandle),
  saveVesselPreset: (heroType: number, vesselId: number, name: string): Promise<unknown> =>
    ipcRenderer.invoke('preset:save-vessel', heroType, vesselId, name),
  equipPreset: (heroType: number, presetIndex: number): Promise<unknown> =>
    ipcRenderer.invoke('preset:equip', heroType, presetIndex),
  deletePreset: (heroType: number, presetIndex: number): Promise<unknown> =>
    ipcRenderer.invoke('preset:delete', heroType, presetIndex),
  renamePreset: (heroType: number, presetIndex: number, name: string): Promise<unknown> =>
    ipcRenderer.invoke('preset:rename', heroType, presetIndex, name),
  exportLoadout: (heroType: number, defaultName: string): Promise<unknown | null> =>
    ipcRenderer.invoke('dialog:export-loadout', heroType, defaultName),
  previewImportLoadout: (): Promise<unknown | null> =>
    ipcRenderer.invoke('dialog:preview-import-loadout'),
  applyImportLoadout: (vesselIndices: number[], presetIndices: number[]): Promise<unknown> =>
    ipcRenderer.invoke('loadout:apply-import', vesselIndices, presetIndices),
  cancelImportLoadout: (): Promise<unknown> => ipcRenderer.invoke('loadout:cancel-import'),
  backendPing: (): Promise<unknown> => ipcRenderer.invoke('backend:ping'),
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('settings:update', settings),
  readClipboard: (): string => clipboard.readText(),
  writeClipboard: (text: string): void => clipboard.writeText(text),
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close')
}

contextBridge.exposeInMainWorld('nightreign', api)
