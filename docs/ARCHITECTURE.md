# Architecture

How BodyForge is put together, and why. The README covers what the app does and
how to run it; this covers the shape of the code.

---

## The layering

Dependencies point one direction only. A layer knows the contract of the layer
below it and nothing about how it is implemented.

```
┌──────────────────────────────────────────────────────────────┐
│  app/                    Expo Router routes                  │
│                          Thin: each file mounts one feature  │
├──────────────────────────────────────────────────────────────┤
│  src/features/           Screens and their components        │
│  src/components/         Reusable primitives                 │
│  src/core/               The Core (Skia)                     │
│  src/stores/             Transient UI state (Zustand)        │
├──────────────────────────────────────────────────────────────┤
│  src/services/           Application services                │
│                          The only API a screen may call      │
├──────────────────────────────────────────────────────────────┤
│  src/domain/             Pure rules. No I/O, no clock.       │
│                          Depended on by services, not vice   │
│                          versa.                              │
├──────────────────────────────────────────────────────────────┤
│  repositories/interfaces.ts   Repository contracts           │
├──────────────────────────────────────────────────────────────┤
│  repositories/sqlite.ts       The only files that write SQL  │
├──────────────────────────────────────────────────────────────┤
│  sqlDatabase.ts               The SQL port                   │
├──────────────────────────────────────────────────────────────┤
│  expo-sqlite  /  node:sqlite (tests)                         │
└──────────────────────────────────────────────────────────────┘
```

**Why the SQL port exists.** `SqlDatabase` is a five-method interface. In the
app it is backed by `expo-sqlite` through `expoAdapter.ts`; in tests it is
backed by Node's built-in SQLite through `src/testing/nodeSqlite.ts`. That means
persistence tests exercise real SQL — real migrations, real constraints, real
joins — instead of a hand-written fake that agrees with the code by
construction. It also means swapping the driver later touches one adapter.

**Why services exist.** A screen that reached into repositories directly would
have to know the domain rules too — how XP is computed, when the rotation
advances, what counts as a personal best. Services own that composition, so a
screen calls `completeSession(id)` and gets back a summary it can render.

---

## Data model

Three entities that are easy to conflate are deliberately separate:

| Concept                          | Type                      | Example                                  |
| -------------------------------- | ------------------------- | ---------------------------------------- |
| The movement                     | `Exercise`                | Push-Up                                  |
| A difficulty of it               | `ExerciseVariation`       | Slow Push-Up (tier 1 of `chain-push-up`) |
| How a template asks for it today | `WorkoutTemplateExercise` | 3 × 7–10, 90 s rest                      |
| What actually happened           | `ExercisePerformance`     | 3 sets of 9, on 21 Aug                   |

An `ExercisePerformance` carries **its own copy** of the prescription and of
both names. When a player progresses from Regular Push-Up to Slow Push-Up, the
template's `variation_id` changes — and every past session still reads "Regular
Push-Up, 3 × 7–10", because that is what was actually prescribed and performed.
This is enforced by a test (`preserves what was prescribed at the time, even
after the template changes`).

Progression chains are data (`src/domain/program/catalog.ts`), not markup. The
Skills tree reads its nodes and edges from the same records the seeder writes,
so adding a variation is a data edit.

---

## State: what lives where

| Kind of state                                          | Home                           | Why                                                                        |
| ------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------- |
| Recorded training, measurements, progression, settings | SQLite                         | Durable, the single source of truth                                        |
| Current exercise, stepper values, rest anchor          | Zustand (`activeWorkoutStore`) | Transient; needs to be read synchronously during render                    |
| Settings mirror                                        | Zustand (`settingsStore`)      | Motion and haptics are read from render and worklet code that cannot await |

The database is never copied into a store. The settings store is a write-through
mirror hydrated once at boot; SQLite still owns the values.

**The rest timer stores a timestamp, not a countdown.** `restSecondsRemaining()`
recomputes from `startedAt`, `durationSeconds` and accumulated pause time on
every read. Backgrounding the app, navigating away, or a dropped frame cannot
make it drift — and the anchor is persisted, so a relaunch mid-rest resumes with
the correct remaining time.

---

## One source of truth for player state

The reference prototype showed Level 14 on one screen and Level 18 on another.
That class of bug is designed out:

- `PlayerProfile.totalXp` is the only stored progression number.
- Level, phase and Core stage are **derived** by `resolveLevel`,
  `resolvePhaseState` and `coreStageForSessions` — never stored.
- Every screen reads the same `PlayerState` read model from `PlayerService`.

`src/features/__tests__/data-consistency.test.tsx` renders System and Status
over one database and asserts their level, XP and phase strings match.

---

## The Core

`src/core/coreGeometry.ts` is pure: given a stage it returns a facet count,
irregularity, energy and rim values, a particle field, and a closed polygon.
Vertex jitter comes from a hash of the vertex index, not `Math.random`, so the
silhouette is stable across frames and launches.

`src/core/Core.tsx` renders that geometry in Skia — an atmosphere gradient, an
orbiting particle field, a blurred rim, a hard facet edge, contained internal
energy, the obsidian body with its own edge, a specular highlight, and the
heart. Three ambient motions run in the ambient band: a very slow rotation, a
breathing scale of about 1%, and drifting particles. Under reduced motion the
clock is stopped entirely — no frames are scheduled — and the Core renders as a
still composition with its energy intact.

There are no image assets.

---

## Motion and accessibility

`src/motion/motion.ts` defines the six-level hierarchy and every duration in the
app. A component picks a level; it does not choose a number.

`useMotionPreference()` resolves the OS Reduce Motion setting against the
in-app preference. `reduceDuration()` shortens rather than removes, so feedback
survives. Status is never carried by colour alone: locked nodes carry a lock
glyph and a dashed border, mastered nodes a check, and every state has a text
label.

---

## Testing strategy

Three tiers, aimed at what could corrupt progress rather than at coverage:

1. **Domain** (`src/domain/__tests__/`) — pure functions, fast, exhaustive on
   edge cases: level curve monotonicity across the whole range, XP that cannot
   be farmed, phases that never regress, mastery that needs two real sessions.
2. **Persistence** (`src/database/__tests__/`, `src/services/__tests__/`) —
   run against Node's SQLite under `@jest-environment node`. Seeding, A/B
   alternation, set logging, unilateral values, timed holds, active-session
   recovery, progression confirmation, backup round-trip and rejection.
3. **Screens** (`src/features/**/__tests__/`) — rendered over a real migrated
   database through the real service layer, so a passing test means the screen
   works against genuine persistence.

`src/testing/renderWithServices.tsx` provides both `renderWithServices` (fresh
database) and `renderOverServices` (same database, second render — how a
relaunch or a screen change is reproduced).

Note for future contributors: with React Testing Library 14's async renderer,
`await fireEvent.press(...)` rather than wrapping presses in `act()`. Mixing
manual `act` with the async renderer leaves the act queue unbalanced and breaks
every subsequent render in the file.

---

## Platform notes

Native is the target. Two files exist only for web and do not affect it:

- `metro.config.js` — resolves the `.wasm` asset for `expo-sqlite` and sends the
  cross-origin isolation headers its worker needs.
- `index.js` — loads CanvasKit before requiring `expo-router/entry`. Skia's web
  module reads CanvasKit off the global object _at import time_, so loading it
  during boot is too late; it has to happen before the app's module graph is
  evaluated.

`scripts/prepare-web-assets.js` copies `canvaskit.wasm` from node_modules into
`public/` on install. The binary is not committed.
