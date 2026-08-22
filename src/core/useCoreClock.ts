import { useEffect } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

/**
 * A millisecond clock for ambient Core motion.
 *
 * Written as a frame callback rather than an infinite `withRepeat` timing so it
 * can be stopped outright: when the Core is off screen or the player has asked
 * for reduced motion, no frames are scheduled at all rather than animating
 * invisibly.
 */
export function useCoreClock(paused: boolean): SharedValue<number> {
  const clock = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    clock.value = info.timeSinceFirstFrame;
  }, !paused);

  useEffect(() => {
    frame.setActive(!paused);
  }, [frame, paused]);

  return clock;
}
