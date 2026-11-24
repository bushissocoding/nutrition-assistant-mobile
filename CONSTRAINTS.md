# Project constraints

Last reviewed: 2026-11-16

These constraints apply to the Expo mobile app and Node/Express API. This repository is a prototype, not a production health service. A failed required check blocks handoff until it is fixed or a reviewer accepts a written exception with its reason and scope. The required test commands run in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for pushes and pull requests targeting `main` or `master`, and can also be started manually. No git hook enforces them locally.

## Always-required floor

- Keep credentials, personal information, and real patient or health data out of source control, test fixtures, logs, screenshots, and sample catalogs. Use synthetic examples. Keep local secrets in ignored environment files and never commit them.
- Describe prototype features accurately. Do not imply that authentication, server-side storage, clinical validation, official Vietnam National Institute of Nutrition data, or production security exists unless it has actually been implemented and verified.
- Preserve the non-clinical boundary: food values, prices, meal templates, and generic nutrient targets are estimates for demonstration. Do not present them as diagnosis, treatment, or individualized medical advice.
- Preserve source attribution on food records. Record the source and relevant units/preparation details for imported values; confirm reuse rights before adding a dataset. Never relabel comparator data as an official Vietnamese dataset.
- Keep allergy exclusions and `hardLimits` as hard planner constraints. Never relax them to produce a plan. Soft `targets` may be unmet only when the result reports a warning.
- Do not leave new behavior as an unimplemented stub or silently swallow an error. Do not skip/delete relevant tests, suppress a failing check, or weaken a threshold to make a change pass. Explain any necessary exception in the change summary and get reviewer acceptance before handoff.

## Required checks

| Check | Requirement | Command | When |
|---|---|---|---|
| Business logic and profile model | All tests pass | `npm run test:unit` | Before handoff for every code change |
| React Native UI components | All component tests pass | `npm run test:ui` | Before handoff for every code change |
| API smoke tests | All assertions pass | `npm run test:api` | Before handoff for every code change |

The commands above are the current measurable quality bar. No coverage percentage, lint result, type-check result, or dependency-scan status is claimed because this repository does not currently configure those checks. Do not invent a passing result for a check that was not run.

Target a total check time of about 90 seconds when running locally before handoff. CI allows up to 10 minutes for dependency installation and both suites; if local checks take longer, report the observed duration rather than silently omitting them.

## Architecture rules

- Follow the feature and layer boundaries in [`docs/architecture.md`](docs/architecture.md); update that document when an accepted architecture change alters them.
- Keep nutrition calculations and meal planning deterministic. Add or update focused tests for changes to nutrient calculations, allergy handling, soft targets, hard limits, budget feasibility, and source provenance.
- Validate external input at the route boundary. Keep response semantics and route versioning explicit when changing the `/api/v1` contract.
- Meal diary day queries must use the supplied IANA timezone and local-midnight boundaries; retries of a create intent must reuse its idempotency key and normalized payload.
- Display diary nutrients and daily totals from the API response, with an estimate/non-medical disclaimer. Do not accept client-supplied nutrient totals.
- When removing local profile/consent state that has a server-side demo diary or grocery list, confirm successful namespace purges first; on any purge failure, preserve local state and offer retry.

## Health data and release boundary

- The current prototype stores a minimal profile locally and sends consent/profile-derived information to the demo API. It has no server identity, retention service, or audited compliance. Do not enter real patient information or expose the API publicly with personal data.
- Meal diary rows persist in the development-only JSON store under a caller-supplied demo namespace. That namespace is not identity or authorization; diary routes must remain unavailable when demo mode is disabled and in production. Use only synthetic records until issue #3 supplies authenticated identity and ownership enforcement.
- The current grocery list and idempotency ledger persist in the same development-only namespaced JSON store. `X-Demo-Namespace` is caller-controlled and not ownership security; grocery routes must remain unavailable when demo mode is disabled and in production. Use only synthetic lists until issue #3 supplies authenticated identity and ownership enforcement.
- Before adding real-user health data, production persistence, or clinical use, document the data flow, consent and access model, retention/deletion behavior, transport/storage protections, and qualified clinical/data-source review. Treat this as a release prerequisite, not an assumption supplied by the prototype.
- For authoritative current limitations and dataset provenance, consult [`README.md`](README.md), [`server/README.md`](server/README.md), and [`server/data/sources.json`](server/data/sources.json); update those source documents when the underlying facts change.

## Exceptions and changes to this bar

Record an exception with the affected rule and files, reason, owner/reviewer, and expiry. Exceptions must be narrow and must not be used to weaken unrelated requirements. Changes that lower or remove a constraint must call out the old and new rule and the reason in review; keep the required tests passing.
