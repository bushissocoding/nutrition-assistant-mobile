# Implementation Plan: Full App V1

Source spec: `spec/SPEC-full-app-v1.md`; module index: `spec/capability-map-full-app.md`. Existing `tasks/plan.md` and `tasks/todo.md` belong to a prior, different initiative and remain untouched.

## Overview

Build account-secured end-to-end patient and provider workflows in dependency order. Keep each slice shippable, maintain `/api/v1`, and never enable real health data before external review and operations prerequisites are met.

## Architecture Decisions

- Use Supabase Auth/Postgres/Storage with request-scoped user JWTs, explicit owner filters, and RLS; privileged service-role operations use a separate internal seam.
- Keep Express as the private-record API and preserve the current public nutrition contract. Legacy demo namespaces remain local-only.
- Integrate PayOS hosted checkout with signed/idempotent webhooks; do not collect or store card credentials.
- Integrate Expo Push, OpenAI Responses with `store: false`, on-device OCR, and FoodData Central behind server/device adapters. Fail clearly when configuration is unavailable.
- Build a role-gated provider mode within the Expo app for schedule, appointment and chat operations.
- Follow module specs recursively: finish each module's spec, plan/task acceptance, implementation and review before expanding to the next independent module.

## Task List

### Phase 0: Scope and module specifications

- [x] Task 0.1: Full-app capability map and vision spec

### Phase 1: Shared platform security

- [x] Task 1.0: `platform-security` module spec and focused task checklist
- [x] Task 1.1: Add strict production configuration and safe env examples
- [x] Task 1.2: Add user-scoped and privileged Supabase client adapters
- [x] Task 1.3: Add verified identity middleware, safe HTTP defaults, and production demo-route gates
- [x] Checkpoint: Existing nutrition API contract and all required tests pass; unauthenticated private requests fail closed. Private records are not yet enabled.

### Phase 2: Identity and profile vertical slices

- [x] Task 2.0: Specify, plan, and task `identity-profile` before implementation
- [x] Task 2.1: Registration, email verification, login/logout, restore and expiry
- [x] Task 2.2: Email/SMS recovery and confirmation flows; live delivery depends on operator-configured providers
- [x] Task 2.3: Server-owned profile, assessment and account consent; add profile/consent migration, RLS policies and executable integration seam
- [x] Task 2.4: Profile export, consent withdrawal, account deletion and retry semantics; later feature modules must register their owned data cleanup/export
- [ ] Checkpoint: Two synthetic accounts cannot read or alter each other's records

### Phase 3: Nutrition and personal tracking

- [ ] Task 3.0: Specify, plan, and task `nutrition-catalog-planning` before implementation
- [ ] Task 3.1: FoodData Central adapter, source metadata and attribution UI/API
- [ ] Task 3.2: Owner-scoped nutrition plan and report with deterministic allergy/hard-limit rules
- [ ] Task 3.3: Specify, plan, and task `diary-grocery-analytics` before implementation
- [ ] Task 3.4: Authenticated diary CRUD, local timezone summaries and meal statistics
- [ ] Task 3.5: Pantry inventory, shopping list and grocery editing
- [ ] Checkpoint: Plan → meals → diary → report/grocery data remains consistent and API-derived

### Phase 4: Care and payment

- [ ] Task 4.0: Specify, plan, and task `care-bookings` before implementation
- [ ] Task 4.1: Provider profile/directory, verification status and schedule operations
- [ ] Task 4.2: Availability query and idempotent appointment lifecycle
- [ ] Task 4.3: Specify, plan, and task `payments` before implementation
- [ ] Task 4.4: PayOS checkout and signed webhook state machine
- [ ] Task 4.5: Patient and provider appointment screens, cancellation and receipts
- [ ] Checkpoint: End-to-end booking shows paid only after a verified provider event

### Phase 5: Chat, records and event notifications

- [ ] Task 5.0: Specify, plan, and task `chat-assistant-messaging` before implementation
- [ ] Task 5.1: Appointment-scoped patient/provider conversation and provider inbox
- [ ] Task 5.2: Non-clinical assistant with explicit data-sharing UX and configurable OpenAI adapter
- [ ] Task 5.3: Specify, plan, and task `records-labs` before implementation
- [ ] Task 5.4: Private health record upload, on-device OCR candidate review and PDF export
- [ ] Task 5.5: Specify, plan, and task `notifications-settings` before implementation
- [ ] Task 5.6: Persisted notification events/read state, push token lifecycle and settings
- [ ] Checkpoint: Delivery, file access, account ownership and deletion tests pass

### Phase 6: Release readiness

- [ ] Task 6.0: Specify, plan, and task `release-operations` before implementation
- [ ] Task 6.1: Complete deployment, privacy/data lifecycle, backup/restore and incident docs
- [ ] Task 6.2: Run full required suites, bundle checks, migration/RLS tests and final code review
- [ ] Checkpoint: All in-repository acceptance is met; unresolved external release gates have named owner/input and are not misrepresented as done

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No provider credentials/accounts in the repository | Live vendor calls cannot be verified here | Implement real adapters and sandbox contracts; require environment validation and report live checks as unavailable |
| No Docker/Supabase CLI | Cannot execute local migrations/RLS integration in this environment | Keep migrations deterministic, test auth/repository behavior, add CI/local instructions and rerun when a DB is available |
| Health data is sensitive | Unauthorized access or misleading advice harms users | RLS plus owner filters, explicit consent, minimal disclosure, private objects, no sensitive logs, non-clinical outputs, synthetic tests |
| No provider roster or staffing | Booking/chat have nobody real to serve | Include provider operations role and roster controls; require verified provider onboarding before production availability |
| Data licensing and privacy/clinical review are unresolved | Real-world launch may be unlawful or inaccurate | Use only sourced/reusable data with attribution and synthetic fixtures; keep real-data/clinical use gated on qualified review |
| External payment/push/AI services can fail or replay events | Duplicate charges, lost notices or false successes | Idempotency, signature verification, explicit pending/failure states, retryable delivery and provider-independent tests |

## External Release Gates

Supabase and secret provisioning; PayOS merchant verification; SMS/custom SMTP and Expo push credentials; OpenAI account/policy review; FoodData Central key and any dataset permission; verified provider roster/staffing; qualified privacy/security/nutrition/clinical review; deployment domain, support owner and backup/restore operator. These gates do not block code work but must block real-data or production claims until proven.
