#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "./env.js";
import { HevyClient } from "./hevy.js";
import { buildCatalog, workoutsToSessions, computeRanks } from "./engine.js";

loadEnv();
const __dirname = dirname(fileURLToPath(import.meta.url));

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const fmt = (n) => nf.format(n);

function bar(progress, width = 20) {
  const filled = Math.round(progress * width);
  return "[" + "#".repeat(filled) + "-".repeat(width - filled) + "]";
}

async function resolveBodyweight(client) {
  try {
    const w = await client.getLatestBodyweight();
    if (w) return { value: w, source: "API Hevy" };
  } catch {
    /* repli .env */
  }
  const env = Number(process.env.BODYWEIGHT_KG);
  if (Number.isFinite(env) && env > 0) return { value: env, source: ".env" };
  return { value: null, source: null };
}

async function main() {
  const apiKey = process.env.HEVY_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    console.error(
      "\n[X] Cle API manquante. Renseigne HEVY_API_KEY dans .env\n" +
        "    (https://hevy.com/settings?developer, Hevy Pro requis)\n"
    );
    process.exit(1);
  }

  const sex = process.env.SEX ?? "male";
  const client = new HevyClient(apiKey.trim());

  console.log("\n== Hevy Ranks -- Rang par groupe musculaire ==\n");

  const bw = await resolveBodyweight(client);
  if (!bw.value) {
    console.error(
      "[X] Poids de corps introuvable. Renseigne BODYWEIGHT_KG dans .env\n"
    );
    process.exit(1);
  }
  console.log(`Poids de corps : ${fmt(bw.value)} kg (source: ${bw.source})`);

  const templates = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "exercise-templates.json"), "utf8")
  );
  const catalog = buildCatalog(templates);

  const count = await client.getWorkoutCount();
  process.stdout.write(`Chargement de ${count} seances...`);
  const workouts = await client.getAllWorkouts({
    onProgress: (p, t) =>
      process.stdout.write(`\rChargement des seances... ${p}/${t}   `),
  });
  console.log(`\rSeances chargees : ${workouts.length}${" ".repeat(20)}`);

  const sessions = workoutsToSessions(workouts);
  const result = computeRanks(sessions, catalog, { bodyweightKg: bw.value, sex });

  console.log("\n=====================================================");
  for (const g of Object.values(result.groups)) {
    const name = g.group.label.padEnd(11);
    if (!g.hasData) {
      console.log(`  ${name} : -- (aucune donnee chargee)`);
      continue;
    }
    const tierName = `${g.tier.name}`.padEnd(9);
    const detail =
      `${g.best.title} ${fmt(g.best.load)}kg x${g.best.reps} ` +
      `-> 1RM ${fmt(g.best.best1RM)}kg (${fmt(g.best.eqRatio)}x PdC)`;
    console.log(`  ${name} : ${tierName} ${bar(g.progress)}  ${detail}`);
  }
  console.log("=====================================================\n");
}

main().catch((err) => {
  console.error("\n[X] Erreur :", err.message, "\n");
  process.exit(1);
});
