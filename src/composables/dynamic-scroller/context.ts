import type { InjectionKey } from 'vue'

import type { RecycleScrollerItemKeyValue } from '../../types/recycle-scroller'

export interface DynamicScrollerContext {
  reportItemSize: (item: unknown, index: number, size: number) => void
  resolveItemKey: (item: unknown, index: number) => RecycleScrollerItemKeyValue
}

export const dynamicScrollerContextKey: InjectionKey<DynamicScrollerContext> = Symbol('dynamic-scroller')
