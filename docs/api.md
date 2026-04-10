# Virtual Scroller API

## 入口

```ts
import {
  DynamicScroller,
  DynamicScrollerItem,
  RecycleScroller,
  type ScrollBoundaryPayload,
  type ScrollPositionPayload,
} from 'vue-virtual-scroller-next'
import 'vue-virtual-scroller-next/style.css'
```

如果你需要直接复用内部逻辑，也可以从包入口导入：

```ts
import {
  assertValidItemSize,
  assertValidMinItemSize,
  resolveAnchorScrollDelta,
  resolveDynamicSizeRange,
  resolveFixedHeightRange,
  resolveItemStyle,
  resolveRecycleScrollerItemKey,
  resolveWrapperStyle,
  useDynamicScroller,
  useRecycleScroller,
} from 'vue-virtual-scroller-next'
```

## RecycleScroller

### Props

#### `items`

- 类型：`unknown[]`
- 必填：是

#### `itemSize`

- 类型：`number`
- 必填：是
- 说明：固定高度或固定宽度，必须是正数。

#### `itemKey`

- 类型：`string | ((item: unknown, index: number) => string | number)`
- 默认值：`'id'`
- 说明：逻辑 item 的稳定 key。

#### `buffer`

- 类型：`number`
- 默认值：`200`
- 说明：预渲染缓冲区，单位是像素。

#### `direction`

- 类型：`'vertical' | 'horizontal'`
- 默认值：`'vertical'`

#### `pullToRefresh`

- 类型：`boolean`
- 默认值：`false`
- 说明：是否启用容器顶部下拉刷新。

#### `pullToRefreshThreshold`

- 类型：`number`
- 默认值：`72`
- 说明：进入 armed 状态的阈值，超过后松手会触发刷新。

#### `pullToRefreshHold`

- 类型：`number`
- 默认值：`56`
- 说明：刷新进行中头部保持的可见高度。

#### `onRefresh`

- 类型：`() => void | Promise<void>`
- 必填：否
- 说明：`pullToRefresh=true` 时必填；回调未完成前不会重复触发。

### Events

#### `scrollTop`

- 触发时机：仅 `direction='vertical'` 时有效；初始 ready 后会先发一次当前状态，之后只有顶部 reached 状态发生变化时才会再次触发。
- 载荷类型：

```ts
type ScrollBoundaryPayload = {
  reached: boolean
  scroll: { start: number; end: number }
}
```

- 模板用法：

```vue
<RecycleScroller @scroll-top="handleScrollTop" />
```

- TSX 用法：

```tsx
const handleScrollTop = (payload: ScrollBoundaryPayload) => {
  console.log(payload.reached, payload.scroll.start)
}

<RecycleScroller onScrollTop={handleScrollTop} />
```

#### `scrollEnd`

- 触发时机：仅 `direction='vertical'` 时有效；初始 ready 后会先发一次当前状态，之后只有底部 reached 状态发生变化时才会再次触发。
- 载荷结构与 `scrollTop` 相同，可直接用于“滚到底加载更多”判断。
- 模板监听：`@scroll-end="handleScrollEnd"`
- TSX 监听：`onScrollEnd={handleScrollEnd}`

#### `scrollPosition`

- 触发时机：首个或末个**真实可见**元素发生变化时；来源可以是滚动、resize、数据变更、`before` 占位变化或 dynamic-size 测量收敛。
- 载荷类型：

```ts
type ScrollPositionPayload = {
  first: { index: number; item: unknown } | null
  last: { index: number; item: unknown } | null
}
```

- 模板用法：

```vue
<RecycleScroller
  @scroll-position="handleScrollPosition"
  @scroll="handleNativeScroll"
/>
```

- TSX 用法：

```tsx
const handleScrollPosition = (payload: ScrollPositionPayload) => {
  console.log(payload.first?.index, payload.last?.index)
}

<RecycleScroller
  onScroll={handleNativeScroll}
  onScrollPosition={handleScrollPosition}
/>
```

- 说明：`first` / `last` 指真实视口内的可见元素，不包含 buffer 区；该事件可与原生 `scroll` 监听并存。

### Slots

#### `default`

```ts
{
  item: unknown
  index: number
  active: boolean
}
```

#### `before`

- 位于滚动内容之前
- 会参与主轴测量
- 会影响可见区计算、`scrollToItem()` 和 pull-to-refresh 的有效占位
- 启用 pull-to-refresh 时，内部 refresh header 会渲染在 `before` slot 的下方

#### `after`

- 位于滚动内容之后
- 只参与自然布局

#### `empty`

- 当 `items.length === 0` 时渲染

### Expose

#### `scrollToItem(index: number): void`

- 自动夹紧索引到有效范围
- 自动计入当前 `before` 占位
- fixed-height 下只要有效 range 发生变化，即使是很小的 scroll delta 也会及时刷新窗口

#### `scrollToPosition(position: number): void`

- 直接滚动容器到绝对位置

#### `getScroll(): { start: number; end: number }`

- 返回当前主轴滚动区间

#### `updateVisibleItems(): void`

- 手动强制刷新可见窗口

## DynamicScroller

### Props

#### `items`

- 类型：`unknown[]`
- 必填：是

#### `minItemSize`

- 类型：`number`
- 必填：是
- 说明：未知尺寸项的估算高度，必须是正数。

#### `itemKey`

- 类型：`string | ((item: unknown, index: number) => string | number)`
- 默认值：`'id'`

#### `buffer`

- 类型：`number`
- 默认值：`200`

#### `direction`

- 类型：`'vertical'`
- 默认值：`'vertical'`
- 说明：dynamic-size 首版只支持纵向列表。

#### `pullToRefresh`

- 类型：`boolean`
- 默认值：`false`

#### `pullToRefreshThreshold`

- 类型：`number`
- 默认值：`72`

#### `pullToRefreshHold`

- 类型：`number`
- 默认值：`56`

#### `onRefresh`

- 类型：`() => void | Promise<void>`
- 必填：否
- 说明：`pullToRefresh=true` 时必填。

### Events

#### `scrollTop`

- 与 `RecycleScroller` 使用相同载荷结构。
- 模板监听：`@scroll-top="handleScrollTop"`
- TSX 监听：`onScrollTop={handleScrollTop}`

#### `scrollEnd`

- 与 `RecycleScroller` 使用相同载荷结构。
- 模板监听：`@scroll-end="handleScrollEnd"`
- TSX 监听：`onScrollEnd={handleScrollEnd}`
- dynamic-size 下，首屏估算结果和后续测量收敛都可能改变底部 reached 状态，因此会在状态切换时发出新事件。

#### `scrollPosition`

- 与 `RecycleScroller` 使用相同事件名和载荷结构。
- 模板监听：`@scroll-position="handleScrollPosition"`
- TSX 监听：`onScrollPosition={handleScrollPosition}`
- dynamic-size 下，首屏估算窗口和后续测量收敛都可能触发新的边界事件，只要首尾可见项发生变化就会发出。

### Slots

#### `default`

```ts
{
  item: unknown
  index: number
  active: boolean
}
```

`DynamicScroller` 不会自动测量 slot 内容。推荐在 default slot 内包一层 `DynamicScrollerItem`：

```tsx
<DynamicScroller
  items={items}
  minItemSize={72}
  itemKey="id"
  pullToRefresh
  onRefresh={refreshItems}
>
  {{
    default: ({ item, index, active }) => (
      <DynamicScrollerItem
        item={item}
        index={index}
        active={active}
        sizeDependencies={[(item as { title: string }).title]}
      >
        <article>{(item as { title: string }).title}</article>
      </DynamicScrollerItem>
    ),
  }}
</DynamicScroller>
```

### Expose

`DynamicScroller` 与 `RecycleScroller` 暴露相同的四个方法：

- `scrollToItem(index)`
- `scrollToPosition(position)`
- `getScroll()`
- `updateVisibleItems()`

注意：

- `scrollToItem()` 在 dynamic-size 下会先按估算值定位，再随着可见区内前置项和目标项的实际测量结果逐步收敛。
- 窗口刷新同样基于 range 变化判定；慢速滚动只要跨过边界，就不会滞后。
- pull-to-refresh 只影响顶部有效占位，不会丢弃当前 `itemKey` 对应的测量缓存。

## DynamicScrollerItem

### Props

#### `item`

- 类型：`unknown`
- 必填：是

#### `index`

- 类型：`number`
- 必填：是

#### `active`

- 类型：`boolean`
- 必填：是
- 说明：当前 item 是否处于真实可见区。

#### `sizeDependencies`

- 类型：`unknown[]`
- 默认值：`[]`
- 说明：依赖变化后会触发重新测量。

### 行为

- 挂载后会测量自身主轴尺寸。
- `ResizeObserver` 可用时会监听尺寸变化并回报给父级 `DynamicScroller`。
- 依赖变更后会重新测量。
- `DynamicScroller` 会按 `itemKey` 复用这些测量结果；当 `items` 替换后，不再存在的 key 会被回收。

## 导出类型

包入口当前导出：

- `DynamicScrollerDefaultSlotProps`
- `DynamicScrollerExpose`
- `DynamicScrollerItemProps`
- `DynamicScrollerProps`
- `DynamicSizeRange`
- `FixedHeightRange`
- `ScrollBoundaryPayload`
- `PullToRefreshHandler`
- `PullToRefreshState`
- `RecycleScrollerDefaultSlotProps`
- `RecycleScrollerExpose`
- `RecycleScrollerItemKey`
- `RecycleScrollerItemKeyResolver`
- `RecycleScrollerItemKeyValue`
- `RecycleScrollerMeasurementState`
- `RecycleScrollerProps`
- `RecycleScrollerView`
- `ScrollDirection`
- `ScrollPositionItem`
- `ScrollPositionPayload`
- `ScrollState`

## 运行时约束

- 只支持 **容器滚动**；`pageMode` 已移除。
- `RecycleScroller` 仍然是 fixed-height 模型；`itemSize <= 0` 会直接抛错。
- `DynamicScroller` 只支持纵向列表；`minItemSize <= 0` 会直接抛错。
- `pullToRefresh` 默认关闭；启用时必须提供 `onRefresh`，并且只能用于纵向模式。
- fixed-height 场景下可见窗口内重复 key 会报错；dynamic-size 场景下重复 key 列表会报错。
- 单次渲染窗口超过 `1000` 项会报错，这通常表示滚动容器测量配置不正确。

## 构建产物

执行 `pnpm build:lib` 后会生成：

- `dist/index.js`
- `dist/index.cjs`
- `dist/index.d.ts`（单文件类型声明入口）
- `dist/style.css`

执行 `pnpm build` 时，示例站点会额外输出到 `demo-dist`，不会混进库发布目录。
