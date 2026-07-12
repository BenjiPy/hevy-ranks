# Changelog

All notable changes to Hevy Ranks are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
