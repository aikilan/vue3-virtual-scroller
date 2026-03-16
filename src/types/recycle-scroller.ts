export type ScrollDirection = 'vertical' | 'horizontal'
export type RecycleScrollerItemKeyValue = string | number
export type RecycleScrollerItemKeyResolver = (
  item: unknown,
  index: number,
) => RecycleScrollerItemKeyValue
export type RecycleScrollerItemKey = string | RecycleScrollerItemKeyResolver
export type RecycleScrollerUpdateReason = 'scroll' | 'resize' | 'items' | 'props' | 'manual'
export type PullToRefreshState = 'idle' | 'pulling' | 'armed' | 'refreshing' | 'settling'
export type PullToRefreshHandler = () => void | Promise<void>

export interface PullToRefreshSlotProps {
  hold: number
  inset: number
  label: string
  state: PullToRefreshState
  threshold: number
}

export interface ScrollState {
  start: number
  end: number
}

export interface RecycleScrollerMeasurementState {
  beforeSize: number
  viewportSize: number
  scroll: ScrollState
}

export interface FixedHeightRange {
  startIndex: number
  endIndex: number
  visibleStartIndex: number
  visibleEndIndex: number
  totalSize: number
}

export interface RecycleScrollerDefaultSlotProps {
  item: unknown
  index: number
  active: boolean
}

export type DynamicScrollerDefaultSlotProps = RecycleScrollerDefaultSlotProps
export type DynamicScrollerRefreshSlotProps = PullToRefreshSlotProps

export interface RecycleScrollerExpose {
  scrollToItem: (index: number) => void
  scrollToPosition: (position: number) => void
  getScroll: () => ScrollState
  updateVisibleItems: () => void
}

export interface RecycleScrollerProps {
  items: unknown[]
  itemSize: number
  itemKey?: RecycleScrollerItemKey
  buffer?: number
  direction?: ScrollDirection
  pullToRefresh?: boolean
  pullToRefreshThreshold?: number
  pullToRefreshHold?: number
  onRefresh?: PullToRefreshHandler
}

export interface DynamicScrollerProps {
  items: unknown[]
  minItemSize: number
  itemKey?: RecycleScrollerItemKey
  buffer?: number
  direction?: 'vertical'
  pullToRefresh?: boolean
  pullToRefreshThreshold?: number
  pullToRefreshHold?: number
  onRefresh?: PullToRefreshHandler
}

export interface DynamicScrollerItemProps {
  item: unknown
  index: number
  active: boolean
  sizeDependencies?: unknown[]
}

export type DynamicScrollerExpose = RecycleScrollerExpose
export type RecycleScrollerRefreshSlotProps = PullToRefreshSlotProps

export interface DynamicSizeRange {
  startIndex: number
  endIndex: number
  visibleStartIndex: number
  visibleEndIndex: number
  totalSize: number
}

export interface RecycleScrollerView {
  viewId: number
  item: unknown
  index: number
  key: RecycleScrollerItemKeyValue
  active: boolean
  position: number
}

export interface RecycleScrollerVisibleEntry {
  item: unknown
  index: number
  key: RecycleScrollerItemKeyValue
  active: boolean
  position: number
}

export interface FixedHeightRangeInput {
  count: number
  itemSize: number
  buffer: number
  scrollStart: number
  scrollEnd: number
  beforeSize?: number
}
