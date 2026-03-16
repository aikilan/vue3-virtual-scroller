import {
  computed,
  defineComponent,
  h,
  mergeProps,
  ref,
  toRef,
  watch,
  type PropType,
} from 'vue'

import {
  assertValidItemSize,
  resolveItemStyle,
  resolveWrapperStyle,
  useRecycleScroller,
  type UseRecycleScrollerOptions,
} from '../../composables/useRecycleScroller'
import {
  assertValidPullToRefreshConfig,
  DEFAULT_PULL_TO_REFRESH_HOLD,
  DEFAULT_PULL_TO_REFRESH_THRESHOLD,
  usePullToRefresh,
} from '../../composables/recycle-scroller/pull-to-refresh'
import type {
  PullToRefreshHandler,
  RecycleScrollerRefreshSlotProps,
  RecycleScrollerDefaultSlotProps,
  RecycleScrollerExpose,
  RecycleScrollerItemKey,
  ScrollDirection,
} from '../../types/recycle-scroller'

const RecycleScroller = defineComponent({
  name: 'RecycleScroller',
  inheritAttrs: false,
  props: {
    items: {
      type: Array as PropType<unknown[]>,
      required: true,
    },
    itemSize: {
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
      type: String as PropType<ScrollDirection>,
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
  setup(props, { attrs, expose, slots }) {
    assertValidItemSize(props.itemSize)

    const containerRef = ref<HTMLElement>()
    const beforeRef = ref<HTMLElement>()

    const {
      handleScroll,
      totalSize,
      ready,
      visibleViews,
      getScroll,
      scrollToItem,
      scrollToPosition,
      updateVisibleItems,
    } = useRecycleScroller(
      props as unknown as UseRecycleScrollerOptions,
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
    const refreshSlotProps = computed<RecycleScrollerRefreshSlotProps>(() => ({
      hold: props.pullToRefreshHold,
      inset: refreshInset.value,
      label: refreshLabel.value,
      state: refreshState.value,
      threshold: props.pullToRefreshThreshold,
    }))
    const shouldRenderBefore = computed(() => pullToRefreshEnabled.value || Boolean(slots.before))

    const exposed: RecycleScrollerExpose = {
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
          'RecycleScroller',
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

    const renderItemView = (slotProps: RecycleScrollerDefaultSlotProps) => {
      return slots.default?.(slotProps) ?? null
    }

    return () => {
      const rootProps = mergeProps(attrs, {
        ref: containerRef,
        class: [
          'vue-recycle-scroller',
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
            key: view.key,
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
              ...resolveItemStyle(props.direction, view.position, props.itemSize),
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

export default RecycleScroller
