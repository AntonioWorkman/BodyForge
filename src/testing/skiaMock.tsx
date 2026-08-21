/* istanbul ignore file */
import React from 'react';
import { View } from 'react-native';

/**
 * Jest stand-in for `@shopify/react-native-skia`.
 *
 * Skia's canvas needs a real GPU surface, which Jest does not have. Component
 * tests only care that the tree builds and that surrounding UI behaves, so
 * every Skia element renders as an inert view and the value helpers return
 * plain objects.
 */
const passthrough = (name: string) => {
  const Component = ({ children }: { children?: React.ReactNode }) => (
    <View testID={`skia-${name}`}>{children}</View>
  );
  Component.displayName = `Skia.${name}`;
  return Component;
};

const identity = <T,>(value: T): T => value;

module.exports = new Proxy(
  {
    Skia: {
      Path: { Make: () => ({ moveTo() {}, lineTo() {}, close() {}, addCircle() {} }) },
      Color: identity,
    },
    vec: (x: number, y: number) => ({ x, y }),
    useFont: () => null,
    useImage: () => null,
    interpolateColors: (_value: number, _input: number[], output: string[]) => output[0],
  },
  {
    get(target: Record<string, unknown>, property: string) {
      if (property in target) return target[property];
      if (property === '__esModule') return true;
      return passthrough(property);
    },
  },
);
