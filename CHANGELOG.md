# Changelog

All notable changes to Hevy Ranks are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0-pre1] — 2026-07-13

Pre-release. Includes the v0.3.1 hotfix content on top of a full visual
overhaul (glassmorphism design language).

### Changed

- **Design overhaul — glassmorphism.** The whole UI is rebuilt on a
  frosted-glass system: translucent surfaces with real
  `backdrop-filter` blur, thin luminous borders, an inset top
  highlight that catches "light" like a real pane, and a new ambient
  background made of four drifting colored radial blobs (blue /
  purple / cyan / pink) that give the blur something rich to work
  on. A single `--glass-*` token block drives every panel, card,
  dropdown, input, toast, tooltip, badge and table, so the DA stays
  uniform across all screens. Primary CTAs and the brand mark now
  use a bluish-purple gradient with a colored ambient shadow.
  Progressive-enhancement fallback for browsers without
  `backdrop-filter` keeps text fully legible. Reduced-motion users
  get the ambient blob drift disabled automatically.

### Added

- **Multilingual keyword coverage (ES + DE + PT + IT).** `GROUP_HINTS`
  and the `__skip__` cardio/mobility list now cover Spanish, German,
  Portuguese and Italian on top of English and French, so users whose
  Hevy app runs in any of these languages get the same title-based
  fallback quality. Also added many missing EN/FR variants
  (`Pallof`, `Meadows Row`, `Landmine Press`, `Belt Squat`,
  `Muscle Up`, cable crossover, farmer carry, tapis de course, etc.).
- **Multilingual coefficient matching (`GROUP_COEFFS`).** The
  per-exercise coefficient table now recognises ES + DE + PT + IT
  keywords for all major movements, so a Spanish `Prensa`, German
  `Beinpresse` or Italian `Pressa Gambe` gets the same coefficient
  (3.0) as the English `Leg Press` — instead of falling through to
  the group default (which was over-crediting foreign users on
  machine-friendly lifts like leg press / pushdown / calf raise).
  New entries covered: squat, deadlift, bench press, pull-up, row,
  shoulder press, lateral raise, calves, glutes, biceps curl,
  triceps pushdown, plus additions like `Belt Squat`, `Meadows Row`,
  `Landmine Press`, `Pallof Press`, `Cable Crossover`, `Farmer Carry`,
  `Ab Wheel`, `Sissy Squat`, etc. `bodyweightFraction()` extended to
  cover FR/ES/DE/PT/IT variants of pull-up / squat / push-up.
- **Fuzzy catalog lookup.** `buildCatalog()` now indexes each
  template by a *canonical* form (accents / punctuation / parens
  stripped, tokens sorted, only true fillers dropped — equipment and
  position kept because they discriminate templates). Titles like
  `Barbell Bench Press`, `Squat Barbell` or
  `Bench Press Barbell Close Grip` now find their exact catalog
  entries even though the stored form is `Bench Press (Barbell)` /
  `Squat (Barbell)` / `Bench Press - Close Grip (Barbell)`.

### Fixed

- **Word-boundary matching for compound languages.** `matchesWord()`
  now allows a trailing compound tail for single-word needles of ≥ 5
  chars, so German compounds like `Bankdrucken`, `Bizepscurl` and
  `Schulterdrucken` match hints `bank`, `bizeps`, `schulter`. Kept a
  strict leading boundary so short needles (`run`, `velo`, `up`)
  never over-match. Multi-word needles remain strict on their final
  word so `Pull Upright Row` doesn't false-match `pull up`.
- **`corda` no longer skips arm work.** The generic Portuguese /
  Italian token `corda` (used in `Trizeps na Corda` = rope triceps
  pushdown) was on the cardio skip list because of jump rope. Now
  only the specific multi-word forms (`salto de corda`,
  `salto della corda`, `corde a sauter`) trigger the skip, so triceps
  rope work is correctly routed to Arms.
- **Assisted-machine sign bug.** Assisted variants (`Pull Up (Assisted)`,
  `Chin Up (Band)`, `Dip (Assisted)`, and their FR / ES / DE / PT / IT
  equivalents) were treated as **added** weight instead of subtracted
  when the CSV title didn't match the English template catalog — the
  engine fell back to the default `weight_reps` type, so *more*
  assistance actually **inflated** the Back / Chest score. Fixed by
  detecting assisted / weighted variants directly from the exercise
  title (multilingual keyword detector) and overriding the load
  semantics accordingly. `effectiveLoad()` for `bodyweight_assisted`
  now returns `null` (skip the set) when assistance meets or exceeds
  bodyweight, instead of a bogus `0`.

## [0.3.0] — 2026-07-12

First stable release of the v0.3 line. Promotes `v0.3.0-pre1` to
stable with two additions: **actionable next-tier recommendations**
per muscle group and an **API-key mode reliability hint**. Ranking
engine, coefficients and thresholds are **unchanged from v0.2** —
existing users' ranks won't move.

### Added

- **Actionable next-tier recommendations.** Each muscle group now shows
  exactly what it takes to reach the next rank — a compact
  "↑ +X kg on [Lift]" chip on the row (visible without opening the
  accordion), plus a full "🎯 To reach [Next Tier]" panel in the detail
  view. The panel spells out both the 1RM delta and the equivalent for
  the user's typical rep range on their top compound lift. Recommendations
  that would require a > 30% jump display a caveat encouraging balanced
  progression across other compounds instead of chasing one lift.
  New engine helpers: `nextTierRecommendation()` and `weightForReps()`
  (reverse Epley).
- **Mode reliability hint.** Secondary tip on the CSV import panel
  and extended locale notice on the results page both nudge users
  toward **API-key mode** as the precision-perfect option — it
  uses Hevy's stable exercise IDs so there's no title-matching
  ambiguity regardless of the Hevy app's language. Both mentions
  carry an inline link that jumps straight to the API-key setup.

## [0.3.0-pre1] — 2026-07-12

Pre-release. Big UX pass across the whole app and a critical iOS
Safari fix. Ranking engine, coefficients and thresholds are
**unchanged** from v0.2 — your ranks won't move.

### Added

- **Results confetti:** the dashboard now lands with a canvas-based
  confetti burst colored from your top rank's palette (~200 particles,
  gravity + drag, HiDPI-aware). Fires only on fresh calculations —
  not on F5, not on the "Back to your results" shortcut. Intentionally
  runs regardless of `prefers-reduced-motion` — it's a single-shot ~4s
  non-strobing decorative reveal, not the recurring/parallax kind of
  motion the preference is designed to guard against.
- **Non-English CSV support:** exercises whose title isn't in the
  English-only Hevy catalog (typical for French / Spanish / etc.
  exports) are now routed via a FR+EN keyword fallback covering ~95%
  of the standard exercise list. The results page shows a discreet
  notice when many exercises were matched this way, and the CSV
  import panel has an upfront tip telling users to switch Hevy to
  English for a strictly perfect mapping.
- **Match statistics:** `computeRanks` now returns
  `matchStats: { catalog, inferred, total }` so the UI can decide
  when to surface the locale notice.
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
- **iOS Safari — French CSV read as mojibake.**
  `FileReader.readAsText` was silently decoding files coming from
  the Files/iCloud picker as Windows-1252, turning accented exercise
  titles into garbage before the parser could see them. Only
  ASCII-named exercises (typically Core) were being recognized.
  Now uses `file.text()` (UTF-8 per spec) with a
  `FileReader.readAsText(file, "UTF-8")` fallback, and strips a
  leading UTF-8 BOM if present.
- **French exports produced empty ranks.** Even with UTF-8 fixed,
  the English-only Hevy catalog couldn't map French titles like
  `Squat (Barre)`, `Développé Couché`, `Presse à Cuisses`, etc. The
  new title-based group inference (see Added) covers this. Verified
  end-to-end against a real FR-locale CSV: all 6 groups populate and
  the "Exercises not counted" list drops to 0.
- **Confetti never fired when the OS reported
  `prefers-reduced-motion: reduce`.** Legitimate for looping /
  parallax animations, but not for a 4-second decorative reveal —
  Windows users with "Show animations" turned off (or Chrome
  headless environments) were seeing nothing. The gate is now
  removed for the confetti while the looping rank-parade loader
  keeps honoring the preference.
- **Engine hardening for `hasData`.** A group with lifts but no
  computable eqRatio (e.g. missing bodyweight) is now correctly
  reported as `hasData: false`, so consumers reading `g.tier.name`
  can't crash on `null`.

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
