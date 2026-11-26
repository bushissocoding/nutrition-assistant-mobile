# Capability Map: Meal Plan and Diary UI Refresh — V1

| Module id | Responsibility | Depends on |
|---|---|---|
| meal-planning-ui | Rebuild the generated daily plan and recipe detail presentation to match references 14.1 and 14.2 while retaining plan, pending NIN lookup state, saved-plan, and grocery actions. | Existing `MealPlanScreen`, meal-plan API, profile model, theme tokens |
| diary-ui | Rebuild the selected-day diary, sourced-food search, portion form, and entry cards to match references 18.1–18.3 while retaining date, CRUD, timezone, source, and API-total behavior. | Existing `DiaryScreen`, diary API, diary-history rules, theme tokens |

Build order: meal-planning-ui and diary-ui are independent; implement both in the same short-lived branch, then verify together in the repository's required suites.

Shared shell and navigation are out of scope. No API contract, server, or data-model changes are planned.
