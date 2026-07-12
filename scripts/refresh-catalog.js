#!/usr/bin/env node
/**
 * Regenerate data/exercise-templates.json from the Hevy API.
 * This catalog (title <-> muscle group) lets the site work in CSV mode
 * (no API key) and map exercises on the client side.
 *
 * Usage: HEVY_API_KEY=... node scripts/refresh-catalog.js
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "../src/env.js";
import { HevyClient } from "../src/hevy.js";

loadEnv();
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const key = process.env.HEVY_API_KEY?.trim();
  if (!key) {
    console.error("HEVY_API_KEY missing (in .env).");
    process.exit(1);
  }
  const client = new HevyClient(key);
  const map = await client.getExerciseTemplateMap({
    onProgress: (p, t) => process.stdout.write(`\rTemplates... ${p}/${t}`),
  });
  const arr = [...map.values()].map((t) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    primary: t.primary_muscle_group,
    secondary: t.secondary_muscle_groups,
    equipment: t.equipment_category,
  }));
  const out = join(__dirname, "..", "data", "exercise-templates.json");
  mkdirSync(join(__dirname, "..", "data"), { recursive: true });
  writeFileSync(out, JSON.stringify(arr));
  console.log(`\n${arr.length} exercises written to data/exercise-templates.json`);
}

main().catch((e) => {
  console.error("\nError:", e.message);
  process.exit(1);
});
