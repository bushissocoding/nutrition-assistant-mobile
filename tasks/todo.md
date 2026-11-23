# Task List: Nutrition Assistant App Completion

## Task 1: Validate password recovery recipient

**Description:** Add a dynamic email/phone recipient field, validate it for the selected method, and show a masked destination on the local confirmation screen.

**Acceptance criteria:**
- [x] Email and SMS paths require a valid matching recipient.
- [x] Confirmation shows only a masked recipient and states no message was sent.
- [x] Account passwords and recovery recipients are not persisted or sent.

**Verification:** [x] `npm run test:ui -- --runTestsByPath app/src/features/onboarding/AuthScreen.test.js`.

**Dependencies:** None.

**Files likely touched:** `app/src/features/onboarding/AuthScreen.js`, `app/src/features/onboarding/AuthScreen.test.js`.

**Estimated scope:** Small.

## Task 2: Gate provider chat on a matching booking preview

**Description:** Show the provider-chat entry point only for the provider tied to the current in-memory booking preview and remove access when the request is cleared.

**Acceptance criteria:**
- [x] Provider chat cannot open before a booking preview exists.
- [x] A preview for one provider does not unlock another provider's chat.
- [x] Clearing the booking removes the chat entry point.

**Verification:** [x] `npm run test:ui -- --runTestsByPath app/src/features/appointments/AppointmentScreen.test.js`.

**Dependencies:** None.

**Files likely touched:** `app/src/features/appointments/AppointmentScreen.js`, `app/src/features/appointments/AppointmentScreen.test.js`.

**Estimated scope:** Small.

## Task 3: Complete the synthetic lab-result preview/edit flow

**Description:** Let the user select a clearly synthetic sample in the scan preview, view and edit its values in memory, and clear it when leaving the feature.

**Acceptance criteria:**
- [x] No camera, upload, OCR, API write, or clinical interpretation is implied.
- [x] Sample values and edits are visibly labeled synthetic and are session-only.
- [x] Empty, sample, edit, and return states are testable.

**Verification:** [x] `npm run test:ui -- --runTestsByPath app/src/features/personalization/PersonalizationScreen.test.js`.

### Checkpoint after Tasks 1–3

- [x] Focused UI tests pass for each task.
- [x] Existing authentication, cancellation, and non-clinical boundaries remain intact.

**Dependencies:** None.

**Files likely touched:** `app/src/features/personalization/PersonalizationScreen.js`, `app/src/features/personalization/PersonalizationScreen.test.js`.

**Estimated scope:** Small.

### Checkpoint after Tasks 1–3

- [ ] Focused UI tests pass for each task.
- [ ] Existing authentication, cancellation, and non-clinical boundaries remain intact.

## Task 4: Add SDK-compatible PDF helper and safe HTML tests

**Description:** Install Expo PDF/Sharing modules compatible with SDK 58 and add a small export boundary that escapes values, generates a local PDF, and reports share outcomes without logging health data.

**Acceptance criteria:**
- [x] SDK-compatible versions are selected through `npx expo install`.
- [x] HTML escaping covers ampersands, angle brackets, quotes, and apostrophes.
- [x] Export/share failure and cancellation are distinguishable; no value is logged or uploaded.

**Verification:** [x] `npm run test:ui -- --runTestsByPath app/src/features/medical-record/medical-record-export.test.js`; Android export succeeded.

**Dependencies:** Task 3 is independent; run after Task 3 to keep the health-record boundary documented.

**Files likely touched:** `package.json`, `package-lock.json`, `app.json`, `app/src/features/medical-record/medical-record-export.js`, `app/src/features/medical-record/medical-record-export.test.js`.

**Estimated scope:** Medium.

## Task 5: Wire PDF export into the medical record screen

**Description:** Replace the preview-only export action with local PDF generation/share, retain a content preview, and expose progress, success, cancel, and retry states.

**Acceptance criteria:**
- [x] The device share sheet receives a generated PDF from the current demo profile.
- [x] Cancel/error does not erase or upload profile data; retry is available after failure.
- [x] A separate action still lets the user preview PDF contents.

**Verification:** [x] `npm run test:ui -- --runTestsByPath app/src/features/medical-record/MedicalRecordScreen.test.js`; helper tests cover generation/share errors.

**Dependencies:** Task 4.

**Files likely touched:** `app/src/features/medical-record/MedicalRecordScreen.js`, `app/src/features/medical-record/MedicalRecordScreen.test.js`.

**Estimated scope:** Small.

### Checkpoint after Tasks 4–5

- [x] Export helper and screen tests pass.
- [x] Android export succeeds with SDK-compatible native modules.

## Task 6: Update architecture and README

**Description:** Document the new local PDF flow, explicit scan preview behavior, share boundary, and unchanged absence of identity/clinical services.

**Acceptance criteria:**
- [x] `docs/architecture.md` matches the code and preserves existing layer/health constraints.
- [x] `README.md` describes local PDF export and does not claim real scanning or cloud account behavior.

**Verification:** [x] Reviewed changed paragraphs against `CONSTRAINTS.md` and app behavior.

**Dependencies:** Tasks 3–5.

**Files likely touched:** `docs/architecture.md`, `README.md`.

**Estimated scope:** Small.

## Task 7: Run acceptance checks and review branch

**Description:** Run all required repository checks and applicable CI checks, inspect the diff, and report exact outcomes.

**Acceptance criteria:**
- [ ] Unit, UI, and API commands pass.
- [ ] Android export and high/critical audit results are reported.
- [ ] Catalog validation remains deterministic.
- [ ] Working tree and branch ancestry are reviewed; no generated bundle or real data is included.

**Verification:** `npm run test:unit`; `npm run test:ui`; `npm run test:api`; `npx expo export --platform android`; `npm run catalog:validate`; `npm audit --audit-level=high`; `git status --short --branch`; `git diff --check`.

**Dependencies:** Tasks 1–6.

**Files likely touched:** None expected.

**Estimated scope:** Medium.
