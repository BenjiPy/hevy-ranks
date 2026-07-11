/**
 * Groupes musculaires consideres comme "jambes".
 * (valeurs renvoyees par Hevy dans primary_muscle_group / secondary_muscle_groups)
 */
export const LEG_MUSCLES = new Set([
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "abductors",
  "adductors",
]);

/**
 * Paliers de rang bases sur le volume cumule (tonnage total en kg).
 * Volume d'un set = poids (kg) x reps. On additionne sur tout l'historique.
 * "min" = seuil d'entree dans le rang.
 */
export const RANKS = [
  { name: "Bronze", min: 0 },
  { name: "Argent", min: 25_000 },
  { name: "Or", min: 75_000 },
  { name: "Platine", min: 200_000 },
  { name: "Diamant", min: 500_000 },
  { name: "Maitre", min: 1_000_000 },
  { name: "Legende", min: 2_500_000 },
];

/** Un set compte s'il a un poids et des reps, et n'est pas un echauffement. */
function setCounts(set) {
  const weight = Number(set.weight_kg);
  const reps = Number(set.reps);
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return false;
  if (weight <= 0 || reps <= 0) return false;
  if (set.type === "warmup") return false;
  return true;
}

/**
 * Analyse toutes les seances et calcule les stats "jambes".
 * @param {Array} workouts - seances brutes de l'API Hevy
 * @param {Map} templateMap - map exercise_template_id -> template (pour le muscle cible)
 */
export function computeMuscleStats(workouts, templateMap, muscles = LEG_MUSCLES) {
  let totalVolume = 0; // kg cumules (poids x reps)
  let totalReps = 0;
  let totalSets = 0;
  let heaviestSet = 0; // charge max sur un set
  let bestVolumeSession = 0; // meilleur volume jambes sur une seance
  const sessionDates = new Set(); // jours avec au moins un set jambes
  const perExercise = new Map(); // titre -> volume

  for (const w of workouts) {
    let sessionVolume = 0;
    for (const ex of w.exercises ?? []) {
      const template = templateMap.get(ex.exercise_template_id);
      const primary = template?.primary_muscle_group;
      if (!primary || !muscles.has(primary)) continue;

      for (const set of ex.sets ?? []) {
        if (!setCounts(set)) continue;
        const volume = Number(set.weight_kg) * Number(set.reps);
        totalVolume += volume;
        sessionVolume += volume;
        totalReps += Number(set.reps);
        totalSets += 1;
        if (Number(set.weight_kg) > heaviestSet) heaviestSet = Number(set.weight_kg);
        const title = ex.title ?? template?.title ?? "Exercice inconnu";
        perExercise.set(title, (perExercise.get(title) ?? 0) + volume);
      }
    }
    if (sessionVolume > 0) {
      const day = (w.start_time ?? w.created_at ?? "").slice(0, 10);
      if (day) sessionDates.add(day);
      if (sessionVolume > bestVolumeSession) bestVolumeSession = sessionVolume;
    }
  }

  const topExercises = [...perExercise.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, volume]) => ({ title, volume }));

  return {
    totalVolume,
    totalReps,
    totalSets,
    heaviestSet,
    bestVolumeSession,
    sessionCount: sessionDates.size,
    topExercises,
  };
}

/**
 * Convertit un volume cumule en rang + progression vers le rang suivant.
 */
export function volumeToRank(volume) {
  let current = RANKS[0];
  let next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (volume >= RANKS[i].min) {
      current = RANKS[i];
      next = RANKS[i + 1] ?? null;
    }
  }

  let progress = 1;
  let remaining = 0;
  if (next) {
    const span = next.min - current.min;
    progress = span > 0 ? (volume - current.min) / span : 1;
    remaining = Math.max(0, next.min - volume);
  }

  return {
    rank: current.name,
    next: next?.name ?? null,
    progress: Math.min(1, Math.max(0, progress)),
    remaining,
  };
}
