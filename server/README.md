# Nutrition Assistant API (MVP)

Small Express API serving an explicitly attributed demonstration food catalog and deterministic sample meal plans. Route handlers, catalog access, and nutrition/planning services are separated under `server/src/`.

## Run

```sh
npm install
npm run api
npm run test:api
```

API listens on `http://localhost:4000` by default. Set `PORT` and `CORS_ORIGIN` for local deployment. The default CORS `*` is for development only; set an explicit origin before deployment. No authentication, database, account storage, or health-data persistence is implemented.

### Routes

- `GET /health`
- `GET /api/v1/foods?q=...&category=...`
- `GET /api/v1/foods/:id`
- `POST /api/v1/nutrition/calculate` — `{ "items": [{ "foodId": "rice-steamed", "grams": 100 }] }`
- `POST /api/v1/meal-plans/generate` — request schema below; contract version is required.

### Versioned meal-plan contract (`contractVersion: "1.0"`)

Request example:

```json
{
  "contractVersion": "1.0",
  "budgetVnd": 120000,
  "allergies": ["cá"],
  "excludedFoodIds": [],
  "preferences": "món gà",
  "targets": { "fiberG": { "min": 25 }, "sodiumMg": { "max": 2000 } },
  "hardLimits": { "sodiumMg": { "max": 2300 } }
}
```

`budgetVnd` and `contractVersion` are required; budget is a non-negative integer VND value (0–10,000,000). Allergy/exclusion lists default to empty, list entries must be non-empty strings (maximum 50 allergy labels / 200 food IDs), and `preferences` is at most 200 characters. Target keys are `energyKcal` (kcal), `proteinG`, `carbohydrateG`, `fatG`, `fiberG` (g), and `sodiumMg` (mg). Each target/limit is a non-empty `{min?, max?}` range in that key's unit, finite, non-negative, and `min <= max`. Unknown keys/fields, missing required fields, wrong types and unsupported contract versions return HTTP 400 with stable `{error:{code,message,field}}`. Malformed JSON returns `INVALID_JSON`.

Output carries the same `contractVersion`; each meal lists portions in grams, estimated VND cost, nutrient values with units, recipe/price metadata and explanation. Each portion identifies the comparator source and its note, optional external source version and record ID (null when unverified), and explicit reuse-rights status (currently unverified for demo data). Each meal exposes price-source and method metadata; current prices are synthetic estimates, not verified market data. Top-level `metadata` records internal catalog, food, recipe, pricing and algorithm versions; the internal manifest is not proof of an external source edition, license, or clinical validity. `feasibility` is either `{status:"feasible",code:"FULL_DAY_PLAN_FOUND",unmetSoftTargets:[...]}` or `{status:"infeasible",code,message,unmet}`. Infeasible output has an empty plan and no partial recommendation. Input failures use stable codes including `INVALID_INPUT` and `UNSUPPORTED_CONTRACT_VERSION`; incomplete catalog data is excluded and flagged rather than treated as zero.

Allergies and explicit food exclusions are hard filters; recorded recipe ingredients are checked, but cross-contamination is not represented. `hardLimits` are hard: the planner never relaxes them. `targets` and preferences are soft ranking objectives; unmet soft targets are returned explicitly and preference text only affects deterministic ranking. The planner enumerates the finite meal-template catalog at 0.75×, 1× and 1.25× portion scales, enforces the total budget and all hard limits, then ranks feasible full-day plans lexicographically by squared normalized soft-target deviation, number of matched preference tokens, estimated cost and stable recipe-id order; hard constraints are feasibility filters, never ranking penalties. A preference token is a whitespace-separated substring longer than two characters, matched against meal names and food IDs. A budget/constraint conflict returns structured infeasibility rather than partial meals.

Nutrient totals sum catalog per-100-g values scaled by edible grams and rounded to one decimal per meal/portion before daily summation; missing nutrients/source/serving information makes a food unavailable, never an implicit zero. Estimated template price is scaled by portion size and rounded to integer VND; it is a demonstration estimate, not a market quote. Oil, seasoning, sauce, recipe variation and cross-contamination are not modeled. Default targets are software examples, not personalized dietary recommendations or medical limits. Output is a prototype suggestion, not treatment or a validated diet prescription. Any clinical suitability claim requires qualified dietitian review of rules, sources, recipes and targets.

## Food data provenance / Vietnam data

The project request asks to use Vietnam's National Institute of Nutrition. This repository does **not** yet include an official Institute dataset: in this implementation session, an official machine-readable download and its reuse terms could not be verified. We therefore do not attribute any values to the Institute. The handful of prototype records use approximate comparator values referenced to USDA FoodData Central, with record-level notes in `data/foods.json`; they are not Vietnam-specific and are not clinical-grade.

Before production, obtain an official Vietnamese food composition table and confirm permission/license for redistribution. Preserve edition, food identifiers, preparation state, units, source page/value, missing-value semantics and transformations on every imported record. Have a qualified Vietnamese dietitian review recipes and serving sizes. Do not load a scraped/unclear-license table or label estimates as official Institute data.

## Mobile connection

`EXPO_PUBLIC_API_URL` overrides the API base URL. For a physical phone, `localhost` points to the phone itself; set this variable to the development computer's reachable LAN address, e.g. `http://192.168.1.20:4000`. The API currently has no production security hardening and must not be exposed publicly with personal data.
