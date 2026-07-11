import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Charge les variables d'un fichier .env dans process.env.
 * Parseur minimal (pas de dependance externe) : gere KEY=VALUE,
 * les lignes vides, les commentaires (#) et les guillemets optionnels.
 */
export function loadEnv(path = join(__dirname, "..", ".env")) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return; // pas de .env : on se rabat sur l'environnement systeme
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
