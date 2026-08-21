import type { Exercise, ExerciseVariation, ProgressionChain } from '../types';

/**
 * The movement catalog.
 *
 * Chains are data, not screen markup — the Skills tree reads its nodes and
 * edges from here, and the seeder writes exactly this into SQLite. Adding a
 * variation is a data edit, never a UI edit.
 *
 * `difficultyScore` is a relative weight used by the Strength attribute. It
 * only has to be internally consistent: harder variation, higher number.
 */

export const EXERCISES: readonly Exercise[] = [
  {
    id: 'ex-bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    pattern: 'lunge',
    primaryMuscles: ['quads', 'glutes'],
    chainId: 'chain-bulgarian-split-squat',
  },
  {
    id: 'ex-bodyweight-squat',
    name: 'Bodyweight Squat',
    pattern: 'squat',
    primaryMuscles: ['quads', 'glutes'],
    chainId: 'chain-squat',
  },
  {
    id: 'ex-reverse-lunge',
    name: 'Reverse Lunge',
    pattern: 'lunge',
    primaryMuscles: ['quads', 'glutes'],
    chainId: 'chain-reverse-lunge',
  },
  {
    id: 'ex-glute-bridge',
    name: 'Glute Bridge',
    pattern: 'hinge',
    primaryMuscles: ['glutes', 'hamstrings'],
    chainId: 'chain-glute',
  },
  {
    id: 'ex-calf-raise',
    name: 'Calf Raise',
    pattern: 'hinge',
    primaryMuscles: ['calves'],
    chainId: 'chain-calf',
  },
  {
    id: 'ex-push-up',
    name: 'Push-Up',
    pattern: 'push',
    primaryMuscles: ['chest', 'triceps', 'shoulders'],
    chainId: 'chain-push-up',
  },
  {
    id: 'ex-close-grip-push-up',
    name: 'Close-Grip Push-Up',
    pattern: 'push',
    primaryMuscles: ['triceps', 'chest'],
    chainId: 'chain-close-grip-push-up',
  },
  {
    id: 'ex-pike-push-up',
    name: 'Pike Push-Up',
    pattern: 'vertical-push',
    primaryMuscles: ['shoulders', 'triceps'],
    chainId: 'chain-pike-push-up',
  },
  {
    id: 'ex-plank',
    name: 'Plank',
    pattern: 'brace',
    primaryMuscles: ['core'],
    chainId: 'chain-plank',
  },
  {
    id: 'ex-reverse-crunch',
    name: 'Reverse Crunch',
    pattern: 'brace',
    primaryMuscles: ['core'],
    chainId: 'chain-reverse-crunch',
  },
] as const;

/**
 * Shorthand for declaring a chain. Tiers, `previousVariationId`, and the chain
 * record itself are derived so the data below stays readable and cannot drift
 * out of order.
 */
interface VariationSpec {
  id: string;
  name: string;
  execution: string;
  formRequirements: string[];
  difficultyScore: number;
  minimumPhase?: ExerciseVariation['minimumPhase'];
}

interface ChainSpec {
  id: string;
  name: string;
  exerciseId: string;
  measurementKind: ExerciseVariation['measurementKind'];
  variations: VariationSpec[];
}

const CHAIN_SPECS: readonly ChainSpec[] = [
  {
    id: 'chain-push-up',
    name: 'Push-Up',
    exerciseId: 'ex-push-up',
    measurementKind: 'reps',
    variations: [
      {
        id: 'var-push-up-regular',
        name: 'Regular Push-Up',
        execution: 'Hands under the shoulders, body in one line from head to heels.',
        formRequirements: [
          'Full range: chest within a fist of the floor',
          'Elbows tracking back at roughly 45°, not flared',
          'Hips level with the shoulders throughout — no sag, no pike',
        ],
        difficultyScore: 10,
      },
      {
        id: 'var-push-up-slow',
        name: 'Slow Push-Up',
        execution: 'Three seconds to descend, then press back up at a normal speed.',
        formRequirements: [
          'A controlled three-second descent on every rep',
          'No collapse at the bottom of the rep',
          'Consistent depth from the first rep to the last',
        ],
        difficultyScore: 13,
      },
      {
        id: 'var-push-up-paused',
        name: 'Paused Push-Up',
        execution: 'Descend under control, hold one second at the bottom, then press.',
        formRequirements: [
          'A genuine one-second pause with no bounce out of the bottom',
          'Shoulders stay set and down during the pause',
          'Full lockout at the top of every rep',
        ],
        difficultyScore: 16,
      },
      {
        id: 'var-push-up-decline',
        name: 'Decline Push-Up',
        execution: 'Feet elevated on a stable surface, hands on the floor.',
        formRequirements: [
          'Feet elevated at least to knee height',
          'Ribs stay down — no arching to reach the floor',
          'Full range with the same depth as your flat push-up',
        ],
        difficultyScore: 20,
      },
      {
        id: 'var-push-up-archer',
        name: 'Archer Push-Up',
        execution: 'Wide hands; lower toward one side while the other arm straightens.',
        formRequirements: [
          'Chest reaches the working hand on every rep',
          'The straight arm stays straight, not bent to assist',
          'Hips stay square — no rotating to reach depth',
        ],
        difficultyScore: 26,
        minimumPhase: 'ascension',
      },
    ],
  },
  {
    id: 'chain-pike-push-up',
    name: 'Pike Push-Up',
    exerciseId: 'ex-pike-push-up',
    measurementKind: 'reps',
    variations: [
      {
        id: 'var-pike-high-incline',
        name: 'High Incline Pike Push-Up',
        execution:
          'Hands on a high surface, hips high, head travelling toward the surface between your hands.',
        formRequirements: [
          'Hips stay high — the torso is closer to vertical than horizontal',
          'Head travels down between the hands, not forward',
          'Knees may stay bent; that is expected at this stage',
        ],
        difficultyScore: 10,
      },
      {
        id: 'var-pike-low-incline',
        name: 'Low Incline Pike Push-Up',
        execution: 'The same movement with your hands on a lower surface.',
        formRequirements: [
          'Same hip height on a noticeably lower surface',
          'Controlled descent — no dropping onto the head',
          'Full press to straight arms at the top',
        ],
        difficultyScore: 15,
      },
      {
        id: 'var-pike-floor',
        name: 'Floor Pike Push-Up',
        execution: 'Hands and feet on the floor, hips as high as your hamstrings allow.',
        formRequirements: [
          'Hips stay stacked over the shoulders for the whole set',
          'Head lightly touches the floor between the hands',
          'No turning it into a wide push-up as fatigue arrives',
        ],
        difficultyScore: 22,
        minimumPhase: 'development',
      },
      {
        id: 'var-pike-feet-elevated',
        name: 'Feet-Elevated Pike Push-Up',
        execution: 'Feet on a raised surface, torso close to vertical.',
        formRequirements: [
          'Torso within roughly 20° of vertical',
          'Elbows travel forward, not out to the sides',
          'Controlled tempo — this position punishes momentum',
        ],
        difficultyScore: 30,
        minimumPhase: 'ascension',
      },
    ],
  },
  {
    id: 'chain-bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    exerciseId: 'ex-bulgarian-split-squat',
    measurementKind: 'reps-per-side',
    variations: [
      {
        id: 'var-bss-standard',
        name: 'Bulgarian Split Squat',
        execution: 'Rear foot elevated behind you, front shin roughly vertical at the bottom.',
        formRequirements: [
          'Front thigh reaches at least parallel to the floor',
          'Torso angle stays consistent from the first rep to the last',
          'Front heel stays down through the whole rep',
        ],
        difficultyScore: 14,
      },
      {
        id: 'var-bss-slow',
        name: 'Slow Bulgarian Split Squat',
        execution: 'Three seconds to descend, stand at a normal speed.',
        formRequirements: [
          'A genuine three-second descent, counted',
          'No using the rear leg to drive out of the bottom',
          'Balance held without touching a wall',
        ],
        difficultyScore: 18,
      },
      {
        id: 'var-bss-paused',
        name: 'Paused Bulgarian Split Squat',
        execution: 'Descend, hold two seconds at the bottom, then stand.',
        formRequirements: [
          'Two full seconds at depth with no bounce',
          'Front knee stays tracking over the middle of the foot',
          'Every rep reaches the same depth',
        ],
        difficultyScore: 23,
        minimumPhase: 'development',
      },
      {
        id: 'var-shrimp-assisted',
        name: 'Assisted Shrimp Squat',
        execution:
          'Rear foot held behind you, descending to a light touch with one hand for balance.',
        formRequirements: [
          'Rear knee touches down under control',
          'Hand assistance is for balance only, not for lifting you',
          'Standing leg heel stays down',
        ],
        difficultyScore: 30,
        minimumPhase: 'ascension',
      },
      {
        id: 'var-shrimp-squat',
        name: 'Shrimp Squat',
        execution: 'Unassisted: rear knee to the floor and back up on one leg.',
        formRequirements: [
          'Rear knee touches under full control, no dropping',
          'No hand contact at any point',
          'Torso stays upright rather than folding forward',
        ],
        difficultyScore: 38,
        minimumPhase: 'ascension',
      },
    ],
  },
  {
    id: 'chain-glute',
    name: 'Single-Leg Hip Extension',
    exerciseId: 'ex-glute-bridge',
    measurementKind: 'reps-per-side',
    variations: [
      {
        id: 'var-glute-bridge-single-leg',
        name: 'Single-Leg Glute Bridge',
        execution: 'One foot planted, the other leg extended, driving the hips up.',
        formRequirements: [
          'Hips reach full extension — a straight line from knee to shoulder',
          'Pelvis stays level, no dropping toward the free leg',
          'Drive comes from the glute, not from arching the lower back',
        ],
        difficultyScore: 8,
      },
      {
        id: 'var-hip-thrust-single-leg',
        name: 'Single-Leg Hip Thrust',
        execution: 'Upper back supported on a raised surface, increasing the range.',
        formRequirements: [
          'Full hip extension at the top with the ribs down',
          'Shins vertical at lockout',
          'Controlled descent — no dropping to the floor',
        ],
        difficultyScore: 14,
        minimumPhase: 'development',
      },
      {
        id: 'var-hip-thrust-paused',
        name: 'Paused Single-Leg Hip Thrust',
        execution: 'The same movement with a two-second hold at full extension.',
        formRequirements: [
          'Two full seconds at lockout without losing hip height',
          'Pelvis level throughout the hold',
          'Consistent tempo across every rep of the set',
        ],
        difficultyScore: 20,
        minimumPhase: 'ascension',
      },
    ],
  },
  {
    id: 'chain-calf',
    name: 'Single-Leg Calf Raise',
    exerciseId: 'ex-calf-raise',
    measurementKind: 'reps-per-side',
    variations: [
      {
        id: 'var-calf-raise-single-leg',
        name: 'Single-Leg Calf Raise',
        execution: 'One leg, rising onto the ball of the foot through a full range.',
        formRequirements: [
          'Full range: a deep stretch at the bottom, a full rise at the top',
          'No bouncing out of the bottom position',
          'Knee stays straight throughout',
        ],
        difficultyScore: 6,
      },
      {
        id: 'var-calf-raise-slow',
        name: 'Slow Single-Leg Calf Raise',
        execution: 'Three seconds to lower on every rep.',
        formRequirements: [
          'A counted three-second descent',
          'Full stretch reached at the bottom of each rep',
          'Balance held without leaning on support',
        ],
        difficultyScore: 10,
      },
      {
        id: 'var-calf-raise-long-pause',
        name: 'Long-Pause Single-Leg Calf Raise',
        execution: 'Three seconds down, three seconds held at the bottom stretch.',
        formRequirements: [
          'Three full seconds in the stretched position',
          'No shortening the range as the set goes on',
          'Controlled rise with no momentum',
        ],
        difficultyScore: 15,
        minimumPhase: 'development',
      },
    ],
  },
  {
    id: 'chain-squat',
    name: 'Squat',
    exerciseId: 'ex-bodyweight-squat',
    measurementKind: 'reps',
    variations: [
      {
        id: 'var-squat-bodyweight',
        name: 'Bodyweight Squat',
        execution: 'Feet about shoulder width, descending to at least parallel.',
        formRequirements: [
          'Thighs reach at least parallel to the floor',
          'Heels stay down throughout',
          'Knees track over the feet, not collapsing inward',
        ],
        difficultyScore: 5,
      },
      {
        id: 'var-squat-slow',
        name: 'Slow Bodyweight Squat',
        execution: 'Three seconds down, a one-second pause, then stand at a normal speed.',
        formRequirements: [
          'A counted three-second descent',
          'A full second held at the bottom with no bounce',
          'The same depth reached on every rep of the set',
        ],
        difficultyScore: 8,
      },
      {
        id: 'var-squat-paused',
        name: 'Paused Bodyweight Squat',
        execution: 'Three seconds down and three seconds held at the bottom.',
        formRequirements: [
          'Three full seconds at depth, breathing normally',
          'Torso angle held during the pause',
          'No shifting weight onto one side',
        ],
        difficultyScore: 12,
        minimumPhase: 'development',
      },
      {
        id: 'var-squat-assisted-pistol',
        name: 'Assisted Pistol Squat',
        execution: 'One leg, descending to a box or with light support.',
        formRequirements: [
          'Controlled descent to at least parallel on one leg',
          'Support used for balance only',
          'Heel of the working leg stays down',
        ],
        difficultyScore: 22,
        minimumPhase: 'ascension',
      },
    ],
  },
  {
    id: 'chain-reverse-lunge',
    name: 'Reverse Lunge',
    exerciseId: 'ex-reverse-lunge',
    measurementKind: 'reps-per-side',
    variations: [
      {
        id: 'var-reverse-lunge',
        name: 'Reverse Lunge',
        execution: 'Step back, lower the rear knee toward the floor, return to standing.',
        formRequirements: [
          'Rear knee lowers to within a fist of the floor',
          'Front shin stays roughly vertical',
          'Return to standing without pushing off the rear foot excessively',
        ],
        difficultyScore: 9,
      },
      {
        id: 'var-reverse-lunge-slow',
        name: 'Slow Reverse Lunge',
        execution: 'Three seconds to descend on every rep.',
        formRequirements: [
          'A counted three-second descent',
          'Torso upright throughout',
          'No touching down for balance between reps',
        ],
        difficultyScore: 13,
      },
      {
        id: 'var-reverse-lunge-deficit',
        name: 'Deficit Reverse Lunge',
        execution: 'Front foot elevated so the rear knee travels below the front foot.',
        formRequirements: [
          'Rear knee travels clearly below the level of the front foot',
          'Front heel stays fully in contact with the platform',
          'Full extension at the top of every rep',
        ],
        difficultyScore: 18,
        minimumPhase: 'development',
      },
    ],
  },
  {
    id: 'chain-close-grip-push-up',
    name: 'Close-Grip Push-Up',
    exerciseId: 'ex-close-grip-push-up',
    measurementKind: 'reps',
    variations: [
      {
        id: 'var-close-grip-push-up',
        name: 'Close-Grip Push-Up',
        execution:
          'Hands narrower than a normal push-up — they do not need to form a diamond.',
        formRequirements: [
          'Elbows stay close to the ribs on the descent',
          'Chest reaches the hands',
          'Full lockout without shrugging the shoulders',
        ],
        difficultyScore: 12,
      },
      {
        id: 'var-close-grip-push-up-slow',
        name: 'Slow Close-Grip Push-Up',
        execution: 'Three seconds to descend, normal speed to press.',
        formRequirements: [
          'A counted three-second descent',
          'Elbows stay tucked for the whole set',
          'No hips leading the way up',
        ],
        difficultyScore: 16,
      },
      {
        id: 'var-diamond-push-up',
        name: 'Diamond Push-Up',
        execution: 'Index fingers and thumbs touching beneath the chest.',
        formRequirements: [
          'Hands genuinely form a diamond under the sternum',
          'Chest touches the hands on every rep',
          'Wrists comfortable — stop the set if they are not',
        ],
        difficultyScore: 21,
        minimumPhase: 'development',
      },
    ],
  },
  {
    id: 'chain-plank',
    name: 'Plank',
    exerciseId: 'ex-plank',
    measurementKind: 'time',
    variations: [
      {
        id: 'var-plank',
        name: 'Plank',
        execution: 'Forearms and toes, a straight line from head to heels.',
        formRequirements: [
          'Hips level — no sagging and no piking upward',
          'Ribs down, glutes engaged for the whole hold',
          'Breathing normally rather than bracing against held breath',
        ],
        difficultyScore: 6,
      },
      {
        id: 'var-plank-extended',
        name: 'Extended Plank',
        execution: 'Forearms moved further forward, lengthening the lever.',
        formRequirements: [
          'Forearms clearly ahead of the shoulders',
          'Lower back stays flat for the whole hold',
          'Position held without creeping back to a standard plank',
        ],
        difficultyScore: 11,
      },
      {
        id: 'var-plank-single-leg',
        name: 'Single-Leg Plank',
        execution: 'One foot lifted, split evenly between sides across the hold.',
        formRequirements: [
          'Hips stay square with the lifted leg',
          'No rotation toward the supporting side',
          'Even time on each side',
        ],
        difficultyScore: 15,
        minimumPhase: 'development',
      },
    ],
  },
  {
    id: 'chain-reverse-crunch',
    name: 'Reverse Crunch',
    exerciseId: 'ex-reverse-crunch',
    measurementKind: 'reps',
    variations: [
      {
        id: 'var-reverse-crunch',
        name: 'Reverse Crunch',
        execution: 'Lying down, curling the pelvis toward the ribs.',
        formRequirements: [
          'Movement comes from curling the pelvis, not swinging the legs',
          'Lower back stays in contact with the floor',
          'Controlled return — no dropping the legs',
        ],
        difficultyScore: 7,
      },
      {
        id: 'var-reverse-crunch-slow',
        name: 'Slow Reverse Crunch',
        execution: 'Three seconds to lower on every rep.',
        formRequirements: [
          'A counted three-second lower',
          'No momentum at the top of the rep',
          'Same range on every rep of the set',
        ],
        difficultyScore: 11,
      },
      {
        id: 'var-candlestick-reverse-crunch',
        name: 'Candlestick Reverse Crunch',
        execution: 'Hips travel high above the shoulders before lowering under control.',
        formRequirements: [
          'Hips clearly stack above the shoulders',
          'Descent takes at least three seconds',
          'Neck stays neutral — no pushing through the head',
        ],
        difficultyScore: 17,
        minimumPhase: 'ascension',
      },
    ],
  },
] as const;

function buildCatalog(): {
  variations: ExerciseVariation[];
  chains: ProgressionChain[];
} {
  const variations: ExerciseVariation[] = [];
  const chains: ProgressionChain[] = [];

  for (const chain of CHAIN_SPECS) {
    const ids: string[] = [];
    chain.variations.forEach((spec, index) => {
      const previous = index > 0 ? chain.variations[index - 1] : undefined;
      variations.push({
        id: spec.id,
        exerciseId: chain.exerciseId,
        chainId: chain.id,
        name: spec.name,
        tier: index,
        previousVariationId: previous?.id ?? null,
        measurementKind: chain.measurementKind,
        minimumPhase: spec.minimumPhase ?? 'awakening',
        execution: spec.execution,
        formRequirements: spec.formRequirements,
        difficultyScore: spec.difficultyScore,
      });
      ids.push(spec.id);
    });
    chains.push({ id: chain.id, name: chain.name, variationIds: ids });
  }

  return { variations, chains };
}

const catalog = buildCatalog();

export const EXERCISE_VARIATIONS: readonly ExerciseVariation[] = catalog.variations;
export const PROGRESSION_CHAINS: readonly ProgressionChain[] = catalog.chains;

export const EXERCISES_BY_ID: ReadonlyMap<string, Exercise> = new Map(
  EXERCISES.map((exercise) => [exercise.id, exercise]),
);

export const VARIATIONS_BY_ID: ReadonlyMap<string, ExerciseVariation> = new Map(
  EXERCISE_VARIATIONS.map((variation) => [variation.id, variation]),
);

export const CHAINS_BY_ID: ReadonlyMap<string, ProgressionChain> = new Map(
  PROGRESSION_CHAINS.map((chain) => [chain.id, chain]),
);

/** Variations belonging to a chain, easiest first. */
export function variationsInChain(chainId: string): ExerciseVariation[] {
  return EXERCISE_VARIATIONS.filter((variation) => variation.chainId === chainId).sort(
    (a, b) => a.tier - b.tier,
  );
}
