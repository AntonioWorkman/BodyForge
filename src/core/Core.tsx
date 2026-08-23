import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  Skia,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { palette } from '@/design';
import type { CoreStage } from '@/domain/coreStages';
import { easing, spring, timing } from '@/motion';
import { useReducedMotion } from '@/motion/useMotionPreference';

import {
  blendProfile,
  buildCorePolygon,
  buildParticles,
  polygonPath,
  scalePolygon,
} from './coreGeometry';
import { useCoreClock } from './useCoreClock';

interface CoreProps {
  stage: CoreStage;
  /** 0–1 toward the next Core stage. Firms up the silhouette as it rises. */
  stageProgress?: number;
  /**
   * 0–1 of additional internal energy layered on top of the stage — XP progress
   * on System, workout progress during a quest.
   */
  charge?: number;
  size: number;
  /** Suppresses ambient motion entirely, e.g. behind a modal. */
  paused?: boolean;
  /** Fires when the player taps the Core. */
  onTap?: () => void;
  testID?: string;
}

/**
 * The Core.
 *
 * Entirely procedural: a faceted obsidian body with internal violet energy and
 * a spectral lavender rim, generated from the stage rather than drawn or
 * imported. Nothing here is an image asset.
 *
 * Three motions run at once, all in the ambient band — a very slow rotation, a
 * slow breathing scale, and a drifting particle field. Under reduced motion the
 * Core renders as a still composition with its energy intact, so it still looks
 * alive without anything moving.
 */
export function Core({
  stage,
  stageProgress = 0,
  charge = 0,
  size,
  paused = false,
  onTap,
  testID,
}: CoreProps) {
  const reducedMotion = useReducedMotion();
  const profile = useMemo(() => blendProfile(stage, stageProgress), [stage, stageProgress]);

  const clock = useCoreClock(paused || reducedMotion);

  // Touch response: a brief inward press, then a settle.
  const press = useSharedValue(0);
  // Drag: the Core tilts toward the finger and returns.
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.3;

  const outer = useMemo(() => buildCorePolygon(profile, cx, cy, radius), [profile, cx, cy, radius]);
  const inner = useMemo(
    () => scalePolygon(outer, cx, cy, profile.innerScale),
    [outer, cx, cy, profile.innerScale],
  );
  const particles = useMemo(() => buildParticles(profile), [profile]);

  const outerPath = useMemo(() => Skia.Path.MakeFromSVGString(polygonPath(outer)), [outer]);
  const innerPath = useMemo(() => Skia.Path.MakeFromSVGString(polygonPath(inner)), [inner]);

  // Internal structure: lines from the centre out to alternating facets.
  const tracePath = useMemo(() => {
    const path = Skia.Path.Make();
    for (let index = 0; index < profile.traces; index += 1) {
      const point = outer[(index * 2) % outer.length];
      if (!point) continue;
      path.moveTo(cx, cy);
      path.lineTo(cx + (point.x - cx) * 0.82, cy + (point.y - cy) * 0.82);
    }
    return path;
  }, [outer, profile.traces, cx, cy]);

  /**
   * Ambient breathing — the Core's clearest sign of life.
   *
   * Amplitude and period come from the stage profile rather than being fixed
   * here, so the breath is part of the progression language: dormant breathes
   * slowly and shallowly, ascendant faster and deeper. It used to be a flat
   * ±1.2% at seven seconds, which measured on a real phone was close to
   * invisible — the Core looked switched off rather than restrained.
   */
  const breath = useDerivedValue(() => {
    if (reducedMotion || paused) return 1;
    const cycle = (Math.PI * 2) / profile.breathPeriod;
    return 1 + Math.sin((clock.value / 1000) * cycle) * profile.breathAmplitude;
  });

  const rotation = useDerivedValue(() => {
    if (reducedMotion || paused) return 0;
    return ((clock.value / 1000) * (Math.PI * 2)) / profile.rotationPeriod;
  });

  const bodyTransform = useDerivedValue(() => [
    { translateX: cx },
    { translateY: cy },
    { scale: breath.value * (1 - press.value * 0.05) },
    { rotateY: tiltX.value },
    { rotateX: tiltY.value },
    { translateX: -cx },
    { translateY: -cy },
  ]);

  const haloTransform = useDerivedValue(() => [
    { translateX: cx },
    { translateY: cy },
    { rotate: rotation.value },
    { translateX: -cx },
    { translateY: -cy },
  ]);

  // Charge lifts the internal energy and the rim without ever fully blowing out.
  const energy = Math.min(0.92, profile.energy + charge * 0.22);
  const rim = Math.min(0.95, profile.rimLight + charge * 0.18);

  // Tap runs on the JS thread so `onTap` can call into the app directly; the
  // shared-value writes are still valid from there.
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onBegin(() => {
      press.value = withTiming(1, { duration: timing.microFast, easing: easing.emphasized });
    })
    .onFinalize(() => {
      press.value = withSpring(0, spring.weighty);
    })
    .onEnd(() => {
      onTap?.();
    });

  const pan = Gesture.Pan()
    .onChange((event) => {
      const limit = 0.22;
      tiltX.value = Math.max(-limit, Math.min(limit, event.translationX / (size * 2)));
      tiltY.value = Math.max(-limit, Math.min(limit, -event.translationY / (size * 2)));
    })
    .onFinalize(() => {
      tiltX.value = withSpring(0, spring.weighty);
      tiltY.value = withSpring(0, spring.weighty);
    });

  const gesture = Gesture.Race(pan, tap);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.root, { width: size, height: size }]}
        testID={testID}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`The Core, ${stage}`}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          {/* Atmosphere: a wide, very low-opacity bloom grounding the Core. */}
          <Circle cx={cx} cy={cy} r={radius * 2.1}>
            <RadialGradient
              c={vec(cx, cy)}
              r={radius * 2.1}
              colors={[
                withAlpha(palette.royalViolet, 0.16 + charge * 0.06),
                withAlpha(palette.royalViolet, 0.04),
                'transparent',
              ]}
              positions={[0, 0.5, 1]}
            />
          </Circle>

          {/* Ambient particles orbiting the body. */}
          <Group transform={haloTransform}>
            {particles.map((particle, index) => (
              <CoreParticle
                key={index}
                clock={clock}
                cx={cx}
                cy={cy}
                radius={radius}
                orbit={particle.orbit}
                phase={particle.phase}
                speed={particle.speed}
                size={particle.size}
                still={reducedMotion || paused}
              />
            ))}
          </Group>

          <Group transform={bodyTransform}>
            {/* Rim: the lavender edge illumination that reads as depth. */}
            {outerPath ? (
              <Path path={outerPath} style="stroke" strokeWidth={2.4} strokeJoin="round">
                <SweepGradient
                  c={vec(cx, cy)}
                  colors={[
                    withAlpha(palette.spectralLavender, rim * 0.7),
                    withAlpha(palette.royalViolet, rim * 0.25),
                    withAlpha(palette.spectralLavender, rim * 0.6),
                    withAlpha(palette.royalViolet, rim * 0.2),
                    withAlpha(palette.spectralLavender, rim * 0.7),
                  ]}
                />
                <BlurMask blur={5} style="normal" />
              </Path>
            ) : null}

            {/* The hard facet edge, drawn over the bloom. */}
            {outerPath ? (
              <Path
                path={outerPath}
                style="stroke"
                strokeWidth={1}
                strokeJoin="round"
                color={withAlpha(palette.spectralLavender, 0.35 + rim * 0.45)}
              />
            ) : null}

            {/* Internal energy, contained inside the silhouette. */}
            {outerPath ? (
              <Path path={outerPath} style="fill">
                <RadialGradient
                  c={vec(cx, cy - radius * 0.18)}
                  r={radius * 1.15}
                  colors={[
                    withAlpha(palette.royalViolet, energy),
                    withAlpha(palette.royalViolet, energy * 0.4),
                    withAlpha('#1B0F33', 0.9),
                  ]}
                  positions={[0, 0.55, 1]}
                />
              </Path>
            ) : null}

            {/* Structure traces reaching from the centre toward the facets. */}
            {profile.traces > 0 ? (
              <Path
                path={tracePath}
                style="stroke"
                strokeWidth={0.8}
                color={withAlpha(palette.spectralLavender, 0.22 + charge * 0.12)}
              />
            ) : null}

            {/* The obsidian body: the dark centre the energy sits behind. */}
            {innerPath ? (
              <>
                <Path path={innerPath} style="fill">
                  <RadialGradient
                    c={vec(cx - radius * 0.2, cy - radius * 0.28)}
                    r={radius}
                    colors={[withAlpha('#241634', 0.96), withAlpha('#05040A', 1)]}
                  />
                </Path>
                <Path
                  path={innerPath}
                  style="stroke"
                  strokeWidth={1}
                  strokeJoin="round"
                  color={withAlpha(palette.spectralLavender, 0.18 + rim * 0.3)}
                />
              </>
            ) : null}

            {/* A single specular highlight — the one place the Core catches light. */}
            <Circle
              cx={cx - radius * 0.26}
              cy={cy - radius * 0.34}
              r={radius * 0.1}
              color={withAlpha(palette.spectralLavender, 0.32 + charge * 0.2)}
            >
              <BlurMask blur={radius * 0.14} style="normal" />
            </Circle>

            {/* The heart: brightest at the centre, scaling with charge. */}
            <Circle cx={cx} cy={cy} r={radius * (0.14 + charge * 0.08)}>
              <RadialGradient
                c={vec(cx, cy)}
                r={radius * (0.14 + charge * 0.08)}
                colors={[
                  withAlpha(palette.spectralLavender, 0.5 + charge * 0.35),
                  withAlpha(palette.royalViolet, 0.1),
                ]}
              />
              <BlurMask blur={radius * 0.1} style="normal" />
            </Circle>
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

function CoreParticle({
  clock,
  cx,
  cy,
  radius,
  orbit,
  phase,
  speed,
  size,
  still,
}: {
  clock: SharedValue<number>;
  cx: number;
  cy: number;
  radius: number;
  orbit: number;
  phase: number;
  speed: number;
  size: number;
  still: boolean;
}) {
  const position = useDerivedValue(() => {
    const t = still ? 0 : (clock.value / 1000) * speed * 0.22;
    const angle = phase + t;
    const wobble = still ? 1 : 1 + Math.sin(t * 1.7 + phase) * 0.04;
    return {
      x: cx + Math.cos(angle) * radius * orbit * wobble,
      y: cy + Math.sin(angle) * radius * orbit * wobble * 0.72,
    };
  });

  const px = useDerivedValue(() => position.value.x);
  const py = useDerivedValue(() => position.value.y);

  return (
    <Circle cx={px} cy={py} r={size} color={withAlpha(palette.spectralLavender, 0.34)}>
      <BlurMask blur={size * 0.9} style="normal" />
    </Circle>
  );
}

/** Hex colour with an alpha channel appended, clamped to a legal range. */
function withAlpha(hex: string, alpha: number): string {
  const clamped = Math.min(1, Math.max(0, alpha));
  const byte = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${byte}`;
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
});
