import { computed, defineComponent, nextTick, ref, watch, type VNodeChild } from 'vue'

import { DynamicScroller, DynamicScrollerItem, RecycleScroller } from './index'
import type {
  DynamicScrollerDefaultSlotProps,
  DynamicScrollerExpose,
  RecycleScrollerDefaultSlotProps,
  RecycleScrollerExpose,
  ScrollBoundaryPayload,
} from './index'

interface DemoMessage {
  id: number
  title: string
  preview: string
}

interface DynamicStory {
  id: number
  title: string
  lines: string[]
  tone: string
}

interface SizeDependencyCard {
  id: number
  summary: string
  title: string
  tone: string
  bullets: string[]
}

type DemoId = 'container' | 'refresh' | 'dynamic' | 'dependencies'
type DependencyCopyMode = 'compact' | 'expanded'

interface DemoTab {
  hint: string
  id: DemoId
  label: string
  title: string
}

interface DemoMetric {
  detail: string
  label: string
  value: string
}

const messages: DemoMessage[] = Array.from({ length: 1240 }, (_, index) => ({
  id: index + 1,
  title: `Message ${index + 1}`,
  preview: `This is row ${index + 1}.`,
}))

const dynamicStories: DynamicStory[] = Array.from({ length: 180 }, (_, index) => ({
  id: index + 1,
  title: `Variable card ${index + 1}`,
  tone: ['quiet', 'warm', 'urgent', 'playful'][index % 4],
  lines: Array.from(
    { length: (index % 4) + 1 },
    (_, lineIndex) =>
      `Paragraph ${lineIndex + 1} for variable row ${index + 1}. This block intentionally changes length so the measured height differs across items.`,
  ),
}))

const sizeDependencyCards: SizeDependencyCard[] = Array.from({ length: 96 }, (_, index) => ({
  id: index + 1,
  title: `Dependency card ${index + 1}`,
  summary: `保持 itemKey 不变，只切换外部 UI 状态，也会让第 ${index + 1} 张卡片的高度重新收敛。`,
  tone: ['teal', 'amber', 'rose'][index % 3],
  bullets: Array.from(
    { length: (index % 3) + 2 },
    (_, bulletIndex) =>
      `附加说明 ${bulletIndex + 1}：这段文案由外部状态控制显示密度，用来制造稳定但可预测的高度差。`,
  ),
}))

const CONTAINER_INITIAL_COUNT = 160
const CONTAINER_BATCH_SIZE = 120
const REFRESH_INITIAL_COUNT = 72
const REFRESH_BATCH_SIZE = 48
const DYNAMIC_INITIAL_COUNT = 24
const DYNAMIC_BATCH_SIZE = 18
const SIZE_DEPENDENCY_INITIAL_COUNT = 18
const SIZE_DEPENDENCY_BATCH_SIZE = 16
const CONTAINER_ITEM_SIZE = 72
const REFRESH_ITEM_SIZE = 68
const DYNAMIC_MIN_ITEM_SIZE = 88
const SIZE_DEPENDENCY_MIN_ITEM_SIZE = 96
const DEMO_SCROLLER_MAX_HEIGHT = 420

const demoTabs: DemoTab[] = [
  {
    id: 'container',
    label: 'Container',
    title: '固定高度容器',
    hint: '基础 fixed-height container window',
  },
  {
    id: 'refresh',
    label: 'Pull Refresh',
    title: '下拉刷新列表',
    hint: 'container scroll + pull-to-refresh',
  },
  {
    id: 'dynamic',
    label: 'Dynamic Size',
    title: '未知高度列表',
    hint: 'estimate first, reconcile later',
  },
  {
    id: 'dependencies',
    label: 'Size Deps',
    title: '依赖变化重测',
    hint: 'sizeDependencies-driven remeasure',
  },
]

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const App = defineComponent({
  name: 'App',
  setup() {
    const activeDemo = ref<DemoId>('container')
    const filter = ref('')
    const containerLoadedCount = ref(Math.min(CONTAINER_INITIAL_COUNT, messages.length))
    const refreshLoadedCount = ref(Math.min(REFRESH_INITIAL_COUNT, messages.length))
    const dynamicLoadedCount = ref(Math.min(DYNAMIC_INITIAL_COUNT, dynamicStories.length))
    const dependencyLoadedCount = ref(
      Math.min(SIZE_DEPENDENCY_INITIAL_COUNT, sizeDependencyCards.length),
    )
    const targetIndex = ref(32)
    const refreshTarget = ref(24)
    const dynamicTarget = ref(48)
    const dependencyTarget = ref(18)
    const viewportHeight = ref(480)
    const refreshRevision = ref(0)
    const dynamicRevision = ref(0)
    const dependencyMode = ref<DependencyCopyMode>('compact')
    const dependencyExpandedIds = ref<number[]>([])
    const refreshPending = ref(false)
    const dynamicRefreshPending = ref(false)
    const containerScrollEndPending = ref(false)
    const refreshScrollEndPending = ref(false)
    const dynamicScrollEndPending = ref(false)
    const dependencyScrollEndPending = ref(false)
    const scrollerRef = ref<RecycleScrollerExpose | null>(null)
    const refreshScrollerRef = ref<RecycleScrollerExpose | null>(null)
    const dynamicScrollerRef = ref<DynamicScrollerExpose | null>(null)
    const dependencyScrollerRef = ref<DynamicScrollerExpose | null>(null)

    const loadedContainerMessages = computed(() => {
      return messages.slice(0, containerLoadedCount.value)
    })

    const filteredMessages = computed(() => {
      const keyword = filter.value.trim().toLowerCase()
      if (!keyword) {
        return loadedContainerMessages.value
      }

      return loadedContainerMessages.value.filter((item) => {
        return (
          item.title.toLowerCase().includes(keyword) || item.preview.toLowerCase().includes(keyword)
        )
      })
    })

    const refreshMessages = computed(() => {
      return messages.slice(0, refreshLoadedCount.value)
    })

    const loadedDynamicStories = computed(() => {
      return dynamicStories.slice(0, dynamicLoadedCount.value)
    })

    const loadedDependencyCards = computed(() => {
      return sizeDependencyCards.slice(0, dependencyLoadedCount.value)
    })

    const extendLoadedCount = (
      loadedCount: { value: number },
      total: number,
      batchSize: number,
      minimumCount?: number,
    ) => {
      const nextMinimum = minimumCount ?? loadedCount.value + batchSize
      loadedCount.value = Math.min(total, Math.max(loadedCount.value + batchSize, nextMinimum))
    }

    const ensureLoadedIndex = async (
      loadedCount: { value: number },
      total: number,
      batchSize: number,
      index: number,
    ): Promise<void> => {
      while (loadedCount.value <= index && loadedCount.value < total) {
        extendLoadedCount(loadedCount, total, batchSize, index + 1)
        await nextTick()
      }
    }

    async function ensureContainerTargetLoaded(index: number): Promise<void> {
      if (index < 0) {
        return
      }

      const keyword = filter.value.trim()
      if (!keyword) {
        while (
          containerLoadedCount.value <= index &&
          containerLoadedCount.value < messages.length
        ) {
          extendLoadedCount(containerLoadedCount, messages.length, CONTAINER_BATCH_SIZE, index + 1)
          await nextTick()
        }
        return
      }

      while (
        filteredMessages.value.length <= index &&
        containerLoadedCount.value < messages.length
      ) {
        extendLoadedCount(containerLoadedCount, messages.length, CONTAINER_BATCH_SIZE)
        await nextTick()
      }
    }

    const backfillFromScrollEnd = async (
      payload: ScrollBoundaryPayload,
      options: {
        batchSize: number
        canStopBackfill: () => boolean
        loadedCount: { value: number }
        pending: { value: boolean }
        total: number
      },
    ): Promise<void> => {
      if (!payload.reached || options.loadedCount.value >= options.total || options.pending.value) {
        return
      }

      options.pending.value = true

      try {
        do {
          extendLoadedCount(options.loadedCount, options.total, options.batchSize)
          await nextTick()
        } while (options.loadedCount.value < options.total && !options.canStopBackfill())
      } finally {
        options.pending.value = false
      }
    }

    const handleContainerScrollEnd = (payload: ScrollBoundaryPayload) => {
      void backfillFromScrollEnd(payload, {
        batchSize: CONTAINER_BATCH_SIZE,
        canStopBackfill: () =>
          filteredMessages.value.length * CONTAINER_ITEM_SIZE > viewportHeight.value,
        loadedCount: containerLoadedCount,
        pending: containerScrollEndPending,
        total: messages.length,
      })
    }

    const handleRefreshScrollEnd = (payload: ScrollBoundaryPayload) => {
      void backfillFromScrollEnd(payload, {
        batchSize: REFRESH_BATCH_SIZE,
        canStopBackfill: () =>
          refreshMessages.value.length * REFRESH_ITEM_SIZE > DEMO_SCROLLER_MAX_HEIGHT,
        loadedCount: refreshLoadedCount,
        pending: refreshScrollEndPending,
        total: messages.length,
      })
    }

    const handleDynamicScrollEnd = (payload: ScrollBoundaryPayload) => {
      void backfillFromScrollEnd(payload, {
        batchSize: DYNAMIC_BATCH_SIZE,
        canStopBackfill: () =>
          loadedDynamicStories.value.length * DYNAMIC_MIN_ITEM_SIZE > DEMO_SCROLLER_MAX_HEIGHT,
        loadedCount: dynamicLoadedCount,
        pending: dynamicScrollEndPending,
        total: dynamicStories.length,
      })
    }

    const handleDependencyScrollEnd = (payload: ScrollBoundaryPayload) => {
      void backfillFromScrollEnd(payload, {
        batchSize: SIZE_DEPENDENCY_BATCH_SIZE,
        canStopBackfill: () =>
          loadedDependencyCards.value.length * SIZE_DEPENDENCY_MIN_ITEM_SIZE >
          DEMO_SCROLLER_MAX_HEIGHT,
        loadedCount: dependencyLoadedCount,
        pending: dependencyScrollEndPending,
        total: sizeDependencyCards.length,
      })
    }

    const scrollFixedTarget = async (): Promise<void> => {
      await ensureContainerTargetLoaded(targetIndex.value)

      if (!filteredMessages.value.length) {
        return
      }

      const safeIndex = Math.max(0, Math.min(targetIndex.value, filteredMessages.value.length - 1))
      scrollerRef.value?.scrollToItem(safeIndex)
    }

    const scrollRefreshTarget = async (): Promise<void> => {
      if (!messages.length) {
        return
      }

      await ensureLoadedIndex(
        refreshLoadedCount,
        messages.length,
        REFRESH_BATCH_SIZE,
        refreshTarget.value,
      )
      const safeIndex = Math.max(0, Math.min(refreshTarget.value, messages.length - 1))
      refreshScrollerRef.value?.scrollToItem(safeIndex)
    }

    const scrollDynamicTarget = async (): Promise<void> => {
      if (!dynamicStories.length) {
        return
      }

      await ensureLoadedIndex(
        dynamicLoadedCount,
        dynamicStories.length,
        DYNAMIC_BATCH_SIZE,
        dynamicTarget.value,
      )
      const safeIndex = Math.max(0, Math.min(dynamicTarget.value, dynamicStories.length - 1))
      dynamicScrollerRef.value?.scrollToItem(safeIndex)
    }

    const scrollDependencyTarget = async (): Promise<void> => {
      if (!sizeDependencyCards.length) {
        return
      }

      await ensureLoadedIndex(
        dependencyLoadedCount,
        sizeDependencyCards.length,
        SIZE_DEPENDENCY_BATCH_SIZE,
        dependencyTarget.value,
      )
      const safeIndex = Math.max(
        0,
        Math.min(dependencyTarget.value, sizeDependencyCards.length - 1),
      )
      dependencyScrollerRef.value?.scrollToItem(safeIndex)
    }

    const refreshFeed = async (): Promise<void> => {
      refreshPending.value = true
      await wait(320)
      refreshRevision.value += 1
      refreshPending.value = false
      refreshLoadedCount.value = Math.max(refreshLoadedCount.value, REFRESH_INITIAL_COUNT)
    }

    const refreshDynamicFeed = async (): Promise<void> => {
      dynamicRefreshPending.value = true
      await wait(360)
      dynamicRevision.value += 1
      dynamicRefreshPending.value = false
      dynamicLoadedCount.value = Math.max(dynamicLoadedCount.value, DYNAMIC_INITIAL_COUNT)
    }

    const handleFilterInput = (event: Event): void => {
      filter.value = (event.target as HTMLInputElement).value
    }

    const handleTargetIndexInput = (event: Event, setter: (value: number) => void): void => {
      const { valueAsNumber } = event.target as HTMLInputElement
      setter(Number.isFinite(valueAsNumber) ? valueAsNumber : 0)
    }

    const handleViewportHeightInput = (event: Event): void => {
      const { valueAsNumber } = event.target as HTMLInputElement
      viewportHeight.value = Number.isFinite(valueAsNumber) ? Math.max(180, valueAsNumber) : 480
    }

    const getMessageTitle = (item: unknown): string => {
      return (item as DemoMessage).title
    }

    const getMessagePreview = (item: unknown): string => {
      return (item as DemoMessage).preview
    }

    const getStory = (item: unknown): DynamicStory => {
      return item as DynamicStory
    }

    const getDependencyCard = (item: unknown): SizeDependencyCard => {
      return item as SizeDependencyCard
    }

    const isDependencyCardExpanded = (id: number): boolean => {
      return dependencyExpandedIds.value.includes(id)
    }

    const toggleDependencyCard = (id: number): void => {
      dependencyExpandedIds.value = isDependencyCardExpanded(id)
        ? dependencyExpandedIds.value.filter((currentId) => currentId !== id)
        : [...dependencyExpandedIds.value, id]
    }

    const collapseDependencyCards = (): void => {
      dependencyExpandedIds.value = []
    }

    const toggleDependencyMode = (): void => {
      dependencyMode.value = dependencyMode.value === 'compact' ? 'expanded' : 'compact'
    }

    watch(filter, async (keyword) => {
      if (!keyword.trim()) {
        return
      }

      while (filteredMessages.value.length === 0 && containerLoadedCount.value < messages.length) {
        extendLoadedCount(containerLoadedCount, messages.length, CONTAINER_BATCH_SIZE)
        await nextTick()
      }
    })

    const renderMetricGrid = (metrics: DemoMetric[]) => (
      <div class="demo-metric-grid">
        {metrics.map((metric) => (
          <article key={metric.label} class="demo-metric">
            <p class="demo-metric__label">{metric.label}</p>
            <strong class="demo-metric__value">{metric.value}</strong>
            <p class="demo-metric__detail">{metric.detail}</p>
          </article>
        ))}
      </div>
    )

    const renderDemoScaffold = (options: {
      controls: VNodeChild
      description: string
      eyebrow: string
      metrics: DemoMetric[]
      panelClass?: string
      preview: VNodeChild
      previewClass?: string
      title: string
    }) => (
      <section class={['demo-panel', options.panelClass]}>
        <div class="demo-layout">
          <div class="demo-sidebar">
            <div class="demo-panel__heading">
              <p class="demo-panel__eyebrow">{options.eyebrow}</p>
              <h2>{options.title}</h2>
              <p>{options.description}</p>
            </div>
            {renderMetricGrid(options.metrics)}
            <div class="demo-control-stack">
              <p class="demo-control-stack__label">Controls</p>
              {options.controls}
            </div>
          </div>
          <div class={['demo-preview', options.previewClass]}>
            <p class="demo-preview__eyebrow">Live Preview</p>
            {options.preview}
          </div>
        </div>
      </section>
    )

    const renderContainerDemo = () =>
      renderDemoScaffold({
        eyebrow: 'Container Mode',
        title: '固定高度容器滚动',
        description:
          '基础 fixed-height container 路径保留了 before slot、buffer、itemKey 和 imperative scroll。列表滚到底部时会通过新的 scrollEnd 事件自动加载更多，方便观察 container-only 的窗口刷新。',
        metrics: [
          {
            label: 'Loaded Data',
            value: `${containerLoadedCount.value}/${messages.length}`,
            detail: '已加载到 demo 的基础数据量',
          },
          {
            label: 'Item Size',
            value: '72px',
            detail: '固定行高，按像素计算窗口',
          },
          {
            label: 'Visible Slice',
            value: `${filteredMessages.value.length}`,
            detail: '过滤后实际参与渲染的数据量',
          },
        ],
        controls: (
          <section class="demo-toolbar">
            <label class="demo-field">
              <span>过滤内容</span>
              <input
                value={filter.value}
                placeholder="输入 Message 关键字"
                type="text"
                onInput={handleFilterInput}
              />
            </label>
            <label class="demo-field demo-field--narrow">
              <span>滚动到索引</span>
              <input
                value={String(targetIndex.value)}
                min="0"
                type="number"
                onInput={(event: Event) =>
                  handleTargetIndexInput(event, (value) => {
                    targetIndex.value = value
                  })
                }
              />
            </label>
            <label class="demo-field demo-field--narrow">
              <span>容器高度</span>
              <input
                value={String(viewportHeight.value)}
                min="180"
                step="12"
                type="number"
                onInput={handleViewportHeightInput}
              />
            </label>
            <button class="demo-button" type="button" onClick={scrollFixedTarget}>
              scrollToItem()
            </button>
          </section>
        ),
        preview: (
          <RecycleScroller
            ref={scrollerRef}
            class="demo-scroller"
            items={filteredMessages.value}
            itemSize={CONTAINER_ITEM_SIZE}
            itemKey="id"
            buffer={144}
            onScrollEnd={handleContainerScrollEnd}
            style={{
              height: `min(${viewportHeight.value}px, 62vh)`,
            }}
          >
            {{
              before: () => (
                <div class="demo-banner">
                  {`Container mode with itemKey="id", itemSize=${CONTAINER_ITEM_SIZE}px and viewport=${viewportHeight.value}px.`}
                </div>
              ),
              default: ({ item, index, active }: RecycleScrollerDefaultSlotProps) => (
                <article class="demo-row" data-active={String(active)}>
                  <span class="demo-row__index">{`#${index}`}</span>
                  <div class="demo-row__content">
                    <strong>{getMessageTitle(item)}</strong>
                    <p>{getMessagePreview(item)}</p>
                  </div>
                  <span class="demo-row__state">{active ? 'active' : 'buffered'}</span>
                </article>
              ),
              after: () => (
                <div class="demo-footer">
                  {containerLoadedCount.value >= messages.length
                    ? '全部 demo 数据都已经加载完成。'
                    : `已加载 ${containerLoadedCount.value}/${messages.length} 条数据，滚到底部会自动追加下一批。`}
                </div>
              ),
              empty: () => <div class="demo-empty">No messages matched the current filter.</div>,
            }}
          </RecycleScroller>
        ),
      })

    const renderRefreshDemo = () =>
      renderDemoScaffold({
        eyebrow: 'Pull To Refresh',
        title: '固定高度下拉刷新',
        description:
          '这里保留容器滚动，但在顶部加入默认关闭、当前示例显式开启的 pull-to-refresh。列表滚到底部时会通过 scrollEnd 自动加载更多，刷新期间会把内部 refresh header 叠加到 before 占位里。',
        panelClass: 'demo-panel--refresh',
        previewClass: 'demo-preview--refresh',
        metrics: [
          {
            label: 'Loaded Data',
            value: `${refreshLoadedCount.value}/${messages.length}`,
            detail: '滚动接近尾部会继续自动补齐数据',
          },
          {
            label: 'Refresh Count',
            value: String(refreshRevision.value),
            detail: refreshPending.value ? '刷新回调执行中' : '下拉到顶部可以再次触发刷新',
          },
          {
            label: 'Trigger',
            value: '72px',
            detail: '超过阈值松手后触发异步刷新',
          },
        ],
        controls: (
          <div class="demo-toolbar demo-toolbar--compact">
            <label class="demo-field demo-field--narrow">
              <span>刷新列表索引</span>
              <input
                value={String(refreshTarget.value)}
                min="0"
                type="number"
                onInput={(event: Event) =>
                  handleTargetIndexInput(event, (value) => {
                    refreshTarget.value = value
                  })
                }
              />
            </label>
            <button class="demo-button" type="button" onClick={scrollRefreshTarget}>
              refresh scrollToItem()
            </button>
          </div>
        ),
        preview: (
          <div class="demo-refresh-shell">
            <div class="demo-refresh-intro">
              <strong>Pull from the top</strong>
              <p>
                回到顶部后继续下拉，跨过阈值松手就会触发 refresh 回调。这个 demo
                仍然保持局部容器滚动，而不是 document scroll。
              </p>
            </div>
            <RecycleScroller
              ref={refreshScrollerRef}
              class="demo-refresh-scroller"
              items={refreshMessages.value}
              itemSize={REFRESH_ITEM_SIZE}
              itemKey="id"
              buffer={180}
              pullToRefresh={true}
              onRefresh={refreshFeed}
              onScrollEnd={handleRefreshScrollEnd}
              style={{
                height: `min(${DEMO_SCROLLER_MAX_HEIGHT}px, 60vh)`,
              }}
            >
              {{
                before: () => (
                  <div class="demo-banner">
                    {`Pull-to-refresh is enabled. Refresh pass #${refreshRevision.value}.`}
                  </div>
                ),
                default: ({ item, index, active }: RecycleScrollerDefaultSlotProps) => (
                  <article class="demo-refresh-row" data-active={String(active)}>
                    <span class="demo-refresh-row__index">{`#${index}`}</span>
                    <div class="demo-refresh-row__content">
                      <strong>{getMessageTitle(item)}</strong>
                      <p>{getMessagePreview(item)}</p>
                    </div>
                    <span class="demo-refresh-row__badge">
                      {refreshPending.value ? 'syncing' : 'fresh'}
                    </span>
                  </article>
                ),
                after: () => (
                  <div class="demo-footer">
                    {refreshLoadedCount.value >= messages.length
                      ? '下拉刷新 demo 的全部数据都已就绪。'
                      : `当前已加载 ${refreshLoadedCount.value}/${messages.length} 条，滚到底部会自动追加。`}
                  </div>
                ),
              }}
            </RecycleScroller>
          </div>
        ),
      })

    const renderDynamicDemo = () =>
      renderDemoScaffold({
        eyebrow: 'Dynamic Size',
        title: '未知高度虚拟滚动',
        description:
          'DynamicScroller 继续用 minItemSize 做首屏估算，再通过 DynamicScrollerItem 的实际测量逐步收敛位置。这里也开启了 pull-to-refresh，用来验证动态高度和 refresh inset 可以一起工作。',
        metrics: [
          {
            label: 'Loaded Cards',
            value: `${dynamicLoadedCount.value}/${dynamicStories.length}`,
            detail: '动态卡片会随着滚动逐批注入',
          },
          {
            label: 'Estimate',
            value: '88px',
            detail: '未测量前的默认高度',
          },
          {
            label: 'Refresh Count',
            value: String(dynamicRevision.value),
            detail: dynamicRefreshPending.value ? '刷新中' : '顶部下拉可重新同步当前卡片集',
          },
        ],
        controls: (
          <div class="demo-toolbar demo-toolbar--compact">
            <label class="demo-field demo-field--narrow">
              <span>动态滚动索引</span>
              <input
                value={String(dynamicTarget.value)}
                min="0"
                type="number"
                onInput={(event: Event) =>
                  handleTargetIndexInput(event, (value) => {
                    dynamicTarget.value = value
                  })
                }
              />
            </label>
            <button class="demo-button" type="button" onClick={scrollDynamicTarget}>
              dynamic scrollToItem()
            </button>
          </div>
        ),
        preview: (
          <DynamicScroller
            ref={dynamicScrollerRef}
            class="demo-dynamic-scroller"
            items={loadedDynamicStories.value}
            minItemSize={DYNAMIC_MIN_ITEM_SIZE}
            itemKey="id"
            buffer={160}
            pullToRefresh={true}
            onRefresh={refreshDynamicFeed}
            onScrollEnd={handleDynamicScrollEnd}
            style={{
              height: `min(${DEMO_SCROLLER_MAX_HEIGHT}px, 60vh)`,
            }}
          >
            {{
              before: () => (
                <div class="demo-banner">
                  {`Dynamic mode estimates with minItemSize=${DYNAMIC_MIN_ITEM_SIZE}px. Refresh pass #${dynamicRevision.value}.`}
                </div>
              ),
              default: ({ item, index, active }: DynamicScrollerDefaultSlotProps) => {
                const story = getStory(item)

                return (
                  <DynamicScrollerItem
                    item={item}
                    index={index}
                    active={active}
                    sizeDependencies={[story.lines, dynamicRevision.value]}
                  >
                    {{
                      default: () => (
                        <article class="demo-dynamic-row" data-tone={story.tone}>
                          <span class="demo-dynamic-row__index">{`#${index}`}</span>
                          <div class="demo-dynamic-row__content">
                            <strong>{story.title}</strong>
                            {story.lines.map((line) => (
                              <p key={line}>{line}</p>
                            ))}
                            {dynamicRevision.value > 0 && index < 3 ? (
                              <p class="demo-dynamic-row__refresh-note">
                                {`Refresh pass ${dynamicRevision.value} updated this card.`}
                              </p>
                            ) : null}
                          </div>
                        </article>
                      ),
                    }}
                  </DynamicScrollerItem>
                )
              },
              after: () => (
                <div class="demo-footer">
                  {dynamicLoadedCount.value >= dynamicStories.length
                    ? '动态高度 demo 已经加载全部卡片。'
                    : `已加载 ${dynamicLoadedCount.value}/${dynamicStories.length} 张卡片，滚到底部会自动追加。`}
                </div>
              ),
            }}
          </DynamicScroller>
        ),
      })

    const renderSizeDependenciesDemo = () =>
      renderDemoScaffold({
        eyebrow: 'sizeDependencies',
        title: '依赖变化触发重测',
        description:
          '这个示例故意保持 itemKey 稳定，只通过外部 UI 状态改变内容密度与单行展开状态。DynamicScrollerItem 会依赖 sizeDependencies 重新测量当前卡片，让滚动位置继续收敛。',
        metrics: [
          {
            label: 'Loaded Cards',
            value: `${dependencyLoadedCount.value}/${sizeDependencyCards.length}`,
            detail: '滚动到底部时会继续补齐更多依赖示例',
          },
          {
            label: 'Detail Mode',
            value: dependencyMode.value,
            detail:
              dependencyMode.value === 'compact'
                ? '每条仅展示 1 条附加说明'
                : '每条展示完整附加说明',
          },
          {
            label: 'Expanded Rows',
            value: String(dependencyExpandedIds.value.length),
            detail: dependencyExpandedIds.value.length
              ? '展开行会额外插入一段局部说明'
              : '点击行内按钮可以只展开某一行',
          },
        ],
        controls: (
          <div class="demo-toolbar">
            <label class="demo-field demo-field--narrow">
              <span>跳转索引</span>
              <input
                value={String(dependencyTarget.value)}
                min="0"
                type="number"
                onInput={(event: Event) =>
                  handleTargetIndexInput(event, (value) => {
                    dependencyTarget.value = value
                  })
                }
              />
            </label>
            <button class="demo-button" type="button" onClick={scrollDependencyTarget}>
              scrollToItem()
            </button>
            <button
              class={['demo-button', 'demo-button--secondary']}
              type="button"
              onClick={toggleDependencyMode}
            >
              {dependencyMode.value === 'compact' ? '切到 expanded copy' : '切回 compact copy'}
            </button>
            <button
              class={['demo-button', 'demo-button--secondary']}
              type="button"
              disabled={dependencyExpandedIds.value.length === 0}
              onClick={collapseDependencyCards}
            >
              收起全部展开行
            </button>
          </div>
        ),
        preview: (
          <DynamicScroller
            ref={dependencyScrollerRef}
            class="demo-dependency-scroller"
            items={loadedDependencyCards.value}
            minItemSize={SIZE_DEPENDENCY_MIN_ITEM_SIZE}
            itemKey="id"
            buffer={160}
            onScrollEnd={handleDependencyScrollEnd}
            style={{
              height: `min(${DEMO_SCROLLER_MAX_HEIGHT}px, 60vh)`,
            }}
          >
            {{
              before: () => (
                <div class="demo-banner">
                  {`sizeDependencies=[expanded, detailMode]。当前模式 ${dependencyMode.value}，已展开 ${dependencyExpandedIds.value.length} 行。`}
                </div>
              ),
              default: ({ item, index, active }: DynamicScrollerDefaultSlotProps) => {
                const card = getDependencyCard(item)
                const expanded = isDependencyCardExpanded(card.id)
                const visibleBullets =
                  dependencyMode.value === 'expanded' ? card.bullets : card.bullets.slice(0, 1)

                return (
                  <DynamicScrollerItem
                    item={item}
                    index={index}
                    active={active}
                    sizeDependencies={[expanded, dependencyMode.value]}
                  >
                    {{
                      default: () => (
                        <article
                          class="demo-dependency-row"
                          data-active={String(active)}
                          data-tone={card.tone}
                        >
                          <div class="demo-dependency-row__meta">
                            <span class="demo-dependency-row__index">{`#${index}`}</span>
                            <span class="demo-dependency-row__key">{`id=${card.id}`}</span>
                          </div>
                          <div class="demo-dependency-row__content">
                            <div class="demo-dependency-row__heading">
                              <strong>{card.title}</strong>
                              <button
                                class="demo-inline-button"
                                type="button"
                                onClick={() => {
                                  toggleDependencyCard(card.id)
                                }}
                              >
                                {expanded ? '收起本行' : '展开本行'}
                              </button>
                            </div>
                            <p class="demo-dependency-row__summary">{card.summary}</p>
                            <div class="demo-dependency-row__chips">
                              <span class="demo-dependency-chip">{dependencyMode.value}</span>
                              <span class="demo-dependency-chip">
                                {expanded ? 'expanded row' : 'collapsed row'}
                              </span>
                            </div>
                            {visibleBullets.map((line) => (
                              <p key={line} class="demo-dependency-row__bullet">
                                {line}
                              </p>
                            ))}
                            {expanded ? (
                              <p class="demo-dependency-row__note">
                                这段额外内容只受当前行的展开状态影响，不需要替换 item，也可以借助
                                sizeDependencies 触发重新测量。
                              </p>
                            ) : null}
                          </div>
                        </article>
                      ),
                    }}
                  </DynamicScrollerItem>
                )
              },
              after: () => (
                <div class="demo-footer">
                  {dependencyLoadedCount.value >= sizeDependencyCards.length
                    ? 'sizeDependencies demo 已经加载全部卡片。'
                    : `已加载 ${dependencyLoadedCount.value}/${sizeDependencyCards.length} 张卡片，滚到底部会继续补齐。`}
                </div>
              ),
            }}
          </DynamicScroller>
        ),
      })

    const renderActiveDemo = () => {
      if (activeDemo.value === 'dependencies') {
        return renderSizeDependenciesDemo()
      }

      if (activeDemo.value === 'refresh') {
        return renderRefreshDemo()
      }

      if (activeDemo.value === 'dynamic') {
        return renderDynamicDemo()
      }

      return renderContainerDemo()
    }

    return () => (
      <main class="demo-shell">
        <section class="demo-header">
          <p class="demo-eyebrow">Container-Only Virtual Scrolling</p>
          <h1>虚拟滚动容器演示</h1>
          <p class="demo-lead">
            当前示例已经收敛到 container-based virtual scrolling：顶部导航分别展示 fixed-height
            基础模式、固定高度下拉刷新、dynamic-size + pull-to-refresh，以及专门演示
            sizeDependencies 的依赖重测示例。四个 demo 都通过 scrollEnd 在滚到底部时自动加载更多。
          </p>
        </section>

        <nav class="demo-nav" aria-label="Demo navigation">
          {demoTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              class={['demo-nav__item', { 'is-active': activeDemo.value === tab.id }]}
              aria-pressed={activeDemo.value === tab.id}
              onClick={() => {
                activeDemo.value = tab.id
              }}
            >
              <span class="demo-nav__eyebrow">{tab.label}</span>
              <strong class="demo-nav__title">{tab.title}</strong>
              <span class="demo-nav__hint">{tab.hint}</span>
            </button>
          ))}
        </nav>

        <section class="demo-stage">
          <div class="demo-stage__meta">
            <p class="demo-stage__eyebrow">Navigation</p>
            <p class="demo-stage__lead">
              顶部导航一次只展示一个 demo。容器基础模式用于观察 fixed-height
              主路径；第二和第三个示例覆盖 pull-to-refresh；第四个示例专门演示外部状态如何通过
              sizeDependencies 触发重新测量。
            </p>
          </div>
          {renderActiveDemo()}
        </section>
      </main>
    )
  },
})

export default App
