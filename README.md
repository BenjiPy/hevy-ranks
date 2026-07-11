# Hevy Ranks

POC local qui récupère tes séances de musculation depuis **Hevy** via son API officielle,
et transforme ton historique en un **rang gamifié**. Ici, le premier exemple calcule le
**rang des jambes**.

Zéro dépendance externe : uniquement Node.js (le `fetch` natif et un mini parseur `.env` maison).

---

## Prérequis

- **Node.js >= 18** (testé sur Node 20).
- Un **abonnement Hevy Pro** (l'API n'est ouverte qu'aux comptes Pro).
- Une **clé API** générée sur https://hevy.com/settings?developer

## Installation

```bash
# 1. Copie le fichier d'exemple (ou édite directement .env)
cp .env.example .env

# 2. Colle ta clé dans .env :
#    HEVY_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Utilisation

```bash
node src/index.js
# ou
npm run legs
```

Exemple de sortie :

```
== Hevy Ranks -- Rang des JAMBES ==

Seances chargees : 137

---------------------------------------------
  RANG JAMBES :  OR
---------------------------------------------
  Volume cumule   : 128 450 kg
  Seances jambes  : 41
  Sets comptes    : 512  |  Reps : 4 380
  Charge max/set  : 140 kg
  Meilleure seance: 9 200 kg de volume

  Progression :
  [########----------------] 36%
  Vers Platine : encore 71 550 kg
```

---

## Comment le rang est calculé

### 1. Récupération des données (`src/hevy.js`)

- `GET /v1/exercise_templates` : catalogue des exercices → on récupère le
  `primary_muscle_group` de chaque exercice (chest, quadriceps, hamstrings, ...).
- `GET /v1/workouts/count` puis `GET /v1/workouts` (paginé, **max 10 séances/page**) :
  tout l'historique de séances, avec le détail de chaque set (poids, reps, type...).

L'authentification se fait via le header `api-key` (ta clé du `.env`).

### 2. Ce qui est considéré comme « jambes » (`src/rank.js`)

Un exercice compte pour les jambes si son `primary_muscle_group` est l'un de :

```
quadriceps · hamstrings · glutes · calves · abductors · adductors
```

### 3. Le volume (le cœur du calcul)

Pour chaque **set** d'un exercice de jambes, on calcule le **volume** :

```
volume_du_set = poids_kg × répétitions
```

Un set n'est compté que si :

- il a un **poids > 0** et des **reps > 0**, et
- ce **n'est pas un échauffement** (`type = "warmup"` est ignoré).

> Pourquoi le volume ? C'est la mesure la plus classique du « travail total » réalisé
> par un muscle (aussi appelée *tonnage*). Elle récompense à la fois la charge lourde
> et le volume d'entraînement (séries × reps), ce qui en fait une bonne base d'XP.

Le **volume cumulé** = somme des volumes de tous les sets de jambes sur **tout ton
historique**. C'est cette valeur qui détermine ton rang.

### 4. Des paliers au rang

Le volume cumulé (en kg) est comparé à des paliers :

| Rang     | Volume cumulé requis |
| -------- | -------------------- |
| Bronze   | 0 kg                 |
| Argent   | 25 000 kg            |
| Or       | 75 000 kg            |
| Platine  | 200 000 kg           |
| Diamant  | 500 000 kg           |
| Maître   | 1 000 000 kg         |
| Légende  | 2 500 000 kg         |

La **progression** affichée est le pourcentage parcouru entre le palier actuel et le
suivant :

```
progression = (volume - palier_actuel) / (palier_suivant - palier_actuel)
```

### Autres stats affichées

- **Séances jambes** : nombre de jours distincts avec au moins un set de jambes.
- **Charge max/set** : le poids le plus lourd soulevé sur un set de jambes.
- **Meilleure séance** : le plus gros volume de jambes réalisé en une seule séance.
- **Top exercices** : tes 5 exercices de jambes classés par volume total.

---

## Personnaliser

- **Changer les seuils de rang** : édite le tableau `RANKS` dans `src/rank.js`.
- **Changer les muscles ciblés** : édite `LEG_MUSCLES` (ou passe un autre `Set` de
  muscles à `computeMuscleStats` pour créer un rang « pecs », « dos », etc.).
- **Changer la formule** : la logique de volume est isolée dans `computeMuscleStats`,
  facile à remplacer (ex. pondérer par le RPE, la 1RM estimée, etc.).

## Structure du projet

```
src/
  env.js     # mini parseur .env (zéro dépendance)
  hevy.js    # client de l'API Hevy (fetch + pagination + retry)
  rank.js    # muscles ciblés, calcul du volume et des rangs
  index.js   # CLI : récupère, calcule et affiche le rang
.env.example # modèle de configuration
```

## Limites connues

- L'API Hevy est en **v0.0.1** : structure susceptible de changer (voir la doc officielle).
- Pagination des séances limitée à **10/page** → sur un gros historique, le premier
  chargement fait plusieurs appels (pas de cache local dans ce POC).
- Le volume ignore les exercices sans poids (cardio, poids de corps sans charge, durée).

## Liens utiles

- Doc API : https://api.hevyapp.com/docs
- Générer sa clé : https://hevy.com/settings?developer
