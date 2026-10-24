module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['.phase01-template/**', 'node_modules/**', 'android/**'],
  rules: {
    'no-void': 'off',
    'no-bitwise': 'off',
    'react-native/no-inline-styles': 'off',
  },
  overrides: [
    {
      files: ['jest.setup.js', 'jest.config.js', '__mocks__/**/*.js'],
      env: { jest: true, node: true, es2021: true },
    },
  ],
};
