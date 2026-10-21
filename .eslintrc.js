module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['.phase01-template/**', 'node_modules/**', 'android/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    'react-native/no-inline-styles': 'error',
    'no-void': ['error', {allowAsStatement: true}],
    'no-restricted-globals': ['error', 'fetch', 'XMLHttpRequest', 'WebSocket'],
  },
};
