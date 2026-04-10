# vue3-virtual-scroller

[English](./README.md) | 简体中文

基于 `Vite + Vue 3 + TypeScript + TSX + Less + ESLint + Prettier` 的虚拟滚动实验仓库。

当前库已经收敛为 **container-based virtual scrolling**，对外提供三类能力：

- `RecycleScroller`：固定高度虚拟滚动
- `DynamicScroller`：未知高度虚拟滚动
- `DynamicScrollerItem`：动态尺寸测量包装组件

同时支持一个默认关闭的容器交互能力：

- `pullToRefresh`：容器滚动列表的下拉刷新，仅支持纵向模式

## 开发

```bash
pnpm install
pnpm dev
```

## 库构建产物

执行 `pnpm build:lib` 后会生成这些入口产物：

- `dist/index.js`：ESM 入口
- `dist/index.cjs`：CommonJS 入口
- `dist/index.d.ts`：单文件类型声明入口
- `dist/style.css`：组件样式入口

`pnpm build` 会先构建库产物，再构建示例站点到 `demo-dist`。

## 快速使用

```tsx
import { defineComponent } from 'vue'

import {
  DynamicScroller,
  DynamicScrollerItem,
  RecycleScroller,
  type ScrollBoundaryPayload,
  type ScrollPositionPayload,
} from 'vue-virtual-scroller-next'
import 'vue-virtual-scroller-next/style.css'

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

完整 API 见 [docs/api.md](./docs/api.md)。

## RecycleScroller

- `items`：列表数据。
- `itemSize`：固定高度或固定宽度，必须是正数。
- `itemKey`：稳定 key，支持字符串字段名或 `(item, index) => key`。
- `buffer`：预渲染缓冲区大小，单位是像素。
- `direction`：`vertical | horizontal`，默认 `vertical`。
- `pullToRefresh`：是否启用下拉刷新，默认 `false`。
- `pullToRefreshThreshold`：进入 `armed` 状态的阈值，默认 `72`。
- `pullToRefreshHold`：刷新中的头部保持高度，默认 `56`。
- `onRefresh`：下拉刷新回调；启用 `pullToRefresh` 时必填。
- `refresh` slot：自定义刷新区内容，可拿到 `{ state, inset, label, threshold, hold }`。
- `scrollTop` / `scrollEnd`：仅在 `vertical` 模式下触发，且只有内部窗口更新成功后才会根据顶部/底部的 reached 状态变化发出；载荷是 `{ reached, scroll }`，适合做重置或加载更多。
- `scrollPosition`：当首个或末个**真实可见**元素变化时触发，载荷是 `{ first, last }`，其中每一项都是 `{ index, item } | null`。
- fixed-height 窗口更新基于 range 变化判定，小步滚动只要跨过 item 边界，就会立即刷新渲染窗口。

### Expose

- `scrollToItem(index)`：滚动到指定索引，会自动夹紧范围，并计入当前 `before` 占位。
- `scrollToPosition(position)`：滚动到容器绝对位置。
- `getScroll()`：获取当前滚动区间。
- `updateVisibleItems()`：手动强制刷新可见窗口。

## DynamicScroller

- `minItemSize`：动态列表的估算高度，必须是正数。
- `itemKey`：与 `RecycleScroller` 一致，必须稳定。
- `pullToRefresh` / `pullToRefreshThreshold` / `pullToRefreshHold` / `onRefresh`：与 `RecycleScroller` 一致。
- `refresh` slot：与 `RecycleScroller` 一致。
- `scrollTop` / `scrollEnd`：与 `RecycleScroller` 使用同一边界事件契约，可通过 `@scroll-top`、`@scroll-end`、`onScrollTop` 或 `onScrollEnd` 监听。
- `scrollPosition`：与 `RecycleScroller` 使用同一事件契约，可通过 `@scroll-position` 或 `onScrollPosition` 监听。
- `DynamicScrollerItem`：负责实际尺寸测量；如果你不包这一层，列表会一直停留在估算高度。
- dynamic-size 同样按 range 变化刷新窗口，慢速滚动跨边界时不会滞后。
- `scrollToItem()` 是“两阶段定位”：先按 `minItemSize` 估算跳转，再随着可见区内前置项的真实测量结果持续修正目标位置。
- 测量缓存按 `itemKey` 复用，并会在 `items` 变更后清理已失效的 key，避免历史尺寸残留。

## 约束

- 只支持 **容器滚动**；`pageMode` 已移除。
- `RecycleScroller` 支持固定高度，`DynamicScroller` 支持纵向未知高度；dynamic-size 首版不支持 horizontal。
- `pullToRefresh` 默认关闭，仅支持 `direction="vertical"`，并且启用时必须提供 `onRefresh`。
- 组件需要明确的主轴尺寸和滚动上下文，例如 `height + overflow: auto`。
- `itemKey` 必须稳定；如果出现重复值，两个 scroller 都会在内部补 `_n` 后缀保证唯一，并在开发环境输出告警。
- `before` slot 会影响可见区、`scrollToItem()` 和 pull-to-refresh 的有效占位；启用下拉刷新时，refresh header 会渲染在 `before` slot 的下方；`after` slot 只参与自然布局。
- `DynamicScroller` 的 `scrollToItem()` 是“先估算、后收敛”，不是一次性精准定位；只有新的实际测量到达后，目标位置才会继续向真实 offset 收敛。

## 迁移说明

- `pageMode` 已经移除；如果你之前依赖 document scroll，请改成显式的 overflow 容器，或在业务层自己同步页面滚动。

## 常用脚本

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
