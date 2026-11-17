# Spec: Project Platform — V1

Module id: `project-platform` (from [CAPABILITY-MAP.md](CAPABILITY-MAP.md))

Related issue: [#5 — Security, testing, deployment and project documentation](https://github.com/bushissocoding/nutrition-assistant-mobile/issues/5)
Status: approved

## Objective

Give contributors a reproducible, reviewable development and test baseline for the Expo app and Express API, with clear environment setup, dependable CI, a minimal security/operations guide, and truthful documentation of current limits. This module enables issues #1–#4 without claiming production security, legal compliance, or clinical readiness.

Success means a new contributor can install and run the app/API from a clean checkout using documented commands; CI runs the same project tests and an Expo configuration/bundle check; environment mistakes fail clearly; the API reports readiness and shuts down cleanly; and the repository documents its data risks, dependency findings, incident path, and unsupported operational guarantees.

## Current baseline and assumptions

1. The repository is an Expo SDK 58 / React Native 0.88.1 app and a Node.js/Express 4 API using CommonJS. The lockfile uses npm lockfile version 3.
2. The repository currently documents Node.js 22.13+ on the 22.x line, 24.3+ on the 24.x line, or 26+; CI selects Node 22. Keep that supported range explicit and retain Node 22 as the CI baseline unless implementation verification shows the range needs tightening.
3. The app has no server identity/authentication. Diary and grocery persistence uses a local JSON demo store, disabled by default and in production. Only synthetic data is in scope.
4. The project has no selected production host, database, incident contact, or assigned privacy/security reviewer. V1 will document these as unresolved operational responsibilities rather than inventing providers or claims.
5. The existing three test scripts are the mandatory repository checks. No lint or type-check command is configured today.
6. A dependency audit run on 2026-11-17 reported 22 moderate findings and no high or critical findings. Some suggested remediations downgrade Expo/Jest to older major versions, so remediation must be advisory-by-advisory and verified against the existing SDK/test stack; do not run a blanket `npm audit fix`.

## Tech stack

- Expo SDK `~58.0.0`, React Native `0.88.1`, React `19.3.0`.
- Node.js and Express `4.22.x`; CommonJS modules and native `node:test` for business/API tests.
- npm with the committed `package-lock.json`; clean installs use `npm ci`.
- GitHub Actions on `ubuntu-latest`; no deployment provider, database, new authentication provider, or new dependency is selected by this spec.

## Commands

- Clean install: `npm ci`.
- API: `npm run api` (set `DEMO_DATA_ENABLED=true` only for local synthetic demo persistence).
- Expo app: `npm start`.
- Unit/domain/profile/service tests: `npm run test:unit`.
- React Native component tests: `npm run test:ui`.
- API smoke tests: `npm run test:api`.
- Expo bundle/config validation: `npx expo export --platform android`.
- Dependency audit: `npm audit --json`; CI gate: `npm audit --audit-level=high`.
- Final whitespace check: `git diff --check`.

The clean install, three test commands, Expo export, and audit command must be runnable by contributors without personal or production secrets. Device connectivity verification remains a separate manual check because CI has no phone or emulator.

## Project structure

- `.nvmrc` and root `package.json` — supported Node runtime declaration and npm scripts.
- `.env.example` and `server/.env.example` — safe Expo and API configuration examples with comments; no secret values.
- `.github/workflows/ci.yml` — pull-request test, Expo export, and high/critical dependency audit gates.
- `server/server.js` and `server/src/` — API config validation, health endpoint, middleware, routes and services.
- `server/server.test.js` and `server/tests/` — HTTP lifecycle/configuration and focused domain tests.
- `docs/security-and-operations.md` — minimum threat model, data/log lifecycle, dependency triage, incident reporting path, troubleshooting, and explicit residual risks.
- `README.md` and `server/README.md` — clean setup, supported versions, app-to-API networking, demo mode and links to security/operations details.

Keep HTTP validation and error mapping in routes, business rules in services, storage behind repositories, and cross-screen state in the existing app shell. Do not introduce a new layer only to pass through configuration.

## Code style

Use the repository's existing CommonJS and JavaScript conventions, small injected seams for testable server configuration, and structured safe errors. Environment values are parsed once at startup rather than read ad hoc throughout handlers.

```js
const config = readServerConfig(process.env);
const app = createApp({ config, catalog, demoContext });
const server = app.listen(config.port, '0.0.0.0');
```

The config reader returns validated values or a non-secret error naming the invalid setting. Logs may contain a method, route template, and stable error code; they must not include request bodies, authorization data, demo namespace values, profile fields, or food diary contents.

## Testing strategy

- Keep the required `npm run test:unit`, `npm run test:ui`, and `npm run test:api` commands green; CI runs all three after `npm ci` on every pull request to the default branches.
- Add deterministic tests for invalid/missing API configuration, health response, startup failure, and SIGINT/SIGTERM shutdown behavior. Do not use real user data or network calls in tests.
- Run the Android Expo export in CI to detect app/config/bundle breakage. It does not count as physical-device verification.
- Run the npm audit threshold in CI and retain full audit output locally for triage. High/critical findings block handoff; moderate findings require a recorded impact and disposition, with unresolved items assigned an owner and review date.
- Keep an implementation-time dependency review record with package, severity, direct/transitive status, reachability, chosen action, and reason. Re-test every targeted upgrade; do not lower thresholds or remove tests to make a gate pass.
- Check changed files for secrets and health data; inspect `git diff --check` before handoff.

## Boundaries

- **Always:** use synthetic examples; preserve `/api/v1`; keep the demo store disabled in production; validate API configuration; keep logs free of secrets and health payloads; report unsupported persistence, backup, retention, and account ownership plainly.
- **Ask first:** add dependencies; change CORS behavior; select hosting/database/auth providers; introduce real-user or new sensitive data; change workflow permissions; define production retention/backup or legal/clinical claims.
- **Never:** commit secrets or real health data; describe a demo namespace as authentication; enable demo persistence in production; silently swallow startup/shutdown errors; claim compliance or clinical readiness from tests alone.

## Success criteria

- A clean contributor setup succeeds with the documented Node/npm range, `npm ci`, API command, Expo command, and all required test commands.
- Runtime compatibility is declared in machine-readable project metadata and matches the documented Expo-supported versions; CI uses the documented primary Node line.
- `.env.example` files contain safe local values/comments only, are tracked, and do not imply that `EXPO_PUBLIC_*` values are secret. Invalid API port/configuration fails at startup with a concise, non-secret message.
- CI installs from the lockfile and runs unit, UI, API, Expo export, and the high/critical audit gate. A failed command fails the workflow; no personal secret is required.
- `/health` has a deterministic, secret-free response. SIGINT and SIGTERM stop accepting requests and close the server cleanly within a bounded time.
- The security/operations guide names assets and trust points, current controls and residual risks, supported demo-data lifecycle, dependency review procedure, incident reporting path, and the prerequisites before any real health data or public deployment.
- The documentation accurately distinguishes Metro startup/bundle errors from backend reachability and API/application errors, including physical-phone LAN, firewall, simulator and `/health` checks.
- No deployment provider, production data store, authentication flow, real-data workflow, or compliance claim is added under this module.

## Out of scope (deferred)

- Production deployment, Docker/staging, provider selection, production database, backup/restore automation, retention service, and multi-instance operation; no owner/environment is selected.
- Authentication, account ownership and consent implementation; owned by `identity-profile` and must be completed before personal data is enabled.
- Licensed Vietnamese food-data import and expert review; owned by `food-catalog`.
- Clinical validation of nutrient limits, recipes, or meal plans; requires qualified review and is not established by software checks.
- Adding a linter, type checker, scanner, or dependency for checks that are not currently configured unless implementation demonstrates a specific need.

## Open questions

- Who is the named maintainer/contact for security incidents and dependency findings? Documentation can describe the reporting route, but the project owner must supply a real contact before external contributors or real data are involved.
- Which qualified privacy/security and nutrition reviewers will assess the relevant flows before any real health data or clinical claims? This spec records the prerequisite but does not assign people.
- Should a later deployment spec require a non-wildcard CORS origin at production startup? Changing current CORS behavior is held for explicit review.
