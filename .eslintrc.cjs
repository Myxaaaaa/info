module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'scripts'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  overrides: [
    {
      files: ['server/**/*.js'],
      env: { node: true },
    },
  ],
  rules: {
    'react/prop-types': 'off',
    'no-unused-vars': ['error', { varsIgnorePattern: '^React$', argsIgnorePattern: '^_' }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'react-refresh/only-export-components': 'off',
  },
}
