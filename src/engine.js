/**
 * Shared ranking engine (browser + Node), zero dependency, no Node-only APIs.
 *
 * v0.2: a group's rank is a COMPOSITE of the user's compound lifts (non
 * isolation) practiced on at least MIN_SESSIONS distinct sessions. For each
 * exercise we estimate a 1RM (Epley, reps capped at 12), normalize it with
 * an exercise-specific coefficient (relative to the group's reference lift),
 * divide by bodyweight, then aggregate the top 3 compounds with decreasing
 * weights [1.0, 0.5, 0.25].
 *
 * Isolation lifts (calf press, back extension, pec deck, curls, etc.)
 * CANNOT define a group's rank on their own: they are only used as a
 * fallback when no qualifying compound is found (in which case the rank
 * is capped at "Titan" to avoid false Mythics).
 */

/** Minimum number of distinct sessions for an exercise to count in the rank. */
export const MIN_SESSIONS = 3;

/** Decreasing weights used for the composite aggregation (top 3 compounds). */
const COMPOSITE_WEIGHTS = [1.0, 0.5, 0.25];

/** Max tier reachable via isolation lifts only (index in RANK_TIERS). */
const ISOLATION_TIER_CAP = 5; // Titan
/** Max tier when no exercise reaches MIN_SESSIONS (very partial data). */
const FEW_SESSIONS_TIER_CAP = 3; // Platinum

/** The 9 ranks, from lowest to highest, with their emblem and color. */
export const RANK_TIERS = [
  { name: "Bronze", img: "rank-01-bronze.png", color: "#c07a3e" },
  { name: "Iron", img: "rank-02-iron.png", color: "#9aa1ab" },
  { name: "Gold", img: "rank-03-gold.png", color: "#e8b923" },
  { name: "Platinum", img: "rank-04-platinum.png", color: "#d3dae1" },
  { name: "Diamond", img: "rank-05-diamond.png", color: "#5ec8ff" },
  { name: "Titan", img: "rank-06-titan.png", color: "#2fe0c8" },
  { name: "Colossus", img: "rank-07-colossus.png", color: "#ff6a2b" },
  { name: "Olympian", img: "rank-08-olympian.png", color: "#ffd76a" },
  { name: "Mythic", img: "rank-09-mythic.png", color: "#c07cff" },
];

/**
 * Configuration per muscle group.
 * - primaries : Hevy `primary_muscle_group` values mapped to the group
 * - ref       : reference lift (coeff = 1.0)
 * - thresholds: 9 thresholds "reference 1RM equivalent / bodyweight" (index = tier)
 * - def       : default coefficient for an exercise not listed in the group
 * Male standards; multiplied by ~0.72 when sex = female.
 */
export const GROUPS = {
  legs: {
    key: "legs",
    label: "Legs",
    ref: "Squat",
    primaries: ["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"],
    thresholds: [0, 0.5, 0.75, 1.0, 1.25, 1.5, 1.85, 2.3, 3.0],
    def: 1.3,
  },
  chest: {
    key: "chest",
    label: "Chest",
    ref: "Bench press",
    primaries: ["chest"],
    thresholds: [0, 0.4, 0.6, 0.8, 1.0, 1.25, 1.55, 1.9, 2.4],
    def: 1.1,
  },
  back: {
    key: "back",
    label: "Back",
    ref: "Barbell row",
    primaries: ["lats", "upper_back", "lower_back", "traps"],
    thresholds: [0, 0.4, 0.6, 0.8, 1.0, 1.25, 1.55, 1.9, 2.3],
    def: 1.1,
  },
  shoulders: {
    key: "shoulders",
    label: "Shoulders",
    ref: "Overhead press",
    primaries: ["shoulders", "neck"],
    thresholds: [0, 0.3, 0.4, 0.55, 0.7, 0.85, 1.05, 1.3, 1.6],
    def: 1.0,
  },
  arms: {
    key: "arms",
    label: "Arms",
    ref: "Barbell curl",
    primaries: ["biceps", "triceps", "forearms"],
    thresholds: [0, 0.25, 0.35, 0.45, 0.55, 0.7, 0.85, 1.05, 1.3],
    def: 1.0,
  },
  core: {
    key: "core",
    label: "Core",
    ref: "Weighted crunch",
    primaries: ["abdominals"],
    thresholds: [0, 0.15, 0.25, 0.35, 0.45, 0.6, 0.8, 1.05, 1.4],
    def: 1.0,
  },
};

/** Hevy `primary_muscle_group` -> major group key. */
const PRIMARY_TO_GROUP = (() => {
  const m = {};
  for (const g of Object.values(GROUPS)) {
    for (const p of g.primaries) m[p] = g.key;
  }
  return m;
})();

/**
 * Per-exercise coefficients, per group (coeff = exercise 1RM / reference 1RM).
 * Most specific patterns first. An exercise with no match uses `def`.
 * Keywords in BOTH English and French, written WITHOUT accents (titles are
 * "deburred" before comparison), so it works regardless of the Hevy locale.
 */
const GROUP_COEFFS = {
  legs: [
    { k: ["front squat", "squat avant"], c: 0.85 },
    { k: ["hack squat", "hack"], c: 1.35 },
    { k: ["pendulum", "pendule"], c: 1.4 },
    { k: ["box squat"], c: 0.95 },
    { k: ["split squat", "bulgarian", "bulgare"], c: 0.5 },
    { k: ["goblet"], c: 0.5 },
    { k: ["leg press", "presse a cuisses", "presse cuisses", "presse"], c: 3.0 },
    { k: ["romanian", "rdl", "roumain"], c: 1.05 },
    { k: ["stiff", "jambes tendues"], c: 1.0 },
    { k: ["deadlift", "souleve de terre"], c: 1.2 },
    { k: ["hip thrust", "poussee de hanche"], c: 1.6 },
    { k: ["glute bridge", "pont fessier"], c: 1.4 },
    { k: ["leg extension", "extension des jambes", "extension jambes", "leg extensions"], c: 0.9, isolation: true },
    { k: ["leg curl", "curl ischio", "ischio", "leg curls"], c: 0.8, isolation: true },
    { k: ["calf", "mollet"], c: 2.8, isolation: true },
    { k: ["adductor", "abductor", "adducteur", "abducteur"], c: 0.7, isolation: true },
    { k: ["lunge", "fente"], c: 0.5 },
    { k: ["step up", "step-up", "montee de banc"], c: 0.5 },
    { k: ["squat"], c: 1.0 },
  ],
  chest: [
    { k: ["incline"], c: 0.85 },
    { k: ["decline"], c: 1.0 },
    { k: ["ecarte", "fly", "flye", "pec deck", "pec dec", "butterfly"], c: 0.8, isolation: true },
    { k: ["chest press", "machine"], c: 1.2 },
    { k: ["dumbbell", "haltere", "db "], c: 0.9 },
    { k: ["dips", "dip"], c: 1.1 },
    { k: ["push up", "pushup", "push-up", "pompe"], c: 0.6 },
    { k: ["bench press", "developpe couche", "developpe", "bench"], c: 1.0 },
  ],
  back: [
    { k: ["deadlift", "souleve de terre"], c: 1.4 },
    { k: ["pendlay"], c: 1.0 },
    { k: ["t-bar", "t bar", "tbar"], c: 1.1 },
    { k: ["seated", "assis", "cable row", "tirage poulie", "rowing poulie", "tirage horizontal"], c: 1.1 },
    { k: ["lat pulldown", "pulldown", "tirage vertical", "tirage nuque", "tirage"], c: 1.0 },
    { k: ["pull up", "pull-up", "pullup", "chin", "traction"], c: 0.9 },
    { k: ["dumbbell row", "one arm", "single arm", "rowing haltere", "unilateral"], c: 0.5 },
    { k: ["back extension", "hyperextension", "hyper extension", "lombaires", "extension lombaire"], c: 2.0, isolation: true },
    { k: ["shrug", "haussement", "shrugs"], c: 1.9, isolation: true },
    { k: ["row", "rowing"], c: 1.0 },
  ],
  shoulders: [
    { k: ["push press"], c: 1.2 },
    { k: ["arnold"], c: 0.8 },
    { k: ["lateral raise", "side raise", "elevation laterale", "laterale", "elevations laterales"], c: 0.5, isolation: true },
    { k: ["front raise", "elevation frontale", "frontale"], c: 0.5, isolation: true },
    { k: ["rear delt", "face pull", "reverse fly", "oiseau"], c: 0.55, isolation: true },
    { k: ["upright row", "tirage menton", "rowing menton"], c: 0.6 },
    { k: ["dumbbell", "haltere", "db "], c: 0.85 },
    { k: ["overhead", "military", "shoulder press", "ohp", "militaire", "developpe epaules", "developpe", "press"], c: 1.0 },
  ],
  arms: [
    { k: ["machine dip", "dips assis", "dips machine", "dip machine", "seated dip"], c: 2.6 },
    { k: ["close grip", "close-grip", "prise serree"], c: 1.6 },
    { k: ["skull", "lying tricep", "lying triceps", "french", "barre au front"], c: 0.7, isolation: true },
    { k: ["pushdown", "push down", "pressdown", "poulie triceps", "corde", "poulie"], c: 1.9, isolation: true },
    { k: ["overhead tricep", "overhead extension", "extension nuque"], c: 0.6, isolation: true },
    { k: ["extension triceps", "triceps"], c: 2.2, isolation: true },
    { k: ["dips", "dip"], c: 1.3 },
    { k: ["preacher", "pupitre"], c: 0.85, isolation: true },
    { k: ["hammer", "marteau"], c: 0.9, isolation: true },
    { k: ["concentration"], c: 0.55, isolation: true },
    { k: ["ez", "ez-bar", "ez bar", "barre ez"], c: 0.95, isolation: true },
    { k: ["dumbbell curl", "db curl", "curl haltere"], c: 0.85, isolation: true },
    { k: ["wrist", "forearm", "avant-bras", "avant bras", "poignet", "reverse curl", "curl inverse"], c: 0.6, isolation: true },
    { k: ["curl"], c: 1.0, isolation: true },
  ],
  core: [
    { k: ["cable crunch", "crunch poulie"], c: 1.0 },
    { k: ["weighted", "plate", "leste"], c: 0.9 },
    { k: ["hanging", "leg raise", "knee raise", "releve de jambes", "releve de genoux", "releve"], c: 0.8 },
    { k: ["russian twist"], c: 0.5 },
    { k: ["crunch", "sit up", "situp", "sit-up", "releve de buste"], c: 0.9 },
  ],
};

/** Strip accents/diacritics for robust comparison. */
function deburr(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Broad EN+FR keyword hints used to guess a muscle group directly from an
 * exercise title when it isn't in the catalog (typical for CSV imports in
 * non-English locales — Hevy's template catalog is English-only, but the
 * CSV export uses the user's locale). Written WITHOUT accents (titles are
 * deburred before comparison). Order matters: first match wins.
 */
const GROUP_HINTS = [
  // Cardio / mobility / combat sports — silently ignored (returns null).
  ["__skip__", [
    "sparring", "boxe", "boxing", "muay", "kickbox", "mma", "judo", "grappling",
    "cardio", "course", "running", "run", "velo", "cycling", "bike", "aerobic",
    "rope", "corde a sauter", "jump rope",
    "stretch", "etirement", "yoga", "mobility", "mobilite", "foam roll",
    "walk", "marche", "hike",
  ]],
  ["legs", [
    "squat", "leg press", "presse a cuisses", "presse cuisse", "hack squat",
    "leg extension", "extension jambe", "extension des jambes", "extension ja",
    "leg curl", "curl ischio", "curl jambe", "hamstring",
    "lunge", "fente",
    "calf", "mollet", "extension mollet",
    "deadlift", "souleve de terre", "romanian",
    "hip thrust", "poussee de hanche", "glute bridge", "fessier", "glute",
    "adductor", "abductor", "adducteur", "abducteur",
    "step up",
  ]],
  ["chest", [
    "bench press", "developpe couche", "developpe incline", "developpe decline",
    "chest press", "pec deck", "peck deck", "butterfly",
    "ecarte", "ecartes", "fly", "cable fly", "chest fly",
    "pectoraux", "pec ", "chest ", "push up", "pompes", "pushup", "dip",
  ]],
  ["back", [
    "row", "rowing", "tirage", "seated row", "bent over",
    "pull up", "pull-up", "pullup", "chin up", "chinup", "traction",
    "pulldown", "tirage vertical", "tirage nuque", "lat ",
    "deadlift", "souleve de terre",
    "shrug", "haussement",
    "reverse fly", "face pull", "rear delt", "oiseau",
    "back extension", "extension du dos", "hyperextension",
    "dos ",
  ]],
  ["shoulders", [
    "overhead press", "shoulder press", "developpe militaire", "developpe epaule",
    "arnold", "ohp",
    "lateral raise", "elevation lateral", "elevation frontale", "front raise",
    "upright row", "tirage menton",
    "epaule",
  ]],
  ["arms", [
    "bicep", "biceps", "curl", "hammer curl", "curl marteau", "preacher",
    "concentration curl", "curl inverse",
    "tricep", "triceps", "extension triceps", "extension tri",
    "pushdown", "poulie triceps", "kickback",
    "skull crush", "barre au front",
    "forearm", "avant-bras", "wrist curl",
  ]],
  ["core", [
    "crunch", "sit up", "sit-up", "situp",
    "plank", "gainage", "planche",
    "ab wheel", "roulette abdo", "ab roller",
    "leg raise", "releve de jambes", "releve de genoux", "knee raise",
    "hanging leg", "toes to bar",
    "russian twist", "wood chop",
    "abdo", "abs ", "core", "oblique",
  ]],
];

/**
 * Guess a group key from a free-form exercise title. Returns the group key,
 * "__skip__" for cardio/mobility (caller should silently ignore), or null
 * when no hint matches. Used as a fallback for CSV-mode exercises whose
 * template isn't in the English-only catalog.
 *
 * Hints are matched on WORD boundaries (not raw substring) so that short
 * keywords like "velo" or "run" don't accidentally match inside longer
 * words like "developpe" or "running-style-something". Multi-word hints
 * ("leg press", "presse a cuisses") match as a phrase between boundaries.
 */
export function inferGroupFromTitle(rawTitle) {
  const norm = deburr(rawTitle || "");
  if (!norm) return null;
  for (const [group, hints] of GROUP_HINTS) {
    for (const h of hints) {
      if (matchesWord(norm, h)) return group;
    }
  }
  return null;
}

function matchesWord(haystack, needle) {
  const words = needle.trim().split(/\s+/).map(escapeRegex);
  if (!words.length) return false;
  // Each word may carry an optional "s" / "es" (FR/EN plural), and words
  // are separated by any whitespace in the haystack. Overall we require
  // a non-alphanumeric boundary before the first and after the last word
  // (start/end of string is fine too) so short hints like "run" or "velo"
  // never match inside longer words ("running", "developpe").
  // Cover EN plural (curl -> curls), FR gender/number (lateral -> laterale,
  // lateraux, laterales) with a compact suffix alternation.
  const inner = words.map((w) => `${w}(?:es|s|e|aux)?`).join("\\s+");
  const re = new RegExp(`(?:^|[^a-z0-9])${inner}(?:$|[^a-z0-9])`);
  return re.test(haystack);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert workouts from the Hevy API into the engine's "sessions" format. */
export function workoutsToSessions(workouts) {
  return (workouts ?? []).map((w) => ({
    date: (w.start_time ?? w.created_at ?? "").slice(0, 10),
    title: w.title ?? "",
    exercises: (w.exercises ?? []).map((ex) => ({
      title: ex.title ?? "",
      templateId: ex.exercise_template_id ?? null,
      sets: (ex.sets ?? []).map((s) => ({
        weight: s.weight_kg,
        reps: s.reps,
        type: s.type ?? "normal",
      })),
    })),
  }));
}

/** 1RM estimation (Epley formula), reps capped at 12 to stay realistic. */
export function estimate1RM(load, reps) {
  const w = Number(load);
  const r = Math.min(Number(reps), 12);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

/** Hevy exercise types considered "strength" (as opposed to cardio/mobility). */
const STRENGTH_TYPES = new Set([
  "weight_reps",
  "bodyweight_weighted",
  "bodyweight_assisted",
  "bodyweight_reps",
  "reps_only",
  "short_distance_weight",
  "assisted_bodyweight",
  "weighted_bodyweight",
]);

/** Effective load of a set depending on the Hevy exercise type. */
export function effectiveLoad(weightKg, type, bodyweightKg) {
  const w = Number(weightKg);
  const bw = Number(bodyweightKg) || 0;
  const hasW = Number.isFinite(w) && w > 0;
  switch (type) {
    case "weight_reps":
    case "short_distance_weight":
      return hasW ? w : null;
    case "bodyweight_weighted":
      return bw + (hasW ? w : 0);
    case "bodyweight_assisted":
      return Math.max(bw - (hasW ? w : 0), 0);
    default:
      // reps_only, duration, distance_duration, etc.: no measurable load
      return null;
  }
}

export function sexFactor(sex) {
  return String(sex).toLowerCase().startsWith("f") ? 0.72 : 1;
}

/** On machines/cables you can load more, so higher coeff => fairer rank. */
function equipFactor(equipment) {
  switch (equipment) {
    case "machine":
      return 1.5;
    case "cable":
      return 1.3;
    case "smith_machine":
    case "smith":
      return 1.35;
    default:
      return 1;
  }
}

/**
 * Returns { coeff, isolation } for a given exercise in the group.
 * If no keyword matches, uses the default coefficient adjusted by equipment
 * and isolation = false (we assume the default targets a compound lift).
 */
function matchCoeff(title, groupKey, equipment) {
  const t = deburr(title);
  for (const entry of GROUP_COEFFS[groupKey] ?? []) {
    if (entry.k.some((kw) => t.includes(kw))) {
      return { coeff: entry.c, isolation: !!entry.isolation };
    }
  }
  return {
    coeff: GROUPS[groupKey].def * equipFactor(equipment),
    isolation: false,
  };
}

/**
 * Fraction of bodyweight effectively lifted on a pure bodyweight movement
 * (reps_only, no external load), so it can still be scored.
 */
function bodyweightFraction(title, groupKey) {
  const t = deburr(title);
  if (/(pull up|pull-up|pullup|chin|traction|muscle up)/.test(t)) return 0.6;
  if (/(pistol|squat)/.test(t)) return 0.5;
  if (/(push up|pushup|push-up|pompe)/.test(t)) return 0.35;
  if (/(dip)/.test(t)) return 0.45;
  if (groupKey === "core") return 0.25;
  return 0.4;
}

/** Reference 1RM/BW equivalent -> tier index (0..8). */
function ratioToTierIndex(ratio, thresholds, factor) {
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (ratio >= thresholds[i] * factor) idx = i;
  }
  return idx;
}

/**
 * Builds an index of the exercise catalog (by id and by normalized title).
 * @param {Array} templates - data/exercise-templates.json
 */
export function buildCatalog(templates) {
  const byId = new Map();
  const byTitle = new Map();
  const norm = (s) => deburr(String(s).trim());
  for (const t of templates) {
    if (t.id) byId.set(t.id, t);
    if (t.title) byTitle.set(norm(t.title), t);
  }
  return { byId, byTitle, norm };
}

/**
 * Aggregates eqRatios into a composite score (weighted average of top N).
 * If fewer than N lifts, only the corresponding weights are used.
 */
function compositeRatio(lifts, weights = COMPOSITE_WEIGHTS) {
  const top = lifts.slice(0, weights.length);
  if (!top.length) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < top.length; i++) {
    if (top[i].eqRatio == null) continue;
    num += top[i].eqRatio * weights[i];
    den += weights[i];
  }
  return den > 0 ? num / den : null;
}

/**
 * Computes the rank of each muscle group.
 *
 * @param {Array} sessions - [{ date, exercises:[{ title, templateId?, sets:[{weight,reps,type?}] }] }]
 * @param {object} catalog - result of buildCatalog()
 * @param {object} opts - { bodyweightKg, sex, minSessions }
 * @returns {object} rich result: see the `groups[key]` structure below
 *   groups[key] = {
 *     group, hasData, tierIndex, tier, next, progress,
 *     eqRatio,        // composite ratio used
 *     source,         // 'compound' | 'isolation' | 'few_sessions' | null
 *     capped,         // true when the tier was capped by a fallback
 *     lifts,          // all lifts of the group (sorted desc), with isolation/sessions
 *     used,           // lifts that contributed to the composite (top 3 compounds)
 *     excluded,       // excluded lifts + reason ('isolation' | 'few_sessions')
 *     best,           // lift with the highest eqRatio among `used` (CLI compat)
 *   }
 *   unmatched : Set of unrecognized exercise titles (custom / cardio)
 *   unmatchedDetails : Map(title -> {sessions, reason:'unknown'|'no_load'})
 */
export function computeRanks(
  sessions,
  catalog,
  { bodyweightKg, sex = "male", minSessions = MIN_SESSIONS } = {}
) {
  const bw = Number(bodyweightKg);
  const hasBw = Number.isFinite(bw) && bw > 0;
  const factor = sexFactor(sex);

  // groupKey -> Map(title -> aggregated lift). A "lift" = best set on that exercise.
  const perGroup = {};
  for (const key of Object.keys(GROUPS)) perGroup[key] = new Map();
  const unmatchedTitles = new Set();
  // title -> { sessions:Set<date>, reason:'unknown'|'no_load' }
  const unmatchedDetails = new Map();
  // Track how each strength exercise was routed (distinct titles), so the
  // UI can warn the user when many exercises came in via the FR/EN keyword
  // fallback instead of the exact English catalog — a strong signal that
  // Hevy was set to a non-English locale when the CSV was exported.
  const catalogMatched = new Set();
  const inferredMatched = new Set();

  for (const s of sessions) {
    for (const ex of s.exercises ?? []) {
      let tpl = ex.templateId ? catalog.byId.get(ex.templateId) : null;
      if (!tpl && ex.title) tpl = catalog.byTitle.get(catalog.norm(ex.title));
      const primary = tpl?.primary;
      let groupKey = primary ? PRIMARY_TO_GROUP[primary] : null;
      const cameFromCatalog = groupKey != null;
      const rawTitle = ex.title ?? tpl?.title ?? "";

      const type = ex.type ?? tpl?.type ?? "weight_reps";
      // Cardio, mobility, etc.: silently ignored (not surfaced in the
      // dashboard's "not counted" section which is strength-only).
      let isStrength = STRENGTH_TYPES.has(type);

      // Fallback for CSV imports in non-English locales: the Hevy template
      // catalog is English-only, so a French title like "Squat (Barre)" or
      // "Presse a Cuisses" won't be found. Try to infer the group directly
      // from the title using FR+EN keyword hints.
      if (!groupKey && rawTitle) {
        const guess = inferGroupFromTitle(rawTitle);
        if (guess === "__skip__") {
          isStrength = false; // silently ignored (cardio / mobility / combat)
        } else if (guess) {
          groupKey = guess;
        }
      }

      if (!groupKey) {
        if (rawTitle && isStrength) {
          unmatchedTitles.add(rawTitle);
          const d = unmatchedDetails.get(rawTitle) ?? {
            title: rawTitle,
            sessions: new Set(),
            reason: "unknown",
          };
          if (s.date) d.sessions.add(s.date);
          unmatchedDetails.set(rawTitle, d);
        }
        continue;
      }
      const title = tpl?.title ?? ex.title ?? "";
      const equipment = tpl?.equipment;

      let hadUsableSet = false;
      let bestOfExercise = null;

      for (const set of ex.sets ?? []) {
        if (set.type === "warmup") continue;
        const reps = Number(set.reps);
        if (!Number.isFinite(reps) || reps <= 0) continue;

        let load = effectiveLoad(set.weight, type, bw);
        if (
          load == null &&
          bw > 0 &&
          (type === "reps_only" || type === "bodyweight_reps")
        ) {
          load = bw * bodyweightFraction(title, groupKey);
        }
        if (load == null || load <= 0) continue;

        const oneRm = estimate1RM(load, reps);
        if (oneRm <= 0) continue;

        hadUsableSet = true;
        if (!bestOfExercise || oneRm > bestOfExercise.best1RM) {
          bestOfExercise = {
            title,
            best1RM: oneRm,
            load,
            reps: Number(set.reps),
            date: s.date ?? null,
          };
        }
      }

      // No usable set: surface it ONLY if the type is a "strength" one
      // (otherwise = cardio/mobility -> silent).
      if (!hadUsableSet) {
        if (rawTitle && isStrength) {
          const d = unmatchedDetails.get(rawTitle) ?? {
            title: rawTitle,
            sessions: new Set(),
            reason: "no_load",
          };
          if (s.date) d.sessions.add(s.date);
          unmatchedDetails.set(rawTitle, d);
        }
        continue;
      }

      if (cameFromCatalog) catalogMatched.add(rawTitle);
      else if (rawTitle) inferredMatched.add(rawTitle);

      const map = perGroup[groupKey];
      const prev = map.get(title);
      if (!prev) {
        const meta = matchCoeff(title, groupKey, equipment);
        map.set(title, {
          ...bestOfExercise,
          coeff: meta.coeff,
          isolation: meta.isolation,
          sessions: new Set(bestOfExercise.date ? [bestOfExercise.date] : []),
        });
      } else {
        if (bestOfExercise.best1RM > prev.best1RM) {
          Object.assign(prev, {
            best1RM: bestOfExercise.best1RM,
            load: bestOfExercise.load,
            reps: bestOfExercise.reps,
            date: bestOfExercise.date,
          });
        }
        if (bestOfExercise.date) prev.sessions.add(bestOfExercise.date);
      }
    }
  }

  const groups = {};
  for (const [key, cfg] of Object.entries(GROUPS)) {
    // Enrich each lift with eqRatio + sessionsCount, sorted desc.
    const allLifts = [...perGroup[key].values()]
      .map((l) => ({
        title: l.title,
        best1RM: l.best1RM,
        load: l.load,
        reps: l.reps,
        date: l.date,
        coeff: l.coeff,
        isolation: l.isolation,
        sessionsCount: l.sessions.size,
        eqRatio: hasBw ? l.best1RM / l.coeff / bw : null,
      }))
      .sort((a, b) => (b.eqRatio ?? 0) - (a.eqRatio ?? 0));

    // Categorization
    const enoughSessions = (l) => l.sessionsCount >= minSessions;
    const compounds = allLifts.filter((l) => !l.isolation && enoughSessions(l));
    const isolations = allLifts.filter((l) => l.isolation && enoughSessions(l));

    let used = [];
    let source = null;
    let cap = null;

    if (compounds.length > 0) {
      used = compounds.slice(0, COMPOSITE_WEIGHTS.length);
      source = "compound";
    } else if (isolations.length > 0) {
      // No qualifying compound: fall back to isolation lifts (cap Titan).
      used = isolations.slice(0, COMPOSITE_WEIGHTS.length);
      source = "isolation";
      cap = ISOLATION_TIER_CAP;
    } else if (allLifts.length > 0) {
      // No exercise reaches MIN_SESSIONS: use whatever we have (cap Platinum),
      // so the group isn't shown as empty when there's actually data.
      used = allLifts.slice(0, COMPOSITE_WEIGHTS.length);
      source = "few_sessions";
      cap = FEW_SESSIONS_TIER_CAP;
    }

    const eqRatio = used.length ? compositeRatio(used) : null;
    const capped = cap != null;

    // Everything that wasn't used: surface it with a reason.
    const usedTitles = new Set(used.map((l) => l.title));
    const excluded = allLifts
      .filter((l) => !usedTitles.has(l.title))
      .map((l) => ({
        ...l,
        reason: !enoughSessions(l) ? "few_sessions" : "isolation",
      }));

    let tierIndex = null;
    let progress = 0;
    let next = null;
    if (eqRatio != null) {
      tierIndex = ratioToTierIndex(eqRatio, cfg.thresholds, factor);
      if (cap != null && tierIndex > cap) tierIndex = cap;
      const cur = cfg.thresholds[tierIndex] * factor;
      const nextThresh =
        tierIndex < cfg.thresholds.length - 1
          ? cfg.thresholds[tierIndex + 1] * factor
          : null;
      if (nextThresh != null) {
        const span = nextThresh - cur;
        progress = span > 0 ? (eqRatio - cur) / span : 1;
        next = {
          tier: RANK_TIERS[tierIndex + 1],
          ratio: nextThresh,
          remaining: Math.max(0, nextThresh - eqRatio),
        };
      } else {
        progress = 1;
      }
    }

    groups[key] = {
      group: cfg,
      lifts: allLifts,
      used,
      excluded,
      best: used[0] ?? allLifts[0] ?? null,
      eqRatio,
      source,
      capped,
      hasData: used.length > 0 && eqRatio != null,
      tierIndex,
      tier: tierIndex != null ? RANK_TIERS[tierIndex] : null,
      next,
      progress: Math.min(1, Math.max(0, progress)),
    };
  }

  return {
    bodyweightKg: hasBw ? bw : null,
    sex,
    minSessions,
    groups,
    unmatched: unmatchedTitles,
    unmatchedDetails,
    matchStats: {
      catalog: catalogMatched.size,
      inferred: inferredMatched.size,
      total: catalogMatched.size + inferredMatched.size,
    },
  };
}
