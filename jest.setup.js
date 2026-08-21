/* eslint-env jest */

// Reanimated ships a Jest helper that stubs its native side.
require('react-native-reanimated/src/jestUtils').setUpTests();

// Skia has no software renderer under Jest; component tests only need the
// element tree to build, so the canvas primitives render as plain views.
jest.mock('@shopify/react-native-skia', () => require('./src/testing/skiaMock'));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
