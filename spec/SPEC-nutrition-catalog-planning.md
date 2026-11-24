# Spec: `nutrition-catalog-planning` — Full App V1

Status: self-approved under the user's explicit delegation (2026-11-24). Parent scope is [SPEC-full-app-v1.md](SPEC-full-app-v1.md); dependencies are [the capability map](capability-map-full-app.md) and completed `identity-profile` spec.

## Objective

Give signed-in users source-attributed food search, nutrient calculation, an account-owned personalized meal plan and a nutrition status report. The API remains the authority for catalog data, profile restrictions, calculations, plan persistence and report totals. Results remain informational, not clinical advice.

USDA FoodData Central (FDC) is the first live catalog adapter because its official API is documented and its data are CC0. The API key remains server-side. Existing in-repository food values remain explicitly prototype comparators: the original IDs/edition of many values are unverified and no Vietnamese national dataset has verified redistribution rights. The live search must not silently fall back to those values.

## Functional Requirements

1. Search by bounded text query, filter to food-data source types suitable for composition lookup, page a bounded result set, debounce in the app, cancel stale requests, and show source/data type/food ID, nutrient basis, and explicit missingness. Provider outage/configuration/rate-limit returns unavailable; it never returns prototype results as if they were USDA.
2. Food detail is fetched from FDC and mapped using nutrient number/measurement units rather than nutrient-name text. Missing or duplicate values remain unknown or are resolved by a documented deterministic rule; unknown values are never treated as zero.
3. Nutrition calculation accepts only server-recognized food IDs and finite serving grams 1–5000, computes each nutrient in stable order, preserves `null` for missing inputs, attaches the catalog/provider version and source attribution, and rejects client-submitted nutrient numbers.
4. A saved plan request contains only preferences and meal count/date parameters. The server loads the verified account's profile, current consent and latest profile revision. Allergies, condition type and hard limits are derived from the account profile; client values cannot weaken or replace them.
5. Plan creation uses deterministic code and known ingredients with source attribution. Allergies are a hard exclusion. If any declared allergy cannot be checked, or a hard-limit nutrient/source is missing, return an unavailable/infeasible result with no partial plan. Soft targets may warn. No price/budget result exists unless each price has an approved source, currency, unit and version.
6. `POST /api/v1/me/meal-plans` persists each result under the verified user and returns the server row ID/version. `GET /api/v1/me/meal-plans` is owner-scoped, paginated and ordered by server creation time. Existing public `/api/v1/meal-plans/generate`, `/api/v1/foods` and `/api/v1/nutrition/calculate` keep their response contract and prototype disclaimers.
7. The report aggregates server-owned diary entries for the user's requested local day and period; the report clearly distinguishes no entry from unknown nutrient values and includes source/date/time-zone metadata. A nutrition report route is completed with the diary module after the owned diary table exists.
8. A generated plan remains a snapshot; later catalog updates do not rewrite an older plan's values or source/version record. Repeating a plan request with the same idempotency key and same normalized intent returns the original row before contacting USDA; reusing a key for different intent returns 409.

## Data and API Contract

- External adapter: `https://api.nal.usda.gov/fdc/v1/foods/search` and `/food/{fdcId}`, server-side `FDC_API_KEY`, 5–25 search results, bounded timeout and streamed response body, no key or full provider request URL in logs.
- Normalized food DTO: stable `id` (`fdc:<FDC ID>`), `name`, `dataType`, `basis` (`100 g` when supported), nutrient values/units/missingness, `source: { id: 'USDA-FDC', label, recordId, release/date }`, `catalogVersion`, `limitations`, and URL.
- New routes: `GET /api/v1/foods/search?q=&page=`, `GET /api/v1/foods/fdc/:fdcId`, `POST /api/v1/nutrition/calculate-sourced`, `POST /api/v1/me/meal-plans`, `GET /api/v1/me/meal-plans`. Saved-plan routes require verified identity and current required consent. Existing routes remain unchanged.
- Add `meal_plans(id, user_id references auth.users, request_key, intent_hash, plan, profile_updated_at, catalog_version, created_at)`, owner RLS select/insert/delete, unique `(user_id, request_key)` and DB-created timestamp. No arbitrary owner field is accepted.
- User-scoped PostgREST client uses the JWT and RLS. Body size, query and serving bounds are checked at the route boundary. FDC errors map to stable `FOOD_SOURCE_UNAVAILABLE`/`FOOD_SOURCE_RATE_LIMITED` errors without provider details.

For the current project-authored meal templates, each comparator description is searched in FDC and must resolve to exactly one normalized exact description before nutrient calculation. An ambiguous/no match returns unavailable; it never chooses the first approximate search hit. Any non-empty profile allergy list returns unavailable because FDC composition records do not verify ingredient contamination or complete allergen coverage. Recipe instructions are project-authored sample steps and remain explicitly unreviewed; source-backed nutrient rows do not make the recipe clinically validated.

## Tech Stack

- Express, native `fetch` with an injected transport, existing deterministic nutrition/meal-planner domain services, Supabase Postgres/RLS.
- USDA FDC documented REST API. The key is configured by an operator only; no key is embedded in Expo or committed.
- No AI model, supplement advice, clinical inference or unverified Vietnamese data source.

## Commands

- Focused: `node --test server/tests/fdc-food-source.test.js server/tests/sourced-food-routes.test.js server/tests/sourced-meal-plans.test.js server/tests/meal-plan-routes.test.js server/tests/meal-plan-repository.test.js server/tests/core.test.js`.
- Required: `npm run test:unit`, `npm run test:ui`, `npm run test:api`.
- Source check when live credentials exist: run a bounded smoke search with the operator's FDC key, never print it; no vendor integration claim without this step.
- Database: `npx supabase db reset` and two-account RLS integration tests if Docker/Supabase CLI are installed.

## Project Structure

- `server/src/services/fdc-food-source.js`: FDC request, timeout, schema validation and normalization.
- `server/src/services/nutrition.js`, `meal-planner.js`: pure deterministic calculations and constraints.
- `server/src/routes/sourced-foods.js`, `server/src/routes/meal-plans.js`: public sourced lookup/calculation plus authenticated account routes.
- `server/src/repositories/meal-plan-repository.js`: user-owned snapshots/idempotency.
- `app/src/features/meal-planning/MealPlanScreen.js`, `app/src/features/diary/DiaryScreen.js`, `app/src/features/dashboard/DashboardScreen.js`: sourced result and account routes.
- `supabase/migrations/`: owner RLS and idempotent saved plans.

## Code Style

Normalize provider payload at one boundary. Keep provider requests out of route handlers; keep plan constraints pure; keep the provider API key out of client code. Do not silently substitute missing values or catalog versions. Route owner comes only from `req.auth.user.id`.

## Testing Strategy

- Unit: nutrient ID/unit normalization, missingness, duplicate nutrients, malformed and streamed oversized payloads, FDC error/status/timeout mapping, allergen coverage, hard-limit failure and deterministic totals.
- API: query validation, public `/api/v1` response compatibility, client owner/constraints tampering, missing consent/profile, owner-scoped saved plan, idempotent replay and conflict.
- UI: source/provenance and missing-value display, no fallback false success, saved plans survive session reload, allergy/hard-limit result states.
- Integration: synthetic users A/B prove RLS plan isolation; run against Supabase local when available.

## Boundaries

- **Always:** use source IDs/versions and units; preserve unknowns; trust neither client nutrients nor client profile restrictions; use verified profile and consent for private plan generation; preserve allergies and hard limits; keep estimate/non-clinical language.
- **Ask first / external owner required:** use real clinical profiles, publish third-party price data, import national Vietnamese nutrient tables, or represent plan as clinically validated.
- **Never:** put FDC key in Expo environment, use prototype values as a silent live fallback, treat unknown nutrients as zero, relax allergies/hard limits, invent prices, or recommend diagnosis/treatment.

## Success Criteria

- Food search and detail return FDC-attributed records when configured, and an honest unavailable state otherwise.
- Nutrient calculations remain deterministic and preserve missingness.
- Authenticated plans use account-owned profile constraints, persist with source/version snapshot and are isolated by RLS.
- Public `/api/v1` nutrition and meal-plan contracts continue to pass unchanged.
- The Home report can use real account-owned diary totals after the diary module is implemented.

## Out of Scope

- Clinical decision support, disease treatment diets, clinician review workflow, price/budget prediction, nutrition advice generated by an LLM, and Vietnamese food-composition values without rights and expert review.

## Open Questions

- No code decision is blocked. Live FDC lookup requires an operator `FDC_API_KEY`; local RLS proof requires Docker and Supabase CLI. FDC composition data do not by themselves verify allergen contamination or recipe/serving equivalence, so those constraints fail closed.

## Source Notes

- Official USDA [API guide](https://fdc.nal.usda.gov/api-guide/) documents search/detail endpoints, per-request API key, key responsibility, rate limits and CC0 terms.
- Official [FDC OpenAPI specification](https://api.nal.usda.gov/fdc/v1/json-spec?api_key=DEMO_KEY) describes the search and detail response contracts. The example DEMO_KEY is not a production credential.
- Official [download documentation](https://fdc.nal.usda.gov/download-datasets/) describes release-specific downloadable datasets; this module uses the live API and records returned provenance rather than claiming a static release snapshot.
