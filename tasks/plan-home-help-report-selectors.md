# Implementation Plan: Home, Help Center, and Report Selectors

## Overview

Make the home month control select an account-bounded month, simplify the home search row and report shortcut, route Help to a support center matching reference images 10.5–10.6, and make report date and nutrient selectors open explicit option lists.

## Decisions

- Keep month/date selector presentation in a small shared component because Home and Dashboard both need the same modal list.
- Carry the verified account creation timestamp through the auth user DTO. Home month and day options begin at that date and end at the current local date.
- Use `Nov-2026` for month labels so both month and year are explicit.
- The report’s top-right “Hôm nay” control will select one of the seven dates already available in the report; its metric cards and confirmed-limit comparison will show that date. The chart remains a seven-day chart.
- Reuse the existing `settings-help` route and FAQ content, restyling it to match the reference’s blue help header, search field, FAQ/contact tabs, FAQ categories, and expandable contact rows. Keep contact channels clearly marked unconfigured.
- Keep all nutrition copy within the existing estimate/non-clinical boundaries.

## Task Order

1. Add an accessible shared option-list modal and a tested home month/date range selector.
2. Remove the two home quick actions, expand the search action, fix the report icon, and route Help to the support center.
3. Restyle the support center to the supplied references and add the report date and nutrient dropdowns.
4. Run required checks and review the diff/status.

## Acceptance Criteria

- Home month selection opens a list labeled with month and year; it includes only months from account creation through the current month.
- Selecting a month stays on Home and displays only selectable dates inside that account-bounded month.
- The home quick row contains only the full-width search control; the report shortcut icon matches the report tab icon.
- Home Help opens the FAQ/contact support center matching the supplied references.
- The chart metric selector opens a list of all five supported metrics; the top-right date selector opens the seven available dates and updates summary cards.
- Unit, UI, API, and diff whitespace checks pass.

## Risks

- Older or synthetic account DTOs can lack `createdAt`; fall back to the current month so Home remains usable.
- A selected historical report date can have missing/failed data; preserve the chart’s existing missing-value behavior and never invent nutrient totals.
- Website/Facebook destinations are not configured in the prototype; expanded contact rows must state that clearly.
