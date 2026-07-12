/**
 * Moteur de rang partage (navigateur + Node), sans dependance ni API Node.
 *
 * v0.2 : le rang d'un groupe est un COMPOSITE des exos "compounds" (non
 * isolation) ayant ete pratiques sur au moins MIN_SESSIONS seances distinctes.
 * On calcule pour chaque exo un 1RM estime (Epley, reps cappees a 12), on le
 * normalise via un coefficient specifique a l'exo (rapport au lift de reference
 * du groupe), on le rapporte au poids de corps, puis on aggrege les top 3
 * compounds avec des poids degressifs [1.0, 0.5, 0.25].
 *
 * Les isolations (calf press, back extension, pec deck, curls, etc.) ne
 * peuvent PAS definir a elles seules le rang d'un groupe : elles servent
 * uniquement de repli si aucun compound qualifie n'est trouve (et le rang
 * est alors plafonne a "Titan" pour eviter les faux Mythic).
 */

/** Nombre minimal de seances distinctes pour qu'un exo compte dans le rang. */
export const MIN_SESSIONS = 3;

/** Poids degressifs pour l'aggregation composite (top 3 compounds). */
const COMPOSITE_WEIGHTS = [1.0, 0.5, 0.25];

/** Tier max atteignable via des isolations seulement (index dans RANK_TIERS). */
const ISOLATION_TIER_CAP = 5; // Titan
/** Tier max quand aucun exo n'atteint MIN_SESSIONS (donnee tres partielle). */
const FEW_SESSIONS_TIER_CAP = 3; // Platinum

/** Les 9 rangs, du plus bas au plus haut, avec leur embleme et couleur. */
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
 * Configuration par groupe musculaire.
 * - primaries : valeurs Hevy `primary_muscle_group` rattachees au groupe
 * - ref       : lift de reference (coeff = 1.0)
 * - thresholds: 9 seuils "equivalent reference 1RM / poids de corps" (index = tier)
 * - def       : coefficient par defaut pour un exercice non liste du groupe
 * Standards masculins ; multiplies par ~0.72 si sex = female.
 */
export const GROUPS = {
  legs: {
    key: "legs",
    label: "Jambes",
    ref: "Squat",
    primaries: ["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"],
    thresholds: [0, 0.5, 0.75, 1.0, 1.25, 1.5, 1.85, 2.3, 3.0],
    def: 1.3,
  },
  chest: {
    key: "chest",
    label: "Pectoraux",
    ref: "Developpe couche",
    primaries: ["chest"],
    thresholds: [0, 0.4, 0.6, 0.8, 1.0, 1.25, 1.55, 1.9, 2.4],
    def: 1.1,
  },
  back: {
    key: "back",
    label: "Dos",
    ref: "Rowing barre",
    primaries: ["lats", "upper_back", "lower_back", "traps"],
    thresholds: [0, 0.4, 0.6, 0.8, 1.0, 1.25, 1.55, 1.9, 2.3],
    def: 1.1,
  },
  shoulders: {
    key: "shoulders",
    label: "Epaules",
    ref: "Developpe militaire",
    primaries: ["shoulders", "neck"],
    thresholds: [0, 0.3, 0.4, 0.55, 0.7, 0.85, 1.05, 1.3, 1.6],
    def: 1.0,
  },
  arms: {
    key: "arms",
    label: "Bras",
    ref: "Curl barre",
    primaries: ["biceps", "triceps", "forearms"],
    thresholds: [0, 0.25, 0.35, 0.45, 0.55, 0.7, 0.85, 1.05, 1.3],
    def: 1.0,
  },
  core: {
    key: "core",
    label: "Abdos",
    ref: "Crunch leste",
    primaries: ["abdominals"],
    thresholds: [0, 0.15, 0.25, 0.35, 0.45, 0.6, 0.8, 1.05, 1.4],
    def: 1.0,
  },
};

/** primary_muscle_group Hevy -> cle de groupe majeur. */
const PRIMARY_TO_GROUP = (() => {
  const m = {};
  for (const g of Object.values(GROUPS)) {
    for (const p of g.primaries) m[p] = g.key;
  }
  return m;
})();

/**
 * Coefficients par exercice, par groupe (coeff = 1RM exo / 1RM reference).
 * Motifs les plus specifiques d'abord. Un exercice non trouve prend `def`.
 * Mots-cles en anglais ET francais, ecrits SANS accents (le titre est
 * "deburre" avant comparaison), pour marcher quelle que soit la langue Hevy.
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

/** Retire les accents/diacritiques pour une comparaison robuste. */
function deburr(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Convertit des workouts de l'API Hevy vers le format "sessions" du moteur. */
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

/** Estimation du 1RM (Epley), reps plafonnees a 12 pour rester realiste. */
export function estimate1RM(load, reps) {
  const w = Number(load);
  const r = Math.min(Number(reps), 12);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

/** Types Hevy consideres comme "musculation" (par opposition au cardio/mobilite). */
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

/** Charge effective d'une serie selon le type d'exercice Hevy. */
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
      // reps_only, duration, distance_duration, etc. : pas de charge mesurable
      return null;
  }
}

export function sexFactor(sex) {
  return String(sex).toLowerCase().startsWith("f") ? 0.72 : 1;
}

/** Sur machine/poulie on charge plus : coeff plus haut => rang plus juste. */
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
 * Retourne { coeff, isolation } pour un exercice donne du groupe.
 * Si aucun mot-cle ne correspond, coeff par defaut ajuste selon l'equipement
 * et isolation = false (on suppose que le default cible plutot du compound).
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
 * Fraction du poids de corps effectivement soulevee sur un mouvement au poids
 * de corps sans charge (reps_only), pour pouvoir le noter quand meme.
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

/** equivalent reference 1RM/PdC -> index de tier (0..8). */
function ratioToTierIndex(ratio, thresholds, factor) {
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (ratio >= thresholds[i] * factor) idx = i;
  }
  return idx;
}

/**
 * Construit un index du catalogue d'exercices (par id et par titre normalise).
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
 * Aggrege les eqRatio en un score composite (moyenne ponderee des top N).
 * Si moins de N lifts, on n'utilise que les poids correspondants.
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
 * Calcule le rang de chaque groupe musculaire.
 *
 * @param {Array} sessions - [{ date, exercises:[{ title, templateId?, sets:[{weight,reps,type?}] }] }]
 * @param {object} catalog - resultat de buildCatalog()
 * @param {object} opts - { bodyweightKg, sex, minSessions }
 * @returns {object} resultat riche : voir la structure `groups[key]` ci-dessous
 *   groups[key] = {
 *     group, hasData, tierIndex, tier, next, progress,
 *     eqRatio,        // ratio composite retenu
 *     source,         // 'compound' | 'isolation' | null
 *     capped,         // true si le tier a ete plafonne (fallback isolation)
 *     lifts,          // tous les lifts du groupe (tries desc), avec isolation/sessions
 *     used,           // les lifts qui ont contribue au composite (top 3 compounds)
 *     excluded,       // lifts exclus + reason ('isolation' | 'few_sessions')
 *     best,           // le lift avec le eqRatio le plus haut parmi `used` (compat CLI)
 *   }
 *   unmatched : Set des titres d'exercices non reconnus (custom / cardio)
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

  // groupKey -> Map(title -> lift agrege). Un "lift" = meilleure serie sur cet exo.
  const perGroup = {};
  for (const key of Object.keys(GROUPS)) perGroup[key] = new Map();
  const unmatchedTitles = new Set();
  // title -> { sessions:Set<date>, reason:'unknown'|'no_load' }
  const unmatchedDetails = new Map();

  for (const s of sessions) {
    for (const ex of s.exercises ?? []) {
      let tpl = ex.templateId ? catalog.byId.get(ex.templateId) : null;
      if (!tpl && ex.title) tpl = catalog.byTitle.get(catalog.norm(ex.title));
      const primary = tpl?.primary;
      const groupKey = primary ? PRIMARY_TO_GROUP[primary] : null;
      const rawTitle = ex.title ?? tpl?.title ?? "";

      const type = ex.type ?? tpl?.type ?? "weight_reps";
      // Cardio, mobilite, etc. : on les ignore silencieusement (pas dans la
      // section "non pris en compte" du dashboard qui vise l'halterophilie).
      const isStrength = STRENGTH_TYPES.has(type);

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

      // Aucune serie exploitable : on signale UNIQUEMENT si le type est
      // "musculation" (sinon = cardio/mobilite -> silencieux).
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
    // Enrichit chaque lift avec eqRatio + sessionsCount, trie desc.
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

    // Categorisation
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
      // Aucun compound qualifie : on retombe sur les isolations (cap Titan).
      used = isolations.slice(0, COMPOSITE_WEIGHTS.length);
      source = "isolation";
      cap = ISOLATION_TIER_CAP;
    } else if (allLifts.length > 0) {
      // Aucun exo n'atteint MIN_SESSIONS : on prend ce qu'on a (cap Platinum),
      // pour ne pas laisser le groupe vide alors qu'il y a des donnees.
      used = allLifts.slice(0, COMPOSITE_WEIGHTS.length);
      source = "few_sessions";
      cap = FEW_SESSIONS_TIER_CAP;
    }

    const eqRatio = used.length ? compositeRatio(used) : null;
    const capped = cap != null;

    // Tout ce qui n'a pas ete retenu : on l'expose avec une raison.
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
  };
}
