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
        ├── onboarding/             # Welcome, Supabase Auth, versioned consent and profile assessment
        ├── home/                   # Home shortcuts, selected-date diary, and daily summary
        ├── meal-planning/           # Preferences, plan generation and results
        ├── grocery/                 # Account-owned pantry and saved-plan shopping list
        ├── diary/                   # Account diary snapshots, edits, local-date history and totals
        ├── dashboard/               # Account API report and daily nutrient progress
        ├── profile/                 # Account profile, consent and lifecycle screens
        ├── chat/                    # Account-backed non-clinical assistant and appointment messages
        ├── notifications/           # Account event inbox, read state and push-aware settings
        ├── settings/                # Account security, consent, export/deletion and notifications
        ├── medical-record/          # Private health records and local PDF export
        ├── personalization/         # Account preferences and on-device lab OCR review
        └── appointments/            # Verified-provider directory, availability, account-owned bookings, PayOS checkout and provider workspace
```

Each feature owns its screen and feature-specific UI/state. Move a component to `shared/components/` only when multiple features genuinely reuse it. `AppShell` restores Supabase Auth sessions and hydrates account-owned consent/profile; diary totals and dashboard reports come from private account APIs. Account consent receipts are versioned, timestamped by Postgres, and append-only; profile, nutrition preferences, plans, diary, pantry, grocery, care, chat, notifications and health-record metadata are owner/role-scoped behind RLS. Private health-record images use a private Storage bucket. SecureStore contains the Auth SDK session and the current account's Expo push token; notification content and read state live on the API.

Welcome/login/registration and email recovery use Supabase Auth; SMS recovery needs an operator-configured delivery provider. Account settings can change a password, verify a recovery phone, export all registered account modules and request staged deletion. Provider applications, verified-provider directory, availability, appointment holds/history/cancellation and provider workspace use authenticated account APIs and owner/role RLS. Holds expire after 20 minutes; only a matching, signature-verified PayOS webhook can transition a booking to confirmed. Checkout uses a hosted provider page; payment receipts are included in account export, and unpaid links are canceled after cancellation when PayOS is reachable. Merchant activation and paid refunds/reconciliation require operator setup. Chat messages are persisted for eligible booking participants; the optional assistant sends only the typed message after separate consent and uses OpenAI Responses with storage disabled. Notifications are generated from business events and use a durable Expo Push outbox; the worker is a separate process. Health-record images are uploaded only after consent and user review; OCR runs on-device and never interprets results. Account personalization is persisted and sent as a soft plan-ranking hint; confirmed target display is conditional on the patient's explicit confirmation. All live providers, the database, the native OCR device path and real provider roster still require external configuration/verification.

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
│   ├── routes/sourced-foods.js      # Authorized-source lookup and server nutrient calculation (currently pending)
│   ├── routes/meal-plans.js        # Consent-gated, account-owned plan snapshots
│   ├── routes/meal-entries.js       # Namespaced demo diary CRUD
│   ├── routes/shopping-lists.js     # Grocery CRUD and boundary validation
│   ├── routes/account-meal-entries.js # Account-owned diary and timezone summaries
│   ├── routes/nutrition-report.js   # Bounded account report aggregation
│   ├── routes/account-grocery.js    # Account-owned pantry and shopping-list API
│   ├── routes/chat.js               # Assistant and appointment-scoped chat APIs
│   ├── routes/health-records.js     # Private record metadata/source APIs
│   ├── routes/notifications.js      # In-app notification and push-device APIs
│   ├── routes/personalization.js    # Owner-scoped nutrition preferences
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
│       ├── food-source.js           # Pending Institute source contract and unavailable response
│       ├── sourced-meal-plans.js    # Exact registered-source ingredient mapping and profile constraints
│       ├── food-catalog.js          # Catalog schema, source-rights checks and diff report
│       ├── meal-entries.js          # Diary schema and timezone/date rules
│       ├── shopping-lists.js        # Grocery schema and item patch rules
│       ├── meal-planner.js          # Deterministic planner and soft ranking hints
│       └── server-shutdown.js       # Bounded SIGINT/SIGTERM shutdown
├── data/                            # Versioned demonstration catalogs, source registry and synthetic fixture
├── tests/                            # Unit tests for domain, config and lifecycle rules
└── server.test.js                   # HTTP smoke tests (needs Express installed)
```

Keep HTTP concerns in routes, calculations/rules in services, and storage access behind repositories. Supabase Auth/Postgres and private Storage are the selected full-app identity and persistence layers. Strict production configuration, provider-verified identity middleware and request-scoped SDK constructors exist. Private feature APIs use verified identity, owner filters and RLS. Rate limiting is per process with bounded in-memory state; production deployments with multiple instances need a shared store. A dedicated CI job applies local migrations, runs pgTAP and exercises account APIs with synthetic Supabase Auth users through the mobile client's shared API module. This checkout has not run that job because Docker and the Supabase CLI are unavailable, and its first hosted result is pending. Private feature records use request-scoped clients and repositories; route handlers do not own database access.

Startup configuration is read and validated before opening the listener. `npm run api` optionally loads `server/.env`; runtime environment values take precedence. The root `.env` is for Expo `EXPO_PUBLIC_*` settings only. Signal handling belongs in the server lifecycle service, not feature routes.

## Current mobile-to-API contract

- `GET /api/v1/foods?q=...` — search the demonstration food catalog; response includes additive catalog version, source, unit and limitation metadata. The existing `/api/v1` food and nutrition fields remain available.
- `GET /api/v1/foods/search?q=...&page=1`, `GET /api/v1/foods/vietnam-nin/:recordId`, `POST /api/v1/nutrition/calculate-sourced` — server-side source lookup and nutrient calculation with record/version and missing-value metadata. These routes currently return unavailable while redistribution permission for the Institute dataset remains unconfirmed; they do not fall back to the demo catalog.
- `POST /api/v1/nutrition/calculate` — deterministic nutrients for `{ items: [{ foodId, grams }] }`.
- `POST /api/v1/meal-plans/generate` — versioned deterministic meal result with per-food source/version provenance. Responses distinguish feasible, infeasible and unavailable results; allergies and `hardLimits` stay strict, while missed `targets` produce warnings. A supplied budget is evaluated only when recipe prices have registered source/version metadata; otherwise the response is unavailable and contains no plan.
- `/api/v1/meal-entries` — demo-only diary CRUD, date filtering by IANA timezone, backend-calculated nutrients and idempotent create. The caller-provided demo namespace is not authentication or account ownership.
- `/api/v1/shopping-lists` — demo-only current grocery list created from a planner snapshot; item quantity/unit/purchased CRUD, idempotent create, and namespace purge. The caller-provided demo namespace is not authentication or account ownership.
- `GET /api/v1/me` — requires a Supabase Auth bearer token and returns only that verified account's ID; it does not load or persist a profile.
- `GET/PUT /api/v1/me/consent` — reads the latest account receipt or appends explicit choices with a database timestamp.
- `GET/PUT/DELETE /api/v1/me/profile` — reads, validates, saves or deletes the caller's own health profile after current required consent.
- `GET /api/v1/me/export` and `DELETE /api/v1/me` — export current identity, profile, consent, meal plans, diary, pantry and shopping lists; account deletion cascades owned rows before privileged Auth deletion.
- `POST/GET /api/v1/me/meal-plans` — create feasible snapshots from exact authorized source records and list owner-scoped history. Creation remains unavailable while the catalog is pending; allergies/hard limits come from the consented account profile. The migration enables owner RLS and per-account idempotency.
- `/api/v1/me/meal-entries` and `/api/v1/me/nutrition-report` — authenticated diary CRUD and local-timezone daily summaries from server-resolved snapshots, preserving the source/version originally saved with each entry.
- `/api/v1/me/grocery/shopping-list` and `/api/v1/me/grocery/pantry` — account-owned list generation from a saved plan, sourced item creation, quantity/purchased editing and pantry CRUD.
- `GET/PUT /api/v1/me/personalization` — owner-scoped meal preferences, reminder choice and target-display choice; the planner treats preferences as soft ranking hints.
- `/api/v1/me/care` — consent-gated verified-provider directory/availability, provider application/workspace, transactional appointment holds, patient/provider lists and lifecycle actions. Booking information is shared with the selected provider only after explicit consent.
- `POST/GET /api/v1/me/care/appointments/:id/payment` and `POST /api/v1/webhooks/payos` — hosted checkout intent/status and signature-verified payment events. Only a verified matching webhook confirms both payment and appointment.
- `/api/v1/me/chat` — private assistant thread/consent/turns and participant-only appointment message history/send. Assistant requests require an explicit AI consent receipt; provider messages require an eligible appointment.
- `/api/v1/me/health-records` — consent-gated private record CRUD, source image upload and short-lived owner-scoped source view; records can be included in account PDF/export.
- `/api/v1/me/notifications` — paginated account event inbox, read/read-all, notification preferences and Expo token register/unregister. `npm run push:worker` runs durable outbox delivery separately from the API.
- `GET /health` — process liveness only; does not prove database or provider health.

Auth sessions use a chunked, failure-safe SecureStore adapter. Consent, profile, meal plans, diary/report, grocery, care, chat, health records, notification state and nutrition preferences use verified bearer identity, request-scoped Supabase RLS and owner/role filters. Export covers the registered account modules; account deletion removes private record objects before Auth deletion and cascades the owned rows. Appointment reservations are transactional and expire after 20 minutes. PayOS checkout uses hosted pages and server-side signed webhooks; merchant credentials and callback URLs are external. The preferred nutrition source is the Vietnamese food-composition table published by the National Institute of Nutrition. The active catalog is empty until redistribution permission and qualified review are confirmed, so source lookup and plan generation remain unavailable. The Expo Push worker runs separately using Supabase service credentials and an optional Expo access token. Local RLS integration and physical-device OCR have not been run. Do not enter real health information until database, privacy, security and qualified reviews are complete. The planner is not a clinical recommendation engine.

## Release gates

All product modules have authenticated API/UI paths and synthetic contract tests. A production release still needs credentials and configured projects, database migration/RLS execution, native-device checks, source rights, verified provider staffing, monitoring and backup operators, support contacts, and privacy/security/clinical review. Track these in [`spec/SPEC-release-operations-v1.md`](../spec/SPEC-release-operations-v1.md) and [`docs/security-and-operations.md`](security-and-operations.md). The prior [`spec/SPEC-app-completion-v2.md`](../spec/SPEC-app-completion-v2.md) records an earlier demo-only increment; it is not the current capability map.
