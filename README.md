# Hevy Ranks

Gamifie tes séances **Hevy** : transforme ton historique en un **rang de force par
groupe musculaire** (Jambes, Pectoraux, Dos, Épaules, Bras, Abdos), du rang **Bronze**
jusqu'au rang légendaire **Mythic**.

- **Basé sur la performance réelle** (1RM estimé relatif au poids de corps), pas sur le
  volume cumulé : un gros lift dès la 1ʳᵉ séance = rang élevé immédiatement.
- **Deux modes** : clé API Hevy (Pro) **ou** import du CSV d'export (sans clé, sans Pro).
- **Site statique** compatible **GitHub Pages** — tout est calculé dans le navigateur,
  aucune donnée envoyée sur un serveur.
- **Zéro dépendance** (JS natif, `fetch`, modules ES). Projet open-source, non lucratif.

> Non affilié à Hevy. Les rangs sont des **estimations** avec des standards ajustables.

---

## Aperçu

- `index.html` — page graphique : landing, choix du mode, dashboard des rangs.
- 9 emblèmes de rang générés par IA dans `assets/ranks/` (haltère centrale, progression Bronze abîmé → Mythic légendaire, 256 px).
- Moteur de calcul partagé (`src/engine.js`) utilisé par le **site** et le **CLI**.

Les 9 rangs : **Bronze · Iron · Gold · Platinum · Diamond · Titan · Colossus · Olympian · Mythic**.

---

## Utilisation (site web)

### En local

```bash
npm run web       # sert le dossier sur http://localhost:8765
# (équivaut à : python -m http.server 8765)
```

Ouvre `http://localhost:8765`, puis choisis :

- **Connexion par clé API** — colle ta clé Hevy (générée sur
  [hevy.com/settings?developer](https://hevy.com/settings?developer), Pro requis).
  Le poids de corps est récupéré automatiquement depuis Hevy (ou saisi à la main).
- **Import CSV** — dépose ton `workouts.csv` (Hevy → Réglages → Exporter les données)
  et renseigne ton poids de corps. Aucune clé, aucun compte Pro nécessaire.

> ⚠️ **CORS** : selon la configuration de l'API Hevy, le navigateur peut bloquer les
> appels directs en mode clé API. Le mode **CSV** fonctionne toujours et est recommandé
> pour un déploiement public (GitHub Pages).

### Déploiement GitHub Pages

Le projet est un site statique : pousse le dépôt sur GitHub, puis
**Settings → Pages → Deploy from branch** (racine du dépôt). Aucune étape de build.

---

## Utilisation (CLI)

Pour un usage perso rapide en terminal (mode clé API) :

```bash
cp .env.example .env      # puis renseigne HEVY_API_KEY, BODYWEIGHT_KG, SEX
npm run cli
```

Affiche un rang par groupe musculaire directement dans le terminal.

---

## Comment le rang est calculé

### 1. Le 1RM estimé (la performance)

Pour chaque série (hors échauffement, avec charge et reps), on estime le **1RM** avec la
formule d'**Epley** (reps plafonnées à 12) :

```
1RM estimé = charge × (1 + reps/30)
```

On ne garde que **la meilleure série** de chaque exercice. C'est une mesure de perf, pas
d'accumulation.

La **charge effective** dépend du type d'exercice Hevy :

| Type Hevy              | Charge utilisée               |
| ---------------------- | ----------------------------- |
| `weight_reps`          | poids externe                 |
| `bodyweight_weighted`  | poids de corps + poids ajouté |
| `bodyweight_assisted`  | poids de corps − assistance   |
| autres (reps/durée…)   | non compté                    |

### 2. Équivalent « lift de référence » relatif au poids de corps

Chaque groupe a un **lift de référence** (Squat pour les jambes, Développé couché pour les
pecs, etc.). Chaque exercice a un **coefficient** = son 1RM typique rapporté à ce lift de
référence. On calcule :

```
équivalent = (1RM estimé / coefficient) / poids_de_corps
```

Le **rang d'un groupe = ta meilleure valeur** parmi ses exercices (ta perf unique).
Les coefficients gèrent l'**anglais et le français** et sont insensibles aux accents.

### 3. Groupes musculaires

Les `primary_muscle_group` de Hevy sont regroupés :

- **Jambes** : quadriceps, ischios, fessiers, mollets, adducteurs, abducteurs
- **Pectoraux** : chest
- **Dos** : lats, upper/lower back, traps
- **Épaules** : shoulders, neck
- **Bras** : biceps, triceps, avant-bras
- **Abdos** : abdominals

### 4. Des paliers au rang

L'équivalent (1RM/poids de corps) est comparé à **9 paliers** propres à chaque groupe
(standards masculins × ~0.72 si `SEX=female`). Exemple pour les Jambes (référence Squat) :

| Rang     | Éq. Squat (1RM/PdC) |
| -------- | ------------------- |
| Bronze   | < 0.5               |
| Iron     | ≥ 0.5               |
| Gold     | ≥ 0.75              |
| Platinum | ≥ 1.0               |
| Diamond  | ≥ 1.25              |
| Titan    | ≥ 1.5               |
| Colossus | ≥ 1.75              |
| Olympian | ≥ 2.1               |
| Mythic   | ≥ 2.5               |

---

## Personnaliser

- **Paliers, groupes, lifts de référence** : objet `GROUPS` dans `src/engine.js`.
- **Coefficients par exercice (EN/FR)** : `GROUP_COEFFS` dans `src/engine.js`.
- **Emblèmes** : remplace/régénère les fichiers de `assets/ranks/` (noms conservés dans `RANK_TIERS`, `src/engine.js`), puis lance `python scripts/optimize-ranks.py` pour les redimensionner/compresser.
- **Catalogue d'exercices** : `npm run refresh-catalog` (régénère `data/exercise-templates.json`).

## Structure

```
index.html / styles.css / app.js   # site web (GitHub Pages)
assets/ranks/rank-01..09-*.png      # emblèmes de rang (IA, 256px)
data/exercise-templates.json        # catalogue titre -> muscle (embarqué)
src/
  engine.js   # moteur de rang partagé (navigateur + Node)
  csv.js      # parseur du CSV d'export Hevy
  hevy.js     # client API Hevy (workouts, templates, poids de corps)
  env.js      # mini parseur .env (CLI uniquement)
  index.js    # CLI
scripts/refresh-catalog.js
```

## Limites connues

- API Hevy en **v0.0.1** (susceptible de changer) et **CORS** possible en navigateur.
- Coefficients et seuils = **approximations** (standards de force courants), ajustables.
- Les exercices **au poids de corps sans charge** (reps only) et le **cardio** ne comptent
  pas dans le rang de force.
- Le rang par **muscle individuel** (et non par groupe) est prévu pour plus tard.

## Roadmap

- Rang par muscle précis (option), en plus du rang par groupe.
- Leaderboard multi-utilisateurs (nécessite un backend + accord de Hevy).
- Bodyweight-reps score pour la callisthénie.

## Liens

- API Hevy : https://api.hevyapp.com/docs
- Générer sa clé : https://hevy.com/settings?developer
