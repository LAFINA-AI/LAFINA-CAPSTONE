module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s?(x)'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  modulePathIgnorePatterns: ['<rootDir>/.phase01-template/', '<rootDir>/.kilo/'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.kilo/'],
  clearMocks: true,
  testTimeout: 15000,
  cacheDirectory: '<rootDir>/.local/jest-cache',
  moduleNameMapper: {
    '\\.(gguf|bin|onnx|png|jpg|jpeg)$': '<rootDir>/__mocks__/fileMock.js',
    '^@op-engineering/op-sqlite$': '<rootDir>/__mocks__/opSqliteMock.js',
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community|-documents)?|react-native-safe-area-context|react-native-svg|lucide-react-native|react-native-tts|react-native-fs|react-native-share)/)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
};
