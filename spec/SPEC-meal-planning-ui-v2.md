# Spec: Meal Planning UI Refresh — V2

## Objective

Rebuild the meal schedule and recipe detail views as native React Native UI that belongs to this app. References 14.1 and 14.2 guide the information hierarchy and user flow only; the app must not render either reference screenshot or cropped regions from them. Match the palette, typography, spacing, card treatment, and controls already used by Home and Diary.

The user can scan a daily plan, open a meal, review its ingredients and description, and return to the plan. On first entry, retain the clearly disclosed, synthetic sample when no saved plan exists. This is a visual refresh; meal-plan behavior and API data remain unchanged.

## Assumptions and approved scope

- The request is limited to meal schedule and recipe presentation. The existing preference form, profile/allergy constraints, API, saved-plan behavior, pending NIN lookup state, and grocery handoff remain intact.
- Use `app/src/theme/tokens.js` for the existing blue, white, navy, light-blue, spacing, and radius values. Follow the platform-default font and weight hierarchy used by adjacent screens; do not introduce a new font or dependency.
- Use native `View`, `Text`, and existing React Native controls for meal art, cards, facts, ingredients, and nutrient progress. Reference images remain read-only acceptance material and are not imported into the screen.
- Sample meal/ingredient/nutrient values remain illustrative only, never become a saved plan or a personalized claim, and are labeled without referring to screenshot images.
- The user explicitly authorized autonomous review of the spec, plan, and task list.

## Commands

- Unit: `npm run test:unit`
- UI: `npm run test:ui`
- API: `npm run test:api`
- Development preview, when available: `npm run web`

## Project Structure

- `app/src/features/meal-planning/MealPlanScreen.js` — plan result and recipe detail presentation.
- `app/src/features/meal-planning/MealPlanScreen.test.js` — focused screen behavior and copy assertions.
- `app/src/theme/tokens.js` — existing app colors, spacing, and radii.
- `app/src/features/home/HomeScreen.js` and `app/src/features/diary/DiaryScreen.js` — visual consistency references.
- `assets/design/ui-reference/UI/14. Thực đơn/` — read-only structure/content reference; never rendered by the app.

## Design contract

- Screen job: help users review the day's meals and understand a selected recipe.
- Visual language: app token palette; platform-default typeface; dark navy page and section headings; white, lightly bordered cards; restrained shadows; the existing spacing and radius scale; Vietnamese labels.
- Schedule hierarchy: focused back/header row, daily schedule title, horizontally browsable meal cards with a compact native food glyph, meal slot/name, energy and time; a clear daily nutrition card with API energy and macro values; a concise illustrative/sample notice when applicable.
- Show progress bars only for the explicitly illustrative sample or when an API-provided denominator is available. Never compare a generated/saved plan to invented nutrient targets.
- Recipe hierarchy: accessible back control, meal name and slot, a compact native illustration, aligned serving facts, ingredient cards with amounts, and a readable description/disclaimer.
- Do not use screenshot assets, cropped screenshot images, oversized decorative image circles, English placeholder labels, or shadow-heavy styling.
- Preserve generated-plan form, warnings, loading/error/infeasible/unavailable states, source attribution, saved plans, grocery navigation, accessible labels, and non-clinical disclosures. Outside the synthetic sample, show only API-provided values and provenance.

## Testing Strategy

- Keep focused React Native Testing Library coverage for first-entry sample, recipe navigation, generation, failures/retries, saved plans, source lookup, provenance, and grocery handoff.
- Assert localized UI hierarchy and sample disclosure; do not weaken existing behavior assertions.
- Run the repository-required unit, UI, and API suites before handoff.
- Review a local preview if the environment supports it; otherwise report that limitation.

## Boundaries

- Always: keep domain calculations and API data unchanged; preserve safety/allergy restrictions, provenance, accessibility, and loading/error feedback; use existing tokens/components.
- Ask first: API or persistence contract changes, new dependencies, edits to reference screenshots.
- Never: render reference screenshots as app UI, present the prototype as clinical advice, claim official Vietnamese nutrition data, invent source-backed values, or weaken required checks.

## Success Criteria

1. The schedule and recipe are built from native components and contain no imports or use of screenshot/crop components.
2. Their palette, text hierarchy, spacing, cards, and controls align with Home and Diary; user-facing labels are Vietnamese.
3. The sample remains clearly illustrative and not personalized; tapping a sample meal opens its native recipe detail and returns to the schedule.
4. Existing API-backed behavior and all focused UI assertions remain intact.
5. Required unit, UI, and API checks pass; feature work is committed on a branch and merged into `codex/fix-bug`.

## Out of Scope (Deferred)

- New food photography or illustration assets; current app visual language uses native UI and existing glyph/icon treatments.
- API, planner algorithm, nutrition values, persistence, and navigation-flow changes.

## Open Questions

- None. The user clarified that the screen must use the app's design style rather than display reference images.
