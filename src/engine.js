/**
 * Moteur de rang partage (navigateur + Node), sans dependance ni API Node.
 *
 * Principe : pour chaque groupe musculaire, on estime le 1RM de ta meilleure
 * serie sur chaque exercice, on le ramene au "lift de reference" du groupe via
 * un coefficient, on le rapporte au poids de corps, et on compare a des paliers.
 * Le rang d'un groupe = ta meilleure performance dans ce groupe (perf unique) :
 * un gros lift des la 1re seance donne un rang eleve immediatement.
 */

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
    thresholds: [0, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.1, 2.5],
    def: 1.3,
  },
  chest: {
    key: "chest",
    label: "Pectoraux",
    ref: "Developpe couche",
    primaries: ["chest"],
    thresholds: [0, 0.4, 0.6, 0.8, 1.0, 1.25, 1.5, 1.75, 2.0],
    def: 1.1,
  },
  back: {
    key: "back",
    label: "Dos",
    ref: "Rowing barre",
    primaries: ["lats", "upper_back", "lower_back", "traps"],
    thresholds: [0, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.9],
    def: 1.1,
  },
  shoulders: {
    key: "shoulders",
    label: "Epaules",
    ref: "Developpe militaire",
    primaries: ["shoulders", "neck"],
    thresholds: [0, 0.3, 0.4, 0.55, 0.7, 0.85, 1.0, 1.15, 1.35],
    def: 1.0,
  },
  arms: {
    key: "arms",
    label: "Bras",
    ref: "Curl barre",
    primaries: ["biceps", "triceps", "forearms"],
    thresholds: [0, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.9, 1.1],
    def: 1.0,
  },
  core: {
    key: "core",
    label: "Abdos",
    ref: "Crunch leste",
    primaries: ["abdominals"],
    thresholds: [0, 0.15, 0.25, 0.35, 0.45, 0.6, 0.75, 0.9, 1.1],
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
    { k: ["leg extension", "extension des jambes", "extension jambes", "leg extensions"], c: 0.7 },
    { k: ["leg curl", "curl ischio", "ischio", "leg curls"], c: 0.6 },
    { k: ["calf", "mollet"], c: 1.3 },
    { k: ["lunge", "fente"], c: 0.5 },
    { k: ["step up", "step-up", "montee de banc"], c: 0.5 },
    { k: ["squat"], c: 1.0 },
  ],
  chest: [
    { k: ["incline"], c: 0.85 },
    { k: ["decline"], c: 1.0 },
    { k: ["ecarte", "fly", "flye", "pec deck", "pec dec", "butterfly"], c: 0.5 },
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
    { k: ["shrug", "haussement", "shrugs"], c: 1.6 },
    { k: ["row", "rowing"], c: 1.0 },
  ],
  shoulders: [
    { k: ["push press"], c: 1.2 },
    { k: ["arnold"], c: 0.8 },
    { k: ["lateral raise", "side raise", "elevation laterale", "laterale", "elevations laterales"], c: 0.35 },
    { k: ["front raise", "elevation frontale", "frontale"], c: 0.4 },
    { k: ["rear delt", "face pull", "reverse fly", "oiseau"], c: 0.4 },
    { k: ["upright row", "tirage menton", "rowing menton"], c: 0.6 },
    { k: ["dumbbell", "haltere", "db "], c: 0.85 },
    { k: ["overhead", "military", "shoulder press", "ohp", "militaire", "developpe epaules", "developpe", "press"], c: 1.0 },
  ],
  arms: [
    { k: ["machine dip", "dips assis", "dips machine", "dip machine", "seated dip"], c: 2.6 },
    { k: ["close grip", "close-grip", "prise serree"], c: 1.6 },
    { k: ["skull", "lying tricep", "lying triceps", "french", "barre au front"], c: 0.7 },
    { k: ["pushdown", "push down", "pressdown", "poulie triceps", "corde", "poulie"], c: 1.6 },
    { k: ["overhead tricep", "overhead extension", "extension nuque"], c: 0.6 },
    { k: ["extension triceps", "triceps"], c: 2.2 },
    { k: ["dips", "dip"], c: 1.3 },
    { k: ["preacher", "pupitre"], c: 0.85 },
    { k: ["hammer", "marteau"], c: 0.9 },
    { k: ["concentration"], c: 0.55 },
    { k: ["ez", "ez-bar", "ez bar", "barre ez"], c: 0.95 },
    { k: ["dumbbell curl", "db curl", "curl haltere"], c: 0.85 },
    { k: ["wrist", "forearm", "avant-bras", "avant bras", "poignet", "reverse curl", "curl inverse"], c: 0.6 },
    { k: ["curl"], c: 1.0 },
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

function matchCoeff(title, groupKey, equipment) {
  const t = deburr(title);
  for (const entry of GROUP_COEFFS[groupKey] ?? []) {
    if (entry.k.some((kw) => t.includes(kw))) return entry.c;
  }
  // Exercice inconnu du groupe : coeff par defaut ajuste selon l'equipement.
  return GROUPS[groupKey].def * equipFactor(equipment);
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
 * Calcule le rang de chaque groupe musculaire.
 *
 * @param {Array} sessions - [{ date, exercises:[{ title, templateId?, sets:[{weight,reps,type?}] }] }]
 * @param {object} catalog - resultat de buildCatalog()
 * @param {object} opts - { bodyweightKg, sex }
 * @returns {object} { bodyweightKg, sex, groups: { [key]: {group, best, lifts, tierIndex, tier, next, progress} }, unmatched:Set }
 */
export function computeRanks(sessions, catalog, { bodyweightKg, sex = "male" } = {}) {
  const bw = Number(bodyweightKg);
  const hasBw = Number.isFinite(bw) && bw > 0;
  const factor = sexFactor(sex);

  // groupKey -> Map(exerciseTitle -> best lift)
  const perGroup = {};
  for (const key of Object.keys(GROUPS)) perGroup[key] = new Map();
  const unmatchedTitles = new Set();

  for (const s of sessions) {
    for (const ex of s.exercises ?? []) {
      // Resolution du template (par id sinon par titre)
      let tpl = ex.templateId ? catalog.byId.get(ex.templateId) : null;
      if (!tpl && ex.title) tpl = catalog.byTitle.get(catalog.norm(ex.title));
      const primary = tpl?.primary;
      const groupKey = primary ? PRIMARY_TO_GROUP[primary] : null;
      if (!groupKey) {
        if (ex.title) unmatchedTitles.add(ex.title);
        continue;
      }
      const type = ex.type ?? tpl?.type ?? "weight_reps";
      // Titre anglais du catalogue (via template) en priorite : traduit les
      // titres localises de l'API Hevy (FR, etc.). Repli sur le titre fourni.
      const title = tpl?.title ?? ex.title ?? "";
      const equipment = tpl?.equipment;

      for (const set of ex.sets ?? []) {
        if (set.type === "warmup") continue;
        const reps = Number(set.reps);
        if (!Number.isFinite(reps) || reps <= 0) continue;

        let load = effectiveLoad(set.weight, type, bw);
        // Mouvement au poids de corps sans charge : charge estimee.
        if (load == null && bw > 0 && (type === "reps_only" || type === "bodyweight_reps")) {
          load = bw * bodyweightFraction(title, groupKey);
        }
        if (load == null || load <= 0) continue;

        const oneRm = estimate1RM(load, reps);
        if (oneRm <= 0) continue;

        const map = perGroup[groupKey];
        const prev = map.get(title);
        if (!prev || oneRm > prev.best1RM) {
          map.set(title, {
            title,
            best1RM: oneRm,
            load,
            reps: Number(set.reps),
            date: s.date ?? null,
            coeff: matchCoeff(title, groupKey, equipment),
          });
        }
      }
    }
  }

  const groups = {};
  for (const [key, cfg] of Object.entries(GROUPS)) {
    const lifts = [...perGroup[key].values()]
      .map((l) => ({
        ...l,
        eqRatio: hasBw ? l.best1RM / l.coeff / bw : null,
      }))
      .sort((a, b) => (b.eqRatio ?? 0) - (a.eqRatio ?? 0));

    const best = lifts[0] ?? null;
    let tierIndex = null;
    let progress = 0;
    let next = null;
    if (best && best.eqRatio != null) {
      tierIndex = ratioToTierIndex(best.eqRatio, cfg.thresholds, factor);
      const cur = cfg.thresholds[tierIndex] * factor;
      const nextThresh =
        tierIndex < cfg.thresholds.length - 1
          ? cfg.thresholds[tierIndex + 1] * factor
          : null;
      if (nextThresh != null) {
        const span = nextThresh - cur;
        progress = span > 0 ? (best.eqRatio - cur) / span : 1;
        next = {
          tier: RANK_TIERS[tierIndex + 1],
          ratio: nextThresh,
          remaining: Math.max(0, nextThresh - best.eqRatio),
        };
      } else {
        progress = 1;
      }
    }

    groups[key] = {
      group: cfg,
      lifts,
      best,
      hasData: !!best,
      tierIndex,
      tier: tierIndex != null ? RANK_TIERS[tierIndex] : null,
      next,
      progress: Math.min(1, Math.max(0, progress)),
    };
  }

  return { bodyweightKg: hasBw ? bw : null, sex, groups, unmatched: unmatchedTitles };
}
