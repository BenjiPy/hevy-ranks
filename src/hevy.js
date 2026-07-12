const BASE_URL = "https://api.hevyapp.com";

/**
 * Small client for the public Hevy API.
 * Docs: https://api.hevyapp.com/docs
 * Auth: `api-key` header (requires Hevy Pro).
 */
export class HevyClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error("Missing Hevy API key.");
    this.apiKey = apiKey;
  }

  async #get(path, params = {}) {
    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    // Simple retry on rate limit (429) or server error (5xx).
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
        `Hevy API ${res.status} on ${path}: ${body || res.statusText}`
      );
    }
    throw new Error(`Hevy API: failed after several attempts on ${path}`);
  }

  /** Total number of workouts on the account. */
  async getWorkoutCount() {
    const data = await this.#get("/v1/workouts/count");
    return data.workout_count ?? 0;
  }

  /** Fetch ALL workouts (auto-paginated, max 10/page). */
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
   * Fetch the most recent bodyweight from Hevy body measurements.
   * GET /v1/body_measurements (paginated, max 10/page). Returns a number (kg)
   * or null when no weight measurement is found.
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

  /** Fetch ALL exercise templates (max 100/page) -> map id -> template. */
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
