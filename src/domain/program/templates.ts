import type { Prescription, WorkoutTemplate, WorkoutTemplateExercise } from '../types';

/**
 * The starting program.
 *
 * Two templates alternate sequentially. Both lead with legs, because the plan
 * this app was built around emphasises them, and both finish with a short brace
 * or core movement. Rest values are the recommended point inside the suggested
 * ranges from the program design.
 */

export const WORKOUT_TEMPLATES: readonly WorkoutTemplate[] = [
  {
    id: 'template-workout-a',
    name: 'Workout A',
    focus: 'Legs + Push',
    rotationOrder: 0,
  },
  {
    id: 'template-workout-b',
    name: 'Workout B',
    focus: 'Legs + Upper Body',
    rotationOrder: 1,
  },
] as const;

interface EntrySpec {
  variationId: string;
  prescription: Prescription;
}

function entries(templateId: string, specs: EntrySpec[]): WorkoutTemplateExercise[] {
  return specs.map((spec, index) => ({
    id: `${templateId}-e${index + 1}`,
    templateId,
    variationId: spec.variationId,
    position: index,
    prescription: spec.prescription,
  }));
}

const WORKOUT_A_ENTRIES = entries('template-workout-a', [
  {
    variationId: 'var-bss-standard',
    prescription: {
      sets: 3,
      targetMin: 8,
      targetMax: 12,
      restSeconds: 120,
      tempo: null,
      cues: [
        'Front shin close to vertical at the bottom.',
        'Rear leg is for balance — the front leg does the work.',
        'Complete all reps on one side, then switch.',
      ],
    },
  },
  {
    variationId: 'var-squat-slow',
    prescription: {
      sets: 3,
      targetMin: 12,
      targetMax: 15,
      restSeconds: 90,
      tempo: '3s down · 1s pause · stand normally',
      cues: [
        'Count the descent — three full seconds.',
        'Hold one second at the bottom without bouncing.',
        'Heels stay down for the whole rep.',
      ],
    },
  },
  {
    variationId: 'var-glute-bridge-single-leg',
    prescription: {
      sets: 3,
      targetMin: 10,
      targetMax: 15,
      restSeconds: 90,
      tempo: null,
      cues: [
        'Drive through the heel of the planted foot.',
        'Keep the pelvis level — do not let it drop toward the free leg.',
        'Squeeze at the top rather than arching the lower back.',
      ],
    },
  },
  {
    variationId: 'var-calf-raise-single-leg',
    prescription: {
      sets: 3,
      targetMin: 15,
      targetMax: 20,
      restSeconds: 90,
      tempo: null,
      cues: [
        'Full stretch at the bottom, full rise at the top.',
        'Use a wall for balance only, not for support.',
        'No bouncing out of the bottom.',
      ],
    },
  },
  {
    variationId: 'var-push-up-regular',
    prescription: {
      sets: 3,
      targetMin: 7,
      targetMax: 10,
      restSeconds: 90,
      tempo: null,
      cues: [
        'One line from head to heels.',
        'Elbows back at roughly 45°, not flared wide.',
        'Chest to within a fist of the floor.',
      ],
    },
  },
  {
    variationId: 'var-pike-high-incline',
    prescription: {
      sets: 3,
      targetMin: 4,
      targetMax: 8,
      restSeconds: 90,
      tempo: null,
      cues: [
        'Knees may stay bent — that is fine here.',
        'Hips stay high; the torso should feel close to vertical.',
        'Start from a comfortable incline rather than forcing floor reps.',
      ],
    },
  },
  {
    variationId: 'var-plank',
    prescription: {
      sets: 3,
      targetMin: 30,
      targetMax: 45,
      restSeconds: 60,
      tempo: null,
      cues: [
        'Ribs down, glutes on.',
        'Hips level — stop the set when they start to sag.',
        'Breathe normally throughout the hold.',
      ],
    },
  },
]);

const WORKOUT_B_ENTRIES = entries('template-workout-b', [
  {
    variationId: 'var-reverse-lunge',
    prescription: {
      sets: 3,
      targetMin: 8,
      targetMax: 12,
      restSeconds: 90,
      tempo: null,
      cues: [
        'Step back and lower straight down.',
        'Rear knee to within a fist of the floor.',
        'Torso stays upright.',
      ],
    },
  },
  {
    variationId: 'var-bss-standard',
    prescription: {
      sets: 3,
      targetMin: 8,
      targetMax: 12,
      restSeconds: 120,
      tempo: null,
      cues: [
        'Front shin close to vertical at the bottom.',
        'Rear leg is for balance — the front leg does the work.',
        'Complete all reps on one side, then switch.',
      ],
    },
  },
  {
    variationId: 'var-glute-bridge-single-leg',
    prescription: {
      sets: 3,
      targetMin: 10,
      targetMax: 15,
      restSeconds: 90,
      tempo: null,
      cues: [
        'Drive through the heel of the planted foot.',
        'Keep the pelvis level.',
        'Full hip extension at the top.',
      ],
    },
  },
  {
    variationId: 'var-calf-raise-single-leg',
    prescription: {
      sets: 3,
      targetMin: 15,
      targetMax: 20,
      restSeconds: 90,
      tempo: null,
      cues: [
        'Full stretch at the bottom, full rise at the top.',
        'Use a wall for balance only.',
        'Knee stays straight.',
      ],
    },
  },
  {
    variationId: 'var-close-grip-push-up',
    prescription: {
      sets: 3,
      targetMin: 5,
      targetMax: 10,
      restSeconds: 90,
      tempo: null,
      cues: [
        'Hands somewhat narrower than a normal push-up.',
        'They do not need to form a diamond.',
        'Elbows stay close to the ribs.',
      ],
    },
  },
  {
    variationId: 'var-pike-high-incline',
    prescription: {
      sets: 3,
      targetMin: 4,
      targetMax: 8,
      restSeconds: 90,
      tempo: null,
      cues: [
        'Knees may stay bent.',
        'Hips stay high.',
        'Progress by lowering the incline, not by forcing floor reps.',
      ],
    },
  },
  {
    variationId: 'var-reverse-crunch',
    prescription: {
      sets: 3,
      targetMin: 10,
      targetMax: 15,
      restSeconds: 90,
      tempo: null,
      cues: [
        'Curl the pelvis rather than swinging the legs.',
        'Lower back stays on the floor.',
        'Lower under control.',
      ],
    },
  },
]);

export const WORKOUT_TEMPLATE_EXERCISES: readonly WorkoutTemplateExercise[] = [
  ...WORKOUT_A_ENTRIES,
  ...WORKOUT_B_ENTRIES,
];

/** Approximate session length, from prescribed sets, rest, and working time. */
export const ESTIMATED_SECONDS_PER_SET = 45;

export function estimateDurationSeconds(prescriptions: readonly Prescription[]): number {
  return prescriptions.reduce((total, prescription) => {
    const working = prescription.sets * ESTIMATED_SECONDS_PER_SET;
    const resting = Math.max(0, prescription.sets - 1) * prescription.restSeconds;
    return total + working + resting;
  }, 0);
}
