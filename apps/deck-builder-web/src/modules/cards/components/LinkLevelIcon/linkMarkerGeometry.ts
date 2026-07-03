// Shared SVG geometry + colors for link-arrow markers, used by the read-only
// LinkLevelIcon and the interactive LinkMarkerSelector filter component.

export const ACTIVE_COLOR = '#e05252'
export const INACTIVE_STROKE = '#aaa'
export const STROKE_WIDTH = 3

export interface LinkArrow {
  key: string
  points: string
}

export const CARDINAL_ARROWS: LinkArrow[] = [
  { key: 'top',    points: '50,5 35,22 65,22' },
  { key: 'right',  points: '95,50 78,35 78,65' },
  { key: 'bottom', points: '50,95 35,78 65,78' },
  { key: 'left',   points: '5,50 22,35 22,65' },
]

export const DIAGONAL_ARROWS: LinkArrow[] = [
  { key: 'top-left',     points: '5,5 30,5 5,30' },
  { key: 'top-right',    points: '95,5 70,5 95,30' },
  { key: 'bottom-right', points: '95,95 70,95 95,70' },
  { key: 'bottom-left',  points: '5,95 30,95 5,70' },
]

export const LINK_ARROWS: LinkArrow[] = [...DIAGONAL_ARROWS, ...CARDINAL_ARROWS]
