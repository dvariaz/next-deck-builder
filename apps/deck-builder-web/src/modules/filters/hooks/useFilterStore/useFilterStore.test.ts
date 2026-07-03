import { beforeEach, describe, expect, it } from 'vitest'
import { useFilterStoreBase as useFilterStore } from './useFilterStore'

const store = () => useFilterStore.getState()

beforeEach(() => {
  useFilterStore.setState(useFilterStore.getInitialState())
})

describe('useFilterStore', () => {
  describe('monster-exclusive filters', () => {
    it('auto-applies the Monster card type when a frame type is toggled on', () => {
      store().toggleFrameType('EFFECT')

      expect(store().cardTypes).toEqual(['MONSTER'])
    })

    it('auto-applies the Monster card type for attribute, race, level/atk/def ranges, and properties', () => {
      store().toggleAttribute('DARK')
      expect(store().cardTypes).toEqual(['MONSTER'])

      useFilterStore.setState(useFilterStore.getInitialState())
      store().toggleRace('Dragon')
      expect(store().cardTypes).toEqual(['MONSTER'])

      useFilterStore.setState(useFilterStore.getInitialState())
      store().setLevelRange(4, 8)
      expect(store().cardTypes).toEqual(['MONSTER'])

      useFilterStore.setState(useFilterStore.getInitialState())
      store().setAtkRange(1000, undefined)
      expect(store().cardTypes).toEqual(['MONSTER'])

      useFilterStore.setState(useFilterStore.getInitialState())
      store().setDefRange(undefined, 2000)
      expect(store().cardTypes).toEqual(['MONSTER'])

      useFilterStore.setState(useFilterStore.getInitialState())
      store().setIsTuner(true)
      expect(store().cardTypes).toEqual(['MONSTER'])
    })

    it('does not override an already explicit card type selection', () => {
      store().toggleCardType('SPELL')

      store().toggleAttribute('DARK')

      expect(store().cardTypes).toEqual(['SPELL'])
    })

    it('does not apply a card type when clearing a range', () => {
      store().setLevelRange(undefined, undefined)
      expect(store().cardTypes).toEqual([])
    })

    it('does not re-derive the card type when toggling an attribute off', () => {
      store().toggleAttribute('DARK')
      store().toggleCardType('MONSTER')
      store().toggleAttribute('DARK')

      expect(store().cardTypes).toEqual([])
    })
  })

  describe('spell/trap sub-type filters', () => {
    it('auto-applies Spell only for spell-exclusive sub-types', () => {
      store().toggleSpellTrapSubType('QUICK_PLAY')

      expect(store().cardTypes).toEqual(['SPELL'])
    })

    it('auto-applies Trap only for the trap-exclusive sub-type', () => {
      store().toggleSpellTrapSubType('COUNTER')

      expect(store().cardTypes).toEqual(['TRAP'])
    })

    it('auto-applies both Spell and Trap for ambiguous sub-types', () => {
      store().toggleSpellTrapSubType('NORMAL')

      expect(store().cardTypes).toEqual(['SPELL', 'TRAP'])
    })

    it('does not override an already explicit card type selection', () => {
      store().toggleCardType('MONSTER')

      store().toggleSpellTrapSubType('COUNTER')

      expect(store().cardTypes).toEqual(['MONSTER'])
    })
  })
})
