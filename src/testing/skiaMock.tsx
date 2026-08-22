/* istanbul ignore file */
import React from 'react';
import { View } from 'react-native';

/**
 * Jest stand-in for `@shopify/react-native-skia`.
 *
 * Skia's canvas needs a real GPU surface, which Jest does not have. Component
 * tests only care that the tree builds and that the surrounding UI behaves, so
 * every Skia element renders as an inert view.
 *
 * `Skia.Path` returns a chainable recorder rather than a no-op object: the app
 * builds real paths during render, and a stub missing a method would fail the
 * render for reasons that have nothing to do with the test.
 */
interface PathRecorder {
  commands: unknown[][];
  [method: string]: unknown;
}

function makePath(): PathRecorder {
  const path: PathRecorder = { commands: [] };
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      path.commands.push([name, ...args]);
      return path;
    };

  for (const method of [
    'moveTo',
    'lineTo',
    'quadTo',
    'cubicTo',
    'conicTo',
    'arcToOval',
    'arcToTangent',
    'addCircle',
    'addOval',
    'addRect',
    'addRRect',
    'addPath',
    'close',
    'reset',
    'rewind',
    'transform',
    'offset',
    'trim',
    'dash',
    'stroke',
    'copy',
    'computeTightBounds',
    'getBounds',
    'toSVGString',
  ]) {
    path[method] = record(method);
  }

  return path;
}

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
      Path: {
        Make: () => makePath(),
        MakeFromSVGString: () => makePath(),
      },
      Color: identity,
      Point: (x: number, y: number) => ({ x, y }),
    },
    vec: (x: number, y: number) => ({ x, y }),
    useFont: () => null,
    useImage: () => null,
    useClock: () => ({ value: 0 }),
    interpolateColors: (_value: number, _input: number[], output: string[]) => output[0],
  } as Record<string, unknown>,
  {
    get(target: Record<string, unknown>, property: string) {
      if (property in target) return target[property];
      if (property === '__esModule') return true;
      return passthrough(property);
    },
  },
);
