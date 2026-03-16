import {
  defineComponent,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
} from 'vue'

import { dynamicScrollerContextKey } from '../../composables/dynamic-scroller/context'
import type { DynamicScrollerItemProps } from '../../types/recycle-scroller'

const DynamicScrollerItem = defineComponent({
  name: 'DynamicScrollerItem',
  props: {
    item: {
      type: null as unknown as PropType<DynamicScrollerItemProps['item']>,
      required: true,
    },
    index: {
      type: Number,
      required: true,
    },
    active: {
      type: Boolean,
      required: true,
    },
    sizeDependencies: {
      type: Array as PropType<unknown[]>,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    const context = inject(dynamicScrollerContextKey, null)
    const itemRef = ref<HTMLElement>()
    let stopObserving = () => undefined

    const measure = (): void => {
      if (!context || !itemRef.value) {
        return
      }

      const size = itemRef.value.offsetHeight
      if (size > 0) {
        context.reportItemSize(props.item, props.index, size)
      }
    }

    const observe = (): void => {
      stopObserving()

      if (typeof ResizeObserver === 'undefined' || !itemRef.value) {
        return
      }

      const observer = new ResizeObserver(() => {
        measure()
      })

      observer.observe(itemRef.value)
      stopObserving = () => {
        observer.disconnect()
      }
    }

    onMounted(() => {
      observe()
      measure()
    })

    onBeforeUnmount(() => {
      stopObserving()
    })

    watch(
      () => props.active,
      (active) => {
        if (active) {
          measure()
        }
      },
    )

    watch(
      () => props.sizeDependencies,
      () => {
        measure()
      },
      { deep: true },
    )

    return () => (
      <div ref={itemRef} class="vue-dynamic-scroller-item">
        {slots.default?.()}
      </div>
    )
  },
})

export default DynamicScrollerItem
