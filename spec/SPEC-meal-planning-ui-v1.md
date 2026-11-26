# Spec: Meal Planning UI Refresh — V1

## Objective

Rebuild the meal-planning result and recipe detail screens to follow the supplied UI references `assets/design/ui-reference/UI/14. Thực đơn/14.1.png` and `14.2.png`. A user can generate or reopen a plan, scan its meals and daily nutrient totals, open a recipe, and still reach existing plan actions.

## Assumptions and approved scope

- The request targets the two meal-planning reference screens, not the broader onboarding or home flow.
- The current `/api/v1` response, server calculations, profile constraints, and saved-plan behavior remain authoritative.
- On first entry, restore the latest saved API plan when one exists. If the account has no saved plan, show the two screenshot meals as an explicitly labeled UI sample; do not send or save that sample as a user plan.
- Screenshot sample values are illustrative only and are disclosed as non-personal. Generated and restored plans continue to show only their API-provided data and provenance.
- This spec, plan, and task list are self-reviewed under the user's explicit authorization to approve these artifacts autonomously.

## Commands

- Unit: `npm run test:unit`
- UI: `npm run test:ui`
- API: `npm run test:api`
- Development preview, when available: `npm run web`

## Project Structure

- `app/src/features/meal-planning/MealPlanScreen.js` — plan result and recipe detail UI.
- `app/src/features/meal-planning/MealPlanScreen.test.js` — focused screen behavior tests.
- `app/src/shared/components/CroppedReferenceImage.js` — clips food imagery supplied in the reference screenshots for the relevant meal cards.
- `app/src/theme/tokens.js` — existing shared visual tokens.
- `assets/design/ui-reference/UI/14. Thực đơn/` — visual acceptance references; do not edit.

## Design contract

- Screen job: let users scan the day's suggested meals and open one meal's ingredients and preparation details.
- Hierarchy: title and meal schedule; horizontally browsable meal cards with circular imagery/placeholder, slot, meal name, calories, and recipe affordance; a rounded daily calorie/macro tracker; recipe detail with centered food hero, serving facts, ingredient cards, and description.
- Use the existing blue, white, navy, and light-blue palette and rounded card language. Preserve comfortable touch targets and accessible labels.
- Preserve the plan form, profile/allergy warnings, unavailable state, historical plan source attribution, saved plans, grocery navigation, and non-clinical disclaimer. While the catalog is pending, show the NIN data-rights notice and do not present a generated plan.
- Outside the disclosed UI sample, do not invent ingredient values, prices, nutrient totals, or targets. Present missing values as unavailable. Keep source/provenance and estimate disclaimers available in the result/detail flow.

## Testing Strategy

- Keep focused React Native Testing Library coverage for generation, failures/retries, saved plans, source lookup, recipe navigation, and grocery handoff.
- Run the repository-required unit, UI, and API suites before handoff.
- Review result and recipe layouts against the supplied 360×800 reference images in a running app preview if the local environment supports it.

## Boundaries

- Always: keep domain calculations/API data unchanged; keep safety/allergy restrictions and provenance; use existing dependencies and tokens; preserve accessible labels and loading/error feedback.
- Ask first: API or persistence contract changes, new dependencies, edits to reference screenshots.
- Never: present the prototype as clinical advice, claim official Vietnamese nutrition data, invent source-backed values, or weaken required checks.

## Success Criteria

1. The plan result follows reference 14.1's title, horizontal meal-card hierarchy, and nutrient tracker while showing actual API result data.
2. Recipe detail follows reference 14.2's centered hero, compact meal facts, ingredient list, and description hierarchy.
3. Existing plan generation, retry/idempotency, source details, profile warnings, saved-plan, and grocery behaviors still work.
4. Focused UI tests and all repository-required suites pass; changes are committed and merged into `codex/fix-bug`.
