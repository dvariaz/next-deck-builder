'use client'

import {
  Sparkles,
  Shield, Sword, Zap,
  Cuboid, Shell, Layers, BookOpenText, Scale, Metronome,
} from 'lucide-react'
import { Slider } from '@/modules/common/components/Slider/Slider'
import { FilterSection } from '@/modules/filters/components/FilterSection/FilterSection'
import { AttributeIcon } from '@/modules/filters/components/AttributeIcon/AttributeIcon'
import { LinkMarkerSelector } from '@/modules/filters/components/LinkMarkerSelector/LinkMarkerSelector'
import { LinkLevelIcon } from '@/modules/cards/components/LinkLevelIcon/LinkLevelIcon'
import { BanlistStatusIcon } from '@/modules/common/components/BanlistStatusIcon/BanlistStatusIcon'
import { formatBanlistLabel } from '@/modules/common/utils/formatBanlistLabel'
import { useFilterStore } from '@/modules/filters/hooks/useFilterStore/useFilterStore'
import {
  CardsControllerFindAllCardTypeItem,
  CardsControllerFindAllBanStatusTcgItem,
  CardsControllerFindAllFrameTypeItem,
} from '@/generated/model'
import { cn } from '@/lib/utils'
import {
  ATTRIBUTES,
  type Attribute,
  FRAME_TYPES,
  type FrameType,
  LINK_MARKERS,
  RACES,
  SPELL_TRAP_SUB_TYPES,
  SPELL_TRAP_SUB_TYPE_LABELS,
} from '@/modules/filters/utils/filterConstants'

const attributeColors: Record<Attribute, string> = {
  DARK: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  LIGHT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  FIRE: 'bg-red-500/20 text-red-400 border-red-500/30',
  WATER: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  EARTH: 'bg-amber-600/20 text-amber-500 border-amber-600/30',
  WIND: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  DIVINE: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

const frameTypeIcons: Record<FrameType, React.ReactNode> = {
  NORMAL: <Cuboid className="h-5 w-5" />,
  EFFECT: <Sparkles className="h-5 w-5" />,
  FUSION: <Shell className="h-5 w-5" />,
  SYNCHRO: <Metronome className="h-5 w-5" />,
  XYZ: <Layers className="h-5 w-5" />,
  LINK: <LinkLevelIcon linkMarkers={[...LINK_MARKERS]} activeColor="currentColor" size={20} />,
  RITUAL: <BookOpenText className="h-5 w-5" />,
  PENDULUM: <Scale className="h-5 w-5" />,
}

const frameTypeColors: Record<FrameType, string> = {
  NORMAL: 'border-yellow-200/30 bg-yellow-200/10 text-yellow-200',
  EFFECT: 'border-orange-300/30 bg-orange-300/10 text-orange-400',
  FUSION: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  SYNCHRO: 'border-slate-100/30 bg-slate-100/10 text-slate-100',
  XYZ: 'border-zinc-300/70 bg-zinc-800/90 text-zinc-50 bg-star-mosaic',
  LINK: 'border-sky-600/30 bg-sky-600/10 text-sky-400',
  RITUAL: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  PENDULUM: 'border-orange-300/30 bg-gradient-to-b from-orange-300/20 to-teal-300/20 text-teal-300',
}

const banlistColors: Record<CardsControllerFindAllBanStatusTcgItem, string> = {
  FORBIDDEN: 'text-red-400',
  LIMITED: 'text-orange-400',
  SEMI_LIMITED: 'text-yellow-400',
  UNLIMITED: 'text-muted-foreground',
}

export function FilterPanel() {
  const cardTypes = useFilterStore.use.cardTypes()
  const frameTypes = useFilterStore.use.frameTypes()
  const attributes = useFilterStore.use.attributes()
  const races = useFilterStore.use.races()
  const spellTrapSubTypes = useFilterStore.use.spellTrapSubTypes()
  const banStatuses = useFilterStore.use.banStatuses()
  const levelMin = useFilterStore.use.levelMin()
  const levelMax = useFilterStore.use.levelMax()
  const atkMin = useFilterStore.use.atkMin()
  const atkMax = useFilterStore.use.atkMax()
  const defMin = useFilterStore.use.defMin()
  const defMax = useFilterStore.use.defMax()
  const isTuner = useFilterStore.use.isTuner()
  const isFlip = useFilterStore.use.isFlip()
  const isPendulum = useFilterStore.use.isPendulum()
  const isToon = useFilterStore.use.isToon()
  const isSpirit = useFilterStore.use.isSpirit()
  const isUnion = useFilterStore.use.isUnion()
  const isGemini = useFilterStore.use.isGemini()
  const linkMarkers = useFilterStore.use.linkMarkers()
  const linkMarkerStrict = useFilterStore.use.linkMarkerStrict()
  const toggleCardType = useFilterStore.use.toggleCardType()
  const toggleFrameType = useFilterStore.use.toggleFrameType()
  const toggleAttribute = useFilterStore.use.toggleAttribute()
  const toggleRace = useFilterStore.use.toggleRace()
  const toggleSpellTrapSubType = useFilterStore.use.toggleSpellTrapSubType()
  const toggleBanStatus = useFilterStore.use.toggleBanStatus()
  const setLevelRange = useFilterStore.use.setLevelRange()
  const setAtkRange = useFilterStore.use.setAtkRange()
  const setDefRange = useFilterStore.use.setDefRange()
  const setIsTuner = useFilterStore.use.setIsTuner()
  const setIsFlip = useFilterStore.use.setIsFlip()
  const setIsPendulum = useFilterStore.use.setIsPendulum()
  const setIsToon = useFilterStore.use.setIsToon()
  const setIsSpirit = useFilterStore.use.setIsSpirit()
  const setIsUnion = useFilterStore.use.setIsUnion()
  const setIsGemini = useFilterStore.use.setIsGemini()
  const toggleLinkMarker = useFilterStore.use.toggleLinkMarker()
  const setLinkMarkerStrict = useFilterStore.use.setLinkMarkerStrict()

  // Link monsters top out at Link 8 (max markers), so cap the shared Level/Rank/Link range in link context.
  const isLinkContext = frameTypes.includes(CardsControllerFindAllFrameTypeItem.LINK) || linkMarkers.length > 0
  const levelUpperBound = isLinkContext ? 8 : 12

  const levelRangeValues = [levelMin ?? 1, Math.min(levelMax ?? levelUpperBound, levelUpperBound)]
  const atkRangeValues = [atkMin ?? 0, atkMax ?? 5000]
  const defRangeValues = [defMin ?? 0, defMax ?? 5000]

  const handleLevelChange = (values: number[]) => {
    setLevelRange(values[0] === 1 ? undefined : values[0], values[1] === levelUpperBound ? undefined : values[1])
  }
  const handleAtkChange = (values: number[]) => {
    setAtkRange(values[0] === 0 ? undefined : values[0], values[1] === 5000 ? undefined : values[1])
  }
  const handleDefChange = (values: number[]) => {
    setDefRange(values[0] === 0 ? undefined : values[0], values[1] === 5000 ? undefined : values[1])
  }

  const showMonsterFilters = cardTypes.length === 0 || cardTypes.includes(CardsControllerFindAllCardTypeItem.MONSTER)
  const showSpellTrapFilters = cardTypes.length === 0 || cardTypes.includes(CardsControllerFindAllCardTypeItem.SPELL) || cardTypes.includes(CardsControllerFindAllCardTypeItem.TRAP)
  // Link markers only apply to Link monsters, so hide them once a non-Link frame type is chosen.
  const showLinkMarkers = showMonsterFilters && frameTypes.every((ft) => ft === CardsControllerFindAllFrameTypeItem.LINK)

  const monsterPropertiesCount =
    (isTuner ? 1 : 0) + (isFlip ? 1 : 0) + (isPendulum ? 1 : 0) +
    (isToon ? 1 : 0) + (isSpirit ? 1 : 0) + (isUnion ? 1 : 0) + (isGemini ? 1 : 0)

  return (
    <div className="space-y-1">
      {/* Card Type */}
      <FilterSection title="Card Type" badge={cardTypes.length}>
        <div className="grid grid-cols-3 gap-2">
          {([CardsControllerFindAllCardTypeItem.MONSTER, CardsControllerFindAllCardTypeItem.SPELL, CardsControllerFindAllCardTypeItem.TRAP] as const).map((type) => {
            const isSelected = cardTypes.includes(type)
            return (
              <button
                key={type}
                onClick={() => toggleCardType(type)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all text-xs font-medium',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50 text-muted-foreground',
                )}
                aria-pressed={isSelected}
              >
                {type === 'MONSTER' && <Sword className="h-4 w-4" />}
                {type === 'SPELL' && <Zap className="h-4 w-4" />}
                {type === 'TRAP' && <Shield className="h-4 w-4" />}
                <span className="capitalize">{type.toLowerCase()}</span>
              </button>
            )
          })}
        </div>
      </FilterSection>

      {/* Frame Type — monsters only */}
      {showMonsterFilters && (
        <FilterSection title="Frame Type" badge={frameTypes.length} defaultOpen={cardTypes.includes('MONSTER')}>
          <div className="grid grid-cols-3 gap-2">
            {FRAME_TYPES.map((type) => {
              const isSelected = frameTypes.includes(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleFrameType(type)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all text-xs font-medium',
                    isSelected
                      ? frameTypeColors[type]
                      : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50 text-muted-foreground',
                  )}
                  aria-pressed={isSelected}
                >
                  {frameTypeIcons[type]}
                  <span className="capitalize">{type.toLowerCase()}</span>
                </button>
              )
            })}
          </div>
        </FilterSection>
      )}

      {/* Attributes — monsters only */}
      {showMonsterFilters && (
        <FilterSection title="Attribute" badge={attributes.length}>
          <div className="flex flex-wrap gap-2">
            {ATTRIBUTES.map((attr) => {
              const isSelected = attributes.includes(attr)
              return (
                <button
                  key={attr}
                  onClick={() => toggleAttribute(attr)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                    isSelected
                      ? attributeColors[attr]
                      : 'border-border text-muted-foreground hover:border-muted-foreground/50',
                  )}
                  aria-pressed={isSelected}
                >
                  <AttributeIcon attribute={attr} className="h-4 w-4" />
                  <span>{attr}</span>
                </button>
              )
            })}
          </div>
        </FilterSection>
      )}

      {/* Monster Properties — monsters only */}
      {showMonsterFilters && (
        <FilterSection title="Properties" badge={monsterPropertiesCount}>
          <div className="flex flex-wrap gap-2">
            {([
              { label: 'Tuner', value: isTuner, set: setIsTuner },
              { label: 'Flip', value: isFlip, set: setIsFlip },
              { label: 'Pendulum', value: isPendulum, set: setIsPendulum },
              { label: 'Toon', value: isToon, set: setIsToon },
              { label: 'Spirit', value: isSpirit, set: setIsSpirit },
              { label: 'Union', value: isUnion, set: setIsUnion },
              { label: 'Gemini', value: isGemini, set: setIsGemini },
            ] as const).map(({ label, value, set }) => (
              <button
                key={label}
                onClick={() => set(value ? undefined : true)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                  value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/50',
                )}
                aria-pressed={!!value}
              >
                {label}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Race — monsters only */}
      {showMonsterFilters && (
        <FilterSection title="Race / Type" badge={races.length}>
          <div className="flex flex-wrap gap-2">
            {RACES.map((race: string) => {
              const isSelected = races.includes(race)
              return (
                <button
                  key={race}
                  onClick={() => toggleRace(race)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/50',
                  )}
                  aria-pressed={isSelected}
                >
                  {race}
                </button>
              )
            })}
          </div>
        </FilterSection>
      )}

      {/* Level / Rank / Link — monsters only */}
      {showMonsterFilters && (
        <FilterSection title="Level / Rank / Link">
          <div className="space-y-4 px-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Range</span>
              <span className="font-mono text-primary">{levelRangeValues[0]} – {levelRangeValues[1]}</span>
            </div>
            <Slider
              value={levelRangeValues}
              onValueChange={handleLevelChange}
              min={1}
              max={levelUpperBound}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span><span>{levelUpperBound}</span>
            </div>
          </div>
        </FilterSection>
      )}

      {/* Link Markers — Link monsters only */}
      {showLinkMarkers && (
        <FilterSection title="Link Markers" badge={linkMarkers.length}>
          <div className="flex justify-center">
            <LinkMarkerSelector
              selected={linkMarkers}
              onToggle={toggleLinkMarker}
              strict={linkMarkerStrict}
              onStrictChange={setLinkMarkerStrict}
            />
          </div>
        </FilterSection>
      )}

      {/* ATK — monsters only */}
      {showMonsterFilters && (
        <FilterSection title="ATK">
          <div className="space-y-4 px-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Range</span>
              <span className="font-mono text-primary">{atkRangeValues[0]} – {atkRangeValues[1]}</span>
            </div>
            <Slider
              value={atkRangeValues}
              onValueChange={handleAtkChange}
              min={0}
              max={5000}
              step={100}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span><span>5000</span>
            </div>
          </div>
        </FilterSection>
      )}

      {/* DEF — monsters only */}
      {showMonsterFilters && (
        <FilterSection title="DEF">
          <div className="space-y-4 px-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Range</span>
              <span className="font-mono text-primary">{defRangeValues[0]} – {defRangeValues[1]}</span>
            </div>
            <Slider
              value={defRangeValues}
              onValueChange={handleDefChange}
              min={0}
              max={5000}
              step={100}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span><span>5000</span>
            </div>
          </div>
        </FilterSection>
      )}

      {/* Spell/Trap Sub-Type — spells and traps only */}
      {showSpellTrapFilters && (
        <FilterSection title="Sub-Type" badge={spellTrapSubTypes.length}>
          <div className="flex flex-wrap gap-2">
            {SPELL_TRAP_SUB_TYPES.map((type) => {
              const isSelected = spellTrapSubTypes.includes(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleSpellTrapSubType(type)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/50',
                  )}
                  aria-pressed={isSelected}
                >
                  {SPELL_TRAP_SUB_TYPE_LABELS[type]}
                </button>
              )
            })}
          </div>
        </FilterSection>
      )}

      {/* Banlist Status (TCG) */}
      <FilterSection title="Banlist (TCG)" badge={banStatuses.length}>
        <div className="flex flex-wrap gap-2">
          {([CardsControllerFindAllBanStatusTcgItem.FORBIDDEN, CardsControllerFindAllBanStatusTcgItem.LIMITED, CardsControllerFindAllBanStatusTcgItem.SEMI_LIMITED] as const).map((status) => {
            const isSelected = banStatuses.includes(status)
            return (
              <button
                key={status}
                onClick={() => toggleBanStatus(status)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                  isSelected
                    ? cn('border-primary bg-primary/10', banlistColors[status])
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/50',
                )}
                aria-pressed={isSelected}
              >
                <BanlistStatusIcon status={status} size="sm" />
                {formatBanlistLabel(status)}
              </button>
            )
          })}
        </div>
      </FilterSection>
    </div>
  )
}
