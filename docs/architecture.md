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
        ├── grocery/                 # Plan-derived, checkable shopping list
        ├── diary/                   # Food search, portion entry, nutrition logging, and local-date history helper
        ├── dashboard/               # Seven-day API totals and daily nutrient progress
        ├── profile/                 # Synthetic local profile and explicit security gaps
        ├── chat/                    # Local FAQ assistant and non-delivering provider conversation preview
        ├── notifications/           # Synthetic notices with locally persisted read flags; no push service
        ├── settings/                # Device demo preferences, privacy text and help
        ├── medical-record/          # Local profile summary and on-device PDF export; no verified records
        ├── personalization/         # Session-only preferences and synthetic lab-result preview
        └── appointments/            # Synthetic provider, schedule and payment UI previews
```

Each feature owns its screen and feature-specific UI/state. Move a component to `shared/components/` only when multiple features genuinely reuse it. `AppShell` owns transient cross-screen state, restores Supabase Auth sessions, hydrates account-owned consent/profile, and currently hydrates the current-day diary summary from the demo API. The Home date strip queries another selected local day through the same API. The dashboard uses AppShell's current-day response and fetches the preceding six dates independently so partial failures do not turn into zero totals. Account consent receipts are versioned, timestamped by Postgres, and append-only; health profile rows are account-owned behind RLS. SecureStore contains only the Auth SDK session and the identifiers/read flags for current sample notifications.

Welcome/login/registration and email/SMS recovery use Supabase Auth when configured. Account settings can change a password, verify a recovery phone, export current identity/profile/consent data and request staged deletion. Chat and personalization still operate only in the current UI session. Notifications use synthetic sample text; read flags persist locally, but there is no push or server notification service. A provider conversation is a non-delivering screen preview and is available only after a matching appointment preview exists; it is not clinician chat. Provider, appointment, and payment screens use synthetic examples and do not contact providers, create bookings, store payment methods, or process transactions. The medical-record screen summarizes the account profile and can create a PDF in the device cache and open the native share sheet; it does not upload the PDF or verify a medical record. The lab-scan screen has an empty state and an optional, editable synthetic sample that remains in session memory. There is no camera capture, image upload, OCR, or lab interpretation service.

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
│   ├── routes/meal-entries.js       # Diary CRUD, boundary validation and response mapping
│   ├── routes/shopping-lists.js     # Grocery CRUD and boundary validation
│   ├── repositories/catalog.js      # Validate/load catalog and its source registry
│   ├── repositories/meal-entry-repository.js # Namespaced demo entries and idempotency ledger
│   ├── repositories/shopping-list-repository.js # Current grocery list and idempotency ledger
│   └── services/
│       ├── supabase/
│       │   ├── user-client.js       # Request-scoped publishable client with caller JWT
│       │   └── privileged-client.js # Separate server-secret client for internal operations
│       ├── nutrition.js             # Deterministic nutrient calculations
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
- `POST /api/v1/nutrition/calculate` — deterministic nutrients for `{ items: [{ foodId, grams }] }`.
- `POST /api/v1/meal-plans/generate` — versioned deterministic meal result with per-food source/version provenance. Responses distinguish feasible, infeasible and unavailable results; allergies and `hardLimits` stay strict, while missed `targets` produce warnings. A supplied budget is evaluated only when recipe prices have registered source/version metadata; otherwise the response is unavailable and contains no plan.
- `/api/v1/meal-entries` — demo-only diary CRUD, date filtering by IANA timezone, backend-calculated nutrients and idempotent create. The caller-provided demo namespace is not authentication or account ownership.
- `/api/v1/shopping-lists` — demo-only current grocery list created from a planner snapshot; item quantity/unit/purchased CRUD, idempotent create, and namespace purge. The caller-provided demo namespace is not authentication or account ownership.
- `GET /api/v1/me` — requires a Supabase Auth bearer token and returns only that verified account's ID; it does not load or persist a profile.
- `GET/PUT /api/v1/me/consent` — reads the latest account receipt or appends explicit choices with a database timestamp.
- `GET/PUT/DELETE /api/v1/me/profile` — reads, validates, saves or deletes the caller's own health profile after current required consent.
- `GET /api/v1/me/export` and `DELETE /api/v1/me` — export current identity/profile/consent records and stage account deletion through registered module cleanup handlers before privileged Auth deletion.
- `GET /health` — service health.

Auth sessions use a chunked, failure-safe SecureStore adapter. Sign-up, login, email/SMS recovery, password changes, verified-phone linking and profile screens use Supabase Auth when configured. Consent and health profile API routes use verified bearer identity and owner-scoped Supabase RLS; export/delete APIs cover identity, profile and consent plus registered module handlers. Only the Auth SDK session remains local. Account-private routes do not yet cover diary/grocery, plans, appointments, chat, records or other feature workflows. Local RLS integration has not run because Docker/Supabase CLI are unavailable. Do not enter real patient information until the data lifecycle and qualified reviews are complete. The catalog is not the Vietnam National Institute of Nutrition database and the planner is not a clinical recommendation engine.

## Suggested next additions

1. Replace demo JSON storage with Supabase persistence and authenticated ownership only after the data lifecycle and RLS policies are implemented and verified.
2. The profile prototype now supports manually entered Patient-mode nutrient ranges with explicit confirmation and Healthy-mode basic measurements/symptom flags; continue with clinician-reviewed target schema and distinguish hard limits from soft preferences and budget.
3. Add prescription/photo/OCR as a separate pipeline that produces editable *candidate* values; require user confirmation before using results.
4. Before enabling real data or production use, provide credentials through protected server configuration, verify ownership, consent, retention/deletion and security controls, and complete qualified reviews. See [`spec/SPEC-app-completion-v2.md`](../spec/SPEC-app-completion-v2.md) for the prior demo-readiness list and [`spec/SPEC-full-app-v1.md`](../spec/SPEC-full-app-v1.md) for the full-app contract.
5. Continue with independently reviewed mobile end-to-end and production API integration tests before a release; preserve nutrient/source, allergy, infeasible-plan, and error-state gates.
