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

  describe('link markers', () => {
    it('auto-applies the Monster card type when a link marker is toggled on', () => {
      store().toggleLinkMarker('top')

      expect(store().linkMarkers).toEqual(['top'])
      expect(store().cardTypes).toEqual(['MONSTER'])
    })

    it('does not override an already explicit card type selection', () => {
      store().toggleCardType('SPELL')

      store().toggleLinkMarker('top')

      expect(store().cardTypes).toEqual(['SPELL'])
    })

    it('removes the marker when toggled off', () => {
      store().toggleLinkMarker('top')
      store().toggleLinkMarker('bottom')
      store().toggleLinkMarker('top')

      expect(store().linkMarkers).toEqual(['bottom'])
    })

    it('includes linkMarkerStrict in query params only when markers are selected and strict is on', () => {
      store().setLinkMarkerStrict(true)
      expect(store().toQueryParams().linkMarker).toBeUndefined()
      expect(store().toQueryParams().linkMarkerStrict).toBeUndefined()

      store().toggleLinkMarker('top')
      expect(store().toQueryParams().linkMarker).toEqual(['top'])
      expect(store().toQueryParams().linkMarkerStrict).toBe(true)
    })

    it('omits linkMarkerStrict when strict is off', () => {
      store().toggleLinkMarker('top')

      expect(store().toQueryParams().linkMarker).toEqual(['top'])
      expect(store().toQueryParams().linkMarkerStrict).toBeUndefined()
    })

    it('auto-selects the Link frame type when a marker is toggled on', () => {
      store().toggleLinkMarker('top')

      expect(store().frameTypes).toEqual(['LINK'])
    })

    it('derives min level from the marker count in loose mode (min only)', () => {
      store().toggleLinkMarker('top')
      store().toggleLinkMarker('bottom')
      store().toggleLinkMarker('left')

      expect(store().linkMarkers).toHaveLength(3)
      expect(store().levelMin).toBe(3)
      expect(store().levelMax).toBeUndefined()
    })

    it('derives an exact min and max level in strict mode', () => {
      store().toggleLinkMarker('top')
      store().toggleLinkMarker('bottom')
      store().setLinkMarkerStrict(true)

      expect(store().levelMin).toBe(2)
      expect(store().levelMax).toBe(2)
    })

    it('clears the derived level range when all markers are removed', () => {
      store().toggleLinkMarker('top')
      expect(store().levelMin).toBe(1)

      store().toggleLinkMarker('top')
      expect(store().levelMin).toBeUndefined()
      expect(store().levelMax).toBeUndefined()
    })

    it('does not touch levels when toggling strict with no markers selected', () => {
      store().setLevelRange(5, 9)
      store().setLinkMarkerStrict(true)

      expect(store().levelMin).toBe(5)
      expect(store().levelMax).toBe(9)
    })

    it('clears all markers, strict, and derived levels via removeFilter("linkMarkers")', () => {
      store().toggleLinkMarker('top')
      store().toggleLinkMarker('bottom')
      store().setLinkMarkerStrict(true)

      store().removeFilter('linkMarkers')

      expect(store().linkMarkers).toEqual([])
      expect(store().linkMarkerStrict).toBe(false)
      expect(store().levelMin).toBeUndefined()
      expect(store().levelMax).toBeUndefined()
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
