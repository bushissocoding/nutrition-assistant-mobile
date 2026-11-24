# Capability Map: Nutrition Assistant — Issues #1–#5

This map extends the approved issue #1 module map to cover the shared foundation and all five open GitHub issues. Existing module IDs are retained.

| Module id | Issue | Responsibility | Depends on |
|---|---:|---|---|
| `project-platform` | #5 | Reproducible runtime/configuration, CI quality gates, API lifecycle, security and operations documentation | — |
| `api-foundation` | #1 | Development-only namespaced persistence and safe demo request scope | `project-platform` |
| `mobile-api-client` | #1 | Shared Expo HTTP transport, environment URL validation, timeout and error handling | `project-platform`, `api-foundation` contracts |
| `identity-profile` | #3 | Onboarding, versioned consent, authentication/session, profile ownership and user data lifecycle | `project-platform`, `mobile-api-client` |
| `food-catalog` | #4 | Licensed food records, field-level provenance, versioning and repeatable import/quality checks | `project-platform` |
| `meal-planner` | #2 | Versioned planning contract, deterministic hard/soft constraints, infeasible results and explanations | `project-platform`, `food-catalog`, `identity-profile` when using profile data |
| `meal-diary` | #1 | Dated meal-entry CRUD, server-calculated nutrients and idempotent writes | `project-platform`, `api-foundation`, `mobile-api-client`; `identity-profile` and `food-catalog` for authenticated use |
| `grocery-list` | #1 | Plan-derived list persistence, quantity/unit edits and purchased state | `project-platform`, `api-foundation`, `mobile-api-client`, `meal-planner`; `identity-profile` and `food-catalog` for authenticated use |

## Build order

The issue #1 `api-foundation`, `mobile-api-client`, `meal-diary`, and `grocery-list` modules already exist in demo scope on the current branch. Keep their interfaces stable while implementing the remaining platform and feature work.

For the integrated authenticated prototype: `project-platform` → (`identity-profile` and `food-catalog` in parallel) → `meal-planner` → authenticated diary/grocery integration. Grocery generation consumes the planner contract. Diary and grocery stay demo-only until identity and ownership checks are implemented and verified.

## Shared constraints

- Keep `/api/v1` versioning explicit and validate untrusted request data at the route boundary.
- Use synthetic data only. Demo namespaces are caller-controlled partitions, never authentication or account ownership.
- Preserve source attribution and reuse rights for food data. Do not label comparator values as official Vietnamese data.
- Keep allergy exclusions and `hardLimits` hard. Soft targets may be unmet only with a clear warning; no clinical claim is allowed without qualified review.
- Do not imply production authentication, persistence, legal compliance, clinical validation, backup, or retention unless implemented and verified.
- GitHub issues are the source of truth for scope and status. Keep durable architecture and safety rules in `CONSTRAINTS.md`, `docs/architecture.md`, and `docs/security-and-operations.md`; this map records module boundaries and dependencies.
