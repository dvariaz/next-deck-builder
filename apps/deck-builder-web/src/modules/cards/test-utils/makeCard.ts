import type { CardResponseDto } from '@/generated/model'

/**
 * Builds a `CardResponseDto` for tests. All required fields get sensible
 * defaults; pass `overrides` to set only the properties a test cares about.
 */
export function makeCard(overrides: Partial<CardResponseDto> = {}): CardResponseDto {
  return {
    id: 'card-1',
    ygoId: 1,
    name: 'Test Card',
    cardType: 'MONSTER',
    frameType: 'normal',
    description: '',
    ygoprodeckUrl: '',
    isEffect: false,
    isFlip: false,
    isTuner: false,
    isPendulum: false,
    isToken: false,
    aiTags: [],
    cardImages: [],
    ...overrides,
  } as CardResponseDto
}
