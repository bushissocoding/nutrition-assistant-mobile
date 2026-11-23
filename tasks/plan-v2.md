# Implementation Plan: App Completion V2

Source: `spec/capability-map-100-percent.md`, `spec/SPEC-app-completion-v2.md`, `CONSTRAINTS.md`, and `docs/architecture.md`.

## Architecture decisions

- Keep the existing `/api/v1/meal-entries` contract and use its local-date/timezone query for Home and analytics.
- Keep date math in a deterministic helper, then let screens own loading and selection lifecycle.
- The chart may show partial data; a failed date is represented as unavailable and never converted to a zero.
- Store only sample notification read flags in SecureStore, with validation and explicit error UI. Keep content in code.
- Do not add production integrations, new packages, persistence for clinical/demo booking content, or server routes.

## Work order

1. **Date/history domain helper** — implement local date keys, seven-day windows, and independent per-day API results; add unit tests. **Complete.**
2. **Home date selection** — query a selected non-today date; provide request loading/error/retry and stale-response protection; add UI tests. **Complete.**
3. **Dashboard history** — chart seven API totals, retain partial results, provide retry and accessible state; add UI tests. **Complete.**
4. **Notification state** — add validated SecureStore read-state service, hydrate before shell readiness, persist changes, surface storage errors; add service and component tests. **Complete.**
5. **External readiness/documentation** — document provider/credentials/review blockers and update architecture/README/capability status. **Complete.**
6. **Acceptance** — run required unit/UI/API checks, catalog validation, Android export, review diff and branch status; record exact results. **Complete.**

## Checkpoints

- After task 1: date helper tests pass across local month/year boundaries; API result failures remain independent.
- After tasks 2–3: Home and dashboard display historical API data and distinguish empty, loading, and failure states.
- After task 4: persisted flags contain no notice text or health data, invalid storage falls back safely, write failure is visible.
- Final: repository-required checks pass and external production blockers are present in the readiness document.

## Risks

| Risk | Mitigation |
|---|---|
| Local day keys shift near UTC boundaries | Construct and increment dates in local calendar fields; test month/year boundaries. |
| Slow history response replaces a newer selection | Cancel or ignore results from stale effect generations. |
| A failed API day looks like zero intake | Model unavailable separately from a successful zero total. |
| SecureStore write races or malformed values | Validate known IDs, serialize writes, and show storage failure state. |
| “Complete” implies real medical services | Keep previews clearly labeled and enumerate integration dependencies/credentials/review. |

## Verification results

- `npm run test:unit` — passed, 116 tests.
- `npm run test:ui` — passed, 21 suites and 84 tests.
- `npm run test:api` — passed.
- `npm run catalog:validate` — passed; catalog `prototype-2026-11-17.1` is unchanged.
- `npx expo export --platform android` — passed; bundle exported successfully.
- `git diff --check` — passed; generated `dist/` output is ignored and not included.

