# Spec: Health Records and Personalization — V1

## Objective

Let the user review and edit a local demo health profile, view an honest lab-scan preview, and export the health-record summary as a locally generated PDF that the device share sheet can open. Personalization controls and lab examples remain non-clinical and session-only.

## Tech Stack

Expo SDK 58, React Native, JavaScript, existing profile model/storage, and Expo-compatible local PDF/share modules (`expo-print`, `expo-sharing`) if supported by the pinned SDK.

## Commands

- `npm run test:unit`
- `npm run test:ui -- --runTestsByPath app/src/features/personalization/PersonalizationScreen.test.js app/src/features/profile/ProfileScreen.test.js app/src/features/medical-record/MedicalRecordScreen.test.js`
- `npm run test:api`
- `npx expo export --platform android`

## Project Structure

- `app/src/features/personalization/` owns health preferences and scan/result preview states.
- `app/src/features/medical-record/` owns the summary and PDF action.
- `app/src/features/profile/` and onboarding profile setup own editable profile state/model.
- A feature-local export helper owns HTML escaping, PDF generation, and sharing error states.
- Adjacent feature tests cover UI and export boundary behavior.

## Code Style

Escape every profile-derived value before embedding it in the PDF template, then call device APIs behind an async handler:

```js
const html = renderRecordHtml(profile, escapeHtml);
const { uri } = await Print.printToFileAsync({ html });
await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
```

Keep profile validation in the existing model; show progress, success, cancellation, and actionable errors without logging health values.

## Testing Strategy

Use UI tests for profile navigation, scan/result states, export loading/failure/success messaging, and retry. Use focused unit tests for HTML escaping and deterministic document content. Run the Android export to check native module integration; do not claim a physical-device test.

## Boundaries

- **Always:** create the PDF on-device from the current demo profile; escape HTML; never send profile/lab data to a PDF service; keep data source and non-clinical disclosures visible; preserve empty scan state unless synthetic sample data is explicitly selected.
- **Ask first:** none for this work; the user delegated approval for decisions needed to complete the requested scope, including a directly required PDF dependency.
- **Never:** upload images, claim OCR/camera extraction, interpret lab values, create a verified medical record, or export/share real patient data as part of the prototype.

## Success Criteria

- Profile metrics, one condition, allergies, and explicitly confirmed limits are visible and can be edited through the existing validated profile form.
- Scan, capture, and result screens disclose that camera/OCR is not connected; any sample result is labeled synthetic, not saved to the API, and can be cleared/edited in-session.
- Medical record action produces a valid local PDF and opens the platform share sheet; cancellation is harmless and generation/share failures offer retry.
- Generated HTML safely displays special characters from profile fields; no health values appear in logs.

## Out of Scope (Deferred)

- Real camera/image upload, OCR, lab interpretation, clinician verification, persistent lab-result storage, and clinical recommendations; these require a separate reviewed data/clinical pipeline.

## Open Questions

None. PDF export is local; scan remains explicitly a preview under the existing safety boundary.
