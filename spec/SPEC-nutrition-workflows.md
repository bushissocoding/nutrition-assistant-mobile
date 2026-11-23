# Spec: Nutrition Workflows — V1

## Objective

Make the home screen a usable entry point to the app's eight modules and complete the nutrition path: review a daily nutrient report, generate a safe meal plan, inspect a recipe, add pantry items, manage the plan-derived grocery list, and record/quantify meals with day totals.

## Tech Stack

Expo SDK 58, React Native, JavaScript, existing Express `/api/v1` contracts, demo namespaced diary/grocery storage, and current nutrient/profile services.

## Commands

- `npm run test:unit`
- `npm run test:ui -- --runTestsByPath app/src/features/home/HomeScreen.test.js app/src/features/meal-planning/MealPlanScreen.test.js app/src/features/grocery/GroceryScreen.test.js app/src/features/diary/DiaryScreen.test.js app/src/features/dashboard/DashboardScreen.test.js`
- `npm run test:api`
- `npx expo export --platform android`

## Project Structure

- `app/src/features/home/` exposes shortcuts and the daily summary.
- `app/src/features/meal-planning/` owns API generation and recipe view.
- `app/src/features/grocery/` owns the local pantry and API-backed shopping list.
- `app/src/features/diary/` owns search, portions, and demo diary CRUD.
- `app/src/features/dashboard/` owns daily nutrient status and history disclosure.
- `app/src/services/api.js` remains the mobile API boundary.

## Code Style

Render totals from server responses, retaining a visible estimate disclaimer:

```js
const totals = result?.totals || emptyTotals;
setEntries(Array.isArray(result?.items) ? result.items : []);
setTotals(totals);
```

Keep calculations on the server, use explicit loading/error/empty states, and use feature-local UI unless another feature genuinely shares it.

## Testing Strategy

Use UI tests for navigation, form states, retry behavior, pantry actions, recipe view, and diary CRUD. Existing unit/API tests remain acceptance gates for hard allergy/limit handling, source provenance, timezone day boundaries, idempotency, and demo route scope. No client nutrient totals may be introduced.

## Boundaries

- **Always:** use server-calculated diary nutrients; show source and estimate/non-medical disclaimers; keep allergies and `hardLimits` strict; keep grocery pantry input distinct from saved list state; preserve API errors and retry intent.
- **Ask first:** none for this work; the user delegated approval for decisions needed to complete the requested scope.
- **Never:** invent food prices/sources, accept client nutrient totals, weaken planner constraints, or present sample data as clinical advice or official Vietnamese nutrition data.

## Success Criteria

- Home exposes the requested eight modules plus notifications/settings navigation.
- The report displays API-backed estimates and accurately states which dates have data.
- Meal generation retains feasible/infeasible/unavailable states and warnings; each meal opens its ingredient/nutrition recipe view.
- Pantry items can be added and adjusted without silently changing the server grocery list; a plan can create the list and saved items remain editable/checkable.
- Diary search, portion quantification, meal type, confirmation, edit/delete, local-day totals, retries, and source attribution work against existing API routes.
- API failures never appear as saved diary or grocery changes.

## Out of Scope (Deferred)

- Historical analytics until the app loads dated diary records for all chart dates; current report must not imply unavailable history exists.
- Food-price optimization, external catalog ingestion, and clinical meal recommendations; sources/review are not available.

## Open Questions

None. Existing API/storage contracts and non-clinical limitations define the scope.
