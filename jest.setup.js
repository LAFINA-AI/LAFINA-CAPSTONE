/* eslint-env jest */
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

// SVG geometry is verified in Android screenshots/builds, not these JS stubs.
// Keep children/props so behavioral and accessibility tests still inspect UI.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const {View} = require('react-native');
  const shape = props => React.createElement(View, props, props.children);
  return {
    __esModule: true,
    default: shape,
    Svg: shape,
    Path: shape,
    Circle: shape,
    Rect: shape,
    Line: shape,
    Polyline: shape,
    Defs: shape,
    LinearGradient: shape,
    Stop: shape,
  };
});
