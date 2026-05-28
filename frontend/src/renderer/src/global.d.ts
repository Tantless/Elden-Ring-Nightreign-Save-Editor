export {}

declare global {
  interface Window {
    nightreign: {
      openSaveFile: () => Promise<unknown | null>
      openLastSave: () => Promise<unknown | null>
      openImportSaveFile: () => Promise<unknown | null>
      loadCharacter: (index: number) => Promise<unknown>
      replaceCharacter: (importIndex: number) => Promise<unknown>
      updateStat: (field: string, value: number) => Promise<unknown>
      saveCurrentCharacter: () => Promise<unknown>
      saveAs: () => Promise<unknown | null>
      addRelic: (relicType: string, count?: number) => Promise<unknown>
      deleteRelic: (gaHandle: number) => Promise<unknown>
      deleteRelics: (gaHandles: number[]) => Promise<unknown>
      toggleFavoriteRelic: (gaHandle: number) => Promise<unknown>
      toggleFavoriteRelics: (gaHandles: number[]) => Promise<unknown>
      copyRelicEffects: (gaHandles: number[]) => Promise<unknown>
      pasteRelicEffects: (gaHandles: number[], effectsText: string) => Promise<unknown>
      reindexRelics: (targetIndex: number, gaHandles: number[]) => Promise<unknown>
      deleteIllegalRelics: () => Promise<unknown>
      massFixRelics: () => Promise<unknown>
      updateRelic: (gaHandle: number, relicId: number, effects: number[]) => Promise<unknown>
      prepareRelicEdit: (relicId: number, effects: number[]) => Promise<unknown>
      inspectRelicEdit: (relicId: number, effects: number[]) => Promise<unknown>
      changeRelicColor: (
        gaHandle: number,
        relicId: number,
        effects: number[],
        targetColor: string
      ) => Promise<unknown>
      listRelicEditOptions: (relicId: number, safeMode: boolean) => Promise<unknown>
      listEffectEditOptions: (
        relicId: number,
        slotIndex: number,
        effects: number[],
        safeMode: boolean
      ) => Promise<unknown>
      exportRelicsExcel: () => Promise<unknown | null>
      importRelicsExcel: () => Promise<unknown | null>
      listVesselRelicOptions: (
        heroType: number,
        vesselId: number,
        slotIndex: number
      ) => Promise<unknown>
      listVessels: (heroType: number) => Promise<unknown>
      listPresets: (heroType: number) => Promise<unknown>
      replaceVesselRelic: (
        heroType: number,
        vesselId: number,
        slotIndex: number,
        gaHandle: number
      ) => Promise<unknown>
      replacePresetRelic: (
        heroType: number,
        presetIndex: number,
        slotIndex: number,
        gaHandle: number
      ) => Promise<unknown>
      saveVesselPreset: (heroType: number, vesselId: number, name: string) => Promise<unknown>
      equipPreset: (heroType: number, presetIndex: number) => Promise<unknown>
      deletePreset: (heroType: number, presetIndex: number) => Promise<unknown>
      renamePreset: (heroType: number, presetIndex: number, name: string) => Promise<unknown>
      exportLoadout: (heroType: number, defaultName: string) => Promise<unknown | null>
      previewImportLoadout: () => Promise<unknown | null>
      applyImportLoadout: (vesselIndices: number[], presetIndices: number[]) => Promise<unknown>
      cancelImportLoadout: () => Promise<unknown>
      backendPing: () => Promise<unknown>
      getSettings: () => Promise<unknown>
      updateSettings: (settings: Record<string, unknown>) => Promise<unknown>
      readClipboard: () => string
      writeClipboard: (text: string) => void
      minimize: () => Promise<void>
      toggleMaximize: () => Promise<void>
      close: () => Promise<void>
    }
  }
}
