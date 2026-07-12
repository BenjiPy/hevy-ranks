const BASE_URL = "https://api.hevyapp.com";

/**
 * Petit client pour l'API publique Hevy.
 * Doc : https://api.hevyapp.com/docs
 * Auth : header `api-key` (necessite Hevy Pro).
 */
export class HevyClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error("Cle API Hevy manquante.");
    this.apiKey = apiKey;
  }

  async #get(path, params = {}) {
    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    // Retry simple en cas de rate limit (429) ou erreur serveur (5xx).
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        headers: { "api-key": this.apiKey, accept: "application/json" },
      });

      if (res.ok) return res.json();

      if (res.status === 429 || res.status >= 500) {
        const wait = 500 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const body = await res.text().catch(() => "");
      throw new Error(
        `Hevy API ${res.status} sur ${path} : ${body || res.statusText}`
      );
    }
    throw new Error(`Hevy API : echec apres plusieurs tentatives sur ${path}`);
  }

  /** Nombre total de seances sur le compte. */
  async getWorkoutCount() {
    const data = await this.#get("/v1/workouts/count");
    return data.workout_count ?? 0;
  }

  /** Recupere TOUTES les seances (pagination automatique, max 10/page). */
  async getAllWorkouts({ onProgress } = {}) {
    const first = await this.#get("/v1/workouts", { page: 1, pageSize: 10 });
    const pageCount = first.page_count ?? 1;
    let workouts = [...(first.workouts ?? [])];
    onProgress?.(1, pageCount);

    for (let page = 2; page <= pageCount; page++) {
      const data = await this.#get("/v1/workouts", { page, pageSize: 10 });
      workouts = workouts.concat(data.workouts ?? []);
      onProgress?.(page, pageCount);
    }
    return workouts;
  }

  /**
   * Recupere le poids de corps le plus recent depuis les mensurations Hevy.
   * GET /v1/body_measurements (paginé, max 10/page). Renvoie un nombre (kg)
   * ou null si aucune mesure de poids n'est trouvee.
   */
  async getLatestBodyweight() {
    let best = null; // { date, weight }
    const first = await this.#get("/v1/body_measurements", {
      page: 1,
      pageSize: 10,
    });
    const pageCount = first.page_count ?? 1;
    const consider = (entry) => {
      const w = entry?.weight_kg;
      if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) return;
      const date = entry.date ?? "";
      if (!best || date > best.date) best = { date, weight: w };
    };
    for (const e of first.body_measurements ?? []) consider(e);

    for (let page = 2; page <= pageCount; page++) {
      const data = await this.#get("/v1/body_measurements", {
        page,
        pageSize: 10,
      });
      for (const e of data.body_measurements ?? []) consider(e);
    }
    return best?.weight ?? null;
  }

  /** Recupere TOUS les modeles d'exercices (max 100/page) -> map id -> template. */
  async getExerciseTemplateMap({ onProgress } = {}) {
    const map = new Map();
    const first = await this.#get("/v1/exercise_templates", {
      page: 1,
      pageSize: 100,
    });
    const pageCount = first.page_count ?? 1;
    for (const t of first.exercise_templates ?? []) map.set(t.id, t);
    onProgress?.(1, pageCount);

    for (let page = 2; page <= pageCount; page++) {
      const data = await this.#get("/v1/exercise_templates", {
        page,
        pageSize: 100,
      });
      for (const t of data.exercise_templates ?? []) map.set(t.id, t);
      onProgress?.(page, pageCount);
    }
    return map;
  }
}
