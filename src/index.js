#!/usr/bin/env node
import { loadEnv } from "./env.js";
import { HevyClient } from "./hevy.js";
import {
  computeMuscleStats,
  volumeToRank,
  LEG_MUSCLES,
  RANKS,
} from "./rank.js";

loadEnv();

const nf = new Intl.NumberFormat("fr-FR");
const fmt = (n) => nf.format(Math.round(n));

function bar(progress, width = 24) {
  const filled = Math.round(progress * width);
  return "[" + "#".repeat(filled) + "-".repeat(width - filled) + "]";
}

async function main() {
  const apiKey = process.env.HEVY_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    console.error(
      "\n[X] Cle API manquante.\n" +
        "    Renseigne HEVY_API_KEY dans le fichier .env\n" +
        "    (genere ta cle sur https://hevy.com/settings?developer, Hevy Pro requis)\n"
    );
    process.exit(1);
  }

  const client = new HevyClient(apiKey.trim());

  console.log("\n== Hevy Ranks -- Rang des JAMBES ==\n");

  process.stdout.write("Chargement des modeles d'exercices... ");
  const templateMap = await client.getExerciseTemplateMap();
  console.log(`${templateMap.size} exercices.`);

  const count = await client.getWorkoutCount();
  process.stdout.write(`Chargement des seances (${count} au total)`);
  const workouts = await client.getAllWorkouts({
    onProgress: (p, total) => process.stdout.write(`\rChargement des seances... page ${p}/${total}   `),
  });
  console.log(`\rSeances chargees : ${workouts.length}${" ".repeat(20)}`);

  const stats = computeMuscleStats(workouts, templateMap, LEG_MUSCLES);
  const { rank, next, progress, remaining } = volumeToRank(stats.totalVolume);

  console.log("\n---------------------------------------------");
  console.log(`  RANG JAMBES :  ${rank.toUpperCase()}`);
  console.log("---------------------------------------------");
  console.log(`  Volume cumule   : ${fmt(stats.totalVolume)} kg`);
  console.log(`  Seances jambes  : ${stats.sessionCount}`);
  console.log(`  Sets comptes    : ${stats.totalSets}  |  Reps : ${fmt(stats.totalReps)}`);
  console.log(`  Charge max/set  : ${fmt(stats.heaviestSet)} kg`);
  console.log(`  Meilleure seance: ${fmt(stats.bestVolumeSession)} kg de volume`);

  console.log("\n  Progression :");
  if (next) {
    console.log(`  ${bar(progress)} ${Math.round(progress * 100)}%`);
    console.log(`  Vers ${next} : encore ${fmt(remaining)} kg`);
  } else {
    console.log(`  ${bar(1)} 100%  -- rang maximum atteint !`);
  }

  if (stats.topExercises.length) {
    console.log("\n  Top exercices (par volume) :");
    for (const [i, e] of stats.topExercises.entries()) {
      console.log(`   ${i + 1}. ${e.title} - ${fmt(e.volume)} kg`);
    }
  }

  console.log("\n  Paliers de rang (volume cumule en kg) :");
  for (const r of RANKS) {
    const marker = r.name === rank ? " <= toi" : "";
    console.log(`   - ${r.name.padEnd(9)} >= ${fmt(r.min).padStart(11)} kg${marker}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("\n[X] Erreur :", err.message, "\n");
  process.exit(1);
});
