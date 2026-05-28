import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCopy,
  ClipboardPaste,
  Clock3,
  Download,
  FileArchive,
  Folder,
  FolderOpen,
  Gauge,
  Gem,
  Globe2,
  Hammer,
  Languages,
  Minus,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  Skull,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Trophy,
  Upload,
  UserRound,
  UsersRound,
  Wand2,
  ArrowUpDown,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type View = 'files' | 'relics' | 'vessels' | 'settings'

type RelicRow = {
  id: number
  gaHandle?: number
  name: string
  deep: boolean
  itemId: number
  color: 'Red' | 'Blue' | 'Yellow' | 'Green' | 'White'
  equippedBy: string
  effectIds?: number[]
  effect1: string
  effect2: string
  effect3: string
  favorite?: boolean
  flagged?: boolean
  illegal?: boolean
  curseIllegal?: boolean
  strictInvalid?: boolean
  unique?: boolean
}

type RelicSortKey =
  | 'favorite'
  | 'id'
  | 'name'
  | 'deep'
  | 'itemId'
  | 'color'
  | 'equippedBy'
  | 'effect1'
  | 'effect2'
  | 'effect3'

type SortDirection = 'asc' | 'desc'

type BackendCharacterSummary = {
  index: number
  name: string
  path: string
  selected: boolean
}

type BackendStats = {
  murks: number
  sigs: number
}

type BackendLanguageOption = {
  code: string
  name: string
}

type BackendSettings = {
  configPath: string
  lastFile: string
  lastCharIndex: number
  language: string
  languageName: string
  languages: BackendLanguageOption[]
  theme: 'Light' | 'Dark'
  reduceMessagePop: boolean
  autoBackup: boolean
  maxBackups: number
}

type BackendSettingsPatch = Partial<
  Pick<BackendSettings, 'language' | 'theme' | 'reduceMessagePop' | 'autoBackup' | 'maxBackups'>
>

type BackendSettingsUpdateResult = {
  settings: BackendSettings
  selectedCharacter: BackendCharacterState | null
}

type BackendRelic = {
  order: number
  gaHandle: number
  itemId: number
  name: string
  color: string
  deep: boolean
  favorite: boolean
  equippedByText: string
  effectIds: number[]
  effectNames: string[]
  illegal: boolean
  curseIllegal: boolean
  strictInvalid: boolean
  unique: boolean
}

type BackendVesselSlot = {
  slot: number
  type: 'Normal' | 'Deep'
  color: string
  requiredColor: string
  gaHandle: number
  name: string
  itemId: number | null
  effectIds: number[]
  effectNames: string[]
  empty: boolean
}

type BackendVesselGroup = {
  index: number
  vesselId: number
  heroType: number
  name: string
  status: string
  unlocked: boolean
  rows: BackendVesselSlot[]
}

type BackendVesselPreset = {
  index: number
  heroPresetIndex: number
  heroType: number
  name: string
  vesselId: number
  vesselName: string
  relicCount: number
  equipped: boolean
  rows: BackendVesselSlot[]
}

type BackendHero = {
  heroType: number
  name: string
}

type BackendVesselRelicOption = {
  gaHandle: number
  itemId: number | null
  name: string
  color: string
  deep: boolean
  equippedByText: string
  effectNames: string[]
}

type BackendCharacterState = {
  index: number
  name: string
  path: string
  stats: BackendStats
  characters: BackendCharacterSummary[]
  heroes: BackendHero[]
  relics: BackendRelic[]
  vessels: BackendVesselGroup[]
  presets: BackendVesselPreset[]
  addedCount?: number
  lastGaHandle?: number
}

type BackendOpenSaveResult = {
  savePath: string
  characters: BackendCharacterSummary[]
  selectedCharacter: BackendCharacterState | null
}

type BackendImportSaveResult = {
  savePath: string
  characters: BackendCharacterSummary[]
}

type BackendSaveResult = {
  savePath: string
  selectedCharacter: BackendCharacterState
}

type BackendLoadoutImportItem = {
  index: number
  type: 'vessel' | 'preset'
  name: string
  vesselId: number
  vesselName: string
  relicCount: number
  unlocked: boolean
}

type BackendLoadoutImportPreview = {
  inputFile: string
  vessels: BackendLoadoutImportItem[]
  presets: BackendLoadoutImportItem[]
}

type BackendLoadoutImportResult = {
  messages: string[]
  selectedCharacter: BackendCharacterState
}

type BackendRelicsExcelImportResult = {
  added: number
  failed: number
  existing: number
  skippedUnique: number
  selectedCharacter: BackendCharacterState
}

type BackendRelicBatchResult = {
  message: string
  selectedCharacter: BackendCharacterState
}

type BackendRelicEffectsCopy = {
  effectsText: string
  count: number
  uniqueNames: string[]
}

type BackendRelicEditPreparation = {
  relicId: number
  relicName: string
  effects: number[]
  effectNames: string[]
  changedRelicId: boolean
  invalidReason: string
  strictInvalid: boolean
}

type BackendRelicEditInspection = {
  relicId: number
  relicName: string
  effects: number[]
  effectNames: string[]
  invalidReason: string
  invalidIndex: number
  strictInvalid: boolean
  strictReason: string | null
  status: string
  title: string
  detail: string
  color: string
  deep: boolean
  effectSlots: number
  curseSlots: number
  debugLines: string[]
}

type BackendRelicColorChange = {
  relicId: number
  relicName: string
  color: string
  effects: number[]
  changedRelicId: boolean
  alreadyTarget: boolean
}

type PendingInvalidRelicSave = {
  relicId: number
  effects: number[]
  reason: string
}

type BackendRelicEditOption = {
  id: number
  name: string
  color: string
  deep: boolean
  effectSlots: number
  curseSlots: number
}

type BackendEffectEditOption = {
  id: number
  name: string
  warning: boolean
  needsCurse: boolean
}

type SelectOption = {
  value: string
  label: string
}

type StatField = 'murks' | 'sigs'
type RelicType = 'normal' | 'deep'

type EditingStat = {
  field: StatField
  label: string
  value: number
}

type EditingRelic = {
  gaHandle: number
  name: string
  itemId: number
  color: RelicRow['color']
  deep: boolean
  effectIds: number[]
}

type RelicEditPicker =
  | {
      mode: 'relic'
      options: BackendRelicEditOption[]
    }
  | {
      mode: 'effect'
      slotIndex: number
      options: BackendEffectEditOption[]
    }

type EditingLoadoutSlot = {
  mode: 'vessel' | 'preset'
  title: string
  groupName: string
  heroName: string
  row: VesselRow
  options: BackendVesselRelicOption[]
  preset?: VesselPresetView
}

type PendingPresetName = {
  mode: 'create' | 'rename'
  heroType: number
  vesselId?: number
  presetIndex?: number
  initialName: string
  title: string
}

type PendingRelicPaste = {
  rows: RelicRow[]
  effectsText: string
}

type VesselRow = {
  slot: number
  vesselId: number
  vesselIndex: number
  heroType: number
  gaHandle: number
  type: 'Normal' | 'Deep'
  color: 'Red' | 'Blue' | 'Yellow' | 'Green' | 'White'
  name: string
  itemId: number | null
  id: string
  effectIds: number[]
  effect1: string
  effect2: string
  effect3: string
}

type VesselGroupView = {
  index: number
  vesselId: number
  heroType: number
  name: string
  status: string
  locked: boolean
  rows: VesselRow[]
}

type VesselPresetView = {
  index: number
  heroPresetIndex: number
  heroType: number
  name: string
  vesselId: number
  vesselName: string
  relicCount: number
  equipped: boolean
  rows: VesselRow[]
}

const navItems: Array<{ id: View; label: string; icon: typeof Folder }> = [
  { id: 'files', label: '文件管理', icon: Folder },
  { id: 'relics', label: '遗物', icon: Gem },
  { id: 'vessels', label: '圣杯', icon: Trophy },
  { id: 'settings', label: '设置', icon: Settings }
]

const relicRows: RelicRow[] = [
  {
    id: 736,
    name: '迂阔的幽静暗淡背景',
    deep: true,
    itemId: 2012322,
    color: 'Green',
    equippedBy: '-',
    effect1: '受到损伤的当下，能通过攻击恢复部分血量 +1',
    effect2: '-',
    effect3: '-'
  },
  {
    id: 735,
    name: '迂阔的水滴暗淡背景',
    deep: true,
    itemId: 2010102,
    color: 'Blue',
    equippedBy: '-',
    effect1: '对陷入猩红腐败的敌人，能强化攻击 +1',
    effect2: '-',
    effect3: '-'
  },
  {
    id: 734,
    name: '迂阔的光辉暗淡背景',
    deep: false,
    itemId: 2011202,
    color: 'Yellow',
    equippedBy: '-',
    effect1: '以剧烈攻击时，恢复血量',
    effect2: '-',
    effect3: '-'
  },
  {
    id: 733,
    name: '迂阔的水滴暗淡背景',
    deep: true,
    itemId: 2013102,
    color: 'Blue',
    equippedBy: '-',
    effect1: '以弓攻击时，恢复专注值',
    effect2: '-',
    effect3: '-'
  },
  {
    id: 732,
    name: '迂阔的火焰暗淡背景',
    deep: true,
    itemId: 2013122,
    color: 'Blue',
    equippedBy: '-',
    effect1: '【女爵】发动技艺时，能进入短暂无敌状态',
    effect2: '-',
    effect3: '-'
  },
  {
    id: 731,
    name: '迂阔的火焰暗淡背景',
    deep: true,
    itemId: 2010012,
    color: 'Red',
    equippedBy: '-',
    effect1: '【学者】提升集中力，但降低生命力',
    effect2: '-',
    effect3: '-',
    flagged: true
  },
  {
    id: 730,
    name: '迂阔的幽静暗淡背景',
    deep: true,
    itemId: 2010302,
    color: 'Green',
    equippedBy: '-',
    effect1: '以刺剑攻击时，恢复专注值',
    effect2: '-',
    effect3: '-'
  },
  {
    id: 729,
    name: '真正的冰滴背景',
    deep: true,
    itemId: 2011211,
    color: 'Yellow',
    equippedBy: '-',
    effect1: '对陷入中毒的敌人，能强化攻击 +1',
    effect2: '-',
    effect3: '-'
  },
  {
    id: 728,
    name: '真正的幽静暗淡背景',
    deep: true,
    itemId: 2013311,
    color: 'Green',
    equippedBy: '-',
    effect1: '提升火属性攻击力 +2',
    effect2: '-',
    effect3: '-'
  }
]

const vesselGroups: VesselGroupView[] = [
  {
    name: '追踪者爵杯',
    status: '已解锁（6/6 遗物）',
    locked: false,
    rows: [
      ['Normal', 'Red', '安定的遗志', '2071', '提升近战攻击力', '提升战技攻击力', '降低强韧临时...'],
      ['Normal', 'Red', '追踪者的耳环', '11001', '【追踪者】技艺的使用次数 +1', '【追踪者】发动绝招时，能燃烧火焰，蔓延周围', '攻击命中时，...'],
      ['Normal', 'Blue', '迂阔的水滴背景', '1007212', '不包含自己，提升周围我方人物的精力恢复速度', '每次打倒敌人后，能提升攻击力', '耐力 +3'],
      ['Deep', 'Red', '迂阔的火焰暗淡背景', '2011012', '提升物理攻击力 +4', '提升对腐败的抵抗力 +1', '提升理性减伤率...'],
      ['Deep', 'Red', '迂阔的火焰暗淡背景', '2010012', '【无畏】攻击命中敌人时，降低敌方的攻击力', '负用者等毒雾道具时，能恢复血量 +1', '提升物理攻击力...'],
      ['Deep', 'Blue', '迂阔的水滴暗淡背景', '2000102', '【追踪者】技艺会附加引发异常状态出血的效果', '强化咒器术 +1', '提升物理攻击力...']
    ]
  },
  {
    name: '追踪者杯盏',
    status: '未解锁（Unlock Flag: 60010）',
    locked: true,
    rows: [
      ['Normal', 'Yellow', '(Empty)', '-', '-', '-', '-'],
      ['Normal', 'Green', '(Empty)', '-', '-', '-', '-'],
      ['Normal', 'Green', '(Empty)', '-', '-', '-', '-'],
      ['Deep', 'Yellow', '(Empty)', '-', '-', '-', '-'],
      ['Deep', 'Green', '(Empty)', '-', '-', '-', '-'],
      ['Deep', 'Green', '(Empty)', '-', '-', '-', '-']
    ]
  },
  {
    name: '追踪者高脚杯',
    status: '已解锁（6/6 遗物）',
    locked: false,
    rows: [
      ['Normal', 'Red', '安定的遗志', '2071', '提升近战攻击力', '提升战技攻击力', '降低强韧临时...'],
      ['Normal', 'Yellow', '猎人的暗夜', '2051', '提升精力上限', '附加属性攻击力时，能提升属性攻击力', '打倒敌人时，...'],
      ['Normal', 'Blue', '受祝福的蓝滴', '30031', '提升最大专注值', '提升专注恢复速度', '增加专注回复...']
    ]
  }
].map((group, groupIndex) => ({
  ...group,
  index: groupIndex,
  vesselId: 19000 + groupIndex,
  heroType: 1,
  rows: group.rows.map((row, index) => ({
    slot: index + 1,
    vesselId: 19000 + groupIndex,
    vesselIndex: groupIndex,
    heroType: 1,
    gaHandle: 0,
    type: row[0],
    color: row[1],
    name: row[2],
    itemId: Number.isFinite(Number(row[3])) ? Number(row[3]) : null,
    id: row[3],
    effectIds: [],
    effect1: row[4],
    effect2: row[5],
    effect3: row[6]
  })) as VesselRow[]
}))

const colorClass = (color: string): string => color.toLowerCase()

export function App(): React.JSX.Element {
  const [activeView, setActiveView] = useState<View>('files')
  const [savePath, setSavePath] = useState<string | null>(null)
  const [sessionState, setSessionState] = useState<BackendCharacterState | null>(null)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [backendNotice, setBackendNotice] = useState<string | null>(null)
  const [backendBusy, setBackendBusy] = useState(false)
  const [settings, setSettings] = useState<BackendSettings | null>(null)
  const [selectedVesselHeroType, setSelectedVesselHeroType] = useState(1)
  const [editingStat, setEditingStat] = useState<EditingStat | null>(null)
  const [editingRelic, setEditingRelic] = useState<EditingRelic | null>(null)
  const [editingLoadoutSlot, setEditingLoadoutSlot] = useState<EditingLoadoutSlot | null>(null)
  const [pendingDeleteRelic, setPendingDeleteRelic] = useState<RelicRow | null>(null)
  const [pendingRelicBulkAction, setPendingRelicBulkAction] = useState<
    'deleteIllegal' | 'massFix' | null
  >(null)
  const [pendingDeleteRelics, setPendingDeleteRelics] = useState<RelicRow[] | null>(null)
  const [pendingRelicPaste, setPendingRelicPaste] = useState<PendingRelicPaste | null>(null)
  const [pendingRelicReindex, setPendingRelicReindex] = useState<RelicRow[] | null>(null)
  const [pendingAddRelic, setPendingAddRelic] = useState(false)
  const [pendingPresetName, setPendingPresetName] = useState<PendingPresetName | null>(null)
  const [pendingEquipPreset, setPendingEquipPreset] = useState<VesselPresetView | null>(null)
  const [pendingDeletePreset, setPendingDeletePreset] = useState<VesselPresetView | null>(null)
  const [pendingReplaceImport, setPendingReplaceImport] = useState<BackendImportSaveResult | null>(null)
  const [pendingLoadoutImport, setPendingLoadoutImport] =
    useState<BackendLoadoutImportPreview | null>(null)
  const currentPage = useMemo(() => navItems.find((item) => item.id === activeView), [activeView])
  const relicTableRows = useMemo(
    () => sessionState?.relics.map(toRelicRow) ?? relicRows,
    [sessionState]
  )
  const vesselTableGroups = useMemo(
    () => sessionState?.vessels.map(toVesselGroup) ?? vesselGroups,
    [sessionState]
  )
  const vesselPresets = useMemo(
    () => sessionState?.presets.map(toVesselPreset) ?? [],
    [sessionState]
  )

  const applyOpenedSave = (opened: BackendOpenSaveResult): void => {
    setSavePath(opened.savePath)
    setSessionState(opened.selectedCharacter)
    setSelectedVesselHeroType(1)
    setSettings((previous) =>
      previous
        ? {
            ...previous,
            lastFile: opened.savePath,
            lastCharIndex: opened.selectedCharacter?.index ?? previous.lastCharIndex
          }
        : previous
    )
  }

  useEffect(() => {
    void bootstrapSession()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme.toLowerCase() ?? 'dark'
  }, [settings?.theme])

  const refreshSettings = async (): Promise<void> => {
    try {
      const currentSettings = await window.nightreign.getSettings()
      if (isSettings(currentSettings)) {
        setSettings(currentSettings)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    }
  }

  const bootstrapSession = async (): Promise<void> => {
    setBackendError(null)
    try {
      const currentSettings = await window.nightreign.getSettings()
      if (!isSettings(currentSettings)) {
        return
      }
      setSettings(currentSettings)
      if (!currentSettings.lastFile) {
        return
      }

      setBackendBusy(true)
      const restored = await window.nightreign.openLastSave()
      if (isOpenSaveResult(restored)) {
        applyOpenedSave(restored)
        setBackendNotice('已恢复上次打开的存档。')
      }
    } catch (error) {
      setBackendError(
        `无法恢复上次打开的存档：${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      setBackendBusy(false)
    }
  }

  const updateSettings = async (patch: BackendSettingsPatch): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.updateSettings(patch)
      if (isSettingsUpdateResult(result)) {
        setSettings(result.settings)
        if (result.selectedCharacter) {
          setSessionState(result.selectedCharacter)
        }
        setBackendNotice('设置已保存。')
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const openSaveFile = async (): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const selected = await window.nightreign.openSaveFile()
      if (isOpenSaveResult(selected)) {
        applyOpenedSave(selected)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const loadCharacter = async (index: number): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const selected = await window.nightreign.loadCharacter(index)
      if (isCharacterState(selected)) {
        setSessionState(selected)
        setSelectedVesselHeroType(1)
        setSettings((previous) =>
          previous ? { ...previous, lastCharIndex: selected.index } : previous
        )
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const updateStat = async (field: StatField, value: number): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.updateStat(field, value)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setEditingStat(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const saveAs = async (): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const saved = await window.nightreign.saveAs()
      if (isSaveResult(saved)) {
        setSavePath(saved.savePath)
        setSessionState(saved.selectedCharacter)
        setSettings((previous) =>
          previous
            ? {
                ...previous,
                lastFile: saved.savePath,
                lastCharIndex: saved.selectedCharacter.index
              }
            : previous
        )
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const openImportSaveFile = async (): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const imported = await window.nightreign.openImportSaveFile()
      if (isImportSaveResult(imported)) {
        if (imported.characters.length === 0) {
          setBackendError('导入存档中未找到可替换的角色档案。')
        } else {
          setPendingReplaceImport(imported)
        }
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const replaceCharacter = async (importIndex: number): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.replaceCharacter(importIndex)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setPendingReplaceImport(null)
        setSelectedVesselHeroType(1)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const addRelic = async (relicType: RelicType, count: number): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.addRelic(relicType, count)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setPendingAddRelic(false)
        const lastGaHandle = isRecord(updated) ? updated.lastGaHandle : null
        const addedCount = isRecord(updated) ? updated.addedCount : count
        setBackendNotice(`已新增 ${typeof addedCount === 'number' ? addedCount : count} 个遗物。`)
        if (count === 1 && typeof lastGaHandle === 'number') {
          const newRelic = updated.relics.map(toRelicRow).find((row) => row.gaHandle === lastGaHandle)
          if (newRelic) {
            editRelic(newRelic)
          }
        }
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const deleteRelic = async (gaHandle: number): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.deleteRelic(gaHandle)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setPendingDeleteRelic(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const deleteRelics = async (rows: RelicRow[]): Promise<void> => {
    const gaHandles = rows.flatMap((row) =>
      typeof row.gaHandle === 'number' ? [row.gaHandle] : []
    )
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.deleteRelics(gaHandles)
      if (isRelicBatchResult(result)) {
        setSessionState(result.selectedCharacter)
        setBackendNotice(result.message)
        setPendingDeleteRelics(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const updateRelic = async (
    gaHandle: number,
    relicId: number,
    effects: number[]
  ): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.updateRelic(gaHandle, relicId, effects)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setEditingRelic(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const exportRelicsExcel = async (): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      await window.nightreign.exportRelicsExcel()
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const importRelicsExcel = async (): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.importRelicsExcel()
      if (isRelicsExcelImportResult(result)) {
        setSessionState(result.selectedCharacter)
        setBackendNotice(
          `导入完成：新增 ${result.added}，已存在 ${result.existing}，失败 ${result.failed}，跳过唯一遗物 ${result.skippedUnique}。`
        )
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const editRelic = (row: RelicRow): void => {
    if (typeof row.gaHandle !== 'number') {
      return
    }
    setEditingRelic({
      gaHandle: row.gaHandle,
      name: row.name,
      itemId: row.itemId,
      color: row.color,
      deep: row.deep,
      effectIds: row.effectIds ?? []
    })
  }

  const editLoadoutSlotRelic = (row: VesselRow): void => {
    const relicRow = toRelicRowFromVesselSlot(row)
    if (relicRow) {
      editRelic(relicRow)
    }
  }

  const toggleFavoriteRelic = async (row: RelicRow): Promise<void> => {
    if (typeof row.gaHandle !== 'number') {
      return
    }
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.toggleFavoriteRelic(row.gaHandle)
      if (isCharacterState(updated)) {
        setSessionState(updated)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const toggleFavoriteRelics = async (rows: RelicRow[]): Promise<void> => {
    const gaHandles = rows.flatMap((row) =>
      typeof row.gaHandle === 'number' ? [row.gaHandle] : []
    )
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.toggleFavoriteRelics(gaHandles)
      if (isRelicBatchResult(result)) {
        setSessionState(result.selectedCharacter)
        setBackendNotice(result.message)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const copyRelicEffects = async (rows: RelicRow[]): Promise<void> => {
    const gaHandles = rows.flatMap((row) =>
      typeof row.gaHandle === 'number' ? [row.gaHandle] : []
    )
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const copied = await window.nightreign.copyRelicEffects(gaHandles)
      if (isRelicEffectsCopy(copied)) {
        window.nightreign.writeClipboard(copied.effectsText)
        const uniqueNotice = copied.uniqueNames.length
          ? `；包含唯一遗物：${copied.uniqueNames.join('、')}`
          : ''
        setBackendNotice(`已复制 ${copied.count} 个遗物的效果${uniqueNotice}。`)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const requestPasteRelicEffects = (rows: RelicRow[]): void => {
    const effectsText = window.nightreign.readClipboard()
    setPendingRelicPaste({ rows, effectsText })
  }

  const pasteRelicEffects = async (pending: PendingRelicPaste): Promise<void> => {
    const gaHandles = pending.rows.flatMap((row) =>
      typeof row.gaHandle === 'number' ? [row.gaHandle] : []
    )
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.pasteRelicEffects(gaHandles, pending.effectsText)
      if (isRelicBatchResult(result)) {
        setSessionState(result.selectedCharacter)
        setBackendNotice(result.message)
        setPendingRelicPaste(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const reindexRelics = async (rows: RelicRow[], targetIndex: number): Promise<void> => {
    const gaHandles = rows.flatMap((row) =>
      typeof row.gaHandle === 'number' ? [row.gaHandle] : []
    )
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.reindexRelics(targetIndex, gaHandles)
      if (isRelicBatchResult(result)) {
        setSessionState(result.selectedCharacter)
        setBackendNotice(result.message)
        setPendingRelicReindex(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const deleteIllegalRelics = async (): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.deleteIllegalRelics()
      if (isRelicBatchResult(result)) {
        setSessionState(result.selectedCharacter)
        setBackendNotice(result.message)
        setPendingRelicBulkAction(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const massFixRelics = async (): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.massFixRelics()
      if (isRelicBatchResult(result)) {
        setSessionState(result.selectedCharacter)
        setBackendNotice(result.message)
        setPendingRelicBulkAction(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const openVesselSlotEditor = async (groupName: string, row: VesselRow): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const options = await window.nightreign.listVesselRelicOptions(
        row.heroType,
        row.vesselId,
        row.slot - 1
      )
      if (isVesselRelicOptions(options)) {
        setEditingLoadoutSlot({
          mode: 'vessel',
          title: '替换圣杯槽位',
          groupName,
          heroName:
            sessionState?.heroes?.find((hero) => hero.heroType === row.heroType)?.name ?? '',
          row,
          options
        })
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const openPresetSlotEditor = async (preset: VesselPresetView, row: VesselRow): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const options = await window.nightreign.listVesselRelicOptions(
        row.heroType,
        row.vesselId,
        row.slot - 1
      )
      if (isVesselRelicOptions(options)) {
        setEditingLoadoutSlot({
          mode: 'preset',
          title: '替换预设槽位',
          groupName: `${preset.name} · ${preset.vesselName}`,
          heroName:
            sessionState?.heroes?.find((hero) => hero.heroType === row.heroType)?.name ?? '',
          row,
          options,
          preset
        })
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const changeVesselHero = async (heroType: number): Promise<void> => {
    setSelectedVesselHeroType(heroType)
    if (!sessionState) {
      return
    }

    setBackendError(null)
    setBackendBusy(true)
    try {
      const [vessels, presets] = await Promise.all([
        window.nightreign.listVessels(heroType),
        window.nightreign.listPresets(heroType)
      ])
      if (isVesselGroups(vessels) && isVesselPresets(presets)) {
        setSessionState({
          ...sessionState,
          vessels,
          presets
        })
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const saveVesselPreset = async (
    heroType: number,
    vesselId: number,
    name: string
  ): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.saveVesselPreset(heroType, vesselId, name)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setSelectedVesselHeroType(heroType)
        setPendingPresetName(null)
        setBackendNotice(`预设「${name.trim()}」已保存。`)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const equipPreset = async (preset: VesselPresetView): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.equipPreset(preset.heroType, preset.index)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setSelectedVesselHeroType(preset.heroType)
        setPendingEquipPreset(null)
        setBackendNotice(`预设「${preset.name}」已装备。`)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const deletePreset = async (preset: VesselPresetView): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.deletePreset(preset.heroType, preset.index)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setSelectedVesselHeroType(preset.heroType)
        setPendingDeletePreset(null)
        setBackendNotice(`预设「${preset.name}」已删除。`)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const renamePreset = async (
    heroType: number,
    presetIndex: number,
    name: string
  ): Promise<void> => {
    setBackendError(null)
    setBackendNotice(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.renamePreset(heroType, presetIndex, name)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setSelectedVesselHeroType(heroType)
        setPendingPresetName(null)
        setBackendNotice(`预设已重命名为「${name.trim()}」。`)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const replaceVesselRelic = async (
    heroType: number,
    vesselId: number,
    slotIndex: number,
    gaHandle: number
  ): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.replaceVesselRelic(heroType, vesselId, slotIndex, gaHandle)
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setEditingLoadoutSlot(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const replacePresetRelic = async (
    heroType: number,
    presetIndex: number,
    slotIndex: number,
    gaHandle: number
  ): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const updated = await window.nightreign.replacePresetRelic(
        heroType,
        presetIndex,
        slotIndex,
        gaHandle
      )
      if (isCharacterState(updated)) {
        setSessionState(updated)
        setSelectedVesselHeroType(heroType)
        setEditingLoadoutSlot(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const exportLoadout = async (heroType: number): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      await window.nightreign.exportLoadout(heroType, sessionState?.name ?? 'nightreign')
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const previewImportLoadout = async (): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const preview = await window.nightreign.previewImportLoadout()
      if (isLoadoutImportPreview(preview)) {
        setPendingLoadoutImport(preview)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const applyImportLoadout = async (
    vesselIndices: number[],
    presetIndices: number[]
  ): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.applyImportLoadout(vesselIndices, presetIndices)
      if (isLoadoutImportResult(result)) {
        setSessionState(result.selectedCharacter)
        setPendingLoadoutImport(null)
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  const cancelImportLoadout = async (): Promise<void> => {
    setBackendError(null)
    setBackendBusy(true)
    try {
      const result = await window.nightreign.cancelImportLoadout()
      if (isRecord(result) && isCharacterState(result.selectedCharacter)) {
        setSessionState(result.selectedCharacter)
      }
      setPendingLoadoutImport(null)
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setBackendBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
        <main className="main-panel">
          <PageHeader
            title={
              activeView === 'files'
                ? '存档管理'
                : activeView === 'relics'
                  ? '遗物管理'
                  : activeView === 'vessels'
                    ? '圣杯配置'
                    : '设置'
            }
            subtitle={
              activeView === 'files'
                ? '管理与编辑《艾尔登法环：黑夜君临》的本地存档数据'
                : activeView === 'relics'
                  ? '管理与验证当前存档的遗物库存。'
                  : activeView === 'vessels'
                    ? '配置圣杯遗物配装，管理追踪者的专属遗物组合与效果。'
                    : '调整编辑器的界面与本地偏好。'
            }
            currentPage={currentPage?.label ?? ''}
            hasLoadedCharacter={Boolean(sessionState)}
            selectedHeroName={
              sessionState?.heroes.find((hero) => hero.heroType === selectedVesselHeroType)?.name ??
              sessionState?.heroes[0]?.name ??
              '追踪者'
            }
            settings={settings}
          />

          {activeView === 'files' && (
            <FilesPage
              backendError={backendError}
              backendBusy={backendBusy}
              characters={sessionState?.characters}
              onEditStat={setEditingStat}
              onOpenSave={openSaveFile}
              onOpenImportSave={() => void openImportSaveFile()}
              onRefreshStats={() => {
                if (sessionState) {
                  void loadCharacter(sessionState.index)
                }
              }}
              onSaveAs={() => void saveAs()}
              onSelectCharacter={(index) => void loadCharacter(index)}
              onUpdateSettings={(patch) => void updateSettings(patch)}
              savePath={savePath}
              selectedCharacterIndex={sessionState?.index}
              settings={settings}
              stats={sessionState?.stats}
            />
          )}
          {activeView === 'relics' && (
            <RelicsPage
              backendBusy={backendBusy}
              backendError={backendError}
              backendNotice={backendNotice}
              hasLoadedCharacter={Boolean(sessionState)}
              rows={relicTableRows}
              onAddRelic={() => setPendingAddRelic(true)}
              onCopyEffects={(rows) => void copyRelicEffects(rows)}
              onDeleteIllegal={() => setPendingRelicBulkAction('deleteIllegal')}
              onDeleteRelic={setPendingDeleteRelic}
              onDeleteRelics={setPendingDeleteRelics}
              onExportExcel={() => void exportRelicsExcel()}
              onEditRelic={editRelic}
              onImportExcel={() => void importRelicsExcel()}
              onMassFix={() => setPendingRelicBulkAction('massFix')}
              onPasteEffects={requestPasteRelicEffects}
              onReindexRelics={setPendingRelicReindex}
              onRefresh={() => {
                if (sessionState) {
                  void loadCharacter(sessionState.index)
                }
              }}
              onToggleFavorite={(row) => void toggleFavoriteRelic(row)}
              onToggleFavoriteMany={(rows) => void toggleFavoriteRelics(rows)}
            />
          )}
          {activeView === 'vessels' && (
            <VesselsPage
              backendBusy={backendBusy}
              backendError={backendError}
              groups={vesselTableGroups}
              heroOptions={sessionState?.heroes}
              hasLoadedCharacter={Boolean(sessionState)}
              presets={vesselPresets}
              onClearSlot={(row) =>
                void replaceVesselRelic(row.heroType, row.vesselId, row.slot - 1, 0)
              }
              onCopySlotEffects={(row) => {
                const relicRow = toRelicRowFromVesselSlot(row)
                if (relicRow) {
                  void copyRelicEffects([relicRow])
                }
              }}
              onDeletePreset={setPendingDeletePreset}
              onEquipPreset={setPendingEquipPreset}
              onExportLoadout={(heroType) => void exportLoadout(heroType)}
              onEditSlotRelic={(row) => editLoadoutSlotRelic(row)}
              onEditPresetSlot={(preset, row) => void openPresetSlotEditor(preset, row)}
              onEditSlot={(groupName, row) => void openVesselSlotEditor(groupName, row)}
              onHeroChange={(heroType) => void changeVesselHero(heroType)}
              onImportLoadout={() => void previewImportLoadout()}
              onPasteSlotEffects={(row) => {
                const relicRow = toRelicRowFromVesselSlot(row)
                if (relicRow) {
                  requestPasteRelicEffects([relicRow])
                }
              }}
              onRenamePreset={(preset) =>
                setPendingPresetName({
                  mode: 'rename',
                  heroType: preset.heroType,
                  presetIndex: preset.index,
                  initialName: preset.name,
                  title: '重命名预设'
                })
              }
              onRefresh={() => {
                if (sessionState) {
                  void changeVesselHero(selectedVesselHeroType)
                }
              }}
              onSavePreset={(group) =>
                setPendingPresetName({
                  mode: 'create',
                  heroType: group.heroType,
                  vesselId: group.vesselId,
                  initialName: group.name,
                  title: '保存为预设'
                })
              }
              selectedHeroType={selectedVesselHeroType}
            />
          )}
          {activeView === 'settings' && (
            <SettingsPage
              backendBusy={backendBusy}
              backendError={backendError}
              backendNotice={backendNotice}
              settings={settings}
              onRefresh={() => void refreshSettings()}
              onUpdateSettings={(patch) => void updateSettings(patch)}
            />
          )}
          {editingStat && (
            <StatEditDialog
              busy={backendBusy}
              editingStat={editingStat}
              onCancel={() => setEditingStat(null)}
              onSubmit={(field, value) => void updateStat(field, value)}
            />
          )}
          {editingRelic && (
            <RelicEditDialog
              busy={backendBusy}
              editingRelic={editingRelic}
              onCancel={() => setEditingRelic(null)}
              onSubmit={(gaHandle, relicId, effects) => void updateRelic(gaHandle, relicId, effects)}
            />
          )}
          {pendingAddRelic && (
            <AddRelicDialog
              busy={backendBusy}
              onCancel={() => setPendingAddRelic(false)}
              onSubmit={(relicType, count) => void addRelic(relicType, count)}
            />
          )}
          {pendingDeleteRelic && typeof pendingDeleteRelic.gaHandle === 'number' && (
            <ConfirmDialog
              busy={backendBusy}
              confirmLabel="删除遗物"
              message={`确定删除「${pendingDeleteRelic.name}」？已装备遗物会由后端阻止删除。`}
              title="确认删除"
              tone="danger"
              onCancel={() => setPendingDeleteRelic(null)}
              onConfirm={() => void deleteRelic(pendingDeleteRelic.gaHandle as number)}
            />
          )}
          {pendingDeleteRelics && (
            <ConfirmDialog
              busy={backendBusy}
              confirmLabel="删除所选"
              message={`确定删除选中的 ${pendingDeleteRelics.length} 个遗物？已装备或无法删除的遗物会由后端阻止或计入失败。`}
              title="确认批量删除"
              tone="danger"
              onCancel={() => setPendingDeleteRelics(null)}
              onConfirm={() => void deleteRelics(pendingDeleteRelics)}
            />
          )}
          {pendingRelicBulkAction === 'deleteIllegal' && (
            <ConfirmDialog
              busy={backendBusy}
              confirmLabel="删除非法遗物"
              message="确定删除当前角色库存中所有后端标记为非法的遗物？已装备或无法删除的遗物会被后端跳过并返回失败数量。"
              title="确认批量删除"
              tone="danger"
              onCancel={() => setPendingRelicBulkAction(null)}
              onConfirm={() => void deleteIllegalRelics()}
            />
          )}
          {pendingRelicBulkAction === 'massFix' && (
            <ConfirmDialog
              busy={backendBusy}
              confirmLabel="批量修正"
              message="确定尝试自动修正非法和严格非法遗物？该操作会调整可修复遗物的 ID 或效果顺序，并写回当前已解包角色档案。"
              title="确认批量修正"
              onCancel={() => setPendingRelicBulkAction(null)}
              onConfirm={() => void massFixRelics()}
            />
          )}
          {pendingRelicPaste && (
            <ConfirmDialog
              busy={backendBusy}
              confirmLabel="粘贴效果"
              message={`确定将剪贴板中的遗物效果粘贴到选中的 ${pendingRelicPaste.rows.length} 个遗物？后端会按普通/深层排序匹配，并尝试沿用旧版自动修正规则。`}
              title="确认粘贴效果"
              onCancel={() => setPendingRelicPaste(null)}
              onConfirm={() => void pasteRelicEffects(pendingRelicPaste)}
            />
          )}
          {pendingRelicReindex && (
            <RelicReindexDialog
              busy={backendBusy}
              count={pendingRelicReindex.length}
              maxIndex={relicTableRows.length}
              onCancel={() => setPendingRelicReindex(null)}
              onSubmit={(targetIndex) => void reindexRelics(pendingRelicReindex, targetIndex)}
            />
          )}
          {editingLoadoutSlot && (
            <LoadoutSlotReplaceDialog
              busy={backendBusy}
              editingSlot={editingLoadoutSlot}
              onCancel={() => setEditingLoadoutSlot(null)}
              onSubmit={(target, gaHandle) => {
                if (target.mode === 'preset' && target.preset) {
                  void replacePresetRelic(
                    target.preset.heroType,
                    target.preset.index,
                    target.row.slot - 1,
                    gaHandle
                  )
                  return
                }
                void replaceVesselRelic(
                  target.row.heroType,
                  target.row.vesselId,
                  target.row.slot - 1,
                  gaHandle
                )
              }}
            />
          )}
          {pendingPresetName && (
            <PresetNameDialog
              busy={backendBusy}
              initialName={pendingPresetName.initialName}
              title={pendingPresetName.title}
              onCancel={() => setPendingPresetName(null)}
              onSubmit={(name) => {
                if (pendingPresetName.mode === 'create' && pendingPresetName.vesselId !== undefined) {
                  void saveVesselPreset(pendingPresetName.heroType, pendingPresetName.vesselId, name)
                } else if (
                  pendingPresetName.mode === 'rename' &&
                  pendingPresetName.presetIndex !== undefined
                ) {
                  void renamePreset(pendingPresetName.heroType, pendingPresetName.presetIndex, name)
                }
              }}
            />
          )}
          {pendingEquipPreset && (
            <ConfirmDialog
              busy={backendBusy}
              confirmLabel="装备预设"
              message={`确定将「${pendingEquipPreset.name}」装备到「${pendingEquipPreset.vesselName}」？当前容器槽位会被该预设覆盖。`}
              title="确认装备预设"
              onCancel={() => setPendingEquipPreset(null)}
              onConfirm={() => void equipPreset(pendingEquipPreset)}
            />
          )}
          {pendingDeletePreset && (
            <ConfirmDialog
              busy={backendBusy}
              confirmLabel="删除预设"
              message={`确定删除预设「${pendingDeletePreset.name}」？该操作会写回当前已解包角色档案。`}
              title="确认删除预设"
              tone="danger"
              onCancel={() => setPendingDeletePreset(null)}
              onConfirm={() => void deletePreset(pendingDeletePreset)}
            />
          )}
          {pendingReplaceImport && (
            <ReplaceCharacterDialog
              busy={backendBusy}
              currentName={sessionState?.name ?? '当前角色'}
              importResult={pendingReplaceImport}
              onCancel={() => setPendingReplaceImport(null)}
              onSubmit={(importIndex) => void replaceCharacter(importIndex)}
            />
          )}
          {pendingLoadoutImport && (
            <LoadoutImportDialog
              busy={backendBusy}
              preview={pendingLoadoutImport}
              onCancel={() => void cancelImportLoadout()}
              onSubmit={(vesselIndices, presetIndices) =>
                void applyImportLoadout(vesselIndices, presetIndices)
              }
            />
          )}
        </main>
      </div>
    </div>
  )
}

function TitleBar(): React.JSX.Element {
  return (
    <header className="title-bar">
      <div className="title-brand">
        <RuneMark compact />
        <span>Elden Ring Nightreign Save Editor</span>
      </div>
      <div className="window-actions">
        <button aria-label="Minimize" onClick={() => void window.nightreign.minimize()}>
          <Minus size={17} />
        </button>
        <button aria-label="Maximize" onClick={() => void window.nightreign.toggleMaximize()}>
          <Square size={14} />
        </button>
        <button aria-label="Close" onClick={() => void window.nightreign.close()}>
          <X size={17} />
        </button>
      </div>
    </header>
  )
}

function Sidebar({
  activeView,
  onNavigate
}: {
  activeView: View
  onNavigate: (view: View) => void
}): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <RuneMark />
        <div className="game-title">
          <span>ELDEN RING</span>
          <strong>NIGHTREIGN</strong>
        </div>
      </div>

      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-ambience" />

      <div className="current-character">
        <div className="avatar-ring">
          <UserRound size={25} />
        </div>
        <div>
          <span>当前角色</span>
          <strong>追踪者</strong>
          <em>
            <span className="status-dot" />
            存档已加载
          </em>
        </div>
      </div>

      <footer className="sidebar-footer">
        <span>v1.0.0</span>
        <CircleHelp size={20} />
      </footer>
    </aside>
  )
}

function PageHeader({
  title,
  subtitle,
  currentPage,
  hasLoadedCharacter,
  selectedHeroName,
  settings
}: {
  title: string
  subtitle: string
  currentPage: string
  hasLoadedCharacter: boolean
  selectedHeroName: string
  settings: BackendSettings | null
}): React.JSX.Element {
  return (
    <section className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-controls">
        <SelectButton icon={Globe2} label="语言：" value={settings?.languageName ?? '简体中文'} />
        <SelectButton icon={Palette} label="主题：" value={settings?.theme ?? 'Dark'} />
        <SelectButton icon={UserRound} label="角色：" value={selectedHeroName} />
        <div className={`save-state ${hasLoadedCharacter ? '' : 'muted'}`}>
          <CheckCircle2 size={19} />
          <span>
            {hasLoadedCharacter
              ? currentPage === '遗物'
                ? '存档已加载'
                : '当前存档已加载'
              : '未加载存档'}
          </span>
        </div>
        <div className="last-save">
          <Clock3 size={18} />
          <span>最近文件： {settings?.lastFile ? '已记录' : '无'}</span>
        </div>
      </div>
    </section>
  )
}

function SelectButton({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Globe2
  label: string
  value: string
}): React.JSX.Element {
  return (
    <button className="select-button">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <ChevronDown size={17} />
    </button>
  )
}

function FilesPage({
  backendError,
  backendBusy,
  characters,
  onEditStat,
  onOpenSave,
  onOpenImportSave,
  onRefreshStats,
  onSaveAs,
  onSelectCharacter,
  onUpdateSettings,
  savePath,
  selectedCharacterIndex,
  settings,
  stats
}: {
  backendError: string | null
  backendBusy: boolean
  characters?: BackendCharacterSummary[]
  onEditStat: (stat: EditingStat) => void
  onOpenSave: () => void
  onOpenImportSave: () => void
  onRefreshStats: () => void
  onSaveAs: () => void
  onSelectCharacter: (index: number) => void
  onUpdateSettings: (patch: BackendSettingsPatch) => void
  savePath: string | null
  selectedCharacterIndex?: number
  settings: BackendSettings | null
  stats?: BackendStats
}): React.JSX.Element {
  const visibleCharacters =
    characters && characters.length > 0
      ? characters
      : [
          { index: 0, name: 'Tantless', path: '', selected: true },
          { index: 1, name: 'Tant1e5s', path: '', selected: false }
        ]

  return (
    <div className="page-stack">
      {backendError && (
        <section className="error-banner">
          <AlertTriangle size={18} />
          <span>{backendError}</span>
        </section>
      )}
      <div className="grid two-columns">
        <section className="panel-card">
          <PanelTitle icon={FolderOpen} title="当前存档" />
          <dl className="save-details">
            <div>
              <dt>游戏：</dt>
              <dd>《艾尔登法环：黑夜君临》</dd>
            </div>
            <div>
              <dt>状态：</dt>
              <dd>
                <span className="pill success">已加载</span>
              </dd>
            </div>
            {savePath && (
              <div>
                <dt>路径：</dt>
                <dd className="path-text">{savePath}</dd>
              </div>
            )}
          </dl>
          <div className="button-row">
            <ActionButton
              disabled={backendBusy}
              icon={FolderOpen}
              label={backendBusy ? '处理中...' : '打开存档'}
              tone="primary"
              onClick={onOpenSave}
            />
            <ActionButton
              disabled={backendBusy || !stats}
              icon={Save}
              label={backendBusy ? '处理中...' : '保存存档'}
              tone="blue"
              onClick={onSaveAs}
            />
            <ActionButton
              disabled={backendBusy || !stats}
              icon={UsersRound}
              label="替换角色档案"
              onClick={onOpenImportSave}
            />
          </div>
        </section>

        <section className="panel-card">
          <PanelTitle icon={Settings} title="偏好设置" />
          <SettingsControls
            busy={backendBusy}
            compact
            settings={settings}
            onUpdate={onUpdateSettings}
          />
        </section>
      </div>

      <section className="panel-card stats-panel">
        <PanelTitle
          icon={Gauge}
          title="角色档案数据"
          right={
            <ActionButton
              disabled={backendBusy || !stats}
              icon={RefreshCw}
              label="刷新数据"
              compact
              onClick={onRefreshStats}
            />
          }
        />
        <div className="stats-list">
          <StatRow
            disabled={backendBusy || !stats}
            field="murks"
            icon={Sparkles}
            label="暗痕"
            onEdit={onEditStat}
            value={stats?.murks ?? 5853}
          />
          <StatRow
            disabled={backendBusy || !stats}
            field="sigs"
            icon={Archive}
            label="为王之证"
            onEdit={onEditStat}
            value={stats?.sigs ?? 13}
          />
        </div>
      </section>

      <section className="panel-card">
        <PanelTitle icon={UsersRound} title="选择角色档案" />
        <div className="character-grid">
          {visibleCharacters.map((character) => (
            <CharacterCard
              active={(selectedCharacterIndex ?? 0) === character.index}
              index={character.index + 1}
              key={`${character.index}-${character.name}`}
              name={character.name}
              onClick={() => onSelectCharacter(character.index)}
              warning={character.index === 1 && !characters}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function RelicsPage({
  backendBusy,
  backendError,
  backendNotice,
  hasLoadedCharacter,
  rows,
  onAddRelic,
  onCopyEffects,
  onDeleteIllegal,
  onDeleteRelic,
  onDeleteRelics,
  onExportExcel,
  onEditRelic,
  onImportExcel,
  onMassFix,
  onPasteEffects,
  onReindexRelics,
  onToggleFavorite,
  onToggleFavoriteMany,
  onRefresh
}: {
  backendBusy: boolean
  backendError: string | null
  backendNotice: string | null
  hasLoadedCharacter: boolean
  rows: RelicRow[]
  onAddRelic: () => void
  onCopyEffects: (rows: RelicRow[]) => void
  onDeleteIllegal: () => void
  onDeleteRelic: (row: RelicRow) => void
  onDeleteRelics: (rows: RelicRow[]) => void
  onExportExcel: () => void
  onEditRelic: (row: RelicRow) => void
  onImportExcel: () => void
  onMassFix: () => void
  onPasteEffects: (rows: RelicRow[]) => void
  onReindexRelics: (rows: RelicRow[]) => void
  onToggleFavorite: (row: RelicRow) => void
  onToggleFavoriteMany: (rows: RelicRow[]) => void
  onRefresh: () => void
}): React.JSX.Element {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [searchText, setSearchText] = useState('')
  const [searchField, setSearchField] = useState('all')
  const [equippedFilter, setEquippedFilter] = useState('all')
  const [colorFilter, setColorFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState<RelicSortKey>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const getRelicKey = (row: RelicRow): string =>
    typeof row.gaHandle === 'number' ? `real-${row.gaHandle}` : `mock-${row.id}-${row.itemId}`
  const equippedOptions = useMemo<SelectOption[]>(() => {
    const names = new Set<string>()
    for (const row of rows) {
      if (!row.equippedBy || row.equippedBy === '-') {
        continue
      }
      for (const name of row.equippedBy.split(',')) {
        const trimmed = name.trim()
        if (trimmed) {
          names.add(trimmed)
        }
      }
    }
    return [
      { value: 'all', label: 'All' },
      { value: 'none', label: '未装备' },
      ...[...names].sort().map((name) => ({ value: name, label: name }))
    ]
  }, [rows])
  const changeSort = (key: RelicSortKey): void => {
    setSortDirection((currentDirection) => (sortKey === key && currentDirection === 'asc' ? 'desc' : 'asc'))
    setSortKey(key)
  }
  const renderSortHeader = (key: RelicSortKey, label: string): React.JSX.Element => (
    <button
      aria-label={`按 ${label} 排序`}
      aria-sort={sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`table-sort ${sortKey === key ? `active ${sortDirection}` : ''}`}
      type="button"
      onClick={() => changeSort(key)}
    >
      <span>{label}</span>
      <ArrowUpDown size={14} />
    </button>
  )
  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    const compareText = (left: string, right: string): number =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
    const matchingRows = rows.filter((row) => {
      if (query) {
        const searchTargets =
          searchField === 'name'
            ? [row.name]
            : searchField === 'itemId'
              ? [String(row.itemId)]
              : searchField === 'effects'
                ? [row.effect1, row.effect2, row.effect3]
                : [
                    row.name,
                    String(row.itemId),
                    row.color,
                    row.equippedBy,
                    row.effect1,
                    row.effect2,
                    row.effect3
                  ]
        if (!searchTargets.some((target) => target.toLowerCase().includes(query))) {
          return false
        }
      }
      if (equippedFilter === 'none' && row.equippedBy !== '-') {
        return false
      }
      if (equippedFilter !== 'all' && equippedFilter !== 'none' && !row.equippedBy.includes(equippedFilter)) {
        return false
      }
      if (colorFilter !== 'all' && row.color !== colorFilter) {
        return false
      }
      if (statusFilter === 'favorite' && !row.favorite) {
        return false
      }
      if (statusFilter === 'illegal' && !row.illegal) {
        return false
      }
      if (statusFilter === 'curseIllegal' && !row.curseIllegal) {
        return false
      }
      if (statusFilter === 'strictInvalid' && !row.strictInvalid) {
        return false
      }
      if (statusFilter === 'unique' && !row.unique) {
        return false
      }
      if (statusFilter === 'deep' && !row.deep) {
        return false
      }
      if (statusFilter === 'normal' && (row.favorite || row.flagged || row.deep)) {
        return false
      }
      return true
    })
    return matchingRows.sort((left, right) => {
      let comparison = 0
      switch (sortKey) {
        case 'favorite':
          comparison =
            Number(!(left.favorite || left.flagged)) - Number(!(right.favorite || right.flagged))
          break
        case 'id':
          comparison = left.id - right.id
          break
        case 'name':
          comparison = compareText(left.name, right.name)
          break
        case 'deep':
          comparison = Number(!left.deep) - Number(!right.deep)
          break
        case 'itemId':
          comparison = left.itemId - right.itemId
          break
        case 'color':
          comparison = compareText(left.color, right.color)
          break
        case 'equippedBy':
          comparison = compareText(left.equippedBy, right.equippedBy)
          break
        case 'effect1':
          comparison = compareText(left.effect1, right.effect1)
          break
        case 'effect2':
          comparison = compareText(left.effect2, right.effect2)
          break
        case 'effect3':
          comparison = compareText(left.effect3, right.effect3)
          break
      }
      if (comparison !== 0) {
        return sortDirection === 'asc' ? comparison : -comparison
      }
      return left.id - right.id
    })
  }, [colorFilter, equippedFilter, rows, searchField, searchText, sortDirection, sortKey, statusFilter])
  const selectedRows = filteredRows.filter((row) => selectedKeys.has(getRelicKey(row)))
  const primaryRow = selectedRows[0] ?? filteredRows[0] ?? null
  const selectedRealRows = selectedRows.filter((row) => typeof row.gaHandle === 'number')
  const primaryRowKey = primaryRow ? getRelicKey(primaryRow) : null
  const hasSelection = selectedRealRows.length > 0
  const selectedCanMutate = hasLoadedCharacter && typeof primaryRow?.gaHandle === 'number'
  const selectOne = (key: string): void => setSelectedKeys(new Set([key]))
  const toggleOne = (key: string): void => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }
  const selectAll = (): void => setSelectedKeys(new Set(filteredRows.map(getRelicKey)))
  const invertSelection = (): void => {
    setSelectedKeys((current) => {
      const next = new Set<string>()
      for (const row of filteredRows) {
        const key = getRelicKey(row)
        if (!current.has(key)) {
          next.add(key)
        }
      }
      return next
    })
  }
  const clearSelection = (): void => setSelectedKeys(new Set())
  const resetFilters = (): void => {
    setSearchText('')
    setSearchField('all')
    setEquippedFilter('all')
    setColorFilter('all')
    setStatusFilter('all')
  }

  return (
    <div className="page-stack">
      {backendError && (
        <section className="error-banner">
          <AlertTriangle size={18} />
          <span>{backendError}</span>
        </section>
      )}
      {backendNotice && (
        <section className="notice-banner">
          <CheckCircle2 size={18} />
          <span>{backendNotice}</span>
        </section>
      )}
      <section className="panel-card toolbar-panel">
        <div className="button-row wrap">
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter}
            icon={Plus}
            label={backendBusy ? '处理中...' : '新增遗物'}
            tone="primary"
            onClick={onAddRelic}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter}
            icon={RefreshCw}
            label="刷新库存"
            onClick={onRefresh}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter}
            icon={Download}
            label="导出为 Excel"
            onClick={onExportExcel}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter}
            icon={Upload}
            label="从 Excel 导入"
            onClick={onImportExcel}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter}
            icon={Trash2}
            label="删除非法遗物"
            tone="danger"
            onClick={onDeleteIllegal}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter}
            icon={Hammer}
            label="修正非法遗物"
            onClick={onMassFix}
          />
        </div>
        <div className="legend-row">
          <span className="pill success">
            <ShieldCheck size={16} />
            未检测到非法遗物
          </span>
          <span className="pill danger">红色 = 非法</span>
          <span className="pill purple">紫色 = 负面非法</span>
          <span className="pill green">绿色 = 严格非法</span>
          <span className="pill amber">橙色 = 商店遗物（请勿编辑）</span>
          <span className="pill blue">蓝色 = 非法商店遗物</span>
        </div>
      </section>

      <section className="filter-bar">
        <div className="search-input">
          <Gem size={19} />
          <input
            aria-label="搜索遗物"
            placeholder="搜索遗物..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <FilterSelect
          label="字段"
          options={[
            { value: 'all', label: 'All Fields' },
            { value: 'name', label: 'Item Name' },
            { value: 'itemId', label: 'Item ID' },
            { value: 'effects', label: 'Effects' }
          ]}
          value={searchField}
          onChange={setSearchField}
        />
        <FilterSelect
          label="角色"
          options={equippedOptions}
          value={equippedFilter}
          onChange={setEquippedFilter}
        />
        <FilterSelect
          label="颜色"
          options={[
            { value: 'all', label: 'All' },
            { value: 'Red', label: 'Red' },
            { value: 'Blue', label: 'Blue' },
            { value: 'Yellow', label: 'Yellow' },
            { value: 'Green', label: 'Green' },
            { value: 'White', label: 'White' }
          ]}
          value={colorFilter}
          onChange={setColorFilter}
        />
        <FilterSelect
          label="状态"
          options={[
            { value: 'all', label: 'All' },
            { value: 'normal', label: '普通' },
            { value: 'favorite', label: '收藏' },
            { value: 'deep', label: '深层' },
            { value: 'illegal', label: '非法' },
            { value: 'curseIllegal', label: '负面非法' },
            { value: 'strictInvalid', label: '严格非法' },
            { value: 'unique', label: '唯一/商店' }
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <ActionButton icon={RefreshCw} label="重置" compact onClick={resetFilters} />
      </section>

      <section className="panel-card table-panel">
        <div className="data-table relic-table">
          <div className="table-row table-head">
            {renderSortHeader('favorite', '收藏/标记')}
            {renderSortHeader('id', '#')}
            {renderSortHeader('name', 'Item Name')}
            {renderSortHeader('deep', 'Deep')}
            {renderSortHeader('itemId', 'Item ID')}
            {renderSortHeader('color', 'Color')}
            {renderSortHeader('equippedBy', 'Equipped By')}
            {renderSortHeader('effect1', 'Effect 1')}
            {renderSortHeader('effect2', 'Effect 2')}
            {renderSortHeader('effect3', 'Effect 3')}
            <Settings size={18} />
          </div>
          {filteredRows.map((row) => (
            <button
              className={`table-row clickable ${selectedKeys.has(getRelicKey(row)) ? 'selected' : ''}`}
              key={getRelicKey(row)}
              type="button"
              onClick={(event) => {
                const key = getRelicKey(row)
                if (event.ctrlKey || event.metaKey) {
                  toggleOne(key)
                } else {
                  selectOne(key)
                }
              }}
            >
              <span className={`favorite ${row.favorite ? 'active' : ''}`}>
                {row.favorite ? '★' : '☆'}
              </span>
              <span>{row.id}</span>
              <span>{row.name}</span>
              <span>{row.deep ? <SkullBadge /> : '-'}</span>
              <span>{row.itemId}</span>
              <span className="color-cell">
                <i className={`color-dot ${colorClass(row.color)}`} />
                {row.color}
              </span>
              <span>{row.equippedBy}</span>
              <span>{row.effect1}</span>
              <span>{row.effect2}</span>
              <span>{row.effect3}</span>
              <span />
            </button>
          ))}
          {filteredRows.length === 0 && (
            <div className="empty-table-note">没有符合当前筛选条件的遗物。</div>
          )}
        </div>
        <div className="table-scrollbar">
          <i />
        </div>
        <div className="bottom-actions">
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter || !hasSelection}
            icon={Sparkles}
            label="收藏"
            onClick={() => {
              if (selectedRealRows.length > 1) {
                onToggleFavoriteMany(selectedRealRows)
              } else if (primaryRow) {
                onToggleFavorite(primaryRow)
              }
            }}
          />
          <ActionButton
            disabled={backendBusy || !selectedCanMutate}
            icon={Pencil}
            label="编辑"
            tone="primary"
            onClick={() => {
              if (primaryRow) {
                onEditRelic(primaryRow)
              }
            }}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter || !hasSelection}
            icon={Trash2}
            label="删除"
            tone="danger"
            onClick={() => {
              if (selectedRealRows.length > 1) {
                onDeleteRelics(selectedRealRows)
              } else if (primaryRow) {
                onDeleteRelic(primaryRow)
              }
            }}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter || !hasSelection}
            icon={Download}
            label="复制效果"
            onClick={() => onCopyEffects(selectedRealRows)}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter || !hasSelection}
            icon={Upload}
            label="粘贴效果"
            onClick={() => onPasteEffects(selectedRealRows)}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter || !hasSelection}
            icon={Archive}
            label="重排"
            onClick={() => onReindexRelics(selectedRealRows)}
          />
          <ActionButton
            disabled={!hasLoadedCharacter || filteredRows.length === 0}
            icon={Check}
            label="全选"
            onClick={selectAll}
          />
          <ActionButton
            disabled={!hasLoadedCharacter || filteredRows.length === 0}
            icon={Shuffle}
            label="反选"
            onClick={invertSelection}
          />
          <ActionButton
            disabled={!hasLoadedCharacter || selectedKeys.size === 0}
            icon={Square}
            label="取消全选"
            onClick={clearSelection}
          />
        </div>
      </section>
    </div>
  )
}

function VesselsPage({
  backendBusy,
  backendError,
  groups,
  heroOptions,
  hasLoadedCharacter,
  presets,
  onClearSlot,
  onCopySlotEffects,
  onDeletePreset,
  onEquipPreset,
  onExportLoadout,
  onEditSlotRelic,
  onEditPresetSlot,
  onEditSlot,
  onHeroChange,
  onImportLoadout,
  onPasteSlotEffects,
  onRenamePreset,
  onRefresh,
  onSavePreset,
  selectedHeroType
}: {
  backendBusy: boolean
  backendError: string | null
  groups: VesselGroupView[]
  heroOptions?: BackendHero[]
  hasLoadedCharacter: boolean
  presets: VesselPresetView[]
  onClearSlot: (row: VesselRow) => void
  onCopySlotEffects: (row: VesselRow) => void
  onDeletePreset: (preset: VesselPresetView) => void
  onEquipPreset: (preset: VesselPresetView) => void
  onExportLoadout: (heroType: number) => void
  onEditSlotRelic: (row: VesselRow) => void
  onEditPresetSlot: (preset: VesselPresetView, row: VesselRow) => void
  onEditSlot: (groupName: string, row: VesselRow) => void
  onHeroChange: (heroType: number) => void
  onImportLoadout: () => void
  onPasteSlotEffects: (row: VesselRow) => void
  onRenamePreset: (preset: VesselPresetView) => void
  onRefresh: () => void
  onSavePreset: (group: VesselGroupView) => void
  selectedHeroType: number
}): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const heroSelectOptions = (heroOptions?.length ? heroOptions : [{ heroType: 1, name: '追踪者' }]).map(
    (hero) => ({
      value: String(hero.heroType),
      label: hero.name
    })
  )
  const getSlotKey = (group: VesselGroupView, row: VesselRow): string =>
    `${group.vesselId}-${row.slot}`
  const selectedSlot = groups
    .flatMap((group) => group.rows.map((row) => ({ group, row })))
    .find(({ group, row }) => getSlotKey(group, row) === selectedKey)
  const canEditSelected = hasLoadedCharacter && Boolean(selectedSlot)
  const canUseSelectedRelic =
    canEditSelected && Boolean(selectedSlot?.row.gaHandle) && selectedSlot?.row.itemId !== null

  return (
    <div className="page-stack vessels-page">
      {backendError && (
        <section className="error-banner">
          <AlertTriangle size={18} />
          <span>{backendError}</span>
        </section>
      )}
      <section className="panel-card vessel-toolbar">
        <div className="button-row">
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter}
            icon={RefreshCw}
            label="刷新"
            onClick={onRefresh}
          />
          <ActionButton
            disabled={backendBusy || !canEditSelected}
            icon={Wand2}
            label="替换槽位"
            tone="primary"
            onClick={() => {
              if (selectedSlot) {
                onEditSlot(selectedSlot.group.name, selectedSlot.row)
              }
            }}
          />
          <ActionButton
            disabled={backendBusy || !canUseSelectedRelic}
            icon={Pencil}
            label="编辑遗物"
            onClick={() => {
              if (selectedSlot) {
                onEditSlotRelic(selectedSlot.row)
              }
            }}
          />
          <ActionButton
            disabled={backendBusy || !canUseSelectedRelic}
            icon={Minus}
            label="清空槽位"
            onClick={() => {
              if (selectedSlot) {
                onClearSlot(selectedSlot.row)
              }
            }}
          />
          <ActionButton
            disabled={backendBusy || !canUseSelectedRelic}
            icon={ClipboardCopy}
            label="复制效果"
            onClick={() => {
              if (selectedSlot) {
                onCopySlotEffects(selectedSlot.row)
              }
            }}
          />
          <ActionButton
            disabled={backendBusy || !canUseSelectedRelic}
            icon={ClipboardPaste}
            label="粘贴效果"
            onClick={() => {
              if (selectedSlot) {
                onPasteSlotEffects(selectedSlot.row)
              }
            }}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter}
            icon={Save}
            label="保存配装"
            onClick={() => onExportLoadout(selectedSlot?.row.heroType ?? selectedHeroType)}
          />
          <ActionButton
            disabled={backendBusy || !hasLoadedCharacter}
            icon={FolderOpen}
            label="加载配装"
            onClick={onImportLoadout}
          />
        </div>
        <FilterSelect
          label="角色"
          options={heroSelectOptions}
          value={String(selectedHeroType)}
          onChange={(value) => {
            setSelectedKey(null)
            onHeroChange(Number(value))
          }}
        />
      </section>

      {groups.map((group) => (
        <section
          className="panel-card vessel-card"
          key={`${group.heroType}-${group.vesselId}-${group.index}`}
        >
          <PanelTitle
            title={group.name}
            right={
              <>
                <span className={`pill ${group.locked ? 'danger' : 'success'}`}>
                  {group.locked ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                  {group.status}
                </span>
                <ActionButton
                  disabled={backendBusy || !hasLoadedCharacter || group.locked}
                  icon={Plus}
                  label="保存为预设"
                  compact
                  tone="primary"
                  onClick={() => onSavePreset(group)}
                />
              </>
            }
          />
          <div className="data-table vessel-table">
            <div className="table-row table-head">
              <span>#</span>
              <span>Type</span>
              <span>Color</span>
              <span>Name</span>
              <span>ID</span>
              <span>Effect 1</span>
              <span>Effect 2</span>
              <span>Effect 3</span>
            </div>
            {group.rows.map((row) => (
              <button
                className={`table-row clickable ${selectedKey === getSlotKey(group, row) ? 'selected' : ''}`}
                key={`${group.vesselId}-${row.slot}`}
                type="button"
                onClick={() => setSelectedKey(getSlotKey(group, row))}
              >
                <span className={`slot-index ${colorClass(row.color)}`}>{row.slot}</span>
                <span>
                  <TypePill value={row.type} />
                </span>
                <span className="color-cell">
                  <i className={`color-dot ${colorClass(row.color)}`} />
                  {row.color}
                </span>
                <span>{row.name}</span>
                <span>{row.id}</span>
                <span>{row.effect1}</span>
                <span>{row.effect2}</span>
                <span>{row.effect3}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="panel-card vessel-card preset-panel">
        <PanelTitle
          title="保存的预设"
          right={
            <span className="pill blue">
              <Archive size={16} />
              {presets.length} 个预设
            </span>
          }
        />
        {presets.length === 0 ? (
          <p className="empty-table-note">当前角色暂无保存的圣杯预设。</p>
        ) : (
          <div className="preset-grid">
            {presets.map((preset) => (
              <article
                className={`preset-card ${preset.equipped ? 'active' : ''}`}
                key={`${preset.heroType}-${preset.index}`}
              >
                <div className="preset-card-head">
                  <div>
                    <strong>{preset.name}</strong>
                    <span>
                      {preset.vesselName} · {preset.relicCount}/6 遗物
                    </span>
                  </div>
                  {preset.equipped && (
                    <span className="pill success">
                      <CheckCircle2 size={15} />
                      已装备
                    </span>
                  )}
                </div>
                <div className="preset-slots">
                  {preset.rows.map((row) => (
                    <button
                      className="preset-slot"
                      disabled={backendBusy || !hasLoadedCharacter}
                      key={`${preset.index}-${row.slot}`}
                      title="替换预设槽位"
                      type="button"
                      onClick={() => onEditPresetSlot(preset, row)}
                    >
                      <i className={`color-dot ${colorClass(row.color)}`} />
                      <strong>{row.slot}</strong>
                      <em>{row.name}</em>
                    </button>
                  ))}
                </div>
                <div className="preset-actions">
                  <ActionButton
                    disabled={backendBusy || !hasLoadedCharacter || preset.equipped}
                    icon={Check}
                    label="装备"
                    compact
                    tone="primary"
                    onClick={() => onEquipPreset(preset)}
                  />
                  <ActionButton
                    disabled={backendBusy || !hasLoadedCharacter}
                    icon={Pencil}
                    label="重命名"
                    compact
                    onClick={() => onRenamePreset(preset)}
                  />
                  <ActionButton
                    disabled={backendBusy || !hasLoadedCharacter}
                    icon={Trash2}
                    label="删除"
                    compact
                    tone="danger"
                    onClick={() => onDeletePreset(preset)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SettingsPage({
  backendBusy,
  backendError,
  backendNotice,
  settings,
  onRefresh,
  onUpdateSettings
}: {
  backendBusy: boolean
  backendError: string | null
  backendNotice: string | null
  settings: BackendSettings | null
  onRefresh: () => void
  onUpdateSettings: (patch: BackendSettingsPatch) => void
}): React.JSX.Element {
  return (
    <div className="page-stack settings-page">
      {backendError && (
        <section className="error-banner">
          <AlertTriangle size={18} />
          <span>{backendError}</span>
        </section>
      )}
      {backendNotice && (
        <section className="notice-banner">
          <CheckCircle2 size={18} />
          <span>{backendNotice}</span>
        </section>
      )}
      <section className="panel-card">
        <PanelTitle
          icon={SlidersHorizontal}
          title="应用设置"
          right={<ActionButton disabled={backendBusy} icon={RefreshCw} label="刷新" compact onClick={onRefresh} />}
        />
        <SettingsControls
          busy={backendBusy}
          settings={settings}
          onUpdate={onUpdateSettings}
        />
      </section>
      <section className="panel-card">
        <PanelTitle icon={FileArchive} title="配置文件" />
        <dl className="save-details">
          <div>
            <dt>路径：</dt>
            <dd className="path-text">{settings?.configPath ?? '-'}</dd>
          </div>
          <div>
            <dt>最近文件：</dt>
            <dd className="path-text">{settings?.lastFile || '-'}</dd>
          </div>
          <div>
            <dt>最近角色槽位：</dt>
            <dd>{settings ? settings.lastCharIndex + 1 : '-'}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

function SettingsControls({
  busy,
  compact = false,
  settings,
  onUpdate
}: {
  busy: boolean
  compact?: boolean
  settings: BackendSettings | null
  onUpdate: (patch: BackendSettingsPatch) => void
}): React.JSX.Element {
  const maxBackups = settings?.maxBackups ?? 5
  return (
    <div className={`settings-form ${compact ? 'compact' : ''}`}>
      <label>
        <span>语言</span>
        <select
          disabled={busy || !settings}
          value={settings?.language ?? 'zh_CN'}
          onChange={(event) => onUpdate({ language: event.target.value })}
        >
          {(settings?.languages ?? [{ code: 'zh_CN', name: '简体中文' }]).map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>主题</span>
        <select
          disabled={busy || !settings}
          value={settings?.theme ?? 'Dark'}
          onChange={(event) => onUpdate({ theme: event.target.value as BackendSettings['theme'] })}
        >
          <option value="Dark">Dark</option>
          <option value="Light">Light</option>
        </select>
      </label>
      <label className="toggle-row">
        <span>
          减少弹窗提示
          <small>沿用旧版设置，减少部分成功提示。</small>
        </span>
        <input
          checked={settings?.reduceMessagePop ?? true}
          disabled={busy || !settings}
          type="checkbox"
          onChange={(event) => onUpdate({ reduceMessagePop: event.target.checked })}
        />
      </label>
      <label className="toggle-row">
        <span>
          自动备份覆盖文件
          <small>保存到已存在的存档文件时保留可回滚备份。</small>
        </span>
        <input
          checked={settings?.autoBackup ?? true}
          disabled={busy || !settings}
          type="checkbox"
          onChange={(event) => onUpdate({ autoBackup: event.target.checked })}
        />
      </label>
      <label>
        <span>保留备份数量</span>
        <input
          disabled={busy || !settings}
          max={100}
          min={0}
          type="number"
          value={maxBackups}
          onChange={(event) => onUpdate({ maxBackups: Number(event.target.value) })}
        />
      </label>
    </div>
  )
}

function PanelTitle({
  icon: Icon,
  title,
  right
}: {
  icon?: typeof Folder
  title: string
  right?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="panel-title">
      <div>
        {Icon && <Icon size={22} />}
        <h2>{title}</h2>
      </div>
      {right && <div className="panel-actions">{right}</div>}
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  tone = 'default',
  compact = false,
  disabled = false,
  onClick
}: {
  icon: typeof Folder
  label: string
  tone?: 'default' | 'primary' | 'blue' | 'danger'
  compact?: boolean
  disabled?: boolean
  onClick?: () => void
}): React.JSX.Element {
  return (
    <button
      className={`action-button ${tone} ${compact ? 'compact' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={compact ? 17 : 21} />
      <span>{label}</span>
    </button>
  )
}

function FilterSelect({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options?: SelectOption[]
  value: string
  onChange?: (value: string) => void
}): React.JSX.Element {
  const selectedLabel = options?.find((option) => option.value === value)?.label ?? value
  return (
    <label className="filter-select">
      <span>{label}</span>
      {options ? (
        <select value={value} onChange={(event) => onChange?.(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <button>
          {selectedLabel}
          <ChevronDown size={17} />
        </button>
      )}
    </label>
  )
}

function StatRow({
  disabled,
  field,
  icon: Icon,
  label,
  onEdit,
  value
}: {
  disabled?: boolean
  field: StatField
  icon: typeof Folder
  label: string
  onEdit: (stat: EditingStat) => void
  value: number
}): React.JSX.Element {
  return (
    <div className="stat-row">
      <div>
        <Icon size={25} />
        <strong>{label}</strong>
      </div>
      <span>{value}</span>
      <ActionButton
        disabled={disabled}
        icon={Pencil}
        label="编辑"
        compact
        onClick={() => onEdit({ field, label, value })}
      />
    </div>
  )
}

function StatEditDialog({
  busy,
  editingStat,
  onCancel,
  onSubmit
}: {
  busy: boolean
  editingStat: EditingStat
  onCancel: () => void
  onSubmit: (field: StatField, value: number) => void
}): React.JSX.Element {
  const [value, setValue] = useState(String(editingStat.value))
  const parsedValue = Number(value)
  const isValid =
    Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 0xFFFFFFFF

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (isValid && !busy) {
            onSubmit(editingStat.field, parsedValue)
          }
        }}
      >
        <div className="modal-title">
          <Pencil size={21} />
          <h2>编辑{editingStat.label}</h2>
        </div>
        <label className="number-field">
          <span>数值</span>
          <input
            autoFocus
            inputMode="numeric"
            min={0}
            max={0xFFFFFFFF}
            type="number"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        {!isValid && <p className="field-error">请输入 0 到 4294967295 之间的整数。</p>}
        <div className="modal-warning">
          <AlertTriangle size={18} />
          <span>该修改会写入当前已解包角色档案。</span>
        </div>
        <div className="modal-actions">
          <button className="plain-button" disabled={busy} type="button" onClick={onCancel}>
            取消
          </button>
          <button className="confirm-button" disabled={!isValid || busy} type="submit">
            {busy ? '保存中...' : '保存修改'}
          </button>
        </div>
      </form>
    </div>
  )
}

function RelicEditDialog({
  busy,
  editingRelic,
  onCancel,
  onSubmit
}: {
  busy: boolean
  editingRelic: EditingRelic
  onCancel: () => void
  onSubmit: (gaHandle: number, relicId: number, effects: number[]) => void
}): React.JSX.Element {
  const initialEffects = [...editingRelic.effectIds, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF].slice(0, 6)
  const [itemIdValue, setItemIdValue] = useState(String(editingRelic.itemId))
  const [effectValues, setEffectValues] = useState(initialEffects.map(formatEffectInputValue))
  const [helperBusy, setHelperBusy] = useState(false)
  const [helperNotice, setHelperNotice] = useState<string | null>(null)
  const [helperError, setHelperError] = useState<string | null>(null)
  const [safeSearch, setSafeSearch] = useState(true)
  const [autoFixOnApply, setAutoFixOnApply] = useState(true)
  const [inspection, setInspection] = useState<BackendRelicEditInspection | null>(null)
  const [inspectionBusy, setInspectionBusy] = useState(false)
  const [inspectionError, setInspectionError] = useState<string | null>(null)
  const [pendingInvalidSave, setPendingInvalidSave] = useState<PendingInvalidRelicSave | null>(null)
  const [picker, setPicker] = useState<RelicEditPicker | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerRelicColorLocked, setPickerRelicColorLocked] = useState(true)
  const [pickerRelicColor, setPickerRelicColor] = useState<string>(
    ['Red', 'Blue', 'Yellow', 'Green'].includes(editingRelic.color) ? editingRelic.color : 'all'
  )
  const [pickerRelicEffectSlots, setPickerRelicEffectSlots] = useState('all')
  const [pickerRelicCurseSlots, setPickerRelicCurseSlots] = useState('all')
  const [pickerBusy, setPickerBusy] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const parsedItemId = parseUint32Input(itemIdValue)
  const parsedEffects = effectValues.map((value) => parseUint32Input(value, true))
  const effectsAreValid = parsedEffects.every((value): value is number => value !== null)
  const isValid = parsedItemId !== null && effectsAreValid
  const effectInputKey = effectValues.join('|')
  const filteredPickerOptions = useMemo(() => {
    if (!picker) {
      return []
    }
    const query = normalizePickerQuery(pickerQuery)
    return picker.options.filter((option) =>
      (!query || normalizePickerQuery(`${option.id} ${option.name}`).includes(query)) &&
      (picker.mode !== 'relic' ||
        !('effectSlots' in option) ||
        ((!pickerRelicColorLocked || pickerRelicColor === 'all' || option.color === pickerRelicColor) &&
          (pickerRelicEffectSlots === 'all' || String(option.effectSlots) === pickerRelicEffectSlots) &&
          (pickerRelicCurseSlots === 'all' || String(option.curseSlots) === pickerRelicCurseSlots)))
    )
  }, [picker, pickerQuery, pickerRelicColorLocked, pickerRelicColor, pickerRelicEffectSlots, pickerRelicCurseSlots])

  const currentEffects = (): number[] | null => {
    if (!effectsAreValid) {
      return null
    }
    return parsedEffects as number[]
  }

  const inspectRelicEdit = async (
    relicId: number,
    effects: number[],
    showBusy = true
  ): Promise<void> => {
    if (showBusy) {
      setInspectionBusy(true)
    }
    setInspectionError(null)
    try {
      const inspected = await window.nightreign.inspectRelicEdit(relicId, effects)
      if (!isRelicEditInspection(inspected)) {
        throw new Error('后端返回了无法识别的校验状态。')
      }
      setInspection(inspected)
    } catch (error) {
      setInspection(null)
      setInspectionError(error instanceof Error ? error.message : String(error))
    } finally {
      if (showBusy) {
        setInspectionBusy(false)
      }
    }
  }

  useEffect(() => {
    const effectInputs = effectValues.map((value) => parseUint32Input(value, true))
    const relicId = parseUint32Input(itemIdValue)
    if (relicId === null || effectInputs.some((value) => value === null)) {
      setInspection(null)
      setInspectionError(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setInspectionBusy(true)
      setInspectionError(null)
      window.nightreign
        .inspectRelicEdit(relicId, effectInputs as number[])
        .then((inspected) => {
          if (cancelled) {
            return
          }
          if (!isRelicEditInspection(inspected)) {
            throw new Error('后端返回了无法识别的校验状态。')
          }
          setInspection(inspected)
        })
        .catch((error) => {
          if (!cancelled) {
            setInspection(null)
            setInspectionError(error instanceof Error ? error.message : String(error))
          }
        })
        .finally(() => {
          if (!cancelled) {
            setInspectionBusy(false)
          }
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [effectInputKey, itemIdValue])

  const requestPreparedRelicEdit = async (
    relicId: number,
    effects: number[]
  ): Promise<BackendRelicEditPreparation> => {
    const prepared = await window.nightreign.prepareRelicEdit(relicId, effects)
    if (!isRelicEditPreparation(prepared)) {
      throw new Error('后端返回了无法识别的整理结果。')
    }
    return prepared
  }

  const applyPreparedRelicEdit = (prepared: BackendRelicEditPreparation): void => {
    setItemIdValue(String(prepared.relicId))
    setEffectValues(prepared.effects.map(formatEffectInputValue))
  }

  const preparedRelicStatus = (prepared: BackendRelicEditPreparation): string => {
    return prepared.invalidReason === 'NONE' && !prepared.strictInvalid
      ? '当前配置通过基础校验。'
      : `当前配置仍可能无效：${prepared.invalidReason}${prepared.strictInvalid ? ' / STRICT_INVALID' : ''}`
  }

  const preparedRelicNeedsConfirmation = (prepared: BackendRelicEditPreparation): boolean => {
    return prepared.invalidReason !== 'NONE' || prepared.strictInvalid
  }

  const preparedRelicIssue = (prepared: BackendRelicEditPreparation): string => {
    return prepared.strictInvalid && prepared.invalidReason === 'NONE'
      ? 'STRICT_INVALID'
      : `${prepared.invalidReason}${prepared.strictInvalid ? ' / STRICT_INVALID' : ''}`
  }

  const prepareRelicEdit = async (): Promise<void> => {
    const effects = currentEffects()
    if (parsedItemId === null || effects === null) {
      setHelperError('请先输入有效的 Item ID 和效果 ID。')
      setHelperNotice(null)
      return
    }

    setHelperBusy(true)
    setHelperError(null)
    setHelperNotice(null)
    try {
      const prepared = await requestPreparedRelicEdit(parsedItemId, effects)
      applyPreparedRelicEdit(prepared)
      setPendingInvalidSave(null)
      setInspection(null)
      setHelperNotice(
        `${prepared.changedRelicId ? `已切换到可用遗物 ${prepared.relicId}。` : '已整理效果顺序。'} ${preparedRelicStatus(prepared)}`
      )
    } catch (error) {
      setHelperError(error instanceof Error ? error.message : String(error))
    } finally {
      setHelperBusy(false)
    }
  }

  const changeRelicColor = async (targetColor: string): Promise<void> => {
    const effects = currentEffects()
    if (parsedItemId === null || effects === null) {
      setHelperError('请先输入有效的 Item ID 和效果 ID。')
      setHelperNotice(null)
      return
    }

    setHelperBusy(true)
    setHelperError(null)
    setHelperNotice(null)
    try {
      const changed = await window.nightreign.changeRelicColor(
        editingRelic.gaHandle,
        parsedItemId,
        effects,
        targetColor
      )
      if (!isRelicColorChange(changed)) {
        throw new Error('后端返回了无法识别的颜色切换结果。')
      }
      setItemIdValue(String(changed.relicId))
      setEffectValues(changed.effects.map(formatEffectInputValue))
      setPendingInvalidSave(null)
      setInspection(null)
      setHelperNotice(
        changed.alreadyTarget
          ? `当前遗物已经是 ${changed.color}。`
          : `已切换到 ${changed.color} 候选遗物 ${changed.relicId}：${changed.relicName}。保存修改后生效。`
      )
    } catch (error) {
      setHelperError(error instanceof Error ? error.message : String(error))
    } finally {
      setHelperBusy(false)
    }
  }

  const openRelicPicker = async (): Promise<void> => {
    if (parsedItemId === null) {
      setPickerError('请先输入有效的 Item ID。')
      return
    }
    setPickerBusy(true)
    setPickerError(null)
    setPickerQuery('')
    const currentColor = inspection?.color ?? editingRelic.color
    setPickerRelicColor(['Red', 'Blue', 'Yellow', 'Green'].includes(currentColor) ? currentColor : 'all')
    setPickerRelicColorLocked(true)
    setPickerRelicEffectSlots('all')
    setPickerRelicCurseSlots('all')
    try {
      const options = await window.nightreign.listRelicEditOptions(parsedItemId, safeSearch)
      if (!isRelicEditOptions(options)) {
        throw new Error('后端返回了无法识别的遗物列表。')
      }
      setPicker({ mode: 'relic', options })
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : String(error))
    } finally {
      setPickerBusy(false)
    }
  }

  const openEffectPicker = async (slotIndex: number): Promise<void> => {
    const effects = currentEffects()
    if (parsedItemId === null || effects === null) {
      setPickerError('请先输入有效的 Item ID 和效果 ID。')
      return
    }
    setPickerBusy(true)
    setPickerError(null)
    setPickerQuery('')
    try {
      const options = await window.nightreign.listEffectEditOptions(
        parsedItemId,
        slotIndex,
        effects,
        safeSearch
      )
      if (!isEffectEditOptions(options)) {
        throw new Error('后端返回了无法识别的效果列表。')
      }
      setPicker({ mode: 'effect', slotIndex, options })
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : String(error))
    } finally {
      setPickerBusy(false)
    }
  }

  const selectPickerOption = (option: BackendRelicEditOption | BackendEffectEditOption): void => {
    if (!picker) {
      return
    }
    if (picker.mode === 'relic') {
      setItemIdValue(String(option.id))
    } else {
      const nextValues = [...effectValues]
      nextValues[picker.slotIndex] = formatEffectInputValue(option.id)
      setEffectValues(nextValues)
    }
    setPicker(null)
    setPickerQuery('')
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal-card wide"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!isValid || busy || helperBusy) {
            return
          }

      let submitItemId = parsedItemId as number
      let submitEffects = parsedEffects as number[]
      setPendingInvalidSave(null)
      if (autoFixOnApply) {
        setHelperBusy(true)
        setHelperError(null)
            setHelperNotice(null)
            try {
              const prepared = await requestPreparedRelicEdit(submitItemId, submitEffects)
              applyPreparedRelicEdit(prepared)
              submitItemId = prepared.relicId
              submitEffects = prepared.effects
              setHelperNotice(`保存前已自动整理。${preparedRelicStatus(prepared)}`)
              if (preparedRelicNeedsConfirmation(prepared)) {
                setPendingInvalidSave({
                  relicId: submitItemId,
                  effects: submitEffects,
                  reason: preparedRelicIssue(prepared)
                })
                setHelperBusy(false)
                return
              }
            } catch (error) {
              setHelperError(error instanceof Error ? error.message : String(error))
              setHelperBusy(false)
              return
            }
            setHelperBusy(false)
          }

          onSubmit(editingRelic.gaHandle, submitItemId, submitEffects)
        }}
      >
        <div className="modal-title">
          <Gem size={21} />
          <h2>编辑遗物</h2>
        </div>
        <div className="relic-meta">
          <strong>{editingRelic.name}</strong>
          <span>GA: 0x{editingRelic.gaHandle.toString(16).toUpperCase()}</span>
        </div>
        <div className="number-field field-with-button">
          <span>Item ID</span>
          <div className="input-action-row">
            <input
              autoFocus
              inputMode="numeric"
              min={0}
              max={0xFFFFFFFF}
              type="number"
              value={itemIdValue}
              onChange={(event) => {
                setItemIdValue(event.target.value)
                setPendingInvalidSave(null)
              }}
            />
            <button
              aria-label="搜索遗物 ID"
              disabled={busy || helperBusy || pickerBusy || parsedItemId === null}
              type="button"
              onClick={() => void openRelicPicker()}
            >
              <Search size={17} />
            </button>
          </div>
        </div>
        <div className="effect-grid">
          {['Effect 1', 'Effect 2', 'Effect 3', 'Curse 1', 'Curse 2', 'Curse 3'].map(
            (label, index) => (
              <div className="number-field field-with-button" key={label}>
                <span>{label}</span>
                <div className="input-action-row">
                  <input
                    inputMode="numeric"
                    max={0xFFFFFFFF}
                    min={-1}
                    type="number"
                    value={effectValues[index]}
                    onChange={(event) => {
                      const nextValues = [...effectValues]
                      nextValues[index] = event.target.value
                      setEffectValues(nextValues)
                      setPendingInvalidSave(null)
                    }}
                  />
                  <button
                    aria-label={`搜索 ${label}`}
                    disabled={!isValid || busy || helperBusy || pickerBusy}
                    type="button"
                    onClick={() => void openEffectPicker(index)}
                  >
                    <Search size={17} />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
        <label className="compact-check">
          <input
            checked={safeSearch}
            disabled={busy || helperBusy || pickerBusy}
            type="checkbox"
            onChange={(event) => setSafeSearch(event.target.checked)}
          />
          <span>仅显示安全范围候选</span>
        </label>
        <label className="compact-check">
          <input
            checked={autoFixOnApply}
            disabled={busy || helperBusy}
            type="checkbox"
            onChange={(event) => setAutoFixOnApply(event.target.checked)}
          />
          <span>保存前自动整理</span>
        </label>
        <section className={`relic-status-panel ${inspection?.status ?? 'unknown'}`}>
          <div className="relic-status-head">
            {inspection?.status === 'valid' ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
            <strong>{inspection?.title ?? '校验状态'}</strong>
            <button
              className="plain-button compact-icon"
              disabled={!isValid || busy || helperBusy || inspectionBusy}
              type="button"
              onClick={() => {
                const effects = currentEffects()
                if (parsedItemId !== null && effects) {
                  void inspectRelicEdit(parsedItemId, effects)
                }
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <p>
            {inspectionBusy
              ? '检查中...'
              : inspectionError ?? inspection?.detail ?? '输入有效 Item ID 和效果后会自动检查当前配置。'}
          </p>
          {inspection && (
            <>
              <div className="relic-status-meta">
                <span>{inspection.color}</span>
                <span>{inspection.deep ? 'Deep' : 'Normal'}</span>
                <span>
                  {inspection.effectSlots}/{inspection.curseSlots} 槽
                </span>
                <span>{inspection.invalidReason}</span>
              </div>
              <details className="relic-debug-details">
                <summary>诊断详情</summary>
                <pre>{inspection.debugLines.join('\n')}</pre>
              </details>
            </>
          )}
        </section>
        <section className="color-shortcut-panel">
          <span>切换颜色</span>
          <div className="color-shortcut-row">
            {(['Red', 'Blue', 'Yellow', 'Green'] as const).map((color) => (
              <button
                className="plain-button inline-action"
                disabled={!isValid || busy || helperBusy || pickerBusy}
                key={color}
                type="button"
                onClick={() => void changeRelicColor(color)}
              >
                <i className={`color-dot ${colorClass(color)}`} />
                <span>{color}</span>
              </button>
            ))}
          </div>
        </section>
        {(picker || pickerBusy || pickerError) && (
          <section className="picker-panel">
            <div className="picker-head">
              <strong>{picker?.mode === 'effect' ? '选择效果' : '选择遗物'}</strong>
              <button className="plain-button compact-icon" type="button" onClick={() => setPicker(null)}>
                <X size={16} />
              </button>
            </div>
            <label className="search-input">
              <Search size={17} />
              <input
                placeholder="按 ID 或名称搜索"
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
              />
            </label>
            {picker?.mode === 'relic' && (
              <div className="picker-filter-grid">
                <label className="picker-filter-lock">
                  <input
                    checked={pickerRelicColorLocked}
                    type="checkbox"
                    onChange={(event) => setPickerRelicColorLocked(event.target.checked)}
                  />
                  <span>锁定颜色</span>
                </label>
                <FilterSelect
                  label="颜色"
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'Red', label: 'Red' },
                    { value: 'Blue', label: 'Blue' },
                    { value: 'Yellow', label: 'Yellow' },
                    { value: 'Green', label: 'Green' }
                  ]}
                  value={pickerRelicColor}
                  onChange={setPickerRelicColor}
                />
                <FilterSelect
                  label="效果槽"
                  options={[
                    { value: 'all', label: 'Any' },
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' }
                  ]}
                  value={pickerRelicEffectSlots}
                  onChange={setPickerRelicEffectSlots}
                />
                <FilterSelect
                  label="诅咒槽"
                  options={[
                    { value: 'all', label: 'Any' },
                    { value: '0', label: '0' },
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' }
                  ]}
                  value={pickerRelicCurseSlots}
                  onChange={setPickerRelicCurseSlots}
                />
                <span className="picker-filter-pill">{picker.options[0]?.deep ? 'Deep' : 'Normal'}</span>
              </div>
            )}
            {pickerError && <p className="field-error">{pickerError}</p>}
            {pickerBusy ? (
              <p className="field-note">正在加载候选项...</p>
            ) : (
              <div className="picker-list">
                {filteredPickerOptions.length === 0 ? (
                  <p className="field-note">没有匹配的候选项。</p>
                ) : (
                  filteredPickerOptions.slice(0, 120).map((option) => (
                    <button
                      className={`picker-row ${'warning' in option && option.warning ? 'warning' : ''}`}
                      key={`${picker?.mode}-${option.id}`}
                      type="button"
                      onClick={() => selectPickerOption(option)}
                    >
                      <span>{option.id === 0xFFFFFFFF ? '-1' : option.id}</span>
                      <strong>{option.name}</strong>
                      {picker?.mode === 'relic' && 'effectSlots' in option ? (
                        <em>
                          {option.color} · {option.deep ? 'Deep' : 'Normal'} · {option.effectSlots}/
                          {option.curseSlots}
                        </em>
                      ) : null}
                      {picker?.mode === 'effect' && 'needsCurse' in option ? (
                        <em>
                          {option.needsCurse ? '需要负面槽' : '普通效果'}
                          {option.warning ? ' · 与现有效果冲突' : ''}
                        </em>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            )}
          </section>
        )}
        <div className="modal-utility-row">
          <button
            className="plain-button inline-action"
            disabled={!isValid || busy || helperBusy}
            type="button"
            onClick={() => void prepareRelicEdit()}
          >
            <Wand2 size={16} />
            <span>{helperBusy ? '整理中...' : '自动整理 ID/效果'}</span>
          </button>
        </div>
        {!isValid && <p className="field-error">请输入有效整数。效果/负面效果可用 -1 表示空槽。</p>}
        {helperError && <p className="field-error">{helperError}</p>}
        {helperNotice && <p className="field-note">{helperNotice}</p>}
        {pendingInvalidSave && (
          <>
            <div className="modal-warning danger">
              <AlertTriangle size={18} />
              <span>
                整理后仍可能无效：{pendingInvalidSave.reason}。旧版会在这种情况下要求确认，继续保存可能导致游戏内异常。
              </span>
            </div>
            <div className="modal-actions split">
              <button
                className="plain-button"
                disabled={busy || helperBusy}
                type="button"
                onClick={() => setPendingInvalidSave(null)}
              >
                返回修改
              </button>
              <button
                className="confirm-button danger"
                disabled={busy || helperBusy}
                type="button"
                onClick={() => {
                  const pending = pendingInvalidSave
                  if (!pending) {
                    return
                  }
                  setPendingInvalidSave(null)
                  onSubmit(editingRelic.gaHandle, pending.relicId, pending.effects)
                }}
              >
                仍然保存
              </button>
            </div>
          </>
        )}
        <div className="modal-warning">
          <AlertTriangle size={18} />
          <span>该修改会立即写回当前已解包角色档案，并重新解析库存。</span>
        </div>
        <div className="modal-actions">
          <button className="plain-button" disabled={busy} type="button" onClick={onCancel}>
            取消
          </button>
          <button className="confirm-button" disabled={!isValid || busy || helperBusy} type="submit">
            {busy ? '保存中...' : '保存修改'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AddRelicDialog({
  busy,
  onCancel,
  onSubmit
}: {
  busy: boolean
  onCancel: () => void
  onSubmit: (relicType: RelicType, count: number) => void
}): React.JSX.Element {
  const [relicType, setRelicType] = useState<RelicType>('normal')
  const [countValue, setCountValue] = useState('1')
  const count = Number(countValue)
  const isValid = Number.isInteger(count) && count >= 1 && count <= 999

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (isValid && !busy) {
            onSubmit(relicType, count)
          }
        }}
      >
        <div className="modal-title">
          <Plus size={21} />
          <h2>新增遗物</h2>
        </div>
        <div className="segmented-control">
          <button
            className={relicType === 'normal' ? 'active' : ''}
            type="button"
            onClick={() => setRelicType('normal')}
          >
            Normal
          </button>
          <button
            className={relicType === 'deep' ? 'active' : ''}
            type="button"
            onClick={() => setRelicType('deep')}
          >
            Deep
          </button>
        </div>
        <label className="number-field">
          <span>数量</span>
          <input
            autoFocus
            inputMode="numeric"
            max={999}
            min={1}
            type="number"
            value={countValue}
            onChange={(event) => setCountValue(event.target.value)}
          />
        </label>
        {!isValid && <p className="field-error">请输入 1 到 999 之间的整数。</p>}
        <div className="modal-warning">
          <AlertTriangle size={18} />
          <span>遗物类型创建后不能互换。新增 1 个遗物时会自动打开编辑弹窗。</span>
        </div>
        <div className="modal-actions">
          <button className="plain-button" disabled={busy} type="button" onClick={onCancel}>
            取消
          </button>
          <button className="confirm-button" disabled={!isValid || busy} type="submit">
            {busy ? '新增中...' : '确认新增'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDialog({
  busy,
  confirmLabel,
  message,
  title,
  tone = 'default',
  onCancel,
  onConfirm
}: {
  busy: boolean
  confirmLabel: string
  message: string
  title: string
  tone?: 'default' | 'danger'
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card">
        <div className="modal-title">
          <AlertTriangle size={21} />
          <h2>{title}</h2>
        </div>
        <p className="modal-copy">{message}</p>
        <div className="modal-actions">
          <button className="plain-button" disabled={busy} type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className={`confirm-button ${tone}`}
            disabled={busy}
            type="button"
            onClick={onConfirm}
          >
            {busy ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function PresetNameDialog({
  busy,
  initialName,
  title,
  onCancel,
  onSubmit
}: {
  busy: boolean
  initialName: string
  title: string
  onCancel: () => void
  onSubmit: (name: string) => void
}): React.JSX.Element {
  const initialAllowNonAscii = !isAsciiPresetName(initialName)
  const [allowNonAscii, setAllowNonAscii] = useState(initialAllowNonAscii)
  const [name, setName] = useState(sanitizePresetName(initialName, initialAllowNonAscii))
  const trimmed = name.trim()
  const isValid =
    trimmed.length > 0 &&
    presetNameUnits(trimmed) <= 18 &&
    (allowNonAscii || isAsciiPresetName(trimmed))

  const updateName = (value: string, nextAllowNonAscii = allowNonAscii): void => {
    setName(sanitizePresetName(value, nextAllowNonAscii))
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (isValid) {
            onSubmit(trimmed)
          }
        }}
      >
        <div className="modal-title">
          <Archive size={21} />
          <h2>{title}</h2>
        </div>
        <label className="number-field">
          <span>预设名称</span>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(event) => updateName(event.target.value)}
          />
        </label>
        <label className={`preset-name-option ${allowNonAscii ? 'selected' : ''}`}>
          <input
            checked={allowNonAscii}
            type="checkbox"
            onChange={(event) => {
              const checked = event.target.checked
              setAllowNonAscii(checked)
              updateName(name, checked)
            }}
          />
          <span>
            <strong>允许非 ASCII 字符</strong>
            <small>默认沿用旧版限制，仅允许英文、数字和常见半角符号。</small>
          </span>
        </label>
        {allowNonAscii && (
          <div className="modal-warning">
            <AlertTriangle size={18} />
            <span>游戏原生不支持非 ASCII 输入。旧版允许手动开启，但需要自行承担兼容风险。</span>
          </div>
        )}
        {!isValid && <p className="field-error">请输入 1-18 个 UTF-16 字符的预设名称。</p>}
        <div className="modal-actions">
          <button className="plain-button" disabled={busy} type="button" onClick={onCancel}>
            取消
          </button>
          <button className="confirm-button" disabled={!isValid || busy} type="submit">
            {busy ? '保存中...' : '保存预设'}
          </button>
        </div>
      </form>
    </div>
  )
}

function RelicReindexDialog({
  busy,
  count,
  maxIndex,
  onCancel,
  onSubmit
}: {
  busy: boolean
  count: number
  maxIndex: number
  onCancel: () => void
  onSubmit: (targetIndex: number) => void
}): React.JSX.Element {
  const [value, setValue] = useState('')
  const parsed = parseUint32Input(value)
  const targetIndex = parsed === null ? null : Math.min(parsed, maxIndex)

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (targetIndex !== null) {
            onSubmit(targetIndex)
          }
        }}
      >
        <div className="modal-title">
          <Archive size={21} />
          <h2>重排遗物</h2>
        </div>
        <label className="number-field">
          <span>移动到 # 之后</span>
          <input
            autoFocus
            min={0}
            max={maxIndex}
            placeholder={`0-${maxIndex}`}
            type="number"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className="modal-copy">将选中的 {count} 个遗物移动到指定序号之后，并影响游戏内获取时间排序。</p>
        {targetIndex === null && <p className="field-error">请输入有效序号。</p>}
        <div className="modal-actions">
          <button className="plain-button" disabled={busy} type="button" onClick={onCancel}>
            取消
          </button>
          <button className="confirm-button" disabled={targetIndex === null || busy} type="submit">
            {busy ? '重排中...' : '确认重排'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ReplaceCharacterDialog({
  busy,
  currentName,
  importResult,
  onCancel,
  onSubmit
}: {
  busy: boolean
  currentName: string
  importResult: BackendImportSaveResult
  onCancel: () => void
  onSubmit: (importIndex: number) => void
}): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(importResult.characters[0]?.index ?? 0)
  const selectedCharacter = importResult.characters.find(
    (character) => character.index === selectedIndex
  )

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card wide">
        <div className="modal-title">
          <FileArchive size={21} />
          <h2>替换角色档案</h2>
        </div>
        <div className="relic-meta">
          <strong>{currentName}</strong>
          <span>将被导入存档中的角色覆盖。</span>
          <span>{importResult.savePath}</span>
        </div>
        <div className="option-list">
          {importResult.characters.map((character) => (
            <button
              className={`option-row compact ${character.index === selectedIndex ? 'selected' : ''}`}
              key={`${character.index}-${character.path}`}
              type="button"
              onClick={() => setSelectedIndex(character.index)}
            >
              <span>#{character.index + 1}</span>
              <strong>{character.name}</strong>
              <span>{character.path}</span>
            </button>
          ))}
        </div>
        <div className="modal-warning">
          <AlertTriangle size={18} />
          <span>替换会写入当前已解包角色档案。之后仍需要使用“保存存档”重打包到游戏存档文件。</span>
        </div>
        <div className="modal-actions">
          <button className="plain-button" disabled={busy} type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="confirm-button danger"
            disabled={busy || !selectedCharacter}
            type="button"
            onClick={() => onSubmit(selectedIndex)}
          >
            {busy ? '替换中...' : '确认替换'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LoadoutImportDialog({
  busy,
  preview,
  onCancel,
  onSubmit
}: {
  busy: boolean
  preview: BackendLoadoutImportPreview
  onCancel: () => void
  onSubmit: (vesselIndices: number[], presetIndices: number[]) => void
}): React.JSX.Element {
  const [selectedVessels, setSelectedVessels] = useState(
    () => new Set(preview.vessels.filter((item) => item.unlocked).map((item) => item.index))
  )
  const [selectedPresets, setSelectedPresets] = useState(
    () => new Set(preview.presets.filter((item) => item.unlocked).map((item) => item.index))
  )
  const selectedCount = selectedVessels.size + selectedPresets.size

  const toggleSelection = (
    selected: Set<number>,
    setSelected: (next: Set<number>) => void,
    index: number
  ): void => {
    const next = new Set(selected)
    if (next.has(index)) {
      next.delete(index)
    } else {
      next.add(index)
    }
    setSelected(next)
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card wide">
        <div className="modal-title">
          <FolderOpen size={21} />
          <h2>导入配装</h2>
        </div>
        <div className="relic-meta">
          <strong>{preview.inputFile}</strong>
          <span>选择要写入当前角色档案的圣杯和预设。</span>
        </div>
        <div className="import-grid">
          <LoadoutImportSection
            items={preview.vessels}
            selected={selectedVessels}
            title="圣杯"
            onToggle={(index) => toggleSelection(selectedVessels, setSelectedVessels, index)}
          />
          <LoadoutImportSection
            items={preview.presets}
            selected={selectedPresets}
            title="预设"
            onToggle={(index) => toggleSelection(selectedPresets, setSelectedPresets, index)}
          />
        </div>
        <div className="modal-warning">
          <AlertTriangle size={18} />
          <span>导入可能会补充缺失的非唯一遗物，并写回当前已解包角色档案。</span>
        </div>
        <div className="modal-actions">
          <button className="plain-button" disabled={busy} type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="confirm-button"
            disabled={busy || selectedCount === 0}
            type="button"
            onClick={() => onSubmit([...selectedVessels], [...selectedPresets])}
          >
            {busy ? '导入中...' : `导入 ${selectedCount} 项`}
          </button>
        </div>
      </div>
    </div>
  )
}

function LoadoutImportSection({
  items,
  selected,
  title,
  onToggle
}: {
  items: BackendLoadoutImportItem[]
  selected: Set<number>
  title: string
  onToggle: (index: number) => void
}): React.JSX.Element {
  return (
    <section className="import-section">
      <h3>{title}</h3>
      <div className="option-list">
        {items.length === 0 && <p className="empty-note">没有可导入项目</p>}
        {items.map((item) => (
          <label className={`check-row ${selected.has(item.index) ? 'selected' : ''}`} key={item.index}>
            <input
              checked={selected.has(item.index)}
              disabled={!item.unlocked}
              type="checkbox"
              onChange={() => onToggle(item.index)}
            />
            <span>
              <strong>{item.name}</strong>
              <small>
                {item.vesselName} · {item.relicCount}/6 遗物
                {!item.unlocked ? ' · 未解锁' : ''}
              </small>
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}

function LoadoutSlotReplaceDialog({
  busy,
  editingSlot,
  onCancel,
  onSubmit
}: {
  busy: boolean
  editingSlot: EditingLoadoutSlot
  onCancel: () => void
  onSubmit: (target: EditingLoadoutSlot, gaHandle: number) => void
}): React.JSX.Element {
  const [selectedGaHandle, setSelectedGaHandle] = useState(editingSlot.row.gaHandle)
  const [optionQuery, setOptionQuery] = useState('')
  const [equippedFilter, setEquippedFilter] = useState('all')
  const filteredOptions = useMemo(() => {
    const query = normalizePickerQuery(optionQuery)
    const heroName = editingSlot.heroName.trim()
    return editingSlot.options.filter((option) => {
      if (query) {
        const searchable = normalizePickerQuery(
          `${option.name} ${option.itemId ?? ''} ${option.color} ${option.equippedByText} ${option.effectNames.join(' ')}`
        )
        if (!searchable.includes(query)) {
          return false
        }
      }
      const isEquipped = option.equippedByText !== '-'
      if (equippedFilter === 'none') {
        return !isEquipped
      }
      if (equippedFilter === 'this') {
        return heroName !== '' && option.equippedByText.includes(heroName)
      }
      if (equippedFilter === 'other') {
        return isEquipped && (heroName === '' || !option.equippedByText.includes(heroName))
      }
      return true
    })
  }, [editingSlot.heroName, editingSlot.options, equippedFilter, optionQuery])
  const selectedOption =
    editingSlot.options.find((option) => option.gaHandle === selectedGaHandle) ??
    editingSlot.options[0]

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card wide">
        <div className="modal-title">
          <Wand2 size={21} />
          <h2>{editingSlot.title}</h2>
        </div>
        <div className="relic-meta">
          <strong>
            {editingSlot.groupName} · Slot {editingSlot.row.slot}
          </strong>
          <span>
            {editingSlot.row.type} / {editingSlot.row.color}
          </span>
        </div>
        <div className="slot-filter-grid">
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder="搜索名称、ID、效果"
              value={optionQuery}
              onChange={(event) => setOptionQuery(event.target.value)}
            />
          </label>
          <FilterSelect
            label="装备状态"
            options={[
              { value: 'all', label: 'All' },
              { value: 'none', label: 'None' },
              { value: 'this', label: 'This Character' },
              { value: 'other', label: 'Other Characters' }
            ]}
            value={equippedFilter}
            onChange={setEquippedFilter}
          />
        </div>
        <div className="option-list">
          {filteredOptions.map((option) => (
            <button
              className={`option-row ${option.gaHandle === selectedGaHandle ? 'selected' : ''}`}
              key={option.gaHandle}
              type="button"
              onClick={() => setSelectedGaHandle(option.gaHandle)}
            >
              <span className="color-cell">
                <i className={`color-dot ${colorClass(normalizeColor(option.color))}`} />
                {option.color}
              </span>
              <strong>{option.name}</strong>
              <span>{option.itemId ?? '-'}</span>
              <span>{option.equippedByText}</span>
              <span>{option.effectNames[0] ?? '-'}</span>
            </button>
          ))}
          {filteredOptions.length === 0 && (
            <p className="empty-table-note">没有符合当前筛选条件的候选遗物。</p>
          )}
        </div>
        {selectedOption && (
          <div className="modal-warning">
            <AlertTriangle size={18} />
            <span>
              替换会同步更新该角色的遗物装备记录，并写回当前已解包角色档案。
            </span>
          </div>
        )}
        <div className="modal-actions">
          <button className="plain-button" disabled={busy} type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="confirm-button"
            disabled={busy || selectedGaHandle === editingSlot.row.gaHandle}
            type="button"
            onClick={() => onSubmit(editingSlot, selectedGaHandle)}
          >
            {busy ? '替换中...' : '确认替换'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CharacterCard({
  index,
  name,
  onClick,
  active = false,
  warning = false
}: {
  index: number
  name: string
  onClick?: () => void
  active?: boolean
  warning?: boolean
}): React.JSX.Element {
  return (
    <button className={`character-card ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="portrait">
        <ShieldCheck size={38} />
      </div>
      <div>
        <strong className={warning ? 'danger-text' : ''}>
          {index}. {name}
        </strong>
        <span>
          <Skull size={16} />
          追踪者
        </span>
        <span>
          <Clock3 size={16} />
          最后修改： 今天 19:42
        </span>
      </div>
      {active && (
        <em>
          <Check size={18} />
        </em>
      )}
    </button>
  )
}

function RuneMark({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <svg className={compact ? 'rune-mark compact' : 'rune-mark'} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="38" />
      <circle cx="60" cy="60" r="11" />
      <path d="M60 7v106M7 60h106M29 20l62 80M91 20 29 100" />
      <path d="M60 18c23 0 42 19 42 42S83 102 60 102 18 83 18 60 37 18 60 18Z" />
      <path d="M60 38v44M44 60h32" />
    </svg>
  )
}

function SkullBadge(): React.JSX.Element {
  return (
    <span className="skull-badge">
      <Skull size={15} />
    </span>
  )
}

function TypePill({ value }: { value: 'Normal' | 'Deep' }): React.JSX.Element {
  return <span className={`type-pill ${value.toLowerCase()}`}>{value}</span>
}

function parseUint32Input(value: string, allowMinusOne = false): number | null {
  if (value.trim() === '') {
    return null
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return null
  }
  if (allowMinusOne && parsed === -1) {
    return 0xFFFFFFFF
  }
  if (parsed < 0 || parsed > 0xFFFFFFFF) {
    return null
  }
  return parsed
}

function presetNameUnits(value: string): number {
  return value.length
}

function isAsciiPresetName(value: string): boolean {
  return /^[\x20-\x7E]*$/.test(value)
}

function sanitizePresetName(value: string, allowNonAscii: boolean): string {
  const normalized = allowNonAscii ? value : value.replace(/[^\x20-\x7E]/g, '')
  return normalized.slice(0, 18)
}

function formatEffectInputValue(effectId: number): string {
  return effectId === 0xFFFFFFFF ? '-1' : String(effectId)
}

function normalizePickerQuery(value: string): string {
  return value.trim().toLowerCase()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOpenSaveResult(value: unknown): value is BackendOpenSaveResult {
  return isRecord(value) && typeof value.savePath === 'string' && Array.isArray(value.characters)
}

function isImportSaveResult(value: unknown): value is BackendImportSaveResult {
  return isRecord(value) && typeof value.savePath === 'string' && Array.isArray(value.characters)
}

function isSettings(value: unknown): value is BackendSettings {
  return (
    isRecord(value) &&
    typeof value.configPath === 'string' &&
    typeof value.language === 'string' &&
    typeof value.languageName === 'string' &&
    Array.isArray(value.languages) &&
    (value.theme === 'Light' || value.theme === 'Dark') &&
    typeof value.reduceMessagePop === 'boolean' &&
    typeof value.autoBackup === 'boolean' &&
    typeof value.maxBackups === 'number'
  )
}

function isSettingsUpdateResult(value: unknown): value is BackendSettingsUpdateResult {
  return (
    isRecord(value) &&
    isSettings(value.settings) &&
    (value.selectedCharacter === null || isCharacterState(value.selectedCharacter))
  )
}

function isCharacterState(value: unknown): value is BackendCharacterState {
  return (
    isRecord(value) &&
    typeof value.index === 'number' &&
    typeof value.name === 'string' &&
    isRecord(value.stats) &&
    Array.isArray(value.relics) &&
    Array.isArray(value.vessels) &&
    Array.isArray(value.presets)
  )
}

function isSaveResult(value: unknown): value is BackendSaveResult {
  return (
    isRecord(value) &&
    typeof value.savePath === 'string' &&
    isCharacterState(value.selectedCharacter)
  )
}

function isVesselRelicOptions(value: unknown): value is BackendVesselRelicOption[] {
  return (
    Array.isArray(value) &&
    value.every((option) => isRecord(option) && typeof option.gaHandle === 'number')
  )
}

function isVesselGroups(value: unknown): value is BackendVesselGroup[] {
  return (
    Array.isArray(value) &&
    value.every(
      (group) =>
        isRecord(group) &&
        typeof group.heroType === 'number' &&
        typeof group.vesselId === 'number' &&
        typeof group.index === 'number' &&
        Array.isArray(group.rows)
    )
  )
}

function isVesselPresets(value: unknown): value is BackendVesselPreset[] {
  return (
    Array.isArray(value) &&
    value.every(
      (preset) =>
        isRecord(preset) &&
        typeof preset.index === 'number' &&
        typeof preset.heroType === 'number' &&
        typeof preset.name === 'string' &&
        typeof preset.vesselId === 'number' &&
        typeof preset.vesselName === 'string' &&
        Array.isArray(preset.rows)
    )
  )
}

function isLoadoutImportPreview(value: unknown): value is BackendLoadoutImportPreview {
  return (
    isRecord(value) &&
    typeof value.inputFile === 'string' &&
    Array.isArray(value.vessels) &&
    Array.isArray(value.presets)
  )
}

function isLoadoutImportResult(value: unknown): value is BackendLoadoutImportResult {
  return (
    isRecord(value) &&
    Array.isArray(value.messages) &&
    isCharacterState(value.selectedCharacter)
  )
}

function isRelicsExcelImportResult(value: unknown): value is BackendRelicsExcelImportResult {
  return (
    isRecord(value) &&
    typeof value.added === 'number' &&
    typeof value.failed === 'number' &&
    isCharacterState(value.selectedCharacter)
  )
}

function isRelicBatchResult(value: unknown): value is BackendRelicBatchResult {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    isCharacterState(value.selectedCharacter)
  )
}

function isRelicEffectsCopy(value: unknown): value is BackendRelicEffectsCopy {
  return (
    isRecord(value) &&
    typeof value.effectsText === 'string' &&
    typeof value.count === 'number' &&
    Array.isArray(value.uniqueNames)
  )
}

function isRelicEditPreparation(value: unknown): value is BackendRelicEditPreparation {
  return (
    isRecord(value) &&
    typeof value.relicId === 'number' &&
    typeof value.relicName === 'string' &&
    Array.isArray(value.effects) &&
    value.effects.every((effectId) => typeof effectId === 'number') &&
    Array.isArray(value.effectNames) &&
    typeof value.changedRelicId === 'boolean' &&
    typeof value.invalidReason === 'string' &&
    typeof value.strictInvalid === 'boolean'
  )
}

function isRelicEditInspection(value: unknown): value is BackendRelicEditInspection {
  return (
    isRecord(value) &&
    typeof value.relicId === 'number' &&
    typeof value.relicName === 'string' &&
    Array.isArray(value.effects) &&
    value.effects.every((effectId) => typeof effectId === 'number') &&
    Array.isArray(value.effectNames) &&
    value.effectNames.every((effectName) => typeof effectName === 'string') &&
    typeof value.invalidReason === 'string' &&
    typeof value.invalidIndex === 'number' &&
    typeof value.strictInvalid === 'boolean' &&
    (typeof value.strictReason === 'string' || value.strictReason === null) &&
    typeof value.status === 'string' &&
    typeof value.title === 'string' &&
    typeof value.detail === 'string' &&
    typeof value.color === 'string' &&
    typeof value.deep === 'boolean' &&
    typeof value.effectSlots === 'number' &&
    typeof value.curseSlots === 'number' &&
    Array.isArray(value.debugLines) &&
    value.debugLines.every((line) => typeof line === 'string')
  )
}

function isRelicColorChange(value: unknown): value is BackendRelicColorChange {
  return (
    isRecord(value) &&
    typeof value.relicId === 'number' &&
    typeof value.relicName === 'string' &&
    typeof value.color === 'string' &&
    Array.isArray(value.effects) &&
    value.effects.every((effect) => typeof effect === 'number') &&
    typeof value.changedRelicId === 'boolean' &&
    typeof value.alreadyTarget === 'boolean'
  )
}

function isRelicEditOptions(value: unknown): value is BackendRelicEditOption[] {
  return (
    Array.isArray(value) &&
    value.every(
      (option) =>
        isRecord(option) &&
        typeof option.id === 'number' &&
        typeof option.name === 'string' &&
        typeof option.color === 'string' &&
        typeof option.deep === 'boolean' &&
        typeof option.effectSlots === 'number' &&
        typeof option.curseSlots === 'number'
    )
  )
}

function isEffectEditOptions(value: unknown): value is BackendEffectEditOption[] {
  return (
    Array.isArray(value) &&
    value.every(
      (option) =>
        isRecord(option) &&
        typeof option.id === 'number' &&
        typeof option.name === 'string' &&
        typeof option.warning === 'boolean' &&
        typeof option.needsCurse === 'boolean'
    )
  )
}

function normalizeColor(color: string): RelicRow['color'] {
  if (
    color === 'Red' ||
    color === 'Blue' ||
    color === 'Yellow' ||
    color === 'Green' ||
    color === 'White'
  ) {
    return color
  }
  return 'Green'
}

function toRelicRow(relic: BackendRelic): RelicRow {
  return {
    id: relic.order,
    gaHandle: relic.gaHandle,
    name: relic.name,
    deep: relic.deep,
    itemId: relic.itemId,
    color: normalizeColor(relic.color),
    equippedBy: relic.equippedByText,
    effectIds: relic.effectIds,
    effect1: relic.effectNames[0] ?? '-',
    effect2: relic.effectNames[1] ?? '-',
    effect3: relic.effectNames[2] ?? '-',
    favorite: relic.favorite,
    flagged: relic.illegal || relic.curseIllegal || relic.strictInvalid || relic.unique,
    illegal: relic.illegal,
    curseIllegal: relic.curseIllegal,
    strictInvalid: relic.strictInvalid,
    unique: relic.unique
  }
}

function toRelicRowFromVesselSlot(row: VesselRow): RelicRow | null {
  if (!row.gaHandle || row.itemId === null) {
    return null
  }
  return {
    id: row.slot,
    gaHandle: row.gaHandle,
    name: row.name,
    deep: row.type === 'Deep',
    itemId: row.itemId,
    color: row.color,
    equippedBy: '-',
    effectIds: row.effectIds,
    effect1: row.effect1,
    effect2: row.effect2,
    effect3: row.effect3
  }
}

function toVesselGroup(group: BackendVesselGroup): VesselGroupView {
  return {
    index: group.index,
    vesselId: group.vesselId,
    heroType: group.heroType,
    name: group.name,
    status: group.status,
    locked: !group.unlocked,
    rows: group.rows.map((row) => ({
      slot: row.slot,
      vesselId: group.vesselId,
      vesselIndex: group.index,
      heroType: group.heroType,
      gaHandle: row.gaHandle,
      type: row.type,
      color: normalizeColor(row.color || row.requiredColor),
      name: row.name,
      itemId: row.itemId,
      id: row.itemId === null ? '-' : String(row.itemId),
      effectIds: row.effectIds,
      effect1: row.effectNames[0] ?? '-',
      effect2: row.effectNames[1] ?? '-',
      effect3: row.effectNames[2] ?? '-'
    }))
  }
}

function toVesselPreset(preset: BackendVesselPreset): VesselPresetView {
  return {
    index: preset.index,
    heroPresetIndex: preset.heroPresetIndex,
    heroType: preset.heroType,
    name: preset.name,
    vesselId: preset.vesselId,
    vesselName: preset.vesselName,
    relicCount: preset.relicCount,
    equipped: preset.equipped,
    rows: preset.rows.map((row) => ({
      slot: row.slot,
      vesselId: preset.vesselId,
      vesselIndex: preset.heroPresetIndex,
      heroType: preset.heroType,
      gaHandle: row.gaHandle,
      type: row.type,
      color: normalizeColor(row.color || row.requiredColor),
      name: row.name,
      itemId: row.itemId,
      id: row.itemId === null ? '-' : String(row.itemId),
      effectIds: row.effectIds,
      effect1: row.effectNames[0] ?? '-',
      effect2: row.effectNames[1] ?? '-',
      effect3: row.effectNames[2] ?? '-'
    }))
  }
}
