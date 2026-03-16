# vue3-virtual-scroller

English | [简体中文](./README.zh-CN.md)

An experimental virtual scrolling library built with `Vite + Vue 3 + TypeScript + TSX + Less + ESLint + Prettier`.

The library is currently focused on **container-based virtual scrolling** and exposes three public building blocks:

- `RecycleScroller`: fixed-size virtual scrolling
- `DynamicScroller`: variable-size virtual scrolling
- `DynamicScrollerItem`: measurement wrapper for dynamic item heights

It also includes an optional container interaction:

- `pullToRefresh`: pull-to-refresh for scroll containers, currently vertical only

## Development

```bash
pnpm install
pnpm dev
```

## Library Output

`pnpm build:lib` generates:

- `dist/index.js`: ESM entry
- `dist/index.cjs`: CommonJS entry
- `dist/index.d.ts`: type declarations
- `dist/style.css`: component styles

`pnpm build` builds the library first and then the demo site into `demo-dist`.

## Quick Start

```tsx
import { defineComponent } from 'vue'

import {
  DynamicScroller,
  DynamicScrollerItem,
  RecycleScroller,
  type ScrollBoundaryPayload,
  type ScrollPositionPayload,
} from 'vue3-virtual-scroller'
import 'vue3-virtual-scroller/style.css'

const items = Array.from({ length: 1000 }, (_, index) => ({
  id: `row-${index}`,
  label: `Item ${index}`,
}))

export default defineComponent({
  setup() {
    const refreshItems = async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    const handleScrollPosition = (payload: ScrollPositionPayload) => {
      console.log(payload.first?.index, payload.last?.index)
    }
    const handleScrollEnd = (payload: ScrollBoundaryPayload) => {
      if (payload.reached) {
        console.log('load more', payload.scroll.end)
      }
    }

    return () => (
      <>
        <RecycleScroller
          items={items}
          itemSize={40}
          itemKey="id"
          buffer={120}
          pullToRefresh
          onRefresh={refreshItems}
          onScrollEnd={handleScrollEnd}
          onScrollPosition={handleScrollPosition}
          style={{ height: '320px', overflow: 'auto' }}
        >
          {{
            before: () => <div>Header</div>,
            refresh: ({ state }) => <div>{state}</div>,
            default: ({ item, index }) => (
              <div>{`${(item as { label: string }).label} | ${index}`}</div>
            ),
          }}
        </RecycleScroller>

        <DynamicScroller
          items={items}
          minItemSize={72}
          itemKey="id"
          buffer={120}
          pullToRefresh
          onRefresh={refreshItems}
          onScrollEnd={handleScrollEnd}
          onScrollPosition={handleScrollPosition}
          style={{ height: '360px', overflow: 'auto' }}
        >
          {{
            refresh: ({ label }) => <div>{label}</div>,
            default: ({ item, index, active }) => (
              <DynamicScrollerItem
                item={item}
                index={index}
                active={active}
                sizeDependencies={[(item as { label: string }).label]}
              >
                <div>{`${(item as { label: string }).label} | ${index}`}</div>
              </DynamicScrollerItem>
            ),
          }}
        </DynamicScroller>
      </>
    )
  },
})
```

Detailed API notes: [docs/api.md](./docs/api.md).

## RecycleScroller

- `items`: list data
- `itemSize`: fixed item height or width, must be positive
- `itemKey`: stable key, either a field name or `(item, index) => key`
- `buffer`: prerender buffer size in pixels
- `direction`: `vertical | horizontal`, default `vertical`
- `pullToRefresh`: enables pull-to-refresh, default `false`
- `pullToRefreshThreshold`: threshold for entering the `armed` state, default `72`
- `pullToRefreshHold`: header height kept during refresh, default `56`
- `onRefresh`: callback for pull-to-refresh; required when `pullToRefresh` is enabled
- `refresh` slot: custom refresh content with `{ state, inset, label, threshold, hold }`
- `scrollTop` / `scrollEnd`: emitted in `vertical` mode when top/bottom reached-state changes; payload is `{ reached, scroll }`, useful for reset/load-more flows
- `scrollPosition`: emitted when the first or last **actually visible** item changes; payload is `{ first, last }` with `{ index, item } | null`
- Fixed-size window updates are range-based. Even small scroll deltas refresh the window as soon as an item boundary is crossed.

### Expose

- `scrollToItem(index)`: scrolls to the target index, clamps bounds, and includes current `before` inset
- `scrollToPosition(position)`: scrolls to an absolute container position
- `getScroll()`: returns the current scroll range
- `updateVisibleItems()`: forces a visible-window refresh

## DynamicScroller

- `minItemSize`: estimated item height for dynamic lists, must be positive
- `itemKey`: same contract as `RecycleScroller`, and must stay stable
- `pullToRefresh` / `pullToRefreshThreshold` / `pullToRefreshHold` / `onRefresh`: same as `RecycleScroller`
- `refresh` slot: same contract as `RecycleScroller`
- `scrollTop` / `scrollEnd`: same boundary event contract as `RecycleScroller`; can be consumed with `@scroll-top`, `@scroll-end`, `onScrollTop`, or `onScrollEnd`
- `scrollPosition`: same event contract as `RecycleScroller`; can be consumed with `@scroll-position` or `onScrollPosition`
- `DynamicScrollerItem`: measures actual item size; without it the list stays at estimated sizes
- Dynamic-size windows are also refreshed on range changes, so slow boundary-crossing scrolls do not lag
- `scrollToItem()` is a two-phase positioning flow: jump by estimate first, then converge as real measurements arrive
- Measurement cache is keyed by `itemKey` and stale keys are pruned after `items` changes

## Constraints

- Only **container scrolling** is supported; `pageMode` has been removed
- `RecycleScroller` supports fixed-size lists; `DynamicScroller` supports vertical variable-height lists only
- `pullToRefresh` is disabled by default, works only with `direction="vertical"`, and requires `onRefresh`
- The container must have an explicit main-axis size and scrolling context, for example `height + overflow: auto`
- `itemKey` must stay stable; duplicate keys in the visible fixed-size path throw, and dynamic-size rejects duplicate-key lists
- The `before` slot affects visible-range calculation, `scrollToItem()`, and pull-to-refresh inset. When pull-to-refresh is enabled, the refresh header is rendered below the `before` slot. The `after` slot only participates in normal layout.
- `DynamicScroller.scrollToItem()` is estimate-first and convergence-based, not instantly exact

## Migration Notes

- `pageMode` has been removed. If you previously depended on document scrolling, move to an explicit overflow container or synchronize page scroll at the application layer.

## Common Scripts

```bash
pnpm dev
pnpm build
pnpm preview
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm type-check
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
```
