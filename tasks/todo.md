# Task List: API Foundation — V1

Source plan: [tasks/plan.md](plan.md)

Source spec: [SPEC-api-foundation.md](../SPEC-api-foundation.md)

## Task 1: Add namespaced JSON demo store

**Description:** Implement the dependency-free repository with an injectable/configurable file path, per-namespace collections, serialized writes, and atomic file replacement. Missing files start as empty stores; malformed data and filesystem failures remain visible to callers.

**Acceptance criteria:**
- [ ] Data written under one namespace can be read after creating a new repository instance, while another namespace remains isolated.
- [ ] Concurrent updates do not silently overwrite each other; test paths use temporary directories and leave no runtime data in the repository.
- [ ] Missing, malformed, read-only, and other I/O failure cases have explicit behavior and focused coverage.

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
- [ ] Disabled demo mode and production reject requests; production remains disabled even if the demo flag is true.
- [ ] Missing or malformed namespaces are rejected with clear client errors; valid namespaces are available to downstream handlers.
- [ ] Tests identify namespace isolation as demo partitioning, not account authentication or security.

**Verification:**
- Focused: `node --test server/tests/demo-scope.test.js`
- Repository unit suite: `npm run test:unit`
- Manual: exercise the middleware through a small Express test app for disabled, production, invalid, and valid requests.

**Dependencies:** None. Task 1 and Task 2 may be developed independently; both must be complete before Task 3.

**Files likely touched:**
- `server/src/middleware/demo-scope.js`
- `server/tests/demo-scope.test.js`

**Estimated scope:** Small.

## Checkpoint: Store and request boundary

- [ ] Tasks 1 and 2 focused tests pass.
- [ ] `npm run test:unit` passes.
- [ ] No demo data file or synthetic personal data is added to source control.

## Task 3: Wire demo context into API composition

**Description:** Build the demo context from environment configuration in the server composition and make it available to future feature routers through dependency injection. Preserve current catalog, nutrition, and meal-plan responses. Allow `X-Demo-Namespace` through CORS preflight.

**Acceptance criteria:**
- [ ] The server composes a repository and scope configuration without adding a demo CRUD endpoint in this module.
- [ ] Existing `/api/v1` routes retain their current response behavior; CORS preflight accepts `Content-Type` and `X-Demo-Namespace`.
- [ ] API smoke coverage confirms existing endpoints and preflight behavior; tests do not persist data in the default store path.

**Verification:**
- API smoke suite: `npm run test:api`
- Manual: start the API with demo enabled and check `/health`, an existing catalog route, and an `OPTIONS` request for the demo namespace header.

**Dependencies:** Tasks 1 and 2.

**Files likely touched:**
- `server/server.js`
- `server/src/routes/api.js`
- `server/server.test.js`

**Estimated scope:** Medium.

## Task 4: Document and safely exclude local demo storage

**Description:** Ignore local runtime data and document how to enable/disable the demo store, configure its path, and understand the no-auth/no-real-health-data boundary.

**Acceptance criteria:**
- [ ] The default demo store path is ignored by Git and remains configurable for local development/tests.
- [ ] Root and server documentation state that authentication, account ownership security, production persistence, and real health-data handling are not implemented.
- [ ] Documentation includes the exact local command to enable demo mode and describes how to stop using it.

**Verification:**
- Run required checks: `npm run test:unit` and `npm run test:api`.
- Manual: inspect `git status --short` after tests and confirm no runtime store or secret is staged.

**Dependencies:** Task 3.

**Files likely touched:**
- `.gitignore`
- `README.md`
- `server/README.md`

**Estimated scope:** Small.

## Checkpoint: API foundation complete

- [ ] All four tasks meet their acceptance criteria.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:api` passes.
- [ ] Demo data is disabled in production and docs prohibit real health data until authenticated storage and data-lifecycle requirements are implemented.
- [ ] Review this module before starting `mobile-api-client`.
