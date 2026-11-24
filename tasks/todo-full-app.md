# Full App V1 Task List

Each implementation task is to be expanded into a module-specific spec and focused task checklist before code. Verification uses synthetic data only. Keep prior initiative checklists unchanged.

## Phase 0 — Scope and specifications

- [x] Task 0.1: Map modules, dependencies, and build order.
  - Acceptance: Full requirements map to stable modules without dependency cycles; external release gates are explicit.
  - Verify: Compare the capability map against every workflow in the user brief.
  - Files: `spec/capability-map-full-app.md`
- [x] Task 0.2: Write and approve the full-app vision and platform foundation spec.
  - Acceptance: Six spec areas, concrete success criteria, technical assumptions, commands, code style, tests, boundaries and deferred scope are recorded.
  - Verify: Self-review under explicit user delegation; verify links/commands and no demo-only objective.
  - Files: `spec/SPEC-full-app-v1.md`, `spec/SPEC-platform-security.md`

## Phase 1 — Platform security

- [x] Task 1.1: Build strict production configuration and safe env examples.
  - Acceptance: Invalid production configuration stops startup; production requires HTTPS origins and current Supabase keys; examples contain names only.
  - Verify: Focused config/client tests and `npm run test:unit`.
  - Files: `server/src/config/`, `server/tests/`, `.env.example`, `server/.env.example`.
- [x] Task 1.2: Add user-scoped and privileged Supabase client seams.
  - Acceptance: User requests carry their verified token through the publishable client; privileged key construction is distinct and only internal code can access it.
  - Verify: Client composition tests and `npm run test:unit`.
  - Files: `server/src/services/supabase/`, `server/tests/`, dependency manifest.
- [x] Task 1.3: Add verified identity middleware and safe HTTP defaults.
  - Acceptance: Private routes require a verified principal; unsafe CORS, excess payloads and rate abuse are rejected; logs exclude sensitive payloads.
  - Verify: API tests for 401/403, expired token, CORS, limits, rate behavior and safe logs; `npm run test:api`.
  - Files: `server/server.js`, `server/src/middleware/`, `server/src/routes/`, `server/server.test.js`.
- [ ] Task 1.4: Add migration/RLS harness and keep legacy demo routes local-only.
  - Acceptance: Owner and role policies are versioned; demo namespace routes remain unavailable in production; RLS test command is documented.
  - Verify: `npm run test:unit`, `npm run test:api`, and `npx supabase db reset` when available.
  - Files: `supabase/migrations/`, server demo gates, test scripts and operations docs.
- [ ] Checkpoint: Public `/api/v1` nutrition contracts remain compatible; no unauthenticated private route succeeds.

## Phase 2 — Identity/profile; Phase 3 — nutrition/tracking; Phase 4 — care/payment; Phase 5 — chat/records/notifications; Phase 6 — release

- [ ] Before each module implementation, write and self-review that module's own spec and focused checklist in capability dependency order.
- [ ] Do not mark external credentials, provider accounts, data rights, reviews, or deployment checks complete from code alone.
