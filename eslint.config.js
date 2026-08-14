import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // .claude/worktrees holds full checkouts of this repo (agent worktrees); linting
  // them double-reports every finding against a copy nobody edits.
  { ignores: ['node_modules', 'out', 'outputs/installer', 'work', 'resources/remote-web', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
)
