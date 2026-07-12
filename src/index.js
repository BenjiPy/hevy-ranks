#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "./env.js";
import { HevyClient } from "./hevy.js";
import { buildCatalog, workoutsToSessions, computeRanks } from "./engine.js";

loadEnv();
const __dirname = dirname(fileURLToPath(import.meta.url));

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmt = (n) => nf.format(n);

function bar(progress, width = 20) {
  const filled = Math.round(progress * width);
  return "[" + "#".repeat(filled) + "-".repeat(width - filled) + "]";
}

async function resolveBodyweight(client) {
  try {
    const w = await client.getLatestBodyweight();
    if (w) return { value: w, source: "Hevy API" };
  } catch {
    /* fall back to .env */
  }
  const env = Number(process.env.BODYWEIGHT_KG);
  if (Number.isFinite(env) && env > 0) return { value: env, source: ".env" };
  return { value: null, source: null };
}

async function main() {
  const apiKey = process.env.HEVY_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    console.error(
      "\n[X] Missing API key. Set HEVY_API_KEY in .env\n" +
        "    (https://hevy.com/settings?developer, Hevy Pro required)\n"
    );
    process.exit(1);
  }

  const sex = process.env.SEX ?? "male";
  const client = new HevyClient(apiKey.trim());

  console.log("\n== Hevy Ranks -- Rank per muscle group ==\n");

  const bw = await resolveBodyweight(client);
  if (!bw.value) {
    console.error(
      "[X] Bodyweight not found. Set BODYWEIGHT_KG in .env\n"
    );
    process.exit(1);
  }
  console.log(`Bodyweight: ${fmt(bw.value)} kg (source: ${bw.source})`);

  const templates = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "exercise-templates.json"), "utf8")
  );
  const catalog = buildCatalog(templates);

  const count = await client.getWorkoutCount();
  process.stdout.write(`Loading ${count} workouts...`);
  const workouts = await client.getAllWorkouts({
    onProgress: (p, t) =>
      process.stdout.write(`\rLoading workouts... ${p}/${t}   `),
  });
  console.log(`\rWorkouts loaded: ${workouts.length}${" ".repeat(20)}`);

  const sessions = workoutsToSessions(workouts);
  const result = computeRanks(sessions, catalog, { bodyweightKg: bw.value, sex });

  console.log("\n=====================================================");
  for (const g of Object.values(result.groups)) {
    const name = g.group.label.padEnd(11);
    if (!g.hasData) {
      console.log(`  ${name} : -- (no qualifying exercise)`);
      continue;
    }
    const tierName = `${g.tier.name}${g.capped ? "*" : ""}`.padEnd(10);
    const composite = `composite ${fmt(g.eqRatio)}x BW`;
    const topExo =
      `top: ${g.best.title} ${fmt(g.best.load)}kg x${g.best.reps} ` +
      `-> 1RM ${fmt(g.best.best1RM)}kg`;
    console.log(`  ${name} : ${tierName} ${bar(g.progress)}  ${composite} | ${topExo}`);
  }
  console.log("=====================================================");
  console.log("  * = rank capped (isolation only -> Titan, or < 3 sessions -> Platinum)");
  console.log(`  Composite: weighted average of your top 3 compound lifts (>= ${result.minSessions} sessions).\n`);
}

main().catch((err) => {
  console.error("\n[X] Error:", err.message, "\n");
  process.exit(1);
});
