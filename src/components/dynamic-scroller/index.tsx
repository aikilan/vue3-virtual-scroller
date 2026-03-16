import {
  computed,
  defineComponent,
  h,
  mergeProps,
  provide,
  ref,
  toRef,
  watch,
  type PropType,
} from 'vue'

import { dynamicScrollerContextKey } from '../../composables/dynamic-scroller/context'
import {
  resolveScrollBoundaryPayload,
  resolveVerticalScrollBoundaryState,
} from '../../composables/recycle-scroller/scroll-boundary'
import {
  isSameScrollPositionPayload,
  resolveScrollPositionPayload,
} from '../../composables/recycle-scroller/scroll-position'
import {
  assertValidPullToRefreshConfig,
  DEFAULT_PULL_TO_REFRESH_HOLD,
  DEFAULT_PULL_TO_REFRESH_THRESHOLD,
  usePullToRefresh,
} from '../../composables/recycle-scroller/pull-to-refresh'
import {
  assertValidMinItemSize,
  resolveItemStyle,
  resolveWrapperStyle,
  useDynamicScroller,
  type UseDynamicScrollerOptions,
} from '../../composables/useDynamicScroller'
import type {
  DynamicScrollerDefaultSlotProps,
  DynamicScrollerExpose,
  DynamicScrollerRefreshSlotProps,
  PullToRefreshHandler,
  RecycleScrollerItemKey,
  ScrollState,
} from '../../types/recycle-scroller'

function assertDynamicScrollerDirection(direction: string): void {
  if (direction !== 'vertical') {
    throw new Error('DynamicScroller currently supports only vertical direction.')
  }
}

const DynamicScroller = defineComponent({
  name: 'DynamicScroller',
  inheritAttrs: false,
  props: {
    items: {
      type: Array as PropType<unknown[]>,
      required: true,
    },
    minItemSize: {
      type: Number,
      required: true,
    },
    itemKey: {
      type: [String, Function] as PropType<RecycleScrollerItemKey>,
      default: 'id',
    },
    buffer: {
      type: Number,
      default: 200,
    },
    direction: {
      type: String as PropType<'vertical'>,
      default: 'vertical',
    },
    pullToRefresh: {
      type: Boolean,
      default: false,
    },
    pullToRefreshThreshold: {
      type: Number,
      default: DEFAULT_PULL_TO_REFRESH_THRESHOLD,
    },
    pullToRefreshHold: {
      type: Number,
      default: DEFAULT_PULL_TO_REFRESH_HOLD,
    },
    onRefresh: {
      type: Function as PropType<PullToRefreshHandler>,
      default: undefined,
    },
  },
  emits: ['scrollPosition', 'scrollTop', 'scrollEnd'],
  setup(props, { attrs, emit, expose, slots }) {
    assertDynamicScrollerDirection(props.direction)
    assertValidMinItemSize(props.minItemSize)

    const containerRef = ref<HTMLElement>()
    const beforeRef = ref<HTMLElement>()
    const {
      handleScroll,
      measurement,
      totalSize,
      ready,
      visibleViews,
      getScroll,
      scrollToItem,
      scrollToPosition,
      updateVisibleItems,
      reportItemSize,
      resolveItemKey,
    } = useDynamicScroller(
      props as unknown as UseDynamicScrollerOptions,
      containerRef,
      beforeRef,
    )
    const {
      handleTouchcancel,
      handleTouchend,
      handleTouchmove,
      handleTouchstart,
      isEnabled: pullToRefreshEnabled,
      refreshInset,
      refreshState,
    } = usePullToRefresh({
      enabled: toRef(props, 'pullToRefresh'),
      direction: toRef(props, 'direction'),
      threshold: toRef(props, 'pullToRefreshThreshold'),
      hold: toRef(props, 'pullToRefreshHold'),
      onRefresh: toRef(props, 'onRefresh'),
      getScrollStart: () => containerRef.value?.scrollTop ?? 0,
    })

    provide(dynamicScrollerContextKey, {
      reportItemSize,
      resolveItemKey,
    })

    const wrapperStyle = computed(() => resolveWrapperStyle(props.direction, totalSize.value))
    const refreshLabel = computed(() => {
      switch (refreshState.value) {
        case 'pulling':
          return '继续下拉刷新'
        case 'armed':
          return '松开立即刷新'
        case 'refreshing':
          return '刷新中...'
        case 'settling':
          return '刷新完成'
        default:
          return '下拉刷新'
      }
    })
    const refreshSlotProps = computed<DynamicScrollerRefreshSlotProps>(() => ({
      hold: props.pullToRefreshHold,
      inset: refreshInset.value,
      label: refreshLabel.value,
      state: refreshState.value,
      threshold: props.pullToRefreshThreshold,
    }))
    const shouldRenderBefore = computed(() => pullToRefreshEnabled.value || Boolean(slots.before))
    const lastScrollPosition = ref<ReturnType<typeof resolveScrollPositionPayload> | null>(null)
    const lastScrollTopReached = ref<boolean | null>(null)
    const lastScrollEndReached = ref<boolean | null>(null)

    const exposed: DynamicScrollerExpose = {
      scrollToItem,
      scrollToPosition,
      getScroll,
      updateVisibleItems,
    }

    expose(exposed)

    watch(
      () => [
        props.pullToRefresh,
        props.pullToRefreshThreshold,
        props.pullToRefreshHold,
        props.direction,
        props.onRefresh,
      ] as const,
      ([enabled, threshold, hold, direction, onRefresh]) => {
        assertValidPullToRefreshConfig(
          'DynamicScroller',
          enabled,
          direction,
          threshold,
          hold,
          onRefresh,
        )
      },
      { immediate: true },
    )

    watch(
      refreshInset,
      () => {
        updateVisibleItems()
      },
      { flush: 'post' },
    )

    watch(
      [ready, visibleViews],
      ([isReady, nextVisibleViews]) => {
        if (!isReady) {
          return
        }

        const nextPayload = resolveScrollPositionPayload(nextVisibleViews)
        if (isSameScrollPositionPayload(lastScrollPosition.value, nextPayload)) {
          return
        }

        lastScrollPosition.value = nextPayload
        emit('scrollPosition', nextPayload)
      },
      { flush: 'post' },
    )

    function syncScrollBoundaryEvents(scroll: ScrollState): void {
      if (!containerRef.value || containerRef.value.clientHeight <= 0) {
        lastScrollTopReached.value = null
        lastScrollEndReached.value = null
        return
      }

      const { topReached, endReached } = resolveVerticalScrollBoundaryState(
        containerRef.value,
        scroll,
      )

      if (lastScrollTopReached.value !== topReached) {
        lastScrollTopReached.value = topReached
        emit('scrollTop', resolveScrollBoundaryPayload(topReached, scroll))
      }

      if (lastScrollEndReached.value !== endReached) {
        lastScrollEndReached.value = endReached
        emit('scrollEnd', resolveScrollBoundaryPayload(endReached, scroll))
      }
    }

    watch(
      [ready, measurement],
      ([isReady, nextMeasurement]) => {
        if (!isReady) {
          return
        }

        syncScrollBoundaryEvents(nextMeasurement.scroll)
      },
      { flush: 'post' },
    )

    const renderItemView = (slotProps: DynamicScrollerDefaultSlotProps) => {
      return slots.default?.(slotProps) ?? null
    }

    return () => {
      const rootProps = mergeProps(attrs, {
        ref: containerRef,
        class: [
          'vue-recycle-scroller',
          'vue-dynamic-scroller',
          `direction-${props.direction}`,
          { 'has-pull-to-refresh': pullToRefreshEnabled.value },
          { [`pull-state-${refreshState.value}`]: pullToRefreshEnabled.value },
          { ready: ready.value },
          attrs.class,
        ],
        onScroll: handleScroll,
        onTouchcancel: pullToRefreshEnabled.value ? handleTouchcancel : undefined,
        onTouchend: pullToRefreshEnabled.value ? handleTouchend : undefined,
        onTouchmove: pullToRefreshEnabled.value ? handleTouchmove : undefined,
        onTouchstart: pullToRefreshEnabled.value ? handleTouchstart : undefined,
      })

      const itemViews = visibleViews.value.map((view) => {
        const viewChildren = (h as unknown as (
          type: string,
          props: Record<string, unknown>,
          children: unknown,
        ) => ReturnType<typeof h>)(
          'div',
          {
            key: resolveItemKey(view.item, view.index),
            class: 'vue-recycle-scroller__item-content',
          },
          renderItemView({
            item: view.item,
            index: view.index,
            active: view.active,
          }),
        )

        return h(
          'div',
          {
            key: view.viewId,
            class: ['vue-recycle-scroller__item-view', { active: view.active }],
            style: {
              ...resolveItemStyle(props.direction, view.position, 0),
              height: 'auto',
            },
          } as Record<string, unknown>,
          viewChildren as never,
        )
      })

      const children = [
        shouldRenderBefore.value
          ? h('div', { ref: beforeRef, class: 'vue-recycle-scroller__slot' }, [
              slots.before?.(),
              pullToRefreshEnabled.value
                ? h(
                    'div',
                    {
                      class: ['vue-recycle-scroller__refresh', `is-${refreshState.value}`],
                      'data-state': refreshState.value,
                      style: {
                        height: `${refreshInset.value}px`,
                      },
                    },
                    slots.refresh?.(refreshSlotProps.value)
                    ?? h(
                      'div',
                      {
                        class: 'vue-recycle-scroller__refresh-indicator',
                        'aria-label': refreshLabel.value,
                        'aria-live': 'polite',
                        role: 'status',
                      },
                      h('span', { class: 'vue-recycle-scroller__refresh-spinner', 'aria-hidden': 'true' }),
                    ),
                  )
                : null,
            ])
          : null,
        h(
          'div',
          { class: 'vue-recycle-scroller__item-wrapper', style: wrapperStyle.value },
          [
            ...itemViews,
            props.items.length === 0 ? slots.empty?.() : null,
          ],
        ),
        slots.after
          ? h('div', { class: 'vue-recycle-scroller__slot' }, slots.after())
          : null,
      ]

      return h('div', rootProps, children)
    }
  },
})

export default DynamicScroller
