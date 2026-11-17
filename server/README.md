# Nutrition Assistant API (MVP)

Small Express API serving an explicitly attributed demonstration food catalog, deterministic sample meal plans, a demo-only persistent meal diary, and the current demo grocery list. Route handlers, repositories, catalog access, and nutrition/planning services are separated under `server/src/`.

## Run

```sh
npm ci
npm run api
npm run test:unit
npm run test:api
npm run test:ui
```

Before the first run, copy `server/.env.example` to `server/.env` if that file does not already exist. The API script loads this optional file using Node's built-in `--env-file-if-exists`; shell environment variables take precedence. Node added the option in v22.9.0, before this repository's declared minimums. The feature is marked as active development in the Node 24.3 documentation. See [Node v22.13 CLI environment-file options](https://nodejs.org/download/release/v22.13.0/docs/api/cli.html#--env-file-if-existsconfig) and [Node v24.3 CLI environment-file options](https://nodejs.org/download/release/v24.3.0/docs/api/cli.html#--env-file-if-existsconfig).

API listens on `http://localhost:4000` by default. Set `PORT` and `CORS_ORIGIN` for local deployment. The sample's `CORS_ORIGIN=*` is for development only; set an explicit origin before deployment. Demo routes and persistence remain disabled unless `DEMO_DATA_ENABLED=true` is explicitly set. There is no authentication, account identity, profile API, account ownership security, or production persistence. The JSON store described below is local development storage only.

CI runs the Android bundle export and a high/critical dependency audit after the required unit, UI and API tests. Bundle export does not verify an installed app or device connectivity. See the [security and operations baseline](../docs/security-and-operations.md) for current controls, residual risks and release prerequisites.

### Routes

- `GET /health`
- `GET /api/v1/foods?q=...&category=...`
- `GET /api/v1/foods/:id`
- `POST /api/v1/nutrition/calculate` — `{ "items": [{ "foodId": "rice-steamed", "grams": 100 }] }`
- `POST /api/v1/meal-plans/generate` — `{ "budgetVnd": 120000, "allergies": ["cá"], "excludedFoodIds": [], "preferences": "...", "targets": { "fiberG": { "min": 25 }, "sodiumMg": { "max": 2000 } }, "hardLimits": { "sodiumMg": { "max": 2300 } } }`
- `POST /api/v1/meal-entries` — create a catalog-food diary entry; requires `X-Demo-Namespace` and `Idempotency-Key`.
- `GET /api/v1/meal-entries?date=YYYY-MM-DD&timeZone=Asia/Ho_Chi_Minh&limit=50&offset=0` — list entries for a user's local calendar day and return server totals.
- `GET /api/v1/meal-entries/:id`, `PATCH /api/v1/meal-entries/:id`, `DELETE /api/v1/meal-entries/:id` — read, update, or delete an entry within the current demo namespace.
- `DELETE /api/v1/meal-entries` — purge all diary entries and idempotency records in the current namespace.
- `POST /api/v1/shopping-lists` — create/replace the current grocery list from `{ "items": [{ "foodId": "rice-steamed", "amount": 300, "unit": "g" }] }`; requires `X-Demo-Namespace` and `Idempotency-Key`.
- `GET /api/v1/shopping-lists/current` — read the current list, returning `{ "list": null }` before one has been created.
- `PATCH /api/v1/shopping-lists/current/items/:itemId` — update `amount`, `unit`, and/or `purchased`.
- `DELETE /api/v1/shopping-lists/current/items/:itemId` — delete one item.
- `DELETE /api/v1/shopping-lists/current` — remove the current list and retain minimal idempotency tombstones.
- `DELETE /api/v1/shopping-lists` — purge the list and idempotency ledger in the current namespace.

### Meal diary contract (demo only)

Create accepts `foodId`, `portion: { amount, unit: "g" }`, `mealType` (`BREAKFAST`, `LUNCH`, `DINNER`, `SNACK`), an ISO-8601 `consumedAt` with `Z` or an explicit offset, an IANA `timeZone`, and optional `notes` up to 500 characters. The server validates the catalog ID and computes per-entry nutrients; clients cannot submit nutrient values. List responses contain entries, totals for the full day before pagination, pagination metadata, and an estimate disclaimer.

`PATCH` accepts only `foodId`, `portion`, `mealType`, `consumedAt`, `timeZone`, and `notes`, and recomputes nutrients from the catalog. `DELETE /:id` is repeat-safe and returns `204`; namespace purge also returns `204`.

The requested `date` is interpreted between local midnights in the supplied IANA timezone and converted to a half-open UTC interval. This handles daylight-saving days that are not 24 hours. List pagination uses `limit` 1–100 (default 50) and a nonnegative `offset`; totals cover the full day before pagination. Create requests require an 8–128 character ASCII idempotency key containing only letters, numbers, `_`, `-`, `.`, and `:`. Repeating the same key and normalized body returns the original record; reusing a key with different data returns `409`; retrying a deleted result returns `410`. Deleting one entry retains its key tombstone. Namespace purge removes both records and tombstones. New diary errors use `{ "error": "...", "code": "..." }`.

Only synthetic demonstration records are allowed. The namespace is selected by the caller and is not identity, authentication, or ownership security. Demo storage is disabled by default and always disabled in production. Do not enter real health information. Server-calculated nutrients are estimates from the demonstration catalog, not medical advice.

### Grocery list contract (demo only)

There is one current list per demo namespace. Creating a new list replaces the current list. The app must confirm before replacing an existing list because purchased state and quantity edits will be lost. Create accepts 1–100 unique items with a catalog `foodId`, finite `amount` greater than 0 and no more than 1,000,000, and `unit` from `g`, `kg`, `ml`, `l`, `piece`, `bunch`, or `pack`. The planner response's `grams` are sent as `amount` with `unit: "g"`. The server looks up item names from the catalog, creates IDs/timestamps, and initializes `purchased: false`; client-supplied names, IDs, purchased flags, and timestamps are rejected.

`PATCH` accepts only `amount`, `unit`, and/or boolean `purchased`; item delete returns `204`. Deleting the final item retains an empty current list. `DELETE /current` removes the current list but keeps its idempotency ledger so a stale create retry returns `410`; `DELETE /shopping-lists` clears both current data and ledger for profile/consent purge.

Create uses the same 8–128 character idempotency-key syntax as diary create. A retry with the same normalized body returns the current list (`200`) without duplicating items; a different body for an existing key returns `409`. A key pointing to a replaced/deleted list returns `410`. The ledger stores only the key, payload fingerprint, list ID, and timestamp, not item bodies; it has no automatic TTL. New shopping-list errors have `{ "error": "...", "code": "..." }` and return a finite retryable response for store failures.

The list is a snapshot submitted by the mobile client from the planner response. The API validates catalog IDs and quantities but does not persist or cryptographically verify the original plan. Changing a grocery amount or unit does not update meal portions or nutrient totals. Price, nutrition, food sources, and the planner remain demonstration estimates, not clinical advice.

The planner searches the finite meal-template catalog across 0.75×, 1×, and 1.25× portions per meal slot. `targets` are soft objectives (below-minimum/above-maximum results are allowed but returned as warnings); `hardLimits` are enforced ceilings/floors and plans that violate them are rejected. Omitted soft targets use generic demonstration ranges from `server/src/services/meal-planner.js`. They are product examples, not personalized dietary recommendations or medical constraints. The optimizer cannot create a recipe outside `server/data/meals.json`.

## Local demo data storage

The API composition provides namespaced JSON repositories used by the meal diary and current grocery list. Its default file is `server/.local-data/demo-store.json`; set `DEMO_DATA_FILE` to override the path. The directory is ignored by Git and is created only when the first record is written.

Enable demo data only for synthetic local testing. Set `DEMO_DATA_ENABLED=true` in `server/.env`, or override it in PowerShell before starting the API:

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

The demo namespace is persisted by the app only to keep a local demo partition stable across app restarts. The API accepts that namespace from the caller, so it is not authentication, verified identity, or ownership protection. Demo routes are disabled by default and always disabled in production. Diary and grocery CRUD use this demo partition. Only synthetic demo data may be used until issue #3 provides authenticated identity and the backend adds production-grade ownership and storage protections.
