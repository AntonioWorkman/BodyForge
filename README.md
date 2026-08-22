# BodyForge

[![CI](https://github.com/AntonioWorkman/BodyForge/actions/workflows/ci.yml/badge.svg)](https://github.com/AntonioWorkman/BodyForge/actions/workflows/ci.yml)

BodyForge is a dark, local-first strength-training app for iOS and Android. It is built around a progression system that reacts only to training the player has actually recorded.

## Local-first and private

Everything runs on the device. There is no account, no server, no analytics and no network dependency — the app works fully offline. Your training data lives in a SQLite database on your phone and nowhere else. The only way data leaves the app is a backup file you explicitly export, to a destination you choose.

## Release posture

> This repository is being hardened to production-quality engineering standards, but that is not the same as claiming the app is store-ready. Automated verification is in place; native runtime validation, release signing/configuration, dependency/security review, and final device QA must still be completed before a production release.

## The loop

```
Observe → Analyze → Recommend → User Approves → Adapt → Measure
```

The System observes what you recorded, analyses it against the prescription, recommends a next step — and waits. Progression to a harder movement is never automatic: you confirm it against a technique standard, because the app cannot see your form. Then the program adapts, and the result is measured against real recorded work.

## Features

| Screen         | What it does                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **System**     | The home screen. One dominant visual — the Core — with your level, XP, phase, and one directive: what to do next.                                                 |
| **Main Quest** | The workout. One exercise at a time, large one-handed controls, independent left/right values for single-leg work, and every set written to disk as it is logged. |
| **Status**     | Four attributes derived only from recorded training, each able to name the sessions behind its value.                                                             |
| **Skills**     | A connected progression tree. Harder variations unlock when you confirm you can meet their technique standard, and never before your phase reaches them.          |
| **History**    | Real charts over recorded rows: bodyweight, waist, and best working set per session.                                                                              |
| **Settings**   | Profile, training preferences, motion and haptics, and local data export / import / reset.                                                                        |

## Tech stack

React Native · Expo SDK 57 · TypeScript (strict) · Expo Router · Expo SQLite · Zustand · Zod · React Native Skia · Reanimated · Gesture Handler · Jest + React Native Testing Library

## Architecture

Dependencies point one way. Each layer knows the contract of the one below it and nothing about how it is implemented.

```
app/ routes
     ↓
features
     ↓
services
     ↓
repository interfaces
     ↓
SQLite repository implementations
     ↓
SqlDatabase
     ↓
expo-sqlite
```

| Path                  | Responsibility                                                         |
| --------------------- | ---------------------------------------------------------------------- |
| `app/`                | Expo Router routes. Thin — each file mounts one feature.               |
| `src/features/`       | Screens and their components, grouped by domain.                       |
| `src/components/`     | Reusable primitives reading from central tokens.                       |
| `src/core/`           | The Core: procedural Skia geometry and rendering.                      |
| `src/services/`       | Application services — the only API a screen may call.                 |
| `src/domain/`         | Pure rules: XP, levels, phases, rotation, mastery, attributes. No I/O. |
| `src/domain/program/` | The movement catalog and starting program, as data.                    |
| `src/database/`       | Migrations, the SQL port, repositories, unit of work.                  |
| `src/design/`         | Palette, type scale, spacing, font loading.                            |
| `src/motion/`         | Motion hierarchy, reduced-motion resolution, haptic language.          |
| `src/stores/`         | Zustand: transient UI state only.                                      |
| `src/testing/`        | Test doubles and fault-injection harnesses.                            |

## Data and correctness guarantees

- **SQLite is the source of truth.** Zustand holds only transient UI state — the current exercise, stepper drafts, the rest anchor — plus a write-through settings mirror for values that must be read synchronously.
- **Completed history is immutable.** A recorded performance snapshots the prescription and the names in force at the time, so representing a template later cannot rewrite what happened.
- **`totalXp` is the stored progression value.** Level, phase and Core stage are derived, never stored, so no two screens can disagree.
- **One transaction per command.** A service command that writes to more than one table runs inside a single unit of work, and rolls back entirely on failure.
- **Preconditions are checked at the same consistency boundary as the mutation.** Commands re-read their state inside the transaction and apply conditional state transitions, so a duplicate or concurrent caller is rejected by the database rather than by timing.
- **At most one quest is active.** Enforced both by the starting command and by a unique index on active sessions, so the state is impossible rather than merely avoided.
- **Onboarding creates a player, it never replaces one.** A second attempt is refused; XP, rotation and history cannot be reset by re-running setup.
- **The session lifecycle is enforced below the UI.** Completed history accepts no new sets, cannot be discarded through an active-quest command and cannot be reclassified. Transient quest state exists only while a quest is active, and is removed when it completes or is abandoned.
- **Progression is explicit.** The app cannot see your form; it presents the technique standard and waits for you to confirm.
- **Phase gates are enforced below the UI.** A disabled button is not a correctness boundary.
- **Backup JSON is untrusted input.** Validation enforces BodyForge's own invariants, not just what SQLite would accept: completed history only, required completion fields, parseable timestamps, coherent prescriptions, and one current variation per chain. Nothing is written until the whole document passes.
- **Avatar media is not portable in JSON.** The format carries no image data, so an imported backup never restores a path from another installation.
- **Destructive operations report truthfully.** A reset either completes and leaves a usable first-launch state, or changes nothing — it never reports failure after deleting.

## Training rules

- **XP cannot be farmed.** Only prescribed sets earn set XP; extra sets earn nothing; reps beyond the top of the range earn nothing.
- **Phases advance on completed sessions, never the calendar.** Missing a week changes nothing. There is no decay and no streak penalty anywhere in the app.
- **A quest completes only when it is finished.** Every prescribed set must be recorded — otherwise no XP, no rotation advance, no phase or Core progression.
- **Attributes are System scores, not measurements.** Strength, Endurance, Consistency and Mastery are each derived from recorded rows, and each can name the sessions behind its value. Nothing is estimated, and the app never presents a value it did not calculate from your training.

## The Core

The Core is generated, not drawn or imported. Its silhouette, internal energy, rim light, structure lines and particle field are all derived from a deterministic stage — Dormant, Awakened, Charged, Evolved, Ascendant — which advances on completed sessions. Vertex jitter comes from a hash rather than `Math.random`, so the same state always renders the same Core. There are no image assets, and no third-party artwork.

## Local development

Requires **Node.js 22+** (the persistence tests run against the built-in `node:sqlite`).

```bash
npm ci          # also copies CanvasKit into public/ for the web target
npm start       # Expo dev server; press i / a, or scan the QR code

npm run ios     # open in the iOS simulator (macOS only)
npm run android # open in an Android emulator or device
npm run web     # run in a browser
```

Day-to-day work needs only Expo Go. Build a development client if you add a native module Expo Go does not bundle.

## Device builds (EAS)

Native projects are generated, not committed — `ios/` and `android/` are gitignored and produced by `expo prebuild`. Builds run on [EAS](https://docs.expo.dev/build/introduction/).

Three profiles in `eas.json`, all pinned to the same Node version CI uses so a build is reproducible:

| Profile       | Purpose                                                  | iOS                 | Android |
| ------------- | -------------------------------------------------------- | ------------------- | ------- |
| `development` | On-device iteration with the dev client and fast refresh | ad-hoc, real device | APK     |
| `preview`     | Internal testing of a release-configuration build        | ad-hoc, real device | APK     |
| `production`  | Store submission                                         | App Store           | AAB     |

```bash
npx eas login              # once, with the account owning the EAS project
npm run device:register    # iOS only: register a device UDID for ad-hoc builds

npm run build:dev:android  # APK — install directly, no Apple account needed
npm run build:dev:ios      # requires an Apple Developer account
npm run build:preview:android
npm run build:preview:ios
npm run build:production
```

Android needs only an Expo account. iOS device builds additionally need an Apple Developer account: every physical device must be registered by UDID before it can appear in an ad-hoc provisioning profile, or the build succeeds and then refuses to install.

### Permissions

The app ships the smallest set it can, and the config asserts that rather than accepting whatever the dependencies bring:

- `expo-image-picker` declares `cameraPermission: false` and `microphonePermission: false`. The avatar flow only ever calls `launchImageLibraryAsync`, so the camera and microphone permissions its plugin adds by default — `RECORD_AUDIO` among them — are blocked. An app that says nothing leaves the device should not ask for a microphone it never opens.
- `SYSTEM_ALERT_WINDOW`, which React Native contributes for its dev overlay, is blocked from shipped builds.

That leaves `INTERNET`, `VIBRATE`, and the legacy storage permissions capped at `maxSdkVersion=32`. After changing anything here, re-check the real manifest rather than trusting the config:

```bash
npx expo prebuild --no-install --platform android
grep uses-permission android/app/src/main/AndroidManifest.xml
rm -rf ios android
```

Entries carrying `tools:node="remove"` are stripped during manifest merge and do not reach the APK.

## Verification

```bash
npm run verify        # typecheck + lint + format:check + test
npm run typecheck
npm run lint
npm test
npm run format:check
```

## CI

Every pull request and every push to `main` runs, from a clean checkout:

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test`
- iOS bundle export
- Android bundle export

The bundle export earns its place: a type-correct app can still fail to bundle, and a web-only import once broke the native graph while every test stayed green.

## What automated checks do not prove

The suite is thorough about logic and persistence. It says nothing about the following, all of which remain **unverified** and are required before a production release:

- Physical iOS and Android cold launch on real devices
- Migration upgrade testing against databases created by earlier builds
- Background / process-kill recovery
- Interrupting a destructive operation (import, clear) mid-flight on device
- Avatar lifecycle against a real filesystem and photo picker
- Accessibility audit and reduced-motion behaviour on device
- Release-build performance and memory profile
- **An actual EAS build.** The build configuration is complete and its generated
  native output has been inspected, but no build has been run — that needs an
  Expo account, and iOS additionally needs an Apple Developer account.
- Code signing, and store metadata and review
- Ongoing dependency and security review
- A crash and error observability strategy

Icons, splash, bundle identifiers and the Android permission set are configured
and verified against generated native output; the remaining release items above
are not.

## Scope boundaries

Not in this project: authentication, cloud sync, backend services, subscriptions, social features, AI coaching, nutrition or macro tracking, wearables, Apple Health or Health Connect integrations, push notifications, and ads.

---

**The target is production-quality code before production claims.**
