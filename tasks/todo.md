# Task List: API Foundation — V1

Source plan: [tasks/plan.md](plan.md)

Source spec: [SPEC-api-foundation.md](../SPEC-api-foundation.md)

## Task 1: Add namespaced JSON demo store

**Description:** Implement the dependency-free repository with an injectable/configurable file path, per-namespace collections, serialized writes, and atomic file replacement. Missing files start as empty stores; malformed data and filesystem failures remain visible to callers.

**Acceptance criteria:**
- [x] Data written under one namespace can be read after creating a new repository instance, while another namespace remains isolated.
- [x] Concurrent updates do not silently overwrite each other; test paths use temporary directories and leave no runtime data in the repository.
- [x] Missing, malformed, read-only, and other I/O failure cases have explicit behavior and focused coverage.

**Verification:**
- Focused: `node --test server/tests/demo-store.test.js`
- Repository unit suite: `npm run test:unit`
- Manual: confirm the default runtime data path is not created by tests.

**Dependencies:** None.

**Files likely touched:**
- `server/src/repositories/demo-store.js`
- `server/tests/demo-store.test.js`

**Estimated scope:** Small.

## Task 2: Add demo mode and namespace validation

**Description:** Add reusable request middleware that enables demo data only when explicitly configured outside production, validates the `X-Demo-Namespace` header, and exposes only the validated namespace to downstream handlers.

**Acceptance criteria:**
- [x] Disabled demo mode and production reject requests; production remains disabled even if the demo flag is true.
- [x] Missing or malformed namespaces are rejected with clear client errors; valid namespaces are available to downstream handlers.
- [x] Store tests verify namespace isolation; middleware tests treat the namespace as a caller-supplied demo scope and do not treat it as account authentication.

**Verification:**
- Focused: `node --test server/tests/demo-scope.test.js`
- Repository unit suite: `npm run test:unit`
- Manual: exercise the middleware through a small Express test app for disabled, production, invalid, and valid requests.

**Dependencies:** None. Task 1 and Task 2 may be developed independently; both must be complete before Task 3.

**Files likely touched:**
- `server/src/services/demo-data-policy.js`
- `server/src/middleware/demo-scope.js`
- `server/src/repositories/demo-store.js`
- `server/tests/demo-scope.test.js`

**Estimated scope:** Small.

## Checkpoint: Store and request boundary

- [x] Tasks 1 and 2 focused tests pass.
- [x] `npm run test:unit` passes.
- [x] No demo data file or synthetic personal data is added to source control.

## Task 3: Compose and inject the demo context

**Description:** Build the repository and scope middleware from the provided environment, then inject the resulting demo context into the API router for future feature routers.

**Acceptance criteria:**
- [x] The context uses the configured store path and contains the demo scope middleware.
- [x] Downstream API router handlers receive the same context through dependency injection.
- [x] Focused tests cover composition and router context injection without adding demo CRUD endpoints.

**Verification:**
- Focused: `node --test server/tests/demo-context.test.js server/tests/api-router.test.js`
- Repository unit suite: `npm run test:unit`

**Dependencies:** Tasks 1 and 2.

**Files likely touched:**
- `server/src/demo-context.js`
- `server/src/routes/api.js`
- `server/tests/demo-context.test.js`
- `server/tests/api-router.test.js`

**Estimated scope:** Medium.

## Task 4: Wire server startup and CORS

**Description:** Create the demo context during server startup, pass it into the API router, and allow the namespace header plus CRUD methods through CORS preflight. Keep existing public route responses unchanged.

**Acceptance criteria:**
- [x] Server startup builds the demo context from environment configuration and injects it into `/api/v1`.
- [x] Existing API responses remain unchanged; preflight accepts `Content-Type`, `X-Demo-Namespace`, and the CRUD HTTP methods.
- [x] API smoke coverage starts the server with demo mode enabled, checks health/catalog/preflight, and creates no default store file.

**Verification:**
- API smoke suite: `npm run test:api`
- Manual runtime check is covered by the smoke test's real server process and HTTP requests.

**Dependencies:** Task 3.

**Files likely touched:**
- `server/server.js`
- `server/server.test.js`

**Estimated scope:** Small.

## Checkpoint: API composition

- [x] Context and API smoke tests pass.
- [x] `npm run test:unit` and `npm run test:api` pass.
- [x] No runtime demo store is created by tests.

## Task 5: Document and safely exclude local demo storage

**Description:** Ignore local runtime data and document how to enable/disable the demo store, configure its path, and understand the no-auth/no-real-health-data boundary.

**Acceptance criteria:**
- [x] The default demo store path is ignored by Git and remains configurable for local development/tests.
- [x] Root and server documentation state that authentication, account ownership security, production persistence, and real health-data handling are not implemented.
- [x] Documentation includes the exact local command to enable demo mode and describes how to stop using it.

**Verification:**
- Run required checks: `npm run test:unit` and `npm run test:api`.
- Manual: inspect `git status --short` after tests and confirm no runtime store or secret is staged.

**Dependencies:** Task 4.

**Files likely touched:**
- `.gitignore`
- `README.md`
- `server/README.md`

**Estimated scope:** Small.

## Checkpoint: API foundation complete

- [x] All five tasks meet their acceptance criteria.
- [x] `npm run test:unit` passes.
- [x] `npm run test:api` passes.
- [x] Demo data is disabled in production and docs prohibit real health data until authenticated storage and data-lifecycle requirements are implemented.
- [x] Review this module before starting `mobile-api-client`.
