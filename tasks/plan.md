# Implementation Plan: Nutrition Assistant App Completion

Source specs: `spec/capability-map.md` and all five `spec/SPEC-*.md` files.

## Overview

Complete the remaining gaps in the existing Expo prototype. Most requested screens and API flows already exist. This plan closes recovery recipient validation, enforces provider-chat gating, makes the lab-result demo preview editable without real image processing, and adds an actual local PDF export. Then update architecture documentation and run all required repository checks.

## Architecture Decisions

- Keep current `AppShell`, profile storage, API client, and `/api/v1` contract. No server identity, booking, payment, messaging, or lab routes are introduced.
- Keep booking requests in memory; provider chat is available only for the provider with a current demo booking preview.
- Keep the lab flow session-only. Use a clearly marked synthetic sample and editable values; do not add camera, upload, OCR, interpretation, or server persistence.
- Generate the record PDF locally from escaped profile text, using Expo modules compatible with SDK 58; invoke the native share sheet without logging exported values.
- Reuse current theme and accessibility patterns; write UI tests beside each changed screen and test export formatting and failure paths.

## Dependency Graph

```text
Existing app shell/profile/API contracts
        ├── Recovery recipient validation
        ├── Appointment-gated provider chat
        ├── Session-only synthetic lab result flow
        └── SDK-compatible PDF helper → MedicalRecordScreen export action
                                         ↓
                              Architecture/readme update
                                         ↓
                            Full acceptance verification
```

## Task List

### Phase 1: Close interaction gaps

- [x] Task 1: Validate password recovery recipient
- [x] Task 2: Gate provider chat on a matching booking preview
- [x] Task 3: Complete the synthetic lab-result preview/edit flow

### Checkpoint: Interaction gaps

- [x] Focused onboarding, appointment, and personalization UI tests pass.
- [x] Recovery shows only a masked destination; provider chat cannot open before booking or after cancellation; synthetic lab values remain in session.

### Phase 2: Export health record

- [x] Task 4: Add SDK-compatible local PDF generation/share helper and safe HTML tests
- [x] Task 5: Wire PDF export to the medical record screen and test UI outcomes

### Checkpoint: PDF export

- [x] Export helper escapes user-entered content and handles share cancellation/errors.
- [x] Android bundle export resolves the new native modules.

### Phase 3: Documentation and acceptance

- [x] Task 6: Update app architecture and README for PDF and synthetic lab behavior
- [x] Task 7: Run required tests, Android export, catalog validation, and CI audit; review branch diff/status

### Checkpoint: Complete

- [x] All applicable spec criteria are met.
- [x] Required checks pass or any exception is documented with its reason and scope.
- [x] Branch is reviewable and final handoff names changed files/check results.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Expo package versions may not match SDK 58 | Android export failure | Use `npx expo install` and the SDK compatibility map; verify via Android export. |
| Share sheet unavailable on a device/platform | PDF creation may succeed without a share target | Catch availability/share errors, preserve a retry path, and never claim sharing succeeded. |
| Sample lab values may be mistaken for real results | Health misinformation | Use obvious synthetic labels, no interpretation or ranges, keep values session-only, and update architecture docs. |
| Existing module UI may already satisfy most requested flows | Unneeded churn | Preserve working flows and focus changes on audited gaps; full UI suite guards existing behavior. |

## Open Questions

None. The user delegated approvals for the requested scope. Real account, provider, payment, clinical, and server-persistence work stays deferred by existing constraints.
