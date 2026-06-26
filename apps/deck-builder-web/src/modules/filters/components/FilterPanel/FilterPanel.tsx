'use client'

import { useState } from 'react'
import {
  Flame, Droplets, Wind, Mountain, Sun, Moon, Sparkles,
  Shield, Sword, Zap, ChevronDown,
} from 'lucide-react'
import { Checkbox } from '@/modules/common/components/Checkbox/Checkbox'
import { Slider } from '@/modules/common/components/Slider/Slider'
import { Button } from '@/modules/common/components/Button/Button'
import { FilterSection } from '@/modules/filters/components/FilterSection/FilterSection'
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
  RACES,
  SPELL_TRAP_SUB_TYPES,
  SPELL_TRAP_SUB_TYPE_LABELS,
} from '@/modules/filters/utils/filterConstants'

const attributeIcons: Record<Attribute, React.ReactNode> = {
  DARK: <Moon className="h-4 w-4" />,
  LIGHT: <Sun className="h-4 w-4" />,
  FIRE: <Flame className="h-4 w-4" />,
  WATER: <Droplets className="h-4 w-4" />,
  EARTH: <Mountain className="h-4 w-4" />,
  WIND: <Wind className="h-4 w-4" />,
  DIVINE: <Sparkles className="h-4 w-4" />,
}

const attributeColors: Record<Attribute, string> = {
  DARK: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  LIGHT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  FIRE: 'bg-red-500/20 text-red-400 border-red-500/30',
  WATER: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  EARTH: 'bg-amber-600/20 text-amber-500 border-amber-600/30',
  WIND: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  DIVINE: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
}

const banlistColors: Record<CardsControllerFindAllBanStatusTcgItem, string> = {
  FORBIDDEN: 'text-red-400',
  LIMITED: 'text-orange-400',
  SEMI_LIMITED: 'text-yellow-400',
  UNLIMITED: 'text-muted-foreground',
}

const RACES_INITIAL_COUNT = 6
const FRAME_TYPES_INITIAL_COUNT = 4

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

  const [showAllFrameTypes, setShowAllFrameTypes] = useState(false)
  const [showAllRaces, setShowAllRaces] = useState(false)

  const visibleFrameTypes = showAllFrameTypes ? FRAME_TYPES : FRAME_TYPES.slice(0, FRAME_TYPES_INITIAL_COUNT)
  const visibleRaces = showAllRaces ? RACES : RACES.slice(0, RACES_INITIAL_COUNT)

  const levelRangeValues = [levelMin ?? 1, levelMax ?? 12]
  const atkRangeValues = [atkMin ?? 0, atkMax ?? 5000]
  const defRangeValues = [defMin ?? 0, defMax ?? 5000]

  const handleLevelChange = (values: number[]) => {
    setLevelRange(values[0] === 1 ? undefined : values[0], values[1] === 12 ? undefined : values[1])
  }
  const handleAtkChange = (values: number[]) => {
    setAtkRange(values[0] === 0 ? undefined : values[0], values[1] === 5000 ? undefined : values[1])
  }
  const handleDefChange = (values: number[]) => {
    setDefRange(values[0] === 0 ? undefined : values[0], values[1] === 5000 ? undefined : values[1])
  }

  const showMonsterFilters = cardTypes.length === 0 || cardTypes.includes(CardsControllerFindAllCardTypeItem.MONSTER)
  const showSpellTrapFilters = cardTypes.length === 0 || cardTypes.includes(CardsControllerFindAllCardTypeItem.SPELL) || cardTypes.includes(CardsControllerFindAllCardTypeItem.TRAP)

  const monsterPropertiesCount = (isTuner ? 1 : 0) + (isFlip ? 1 : 0) + (isPendulum ? 1 : 0)

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
          <div className="space-y-2">
            {visibleFrameTypes.map((type: CardsControllerFindAllFrameTypeItem) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer group">
                <Checkbox
                  checked={frameTypes.includes(type)}
                  onCheckedChange={() => toggleFrameType(type)}
                />
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors capitalize">
                  {type.toLowerCase()}
                </span>
              </label>
            ))}
            {FRAME_TYPES.length > FRAME_TYPES_INITIAL_COUNT && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllFrameTypes(!showAllFrameTypes)}
                className="w-full justify-start gap-1 text-xs text-muted-foreground"
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform', showAllFrameTypes && 'rotate-180')} />
                {showAllFrameTypes ? 'Show less' : `Show ${FRAME_TYPES.length - FRAME_TYPES_INITIAL_COUNT} more`}
              </Button>
            )}
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
                  {attributeIcons[attr]}
                  <span>{attr}</span>
                </button>
              )
            })}
          </div>
        </FilterSection>
      )}

      {/* Race — monsters only */}
      {showMonsterFilters && (
        <FilterSection title="Race / Type" badge={races.length}>
          <div className="space-y-2">
            {visibleRaces.map((race: string) => (
              <label key={race} className="flex items-center gap-2 cursor-pointer group">
                <Checkbox
                  checked={races.includes(race)}
                  onCheckedChange={() => toggleRace(race)}
                />
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  {race}
                </span>
              </label>
            ))}
            {RACES.length > RACES_INITIAL_COUNT && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllRaces(!showAllRaces)}
                className="w-full justify-start gap-1 text-xs text-muted-foreground"
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform', showAllRaces && 'rotate-180')} />
                {showAllRaces ? 'Show less' : `Show ${RACES.length - RACES_INITIAL_COUNT} more`}
              </Button>
            )}
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
              max={12}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span><span>12</span>
            </div>
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

      {/* Monster Properties — monsters only */}
      {showMonsterFilters && (
        <FilterSection title="Properties" badge={monsterPropertiesCount}>
          <div className="flex flex-wrap gap-2">
            {([
              { label: 'Tuner', value: isTuner, set: setIsTuner },
              { label: 'Flip', value: isFlip, set: setIsFlip },
              { label: 'Pendulum', value: isPendulum, set: setIsPendulum },
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

      {/* Spell/Trap Sub-Type — spells and traps only */}
      {showSpellTrapFilters && (
        <FilterSection title="Sub-Type" badge={spellTrapSubTypes.length}>
          <div className="space-y-2">
            {SPELL_TRAP_SUB_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer group">
                <Checkbox
                  checked={spellTrapSubTypes.includes(type)}
                  onCheckedChange={() => toggleSpellTrapSubType(type)}
                />
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  {SPELL_TRAP_SUB_TYPE_LABELS[type]}
                </span>
              </label>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Banlist Status (TCG) */}
      <FilterSection title="Banlist (TCG)" badge={banStatuses.length}>
        <div className="space-y-2">
          {([CardsControllerFindAllBanStatusTcgItem.FORBIDDEN, CardsControllerFindAllBanStatusTcgItem.LIMITED, CardsControllerFindAllBanStatusTcgItem.SEMI_LIMITED] as const).map((status) => (
            <label key={status} className="flex items-center gap-2 cursor-pointer group">
              <Checkbox
                checked={banStatuses.includes(status)}
                onCheckedChange={() => toggleBanStatus(status)}
              />
              <span className={cn(
                'flex items-center gap-2 text-sm transition-colors',
                banStatuses.includes(status) ? banlistColors[status] : 'text-muted-foreground group-hover:text-foreground',
              )}>
                <BanlistStatusIcon status={status} size="sm" />
                {formatBanlistLabel(status)}
              </span>
            </label>
          ))}
        </div>
      </FilterSection>
    </div>
  )
}
