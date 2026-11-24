# Project architecture

The repository uses a feature-first Expo client and a small layered Express API. The first implementation keeps the existing UI reference assets and sample API contract, while moving app code out of one large entry component.

## Mobile app (`app/`)

```text
app/
├── App.js                         # Expo entry point
└── src/
    ├── app/AppShell.js             # App state and feature composition
    ├── navigation/routes.js        # Route keys and bottom-tab metadata
    ├── services/api.js             # HTTP client for the current API
    ├── theme/tokens.js             # Shared colors, spacing and radii
    ├── shared/components/          # Reusable presentation components
    └── features/
        ├── onboarding/             # Welcome, account preview, versioned consent and profile assessment
        ├── home/                   # Home shortcuts, selected-date diary, and daily summary
        ├── meal-planning/           # Preferences, plan generation and results
        ├── grocery/                 # Account-owned pantry and saved-plan shopping list
        ├── diary/                   # USDA-sourced account diary, edits, local-date history and totals
        ├── dashboard/               # Account API report and daily nutrient progress
        ├── profile/                 # Account profile, consent and lifecycle screens
        ├── chat/                    # Local FAQ assistant and non-delivering provider conversation preview
        ├── notifications/           # Synthetic notices with locally persisted read flags; no push service
        ├── settings/                # Device demo preferences, privacy text and help
        ├── medical-record/          # Local profile summary and on-device PDF export; no verified records
        ├── personalization/         # Session-only preferences and synthetic lab-result preview
        └── appointments/            # Verified-provider directory, availability, account-owned bookings and provider workspace
```

Each feature owns its screen and feature-specific UI/state. Move a component to `shared/components/` only when multiple features genuinely reuse it. `AppShell` restores Supabase Auth sessions and hydrates account-owned consent/profile; current-day diary totals and multi-day dashboard reports come from private account APIs. Account consent receipts are versioned, timestamped by Postgres, and append-only; profile, meal plans, diary, pantry and grocery rows are owner-scoped behind RLS. SecureStore contains only the Auth SDK session and the identifiers/read flags for current sample notifications.

Welcome/login/registration and email/SMS recovery use Supabase Auth when configured. Account settings can change a password, verify a recovery phone, export current identity/profile/consent data and request staged deletion. Provider applications, verified-provider directory, provider availability, appointment holds/history/cancellation, and provider workspace use authenticated account APIs and owner/role RLS. Holds expire after 20 minutes; only server payment verification will transition them to confirmed. Chat and personalization still operate only in the current UI session. Notifications use synthetic sample text; read flags persist locally, but there is no push or server notification service. Provider chat is still non-delivering. Checkout, payment receipts, medical-record upload, and OCR are not yet implemented. The medical-record screen summarizes the account profile and can create a PDF in the device cache and open the native share sheet; it does not upload the PDF or verify a medical record. The lab-scan screen has an empty state and an optional, editable synthetic sample that remains in session memory. There is no camera capture, image upload, OCR, or lab interpretation service.

## API (`server/`)

```text
server/
├── server.js                       # Express composition and middleware
├── scripts/import-food-catalog.js  # Reproducible JSON catalog import/validation CLI
├── src/
│   ├── config/server-config.js     # Parse and validate startup environment once
│   ├── middleware/
│   │   ├── cors.js                  # Exact origin/method/header allowlist
│   │   ├── rate-limit.js            # Bounded per-process request limiter
│   │   ├── security-headers.js      # API security response headers
│   │   └── supabase-auth.js         # Provider-verified principal and user DB client
│   ├── routes/api.js                # API composition and existing route mapping
│   ├── routes/sourced-foods.js      # USDA search/detail and server nutrient calculation
│   ├── routes/meal-plans.js        # Consent-gated, account-owned plan snapshots
│   ├── routes/meal-entries.js       # Namespaced demo diary CRUD
│   ├── routes/shopping-lists.js     # Grocery CRUD and boundary validation
│   ├── routes/account-meal-entries.js # Account-owned diary and timezone summaries
│   ├── routes/nutrition-report.js   # Bounded account report aggregation
│   ├── routes/account-grocery.js    # Account-owned pantry and shopping-list API
│   ├── repositories/catalog.js      # Validate/load catalog and its source registry
│   ├── repositories/meal-entry-repository.js # Namespaced demo entries and idempotency ledger
│   ├── repositories/shopping-list-repository.js # Namespaced demo grocery list
│   ├── repositories/account-meal-entry-repository.js # Account diary snapshots/idempotency
│   ├── repositories/account-grocery-repository.js # Account pantry and grocery operations
│   ├── repositories/meal-plan-repository.js # Account-scoped plan snapshots and idempotency
│   └── services/
│       ├── supabase/
│       │   ├── user-client.js       # Request-scoped publishable client with caller JWT
│       │   └── privileged-client.js # Separate server-secret client for internal operations
│       ├── nutrition.js             # Deterministic nutrient calculations
│       ├── fdc-food-source.js       # Server-only FoodData Central adapter and normalization
│       ├── sourced-meal-plans.js    # Exact FDC ingredient mapping and profile constraints
│       ├── food-catalog.js          # Catalog schema, source-rights checks and diff report
│       ├── meal-entries.js          # Diary schema and timezone/date rules
│       ├── shopping-lists.js        # Grocery schema and item patch rules
│       ├── meal-planner.js          # Deterministic demo planner
│       └── server-shutdown.js       # Bounded SIGINT/SIGTERM shutdown
├── data/                            # Versioned demonstration catalogs, source registry and synthetic fixture
├── tests/                            # Unit tests for domain, config and lifecycle rules
└── server.test.js                   # HTTP smoke tests (needs Express installed)
```

Keep HTTP concerns in routes, calculations/rules in services, and storage access behind repositories. Supabase Auth/Postgres have been selected for full-app identity and persistence. Strict production configuration, provider-verified identity middleware and request-scoped SDK constructors now exist. Consent and profile routes use verified identity and request-scoped RLS clients. Rate limiting is per process with bounded in-memory state; production deployments with multiple instances need a shared store. Private feature records must use request-scoped clients and repositories; do not put SQL or document-store access inside route handlers.

Startup configuration is read and validated before opening the listener. `npm run api` optionally loads `server/.env`; runtime environment values take precedence. The root `.env` is for Expo `EXPO_PUBLIC_*` settings only. Signal handling belongs in the server lifecycle service, not feature routes.

## Current mobile-to-API contract

- `GET /api/v1/foods?q=...` — search the demonstration food catalog; response includes additive catalog version, source, unit and limitation metadata. The existing `/api/v1` food and nutrition fields remain available.
- `GET /api/v1/foods/search?q=...&page=1`, `GET /api/v1/foods/fdc/:fdcId`, `POST /api/v1/nutrition/calculate-sourced` — server-side FDC search/detail and nutrient calculation with source record/version and missing-value metadata. They return unavailable when the provider key/data is unavailable; they do not fall back to the demo catalog.
- `POST /api/v1/nutrition/calculate` — deterministic nutrients for `{ items: [{ foodId, grams }] }`.
- `POST /api/v1/meal-plans/generate` — versioned deterministic meal result with per-food source/version provenance. Responses distinguish feasible, infeasible and unavailable results; allergies and `hardLimits` stay strict, while missed `targets` produce warnings. A supplied budget is evaluated only when recipe prices have registered source/version metadata; otherwise the response is unavailable and contains no plan.
- `/api/v1/meal-entries` — demo-only diary CRUD, date filtering by IANA timezone, backend-calculated nutrients and idempotent create. The caller-provided demo namespace is not authentication or account ownership.
- `/api/v1/shopping-lists` — demo-only current grocery list created from a planner snapshot; item quantity/unit/purchased CRUD, idempotent create, and namespace purge. The caller-provided demo namespace is not authentication or account ownership.
- `GET /api/v1/me` — requires a Supabase Auth bearer token and returns only that verified account's ID; it does not load or persist a profile.
- `GET/PUT /api/v1/me/consent` — reads the latest account receipt or appends explicit choices with a database timestamp.
- `GET/PUT/DELETE /api/v1/me/profile` — reads, validates, saves or deletes the caller's own health profile after current required consent.
- `GET /api/v1/me/export` and `DELETE /api/v1/me` — export current identity, profile, consent, meal plans, diary, pantry and shopping lists; account deletion cascades owned rows before privileged Auth deletion.
- `POST/GET /api/v1/me/meal-plans` — create feasible snapshots from exact live FDC records and list owner-scoped history; allergies/hard limits come from the consented account profile. The migration enables owner RLS and per-account idempotency.
- `/api/v1/me/meal-entries` and `/api/v1/me/nutrition-report` — authenticated diary CRUD and local-timezone daily summaries from server-resolved USDA snapshots.
- `/api/v1/me/grocery/shopping-list` and `/api/v1/me/grocery/pantry` — account-owned list generation from a saved plan, sourced item creation, quantity/purchased editing and pantry CRUD.
- `/api/v1/me/care` — consent-gated verified-provider directory/availability, provider application/workspace, transactional appointment holds, patient/provider lists and lifecycle actions. Booking information is shared with the selected provider only after explicit consent.
- `GET /health` — service health.

Auth sessions use a chunked, failure-safe SecureStore adapter. Sign-up, login/email recovery, password changes, verified-phone linking and account assessment use Supabase Auth when configured; SMS recovery still needs an operator-configured provider. Consent, profile, saved meal plans, diary/report, pantry, grocery, provider applications, availability, and appointments use verified bearer identity, request-scoped Supabase RLS and owner filters. Export includes patient appointments and provider-owned profile/credentials/availability; deletion relies on auth-user cascades. Appointment reservations are transactional and expire after 20 minutes. Payment confirmation, provider chat, uploaded records/OCR, and server notifications remain to be built. Sourced FDC lookup, nutrition calculation and profile-constrained saved plans require a server-only `FDC_API_KEY` and exact source matches. Local RLS integration has not run because Docker/Supabase CLI are unavailable. Do not enter real patient information until the data lifecycle and qualified reviews are complete. The catalog is not the Vietnam National Institute of Nutrition database and the planner is not a clinical recommendation engine.

## Suggested next additions

1. Replace demo JSON storage with Supabase persistence and authenticated ownership only after the data lifecycle and RLS policies are implemented and verified.
2. The profile prototype now supports manually entered Patient-mode nutrient ranges with explicit confirmation and Healthy-mode basic measurements/symptom flags; continue with clinician-reviewed target schema and distinguish hard limits from soft preferences and budget.
3. Add prescription/photo/OCR as a separate pipeline that produces editable *candidate* values; require user confirmation before using results.
4. Before enabling real data or production use, provide credentials through protected server configuration, verify ownership, consent, retention/deletion and security controls, and complete qualified reviews. See [`spec/SPEC-app-completion-v2.md`](../spec/SPEC-app-completion-v2.md) for the prior demo-readiness list and [`spec/SPEC-full-app-v1.md`](../spec/SPEC-full-app-v1.md) for the full-app contract.
5. Continue with independently reviewed mobile end-to-end and production API integration tests before a release; preserve nutrient/source, allergy, infeasible-plan, and error-state gates.
