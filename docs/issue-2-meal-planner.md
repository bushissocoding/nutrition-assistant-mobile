# Spec: Constraint-aware meal planner — V1

Status: implemented
Issue: #2
Base: `codex/issue-2-integration` (issues #3 and #4 merged)

## Objective

Generate deterministic, non-clinical meal suggestions from the versioned catalog. Allergies and `hardLimits` are mandatory constraints. `targets` and preferences affect ranking and may be unmet only with warnings. Never expose an unsafe or incomplete plan as success.

## Interface

`POST /api/v1/meal-plans/generate` accepts an optional `contractVersion` (defaults to 1 for existing clients), optional integer `budgetVnd`, `allergies`, `excludedFoodIds`, `preferences`, `targets`, and `hardLimits`. Nutrient keys define units (`energyKcal:kcal`, `proteinG/carbohydrateG/fatG/fiberG:g`, `sodiumMg:mg`); an optional range `unit` must match. Unknown fields, invalid types, non-finite/negative/out-of-range values, and malformed ranges return HTTP 400 with stable `{ error, code, issues }` fields.

Responses include `contractVersion: 1`, a discriminated `status` (`feasible`, `infeasible`, or `unavailable`), the legacy-compatible plan/totals/warnings fields, per-meal portions and nutrient totals, source references and versions, explanations, and `{ catalogVersion, algorithmVersion }` metadata. A non-feasible result has an empty plan and structured reason codes. Cost is `null` unless a template has a registered, versioned VND price source with a 1× template basis; a supplied budget cannot be evaluated without such prices and returns `unavailable`.

## Domain rules

- Reject every food whose catalog allergens match a declared allergy. Fail closed if the catalog cannot classify a declared allergen.
- Enforce every hard minimum and maximum exactly; never relax them or return a partial plan.
- Rank complete valid plans by deterministic soft-target penalty, then preference matches, sourced total cost when available, and stable template/portion ordering. Report every missed target.
- Calculate from reported catalog nutrients only. Missing nutrition or provenance makes affected choices unavailable; do not coerce unknown values to zero.
- Retain catalog, food-record, source/edition, template, and algorithm versions with the result. Explain that allergen tags do not establish cross-contact safety.

## Modules and files

- Domain seam: pure `server/src/services/meal-planner.js` function over foods, templates, and request data.
- HTTP adapter: `server/src/routes/api.js` validates and maps errors without owning planner rules.
- Data access: `server/src/repositories/catalog.js` supplies source/version metadata and does not invent missing prices.
- Presentation: `app/src/features/meal-planning/MealPlanScreen.js` renders loading, retryable error, unavailable, infeasible, and feasible states.

## Test strategy and checks

Add deterministic unit tests for allergy exclusion, budget availability/limits, hard limits, reached/unreached targets, invalid and missing inputs, missing sourced data, infeasibility, portion scaling, provenance, and daily totals. Add API contract tests for stable validation errors and structured non-feasible responses; add UI tests for loading, retry, empty/infeasible and result states.

Required handoff commands: `npm run test:unit`, `npm run test:ui`, `npm run test:api`, `npx expo export --platform android`, `npm audit --audit-level=high`, and `git diff --check`.

## Boundaries

Always: preserve `/api/v1`; keep allergies and hard limits strict; show estimates and source limitations; use synthetic test data only. Never: fabricate nutrition/prices, describe the output as diagnosis/treatment, or ask users to relax medical limits. Out of scope: clinical validation, cross-contact guarantees, Vietnamese official dataset reuse, and treatment claims; qualified nutrition review is required before any clinical claim.
