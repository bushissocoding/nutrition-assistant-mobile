# Task List: Project Platform — V1

Source plan: [tasks/plan.md](plan.md)

Source spec: [SPEC-project-platform.md](../SPEC-project-platform.md)

Status: approved; implementation in progress

## Task 1: Declare runtime support and triage dependency findings

**Description:** Record the primary Node line and supported Node/npm range in machine-readable metadata. Review each current npm advisory and make only compatible targeted updates; preserve a review record for resolved and accepted findings.

**Acceptance criteria:**
- [x] `.nvmrc`, `package.json` engines, README, and CI agree on the primary Node 22 line and supported versions.
- [x] Every current audit finding has a recorded package, severity, direct/transitive status, exposure, and disposition; unresolved findings show the known owner or an explicit owner-assignment gap and review trigger.
- [x] No blanket `npm audit fix`, major downgrade, threshold weakening, or unrelated dependency update is used.

**Verification:** `node --version`; `npm --version`; `npm ci`; `npm audit --json`; `npm audit --audit-level=high`. If dependency versions change, run `npm run test:unit`, `npm run test:ui`, and `npm run test:api` before moving on.

**Dependencies:** None.

**Files likely touched:**
- `.nvmrc`
- `package.json`
- `package-lock.json` (only for approved compatible fixes)
- `docs/security-and-operations.md` (initial dependency review record)

**Estimated scope:** Medium.

## Checkpoint: Runtime and dependency baseline

- [x] Clean install works on the available supported local runtime (Node 24.19/npm 11.17); the primary CI runtime remains Node 22 and will be verified by the CI gates.
- [x] Audit findings are triaged without an unverified Expo/Jest downgrade.

## Task 2: Validate API startup configuration

**Description:** Add a small pure configuration reader for supported server settings and fail fast on invalid values before opening the listener. Preserve current defaults and CORS semantics.

**Acceptance criteria:**
- [x] Invalid `PORT` and invalid explicit demo-mode values fail with a concise message that contains no secret or user data.
- [x] Valid/default settings preserve current port, host, demo-disabled default, and CORS behavior.
- [x] API handlers no longer parse the port ad hoc from `process.env`.

**Verification:** Focused `node --test server/tests/server-config.test.js`; then `npm run test:unit` and `npm run test:api`.

**Dependencies:** Task 1.

**Files likely touched:**
- `server/src/config/server-config.js`
- `server/tests/server-config.test.js`
- `server/server.js`
- `server/server.test.js`

**Estimated scope:** Medium.

## Task 3: Add health and graceful shutdown coverage

**Description:** Keep `/health` deterministic and secret-free; handle SIGINT/SIGTERM by stopping acceptance of new requests, allowing active requests to finish, and enforcing a bounded shutdown deadline.

**Acceptance criteria:**
- [ ] Health smoke test keeps the existing response contract.
- [ ] Process-level tests show SIGINT and SIGTERM exit cleanly and do not hang beyond the documented deadline.
- [ ] Shutdown errors are visible and no request body, namespace, or health data is logged.

**Verification:** `npm run test:api`; focused process smoke test for both signals; `npm run test:unit` if lifecycle logic is extracted into a pure module.

**Dependencies:** Task 2.

**Files likely touched:**
- `server/server.js`
- `server/server.test.js`

**Estimated scope:** Small.

## Checkpoint: API configuration and lifecycle

- [x] Configuration tests pass; process startup rejects invalid environment values.
- [x] Existing `/api/v1` route behavior remains unchanged.
- [ ] Process lifecycle tests pass (Task 3).

## Task 4: Provide safe environment examples and local setup instructions

**Description:** Keep Expo public configuration separate from API settings, add an API example with development-only values, and document app/API startup and device connectivity. Use Node's built-in env-file support only after official documentation confirms compatibility with the declared minimum; otherwise document shell-based environment setup.

**Acceptance criteria:**
- [ ] Examples contain no secrets or personal data; public Expo variables are explicitly described as bundle-visible.
- [ ] API defaults keep demo persistence disabled; enabling it requires an explicit local action.
- [ ] Root/server setup covers Expo Go on a phone, Android Emulator, iOS Simulator, LAN/firewall, `/health`, and Metro-versus-API troubleshooting.
- [ ] Existing CORS behavior and demo namespace limitations are stated accurately.

**Verification:** Follow the documented clean setup from a fresh local `.env` copy; start API and Expo; verify `/health` through the configured host; inspect `git check-ignore` for local env files.

**Dependencies:** Task 2.

**Files likely touched:**
- `.env.example`
- `server/.env.example`
- `package.json` (API startup script only if the built-in loader is verified)
- `README.md`
- `server/README.md`

**Estimated scope:** Medium.

## Task 5: Extend CI with app export and security threshold

**Description:** Add the same Expo Android export and high/critical dependency audit commands used locally to the current pull-request workflow. Keep all existing test suites required and retain least-privilege workflow permissions.

**Acceptance criteria:**
- [ ] CI starts from `npm ci` and runs unit, UI, API, Expo export, and `npm audit --audit-level=high`.
- [ ] Any failed command fails the workflow; no personal or production secret is needed.
- [ ] CI does not imply that bundle export is physical-device verification.

**Verification:** Run every workflow command locally after `npm ci`; inspect workflow triggers and permissions; confirm no generated `dist/` output is tracked.

**Dependencies:** Tasks 1 and 4.

**Files likely touched:**
- `.github/workflows/ci.yml`

**Estimated scope:** Small.

## Checkpoint: Reproducible contributor and CI checks

- [ ] A contributor can reproduce the CI command sequence from the documented setup.
- [ ] Workflow permissions remain unchanged and no secrets are introduced.

## Task 6: Document threat model and operational limits

**Description:** Write the minimum security/operations guide, including assets and trust points, implemented controls, residual risks, demo data/log/delete limits, dependency review, incident reporting path, and prerequisites before public deployment or real health data.

**Acceptance criteria:**
- [ ] Documentation does not claim authentication, production persistence, backup, retention, legal compliance, or clinical readiness that has not been implemented.
- [ ] Unknown incident contacts and qualified reviewers are explicitly identified as unresolved prerequisites.
- [ ] Root/server README, `docs/architecture.md`, and `CONSTRAINTS.md` agree with the actual code and health-data boundary.

**Verification:** Cross-check each documented control against implementation; review for secrets/real health data; run `git diff --check`.

**Dependencies:** Tasks 1–5.

**Files likely touched:**
- `docs/security-and-operations.md`
- `README.md`
- `server/README.md`
- `docs/architecture.md`
- `CONSTRAINTS.md`

**Estimated scope:** Medium.

## Task 7: Run final checks and review scope

**Description:** Run the repository's required checks and the new platform gates, inspect the final diff, and report any environmental check that could not run.

**Acceptance criteria:**
- [ ] `npm run test:unit`, `npm run test:ui`, `npm run test:api`, Expo Android export, `npm audit --audit-level=high`, and `git diff --check` pass, or a narrow documented exception is accepted.
- [ ] No secret, real health data, runtime demo store, generated build artifact, or unrelated cleanup is tracked.
- [ ] User-facing documentation distinguishes a CI bundle check from device connectivity verification.

**Verification:** Run all commands in the acceptance criteria; inspect `git status --short` and the final diff.

**Dependencies:** Tasks 1–6.

**Files likely touched:** None, except focused corrections required by verification.

**Estimated scope:** Small.

## Completion criteria

- [ ] All tasks and checkpoints satisfy their acceptance criteria.
- [ ] The platform baseline supports issues #1–#4 without claiming production or clinical readiness.
- [ ] Every unresolved external responsibility is reported with an owner gap and a future prerequisite.
