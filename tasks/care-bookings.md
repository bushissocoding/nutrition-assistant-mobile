# Tasks: `care-bookings`

Spec: `spec/SPEC-care-bookings.md`.

- [x] 1. Add provider, availability, appointment schema, RLS, non-self-verification grants, reservation/cancellation RPCs and migration contract tests.
- [x] 2. Add deterministic booking/provider services and owner-scoped repositories for directory, applications, slots, appointment creation/list/cancel, and provider workspace.
- [x] 3. Add authenticated patient/provider routes with strict boundary validation, pagination, safe errors and consent/disclosure gates.
- [x] 4. Register appointment/provider profile data in account export/deletion lifecycle.
- [x] 5. Replace synthetic appointment screen and AppShell state with provider search, real availability, booking details, appointment history/cancellation and verified provider workspace.
- [x] 6. Connect doctor chat navigation only to a persisted eligible appointment; keep delivery disabled until messaging module.
- [x] 7. Add focused service/repository/route/UI tests, update architecture and complete code review.
- [ ] 8. Run required checks, Android export and diff hygiene; document unavailable local Supabase/RLS integration.
