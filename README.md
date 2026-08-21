# BodyForge

A dark, local-first bodyweight strength-training app for iOS and Android, built
around a progression System that reacts to training you have actually recorded.

Everything runs on the device. There is no account, no server, no analytics and
no network dependency — the app works fully offline, and the only way data
leaves it is a backup file you choose to export.

---

## What it does

Training drives everything else:

```
Training → Quests → Performance → XP → Attributes → Progression → Levels → Phases
```

- **System** — the home screen. One dominant visual (the Core), the player's
  level and XP, the current phase, and one directive: what to do next.
- **Main Quest** — the workout. One exercise at a time, large one-handed
  controls, left/right values for single-leg work, and every set written to
  disk the instant it is logged.
- **Status** — four attributes derived only from recorded training, each with a
  breakdown naming the sessions behind it.
- **Skills** — a connected progression tree. Harder variations unlock when the
  player confirms they can meet the technique standard, never automatically.
- **History** — real charts over recorded rows: bodyweight, waist, and best
  working set per session.
- **Settings** — profile, training preferences, motion and haptics, and local
  data export / import / reset.

---

## Running it

Requires Node 20+ and npm.

```bash
npm install          # also copies CanvasKit into public/ for the web target
npm start            # Expo dev server; press i / a, or scan the QR code
```

Platform shortcuts:

```bash
npm run ios          # open in the iOS simulator (macOS only)
npm run android      # open in an Android emulator or device
npm run web          # run in a browser
```

**Expo Go vs a development build.** The app uses `react-native-skia`,
`expo-sqlite` and `react-native-reanimated`, all of which are included in Expo
Go for this SDK, so `npm start` and scanning the QR code is enough for day-to-day
work. Build a development client only if you add a native module that Expo Go
does not bundle:

```bash
npx expo prebuild        # generates ios/ and android/
npx expo run:ios         # or run:android
```

### Checks

```bash
npm run typecheck    # tsc --noEmit, strict
npm run lint         # eslint
npm test             # jest
npm run verify       # all three
npm run format       # prettier --write
```

---

## Architecture

Dependencies point one way. Nothing above a boundary knows how the layer below
it is implemented.

```
app/                    Expo Router routes — thin, they only mount features
src/features/           Screens and their components, grouped by domain
src/components/         Reusable primitives (Text, Button, Sheet, Stepper, …)
src/core/               The Core: procedural Skia geometry and rendering
        ↓
src/services/           Application services — the only API screens call
        ↓
src/database/repositories/interfaces.ts    Repository contracts
        ↓
src/database/repositories/sqlite.ts        The only files that write SQL
        ↓
src/database/sqlDatabase.ts                The SQL port
        ↓
expo-sqlite
```

Supporting modules:

| Path                       | What lives there                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/domain/`              | Pure rules: XP, levels, phases, rotation, mastery, attributes, personal bests, Core stages. No storage, no clock beyond what is passed in. |
| `src/domain/program/`      | The movement catalog and the starting program, as data.                                                                                    |
| `src/design/`              | Palette, type scale, spacing, font loading.                                                                                                |
| `src/motion/`              | Motion hierarchy, reduced-motion resolution, the haptic language.                                                                          |
| `src/stores/`              | Zustand: transient UI state only.                                                                                                          |
| `src/database/migrations/` | Explicit, versioned schema steps.                                                                                                          |

### Two rules that shape the code

**1. SQLite is the source of truth; Zustand is not.**
Zustand holds the current exercise, the values dialled into the steppers, and
the rest timer's anchor. Recorded sets are written to SQLite immediately, so an
interrupted workout resumes from disk. The database is never mirrored into a
store.

**2. History is immutable.**
An `Exercise` is a movement, an `ExerciseVariation` is a difficulty of it, and a
`WorkoutTemplateExercise` is how a template prescribes it today. A completed
`ExercisePerformance` carries its own copy of the prescription and the names in
force at the time, so changing a template later cannot rewrite what happened.

### One source of truth for player state

Level and XP derive from a single stored total. Every screen reads the same
`PlayerState` read model, so no two screens can disagree — there is a test that
renders System and Status over one database and asserts their numbers match.

---

## Product rules worth knowing

**XP does not reward volume.** Only prescribed sets earn set XP, extra sets earn
nothing, and reps beyond the top of the range earn nothing. All values live in
`src/domain/xp.ts` and can be rebalanced in one edit.

**Phases advance on completed sessions, never on the calendar.** Awakening runs
to session 12, Development to 24, then Ascension. Missing a week changes
nothing, and there is no decay or penalty anywhere in the app.

**Progression is confirmed, not assumed.** The app cannot see form. When every
prescribed set has reached the top of the range in two sessions, the variation
is marked ready; the player then reads the technique standard for the next
variation and confirms. That confirmation is the unlock.

**Attributes are System scores, not measurements.** Strength, Endurance,
Consistency and Mastery are each derived from recorded rows, and each one can
name the sessions behind its value. Nothing is estimated.

---

## Motion and haptics

Motion has a hierarchy, defined once in `src/motion/motion.ts`:

| Level       | Used for                                | Duration                |
| ----------- | --------------------------------------- | ----------------------- |
| Micro       | Taps, counters, toggles                 | 80–180 ms               |
| Interaction | Set actions, sheets, controls           | 180–350 ms              |
| Transition  | Exercise and screen changes             | 300–500 ms              |
| Reward      | Exercise completion                     | 500–900 ms              |
| Milestone   | Personal best, level-up, quest complete | 1–2 s                   |
| Ambient     | The Core's idle life                    | Continuous, very subtle |

The operating system's Reduce Motion setting is respected by default and can be
overridden in Settings. Under reduced motion, animations shorten to a
cross-fade rather than disappearing, so feedback is never lost. Haptics map to
named events (`setComplete`, `personalBest`, `questComplete`, …) and can be
turned off.

## The Core

The Core is generated, not drawn or imported. Its silhouette, internal energy,
rim light, structure lines and particle field are all derived from a
deterministic stage — Dormant, Awakened, Charged, Evolved, Ascendant — which
advances on completed sessions. See `src/core/coreGeometry.ts` for the geometry
and `src/core/Core.tsx` for the renderer. There are no image assets.

## Testing

Tests cover the logic that could corrupt progress or make training incorrect,
rather than chasing coverage:

- **Domain** — XP, levels, phases, A/B rotation, mastery qualification,
  attributes, personal bests, Core stages.
- **Persistence** — run against Node's built-in SQLite, so migrations,
  constraints and joins are genuinely exercised: seeding, set logging,
  unilateral values, timed holds, active-session recovery, export/import.
- **Screens** — Main Quest logging and rest, Quest Complete recording and XP,
  the Skills confirmation flow, and cross-screen data consistency.

## Web

iOS and Android are the targets; web works and is useful for quick checks. Two
web-only pieces exist: `metro.config.js` resolves the SQLite WebAssembly binary
and sends the cross-origin isolation headers it needs, and `index.js` loads
CanvasKit before the app's module graph so Skia is ready when it evaluates.
Neither affects the native path.

## Not in this version

No authentication, cloud sync, backend, subscriptions, social features,
leaderboards, AI coaching, calorie or macro tracking, wearables, Apple Health,
Health Connect, push notifications, streak penalties or ads.
