import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // e2e 스펙과 그 config 는 브라우저가 아니라 Node 에서 실행된다
    // (playwright 러너). 자격증명을 코드에 넣지 않고 process.env 로 받으므로
    // 여기에만 node 전역을 더한다.
    files: ['e2e/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
])
