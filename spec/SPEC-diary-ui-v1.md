# Spec: Diary UI Refresh — V1

## Objective

Rebuild the food diary screen to follow supplied references `assets/design/ui-reference/UI/18. Nhật kí/18.1.png`, `18.2.png`, and `18.3.png`. A user can review a chosen day's entries and API-computed nutrition totals, find a sourced food, set its portion and meal, and create, edit, or delete a diary entry.

## Assumptions and approved scope

- The request covers diary history, food search, portion selection, and meal confirmation as represented by references 18.1–18.3.
- Existing account-authenticated API calls and their response semantics remain unchanged. The diary screen continues to search exact USDA-sourced food records and submits only food ID, portion, meal type, time, timezone, and notes; nutrient totals remain server-resolved.
- Food selection supports multiple sourced records like reference 18.2. The screen confirms portions sequentially, creating one API entry per record with a distinct idempotency intent; no batch endpoint or contract change is introduced.
- This spec, plan, and task list are self-reviewed under the user's explicit authorization to approve these artifacts autonomously.

## Commands

- Unit: `npm run test:unit`
- UI: `npm run test:ui`
- API: `npm run test:api`
- Development preview, when available: `npm run web`

## Project Structure

- `app/src/features/diary/DiaryScreen.js` — day history, sourced-food search, portion and CRUD UI.
- `app/src/features/diary/DiaryScreen.test.js` — focused screen behavior tests.
- `app/src/features/diary/diary-history.cjs` — existing timezone and date helpers.
- `app/src/theme/tokens.js` — existing shared visual tokens.
- `assets/design/ui-reference/UI/18. Nhật kí/` — visual acceptance references; do not edit.

## Design contract

- Screen job: let users check food entries and daily totals, then record one source-backed meal with an appropriate portion and meal slot.
- History: a compact week/date strip, a daily calorie and macronutrient summary, and meal-grouped entry cards with time, serving, nutrients, and edit/delete actions.
- Add flow: rounded search field, category chips, and searchable USDA results; multi-select with a selected count; compact portion controls and meal-type chips for each selected item; a prominent confirm action.
- Use the existing blue, white, navy, and light-blue palette and rounded card language. Keep accessible date navigation, selection states, live feedback, and usable touch targets.
- Preserve estimate/non-medical and data-source notices, API-provided totals, account boundaries, local-day timezone query behavior, and retry intent/idempotency.
- Do not fabricate food records, nutrient totals, or prices. Show unavailable source values as unavailable.

## Testing Strategy

- Keep focused tests for loading/errors, date selection and stale-response protection, sourced search, create/retry/idempotency, edit/delete confirmation, API-returned totals, and source attribution.
- Run the repository-required unit, UI, and API suites before handoff.
- Review history/add/portion layouts against the supplied 360×800 reference images in a running app preview if the local environment supports it.

## Boundaries

- Always: use API totals and source metadata; query by the selected local date and IANA timezone; preserve CRUD confirmation/error behavior; keep health content non-clinical.
- Ask first: batch-create or `/api/v1` contract changes, new dependencies, edits to reference screenshots.
- Never: accept client nutrient totals, mislabel a sample food catalog as official Vietnamese data, bypass idempotency, or weaken required checks.

## Success Criteria

1. Diary history follows reference 18.3's date strip, nutrient summary, grouped meal cards, and add affordance.
2. Food search/portion/confirmation follows references 18.2 and 18.1; each confirmed item uses the existing one-entry create contract and retains its own retry key.
3. All entries, nutrient totals, source/unit details, and selected-date requests remain driven by the existing API and timezone rules.
4. Focused UI tests and all repository-required suites pass; changes are committed and merged into `codex/fix-bug`.
