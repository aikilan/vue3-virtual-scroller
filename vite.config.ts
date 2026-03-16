/// <reference types="vitest" />

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

function stripVueJsxSsrRegister(): Plugin {
  return {
    name: 'strip-vue-jsx-ssr-register',
    enforce: 'post',
    transform(code, id, options) {
      const ssr = typeof options === 'boolean' ? options : options?.ssr === true
      if (!ssr || !id.includes('.tsx') || !code.includes('__vue-jsx-ssr-register-helper')) {
        return null
      }

      return {
        code: code
          .replace(/\nimport \{ ssrRegisterHelper \} from "\/__vue-jsx-ssr-register-helper"/g, '')
          .replace(/\nconst __moduleId = .*$/gm, '')
          .replace(/\nssrRegisterHelper\([^)]+\)/g, ''),
        map: null,
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    ...(process.env.VITEST ? [stripVueJsxSsrRegister()] : []),
  ],
  server: {
    host: '0.0.0.0'
  },
  build: {
    outDir: 'demo-dist',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
