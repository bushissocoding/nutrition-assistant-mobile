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
        ├── onboarding/             # Consent prototype
        ├── home/                   # Home shortcuts and daily summary
        ├── meal-planning/           # Preferences, plan generation and results
        ├── grocery/                 # Plan-derived, checkable shopping list
        ├── diary/                   # Food search, portion entry, nutrition logging
        ├── dashboard/               # Meal schedule and nutrient progress
        ├── profile/                 # Explicit status of profile/security gaps
        └── appointments/            # Planned: paid doctor consultation
```

Each feature owns its screen and feature-specific UI/state. Move a component to `shared/components/` only when multiple features genuinely reuse it. `AppShell` owns temporary cross-screen state until persistence/auth is added.

## API (`server/`)

```text
server/
├── server.js                       # Express composition and middleware
├── src/
│   ├── routes/api.js                # HTTP validation and response mapping
│   ├── repositories/catalog.js      # Loading the current JSON catalog
│   └── services/
│       ├── nutrition.js             # Deterministic nutrient calculations
│       └── meal-planner.js          # Deterministic demo planner
├── data/                            # Demonstration catalogs and provenance
├── tests/core.test.js               # Dependency-free domain tests
└── server.test.js                   # HTTP smoke tests (needs Express installed)
```

Keep HTTP concerns in routes, calculations/rules in services, and storage access behind repositories. If a persistent database is introduced, add repositories for profiles, meal plans, diary entries, and shopping lists; do not put SQL or document-store access inside route handlers.

## Current mobile-to-API contract

- `GET /api/v1/foods?q=...` — search the demonstration food catalog.
- `POST /api/v1/nutrition/calculate` — deterministic nutrients for `{ items: [{ foodId, grams }] }`.
- `POST /api/v1/meal-plans/generate` — versioned contract `1.0`; documented request/response, stable validation errors, provenance, deterministic full-day feasibility and soft-goal warnings are in [`server/README.md`](../server/README.md).
- `GET /health` — service health.

The current client stores consent and a minimal profile locally with `expo-secure-store`; consent, profile fields, and derived health information are sent to the demo API. Generated plan, diary and grocery state remain in memory and are lost when the app restarts. SecureStore uses platform-provided protected storage, but this prototype has no server-side identity, retention service or audited compliance. Do not enter real patient information. The catalog is not the Vietnam National Institute of Nutrition database and the planner is not a clinical recommendation engine.

## Suggested next additions

1. Consider generated/shared client-server schemas and stricter catalog provenance (external dataset edition, source record identifiers and verified reuse rights); current `1.0` API validation is server-side and its internal manifest does not establish external source revisions.
2. Add persistence and authentication only after the team chooses a database/provider and a safe data lifecycle.
3. The profile prototype now supports manually entered Patient-mode nutrient ranges with explicit confirmation and Healthy-mode basic measurements/symptom flags; continue with clinician-reviewed target schema and distinguish hard limits from soft preferences and budget.
4. Add prescription/photo/OCR as a separate pipeline that produces editable *candidate* values; require user confirmation before using results.
5. Add weekly analytics from dated diary records, then reminders. Doctor booking/payment and telehealth are separate modules, not placeholders to imply working functionality.
6. Add end-to-end mobile tests and API integration tests; keep nutrient/source, allergy, infeasible-plan, and error-state tests as acceptance gates.
