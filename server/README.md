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
- `GET /api/v1/foods?q=...&category=...` — returns `{ items, count, disclaimer, catalog }`. `catalog` contains the catalog version/status, source registry, nutrient units and limitations; food records include aliases, preparation, serving conversions, nutrient basis/units, missingness, provenance and review state.
- `GET /api/v1/foods/:id`
- `POST /api/v1/nutrition/calculate` — `{ "items": [{ "foodId": "rice-steamed", "grams": 100 }] }`
- `POST /api/v1/meal-plans/generate` — optional `{ "contractVersion": 1, "budgetVnd": 120000, "allergies": ["cá"], "excludedFoodIds": [], "preferences": "...", "targets": { "fiberG": { "min": 25, "unit": "g" }, "sodiumMg": { "max": 2000, "unit": "mg" } }, "hardLimits": { "sodiumMg": { "max": 2300, "unit": "mg" } } }`. Existing requests without `contractVersion` remain accepted; invalid input returns `{ "error", "code", "issues" }`.
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

The planner searches the finite meal-template catalog across 0.75×, 1×, and 1.25× portions per meal slot and returns `status: feasible | infeasible | unavailable`. `targets` are soft ranking objectives; missed ranges and preferences are warnings. `hardLimits` and known allergies are enforced, and the planner never returns a partial plan as success. If a declared allergen is not covered by catalog tags or required nutrition/provenance is missing, it fails closed with `status: unavailable`. If no full combination satisfies hard constraints, it returns `status: infeasible` with a reason and an empty plan. Nutrient ranges use the key-defined units: kcal for energy, g for protein/carbohydrate/fat/fiber and mg for sodium; a supplied `unit` must match. Omitted soft targets use generic demonstration ranges from `server/src/services/meal-planner.js`. They are product examples, not personalized dietary recommendations or medical constraints. The optimizer cannot create a recipe outside `server/data/meals.json`.

Successful results include portions in grams, per-meal and daily nutrients, selection reasons, source and record versions, catalog version, algorithm version, and warnings. Legacy nutrition comparators have source attribution but some exact record IDs/editions remain unrecoverable; the response exposes that limitation. Allergy tags do not guarantee cross-contact safety.

The old hard-coded `estimatedCostVnd` values in meal templates had no registered price source and are no longer used. A budget is optional. When supplied, every candidate used for budget evaluation must have a registered, versioned VND price source whose value is the 1× template cost (`basis: "template-1x"`); the planner scales it linearly with portion size. The current catalog has no such prices, so the API returns `status: unavailable`, `PRICE_DATA_UNAVAILABLE`, and an empty plan instead of claiming a budget fit. When no budget is supplied, a nutrition-only suggestion can be returned with null costs and an explicit warning. No prices are fabricated.

Food values are stored on a 100 g edible-portion basis. Each nutrient carries its unit and either a numeric `value` with `status: "reported"` or `value: null` with `status: "missing"` and a reason. Zero is a valid reported value and is never treated as missing. Calculations preserve unknowns as `null`; the API does not turn missing nutrients into zero. The meal-planner catalog loader refuses foods referenced by active templates when any planner nutrient is missing. Metric mass conversion is deterministic (`mg`, `g`, `kg`); volume or household units require an explicit per-food grams conversion, and the system does not assume a water-like density.

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

Meal generation is deterministic template selection, not AI, a clinical optimizer, or a validated diet prescription. No sourced food-price data is currently available. Nutrient estimates omit recipe variation, oil, salt, sauces and seasoning. Read `data/sources.json` for source limitations.

## Food data provenance / Vietnam data

The active catalog is `server/data/foods.json`, versioned as `prototype-2026-11-17.1`. Each record keeps Vietnamese labels and aliases, raw/cooked and maturity state, household serving and any explicit unit conversion, nutrients with units/missingness, provenance by field group, a record version, and review status. The API preserves the existing `/api/v1` fields (including `name`, `serving`, and numeric `per100g`) and adds the richer metadata. A missing `per100g` nutrient is omitted from that compatibility projection; calculation responses preserve it as `null`.

`server/data/sources.json` records editions, verification dates, licensing, redistribution rights and attribution. USDA FoodData Central states its data are CC0 1.0/public domain and requests attribution. The existing comparator entries retain that attribution, but the old data did not retain exact FDC IDs or releases, so their match and edition remain explicitly unverified. They are not Vietnam-specific.

The Institute's 2007/2017 tables and the 2013 SMILING Vietnam table were reviewed against official Institute/FAO-INFOODS sources on 2026-11-17. No explicit redistribution license or written permission was found. None of their values are imported or transcribed. The Institute data source and redistribution rights remain a blocker; do not call this catalog an official Vietnamese table. Full findings and links are in [`docs/research/issue-4-food-data-sources.md`](../docs/research/issue-4-food-data-sources.md).

### Reproducible import and validation

The dependency-free pipeline accepts canonical JSON, validates required fields, units, nutrient ranges, duplicate identities, provenance, source licensing and exact external record/edition references, then writes deterministic catalog JSON and an added/updated/removed/unchanged report. Strict imports from an external source fail unless the source registry confirms redistribution permission, license, verification date and attribution and every external provenance group names its source record and edition. `--allow-legacy` is validation-only and cannot write output.

```sh
npm run catalog:validate
npm run catalog:fixture
npm run catalog:import -- --input <licensed-source.json> --sources server/data/sources.json --previous server/data/foods.json --output <candidate-catalog.json> --report <change-report.json>
```

The checked-in synthetic fixture exists only to exercise the pipeline; it is not loaded by the API and its numbers do not describe real food. Do not use it to replace the active catalog. Do not import or publish a Vietnamese dataset until redistribution rights are confirmed and the records have a qualified food/nutrition review. `npm run catalog:import` never downloads or scrapes data.

### Updating or removing a source

Ask the publisher/rights holder named in the research report for permission covering copying, transformation, app/API redistribution and required attribution. Record the written grant or official license URL, exact edition, verification date and the scope of the grant in the registry before mapping values. A registry flag records reviewed evidence; the validator cannot make a legal determination or prove the source's authenticity. Keep the original authorized input and its checksum with the reviewed change; never commit restricted source files.

For an update, increment the catalog version and each changed record version, retain source identifiers and transformations, run a strict import to a separate candidate file, and inspect its change report. Have a qualified reviewer check names/aliases, raw versus cooked matching, servings, conversions and nutrient definitions; record reviewer/date only after actual review. Run the required repository checks before promoting the candidate. Existing legacy comparators fail strict import until their exact source IDs and editions are recovered.

For withdrawal or changed terms, stop distributing the affected source, remove every food whose provenance references it, update dependent meal templates and bump the catalog version. Preserve nonrestricted attribution and a removal note in the registry/change report. Check existing demo diary records and purge affected local demo stores as needed; their stored nutrient snapshots are not automatically migrated. Do not restore withdrawn values from an older release without checking rights again.

## Mobile connection

The Expo app reads `EXPO_PUBLIC_API_URL` from the repository-root `.env` file; see the [root README's target-specific URL and connectivity instructions](../README.md#choose-the-api-url-for-the-app-target). The client fails clearly when the URL is missing or malformed rather than silently using `localhost`. The API binds to `0.0.0.0` for development, but a phone still needs a reachable computer LAN address, the same non-isolated network, and a firewall rule allowing TCP port 4000. Confirm access by opening `http://<backend-host>:4000/health` in the phone/emulator browser and checking for `{"status":"ok"}`. A Metro tunnel does not tunnel this API.

The demo namespace is persisted by the app only to keep a local demo partition stable across app restarts. The API accepts that namespace from the caller, so it is not authentication, verified identity, or ownership protection. Demo routes are disabled by default and always disabled in production. Diary and grocery CRUD use this demo partition. Only synthetic demo data may be used until issue #3 provides authenticated identity and the backend adds production-grade ownership and storage protections.
