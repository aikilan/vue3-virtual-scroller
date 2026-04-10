import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dts } from 'rollup-plugin-dts'

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)))

export default {
  input: resolve(rootDir, '.types-temp/index.d.ts'),
  output: {
    file: resolve(rootDir, 'dist/index.d.ts'),
    format: 'es',
  },
  external: ['vue'],
  plugins: [
    dts({
      respectExternal: true,
      tsconfig: resolve(rootDir, 'tsconfig.types.json'),
    }),
  ],
}
