import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const tempDir = mkdtempSync(join(tmpdir(), 'vue-virtual-scroller-next-import-named-'))
const packDir = join(tempDir, 'pack')
const consumerDir = join(tempDir, 'consumer')

function run(command, args, cwd, options = {}) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    ...options,
  })
}

mkdirSync(packDir)
mkdirSync(consumerDir)

try {
  run('pnpm', ['build:lib'], rootDir)
  run('pnpm', ['pack', '--pack-destination', packDir], rootDir)

  const tarballName = readdirSync(packDir).find((entry) => entry.endsWith('.tgz'))

  if (!tarballName) {
    throw new Error('pnpm pack did not produce a tarball.')
  }

  const tarballPath = join(packDir, tarballName)

  writeFileSync(
    join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'tarball-import-named-check',
        private: true,
        type: 'module',
        packageManager: 'pnpm@10.15.1',
        dependencies: {
          vue: '>=3.2.4 <4',
          'vue-virtual-scroller-next': `file:${tarballPath}`,
        },
        devDependencies: {
          '@typescript-eslint/parser': '8.58.1',
          eslint: '9.39.4',
          'eslint-import-resolver-typescript': '4.4.4',
          'eslint-plugin-import': '2.32.0',
          typescript: '5.9.3',
        },
      },
      null,
      2,
    ),
  )

  writeFileSync(
    join(consumerDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          jsx: 'preserve',
          skipLibCheck: true,
        },
        include: ['import-check.ts'],
      },
      null,
      2,
    ),
  )

  writeFileSync(
    join(consumerDir, 'eslint.config.mjs'),
    `import importPlugin from 'eslint-plugin-import'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx', '.d.ts'],
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      'import/named': 'error',
    },
  },
]
`,
  )

  writeFileSync(
    join(consumerDir, 'import-check.ts'),
    `import {
  DynamicScroller,
  DynamicScrollerItem,
  RecycleScroller,
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
  type DynamicScrollerDefaultSlotProps,
  type DynamicScrollerExpose,
  type DynamicScrollerItemProps,
  type DynamicScrollerProps,
  type DynamicScrollerRefreshSlotProps,
  type DynamicSizeRange,
  type FixedHeightRange,
  type PullToRefreshHandler,
  type PullToRefreshSlotProps,
  type PullToRefreshState,
  type RecycleScrollerDefaultSlotProps,
  type RecycleScrollerExpose,
  type RecycleScrollerItemKey,
  type RecycleScrollerItemKeyResolver,
  type RecycleScrollerItemKeyValue,
  type RecycleScrollerMeasurementState,
  type RecycleScrollerProps,
  type RecycleScrollerRefreshSlotProps,
  type RecycleScrollerView,
  type ScrollBoundaryPayload,
  type ScrollDirection,
  type ScrollPositionItem,
  type ScrollPositionPayload,
  type ScrollState,
} from 'vue-virtual-scroller-next'
import 'vue-virtual-scroller-next/style.css'

void [
  DynamicScroller,
  DynamicScrollerItem,
  RecycleScroller,
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
]

export type PublicApiImportNamedSmokeCheck = {
  dynamicDefaultSlot: DynamicScrollerDefaultSlotProps
  dynamicExpose: DynamicScrollerExpose
  dynamicItemProps: DynamicScrollerItemProps
  dynamicProps: DynamicScrollerProps
  dynamicRefreshSlot: DynamicScrollerRefreshSlotProps
  dynamicSizeRange: DynamicSizeRange
  fixedHeightRange: FixedHeightRange
  pullToRefreshHandler: PullToRefreshHandler
  pullToRefreshSlot: PullToRefreshSlotProps
  pullToRefreshState: PullToRefreshState
  recycleDefaultSlot: RecycleScrollerDefaultSlotProps
  recycleExpose: RecycleScrollerExpose
  recycleItemKey: RecycleScrollerItemKey
  recycleItemKeyResolver: RecycleScrollerItemKeyResolver
  recycleItemKeyValue: RecycleScrollerItemKeyValue
  recycleMeasurementState: RecycleScrollerMeasurementState
  recycleProps: RecycleScrollerProps
  recycleRefreshSlot: RecycleScrollerRefreshSlotProps
  recycleView: RecycleScrollerView
  scrollBoundaryPayload: ScrollBoundaryPayload
  scrollDirection: ScrollDirection
  scrollPositionItem: ScrollPositionItem
  scrollPositionPayload: ScrollPositionPayload
  scrollState: ScrollState
}
`,
  )

  run('pnpm', ['install', '--ignore-scripts'], consumerDir)
  run('pnpm', ['exec', 'eslint', 'import-check.ts'], consumerDir)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
