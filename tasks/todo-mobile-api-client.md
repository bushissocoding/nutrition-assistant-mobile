# Task List: Mobile API Client — V1

Source plan: [tasks/plan-mobile-api-client.md](plan-mobile-api-client.md)

Source spec: [SPEC-mobile-api-client.md](../SPEC-mobile-api-client.md)

## Task 1: Validate Expo API base URL

**Description:** Add a pure base URL validator for the statically inlined `EXPO_PUBLIC_API_URL`. Reject missing or malformed configuration, unsupported schemes, and credentials/query/fragment; normalize trailing slashes and return a typed configuration error.

**Acceptance criteria:**
- [ ] Missing, malformed, non-HTTP(S), credential-bearing, query-bearing, and fragment-bearing URLs fail before any request is sent.
- [ ] Valid HTTP and HTTPS base URLs are normalized consistently.
- [ ] The validator has no Expo/native imports and can be tested by Node's built-in runner.

**Verification:**
- Focused: `node --test app/src/services/api-config.test.cjs`
- Repository unit suite: `npm run test:unit`

**Dependencies:** None.

**Files likely touched:**
- `app/src/services/api-config.cjs`
- `app/src/services/api-config.test.cjs`

**Estimated scope:** Small.

## Task 2: Persist the demo namespace

**Description:** Add an async namespace store with an injectable storage adapter and a SecureStore adapter for native Expo. Generate a namespace only when none is stored; do not treat it as authentication.

**Acceptance criteria:**
- [ ] First read creates and persists a valid namespace; later reads and a newly constructed store return the same value.
- [ ] Read/write storage failures are explicit and do not cause a fresh namespace to be generated on every request.
- [ ] Unit tests use an in-memory adapter and do not require a native runtime.

**Verification:**
- Focused: `node --test app/src/services/demo-namespace-storage.test.cjs`
- Repository unit suite: `npm run test:unit`

**Dependencies:** None. May proceed alongside Task 1.

**Files likely touched:**
- `app/src/services/demo-namespace-storage.cjs`
- `app/src/services/demo-namespace-storage.test.cjs`

**Estimated scope:** Small.

## Checkpoint: Configuration and namespace primitives

- [ ] Tasks 1 and 2 focused tests pass.
- [ ] `npm run test:unit` passes.
- [ ] No secrets or personal health data are added to configuration or fixtures.

## Task 3: Implement shared HTTP transport and error mapping

**Description:** Implement an injectable transport that validates configuration before I/O, adds JSON and demo namespace headers, enforces a finite timeout, supports caller abort, parses JSON and 204 responses, and maps configuration/network/timeout/HTTP/response errors to typed client errors. Do not retry requests automatically.

**Acceptance criteria:**
- [ ] Tests cover request URL, method, headers and body, JSON success, 204, malformed response JSON, HTTP 4xx/5xx, network rejection, timeout and caller abort.
- [ ] Errors expose stable categories and useful user-facing Vietnamese messages; HTTP status is retained when available.
- [ ] A failed or timed-out mutation never resolves as success and the transport never automatically resends it.

**Verification:**
- Focused: `node --test app/src/services/api-client.test.cjs`
- Repository unit suite: `npm run test:unit`

**Dependencies:** Tasks 1 and 2.

**Files likely touched:**
- `app/src/services/api-client.cjs`
- `app/src/services/api-client.test.cjs`
- `app/src/services/api-config.cjs`
- `app/src/services/demo-namespace-storage.cjs`

**Estimated scope:** Medium.

## Task 4: Integrate the shared client into Expo

**Description:** Replace direct transport in `app/src/services/api.js` with the shared client and SecureStore adapter. Preserve the existing API methods and payloads. Include service tests in `test:unit` and confirm screens do not call `fetch()` directly.

**Acceptance criteria:**
- [ ] `generateMealPlan`, `calculateNutrition`, and `getFoods` retain their current `/api/v1` path and payload contracts.
- [ ] `app/src/services/api.js` is the only app module that wires HTTP calls; screens use service methods.
- [ ] SecureStore namespace is added to demo requests as `X-Demo-Namespace`; storage errors prevent the request.
- [ ] Expo resolves the module imports and bundles the app successfully.

**Verification:**
- `npm run test:unit`
- `npm run test:api`
- Search: `rg "fetch\\(" app/src`
- Expo bundle/export command appropriate to the installed SDK and current host.

**Dependencies:** Task 3.

**Files likely touched:**
- `app/src/services/api.js`
- `app/src/services/demo-namespace-storage.cjs`
- `package.json`

**Estimated scope:** Medium.

## Task 5: Document environment URLs and verify device connectivity

**Description:** Add `.env.example`, document base URL setup for Expo Go on a physical phone, Android Emulator and iOS Simulator, and explain LAN/firewall checks and `/health` verification. Run required checks and attempt end-to-end verification from an available device/emulator.

**Acceptance criteria:**
- [ ] `.env.example` uses a replaceable LAN IP and contains no credentials; `.env` is ignored by Git.
- [ ] Docs explain same-LAN/firewall requirements, Android `10.0.2.2`, simulator-specific `localhost`, and how to check `/health` from the device.
- [ ] Docs state demo namespace is not authentication, production demo persistence is disabled, and no real health data should be used before issue #3.
- [ ] `npm run test:unit` and `npm run test:api` pass.
- [ ] At least one phone/emulator reaches `/health` and opens the app with the same base URL; if the environment has no device, record the exact unverified check and reason instead of claiming acceptance.

**Verification:**
- `npm run test:unit`
- `npm run test:api`
- Open `http://<backend-host>:4000/health` in the device/emulator browser; verify `status: "ok"`.
- Confirm clean Git diff has no local store, `.env`, or secret staged.

**Dependencies:** Task 4.

**Files likely touched:**
- `.env.example`
- `.gitignore`
- `README.md`
- `server/README.md`

**Estimated scope:** Medium.

## Checkpoint: Mobile API client complete

- [ ] All five tasks meet their acceptance criteria.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:api` passes.
- [ ] Expo bundle succeeds.
- [ ] Device verification is recorded accurately.
- [ ] Review this module before beginning the meal-diary module.
