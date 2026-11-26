# Task List: Home, Help Center, and Report Selectors

## Task 1: Home month picker and account-bounded calendar

- [x] Preserve account creation time in the verified auth user DTO.
- [x] Add a shared accessible option-list modal.
- [x] Open a month/year list from the Home month control without navigating away.
- [x] Limit listed months and selectable dates to account creation through today.
- [x] Add focused auth, modal, and Home tests.

**Verification:** 12 focused unit/auth tests and 7 focused UI tests passed.

## Task 2: Home toolbar and Help route

- [x] Remove the doctor and report actions from the search row.
- [x] Let the search action occupy the freed width.
- [x] Use the report glyph on the Home report button.
- [x] Route Home Help to `settings-help`.
- [x] Add focused Home/AppShell tests.

**Verification:** Home, AppShell, and Settings focused UI tests passed (25 tests).

## Task 3: Help center and report selectors

- [x] Match the FAQ/contact structure in UI reference images 10.5 and 10.6.
- [x] Add searchable FAQ categories and expandable contact rows with accurate configuration status.
- [x] Make report metric selection open the five-metric list.
- [x] Make the report date control open the seven-date list and update selected-day summaries.
- [x] Add focused Settings/Dashboard tests.

**Verification:** Dashboard focused UI tests passed (7 tests); Settings/Home/AppShell focused UI tests passed (25 tests).

## Task 4: Acceptance checks

- [x] `npm run test:unit` (324 tests passed).
- [x] `npm run test:ui` (24 suites, 122 tests passed).
- [x] `npm run test:api` (smoke tests passed).
- [x] `git diff --check` passed.
- [x] Confirm prior uncommitted changes and existing plan files remain untouched.
