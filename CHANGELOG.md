# Changelog

All notable changes to Hevy Ranks are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0-pre1] — 2026-07-12

Pre-release. Big UX pass across the whole app and a critical iOS
Safari fix. Ranking engine, coefficients and thresholds are
**unchanged** from v0.2 — your ranks won't move.

### Added

- **Results confetti:** the dashboard now lands with a canvas-based
  confetti burst colored from your top rank's palette (~200 particles,
  gravity + drag, HiDPI-aware). Fires only on fresh calculations —
  not on F5, not on the "Back to your results" shortcut. Skipped when
  `prefers-reduced-motion` is set.
- **Rank parade loader:** the plain spinner is replaced by the 9 rank
  emblems lighting up in sequence (climb-the-ladder animation), each
  glowing in its own color, with an indeterminate progress bar and a
  short hint. Existing step messages still surface on top of it.
- **Styled rank tooltip:** hovering an emblem on the landing rank
  strip now shows a dark tooltip with a colored border matching the
  rank, plus a colored glow + lift on the emblem itself. Replaces
  the native browser tooltip.
- **CSV client-side validation:** picked/dropped files are now
  checked for extension + MIME + size (max 20 MB) + non-emptiness
  before hitting the parser. Bad files are rejected with an explicit
  toast instead of failing deep in the CSV parser.
- **FileReader error handler:** clear message when the picked file
  is on iCloud Drive but hasn't been downloaded yet.

### Fixed

- **iOS Safari — CSV picker didn't return the selected file.** The
  `<label>` + `<input hidden>` structure was broken on iOS in two
  ways: `hidden` silences the input entirely, and the `clip-rect`
  fallback hits a known iOS bug where the picker opens, the file is
  chosen, and the `change` event never fires. Rewritten as a `<div>`
  dropzone with an overlay `<input type="file">`
  (`opacity:0`, `inset:0`) — the canonical iOS-safe pattern. Also
  widened `accept` to `.csv,text/csv,text/plain,application/vnd.ms-excel`
  so the CSV isn't greyed out in the Files picker (Hevy's export is
  often served as `text/plain` or `application/octet-stream`).

### Changed

- **Loader markup/styles:** now uses a shared `#rankParade` element
  with `.loading-bar` / `.loading-hint` instead of the old
  `.spinner`. Fully respects `prefers-reduced-motion`.
- **Dropzone markup:** the `<label>` is now a `<div>` (no more
  `for=`), and the input is CSS-overlaid on top of the whole zone.

### Removed

- Legacy `.spinner` CSS class (no longer referenced anywhere).
- `visually-hidden-file` utility class (replaced by the overlay
  pattern).

### Notes

- Prerelease naming: `-pre1` is a pre-release identifier per SemVer.
  Bump to `0.3.0` (no suffix) when tagging the stable release.

## [0.2.2] — 2026-07-12

### Changed

- **README:** header now displays all 9 rank emblems (Bronze → Mythic)
  instead of a subset of 5.
- **README:** Roadmap section reorganized into a proper TODO with
  Done / Planned / Ideas / Ongoing buckets, so contributors and users
  can see what's next at a glance.

## [0.2.1] — 2026-07-12

### Fixed

- **Engine:** `computeRanks` returned `hasData: true` for a group when
  `bodyweightKg` was missing or invalid, while `tier` and `eqRatio` were
  `null`. Any consumer reading `group.tier.name` on that basis would
  crash. `hasData` now also requires a computable composite ratio.

## [0.2.0] — 2026-07-12

Big calibration overhaul, driven by the first wave of community feedback on
r/Hevy. Ranks are now much less gameable by isolation lifts and stray demo
sets, and the top of the scale is spread out so Mythic actually stays rare.

### Changed

- **Composite scoring.** A muscle group's rank is now a weighted average of
  your top 3 compound lifts (weights: 1.0 / 0.5 / 0.25), instead of your
  single best lift. One PR alone can no longer carry the whole group.
- **Isolation exercises are demoted.** Calf press, back extension /
  hyperextension, pec deck / flyes, shrugs, lateral raises, most curls and
  triceps extensions are flagged as isolation and no longer count when at
  least one compound exercise is available for the group. As a last-resort
  fallback (no compound found) they are used but the rank is capped at
  Titan.
- **Minimum 3 sessions per exercise.** An exercise must have been trained on
  at least 3 distinct days to contribute to your rank. Fixes the classic
  "I did pec deck twice for a friend and it beat my bench" case. If **no**
  exercise in a group reaches 3 sessions, the group falls back to whatever
  data exists but its rank is capped at Platinum (so the group is never
  shown as "no data" when there's actually something to score).
- **Rebalanced coefficients.** Machine and isolation lifts had coefficients
  too low, which inflated their normalized scores. Updated notably:
  calf press 1.3 → 2.8, back extension (new entry) 2.0, pec deck 0.5 → 0.8,
  shrugs 1.6 → 1.9, triceps pushdown 1.6 → 1.9, leg extension 0.7 → 0.9,
  leg curl 0.6 → 0.8, lateral raise 0.35 → 0.5.
- **Top thresholds spread out.** The Colossus / Olympian / Mythic tiers now
  require noticeably more strength (e.g. Legs Mythic 2.5× → 3.0× bodyweight
  on squat equivalent). Bronze / Iron / Gold are unchanged so beginners
  aren't penalized.

### Added

- New exercise entries: `back extension` / `hyperextension`, `adductor` /
  `abductor`.
- Public API: `unmatchedDetails` map with per-exercise session count and
  reason (`unknown` or `no_load`), for the UI to surface exercises that
  were skipped.
- Dashboard: expandable per-group panel showing the exact composite,
  the used lifts, and the excluded ones (with reason).
- Dashboard: "Exercises not counted" section listing unrecognized
  strength lifts (cardio silently ignored).
- Footer: app version + link to this changelog and to the GitHub repo.
- In-app "How it works" page rewritten to match the new composite logic.

### Notes

- CLI output still shows a single "best" lift per group for readability, but
  under the hood it is the top contributor of the new composite score.
- Percentile-based ranks (vs. other users) are still tracked as a possible
  future direction; they would require an opt-in backend and are not part
  of this release.

## [0.1.0] — 2026-07-12

Initial public release. Bronze → Mythic per muscle group, computed from a
single best lift (Epley 1RM ÷ coefficient ÷ bodyweight). CSV import and
Hevy API modes, 100% client-side.
