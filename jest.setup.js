jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
// Tests inject a repository. Never claim this mock validates the Android JSI driver.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => {
    throw new Error('Native SQLite is unavailable in Jest');
  }),
}));
