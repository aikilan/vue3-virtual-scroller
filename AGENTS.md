# 仓库约束

- `src/components/**` 下的生产组件主渲染统一使用 TSX。
- 禁止使用 `h` 或 `createVNode` 组装生产组件的主渲染树。
- 当 `attrs`、`class`、`style`、事件监听需要合并时，可以继续使用 `mergeProps`，但最终 DOM / VNode 结构必须通过 TSX 表达。
- slot 透传优先使用 TSX、`v-slots` 或 `slots.xxx?.()` 的方式组织。
- 测试文件和测试专用 stub 不在这条约束范围内，除非任务明确要求同步改写。
