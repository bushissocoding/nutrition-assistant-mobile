# Nutrition Assistant API (MVP)

Small Express API serving an explicitly attributed demonstration food catalog and deterministic sample meal plans. Route handlers, catalog access, and nutrition/planning services are separated under `server/src/`.

## Run

```sh
npm install
npm run api
npm run test:api
```

API listens on `http://localhost:4000` by default. Set `PORT` and `CORS_ORIGIN` for local deployment. The default CORS `*` is for development only; set an explicit origin before deployment. There is no authentication, account identity, account ownership security, or production persistence. The JSON store described below is a local development foundation only; diary and grocery CRUD routes are not included yet.

### Routes

- `GET /health`
- `GET /api/v1/foods?q=...&category=...`
- `GET /api/v1/foods/:id`
- `POST /api/v1/nutrition/calculate` — `{ "items": [{ "foodId": "rice-steamed", "grams": 100 }] }`
- `POST /api/v1/meal-plans/generate` — `{ "budgetVnd": 120000, "allergies": ["cá"], "excludedFoodIds": [], "preferences": "...", "targets": { "fiberG": { "min": 25 }, "sodiumMg": { "max": 2000 } }, "hardLimits": { "sodiumMg": { "max": 2300 } } }`

The planner searches the finite meal-template catalog across 0.75×, 1×, and 1.25× portions per meal slot. `targets` are soft objectives (below-minimum/above-maximum results are allowed but returned as warnings); `hardLimits` are enforced ceilings/floors and plans that violate them are rejected. Omitted soft targets use generic demonstration ranges from `server/src/services/meal-planner.js`. They are product examples, not personalized dietary recommendations or medical constraints. The optimizer cannot create a recipe outside `server/data/meals.json`.

## Local demo data storage

The API composition provides a namespaced JSON repository for future diary and grocery routes. Its default file is `server/.local-data/demo-store.json`; set `DEMO_DATA_FILE` to override the path. The directory is ignored by Git and is created only when the first record is written.

Enable demo data in PowerShell before starting the API:

```powershell
$env:DEMO_DATA_ENABLED = 'true'
# Optional; relative paths resolve from the repository root.
$env:DEMO_DATA_FILE = '.\server\.local-data\demo-store.json'
npm run api
```

On macOS/Linux, run `DEMO_DATA_ENABLED=true npm run api`. Leave the flag unset or set it to `false` to disable demo data routes. `NODE_ENV=production` always disables them, regardless of the flag. Routes that use the demo context must apply its request-scope middleware; without the flag it returns `503`, and a missing or malformed `X-Demo-Namespace` returns `400`.

`X-Demo-Namespace` is caller-controlled and only separates local demo collections. Anyone who can send requests can claim another namespace, so this does not provide authentication, account ownership security, or permission to store real health information. Do not expose demo data routes publicly or enter real personal/health data. The JSON store has no backup, retention, multi-server synchronization, or production durability guarantee.

Meal generation is deterministic template selection, not AI, a clinical optimizer, or a validated diet prescription. Demonstration price estimates are invented. Nutrient estimates omit recipe variation, oil, salt, sauces and seasoning. Read `data/sources.json` for source limitations.

## Food data provenance / Vietnam data

The project request asks to use Vietnam's National Institute of Nutrition. This repository does **not** yet include an official Institute dataset: in this implementation session, an official machine-readable download and its reuse terms could not be verified. We therefore do not attribute any values to the Institute. The handful of prototype records use approximate comparator values referenced to USDA FoodData Central, with record-level notes in `data/foods.json`; they are not Vietnam-specific and are not clinical-grade.

Before production, obtain an official Vietnamese food composition table and confirm permission/license for redistribution. Preserve edition, food identifiers, preparation state, units, source page/value, missing-value semantics and transformations on every imported record. Have a qualified Vietnamese dietitian review recipes and serving sizes. Do not load a scraped/unclear-license table or label estimates as official Institute data.

## Mobile connection

The Expo app reads `EXPO_PUBLIC_API_URL` from the repository-root `.env` file; see the [root README's target-specific URL and connectivity instructions](../README.md#choose-the-api-url-for-the-app-target). The client fails clearly when the URL is missing or malformed rather than silently using `localhost`. The API binds to `0.0.0.0` for development, but a phone still needs a reachable computer LAN address, the same non-isolated network, and a firewall rule allowing TCP port 4000. Confirm access by opening `http://<backend-host>:4000/health` in the phone/emulator browser and checking for `{"status":"ok"}`. A Metro tunnel does not tunnel this API.

The demo namespace is persisted by the app only to keep a local demo partition stable across app restarts. The API accepts that namespace from the caller, so it is not authentication, verified identity, or ownership protection. Demo routes are disabled by default and always disabled in production. The diary and grocery CRUD routes are not implemented yet; only synthetic demo data may be used until issue #3 provides authenticated identity and the backend adds production-grade ownership and storage protections.
