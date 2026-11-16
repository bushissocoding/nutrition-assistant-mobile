# Capability Map: Meal Diary and Grocery Persistence

| Module id | Responsibility | Depends on |
|---|---|---|
| `api-foundation` | Demo-only persistent storage boundary, request scoping, and safe enablement for data features | — |
| `mobile-api-client` | Shared Expo HTTP transport, environment URL validation, and network/error handling | `api-foundation` contracts |
| `meal-diary` | Dated meal-entry API contract and create/read/update/delete user flows | `api-foundation`, `mobile-api-client` |
| `grocery-list` | Plan-derived shopping-list API contract and persistent item edits/check-off flows | `api-foundation`, `mobile-api-client`; existing meal planner |

Build order: `api-foundation` → `mobile-api-client` → `meal-diary` and `grocery-list`.

Each module is independently testable after its dependencies are in place. API contract and UI tests belong to the feature module they verify. Documentation updates belong to the module that introduces each configuration or behavior.

Until issue #3 supplies authentication and account identity, diary and grocery persistence is restricted to an explicitly enabled demo environment and synthetic data. Demo request scoping is not authentication, account ownership security, or permission to store real health data. The demo data API must be disabled in production.
