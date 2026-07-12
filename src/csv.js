/**
 * Parseur du CSV d'export Hevy (mode "sans cle API").
 * Colonnes attendues :
 * title, start_time, end_time, description, exercise_title, superset_id,
 * exercise_notes, set_index, set_type, weight_kg, reps, distance_km,
 * duration_seconds, rpe
 *
 * Transforme le CSV en "sessions" au format attendu par le moteur (engine.js).
 */

/** Tokenise une ligne CSV en gerant les guillemets et les "" echappes. */
function parseLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** Decoupe le texte CSV en lignes en respectant les champs multi-lignes. */
function splitRows(text) {
  const rows = [];
  let row = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "\n" && !inQuotes) {
      if (row.trim() !== "") rows.push(row);
      row = "";
    } else {
      row += ch;
    }
  }
  if (row.trim() !== "") rows.push(row);
  return rows;
}

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {string} text - contenu brut du CSV
 * @returns {Array} sessions [{ date, title, exercises:[{ title, sets:[{weight,reps,type}] }] }]
 */
export function parseHevyCsv(text) {
  const rows = splitRows(text);
  if (rows.length < 2) return [];

  const header = parseLine(rows[0]).map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const idx = {
    title: col("title"),
    start: col("start_time"),
    exercise: col("exercise_title"),
    setType: col("set_type"),
    weight: col("weight_kg"),
    reps: col("reps"),
  };

  const sessions = new Map(); // cle (title|start) -> session
  for (let r = 1; r < rows.length; r++) {
    const c = parseLine(rows[r]);
    const wTitle = c[idx.title] ?? "";
    const start = c[idx.start] ?? "";
    const exTitle = (c[idx.exercise] ?? "").trim();
    if (!exTitle) continue;

    const key = `${wTitle}|${start}`;
    let session = sessions.get(key);
    if (!session) {
      session = { date: start, title: wTitle, _ex: new Map(), exercises: [] };
      sessions.set(key, session);
    }
    let exercise = session._ex.get(exTitle);
    if (!exercise) {
      exercise = { title: exTitle, sets: [] };
      session._ex.set(exTitle, exercise);
      session.exercises.push(exercise);
    }
    exercise.sets.push({
      weight: num(c[idx.weight]),
      reps: num(c[idx.reps]),
      type: (c[idx.setType] ?? "normal").trim() || "normal",
    });
  }

  return [...sessions.values()].map((s) => ({
    date: s.date,
    title: s.title,
    exercises: s.exercises,
  }));
}
