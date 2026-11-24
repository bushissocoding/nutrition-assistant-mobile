# Spec: `records-labs` — V2

Status: approved for implementation under the user's explicit delegation to make and approve technical decisions.

## Objective

Replace the profile-only health record preview with account-owned examination records that users can capture/select, review, save, view and export. Images remain on device during OCR. OCR only proposes editable candidates; nothing becomes a saved result until the user confirms it. Saved source files live in a private Supabase Storage bucket with owner-scoped metadata. The app does not interpret or diagnose values.

## Tech Stack

Expo SDK 58 / React Native 0.88, `expo-image-picker` for camera/photo selection, `expo-ai-kit` on-device text recognition (Apple Vision on iOS and ML Kit on Android), Express and Supabase Postgres/Storage. The native OCR config is opt-in for Android. PDF generation/share stays on device with the installed Expo Print/Sharing modules. Use only authenticated API routes and short-lived signed downloads; files are never public.

## Commands

- Unit/API: `npm run test:unit` and `npm run test:api`
- Focused UI: `npx jest app/src/features/personalization/PersonalizationScreen.test.js app/src/features/medical-record/MedicalRecordScreen.test.js --runInBand`
- Android JS bundle/config: `npx expo export --platform android`
- Native OCR smoke: `npx expo run:android` on a physical/device build with Play Services; iOS requires an Xcode physical device for OCR validation.
- Migration/whitespace: repository unit suite and `git diff --check`

## Project Structure

- `server/src/routes/health-records.js` owns authenticated metadata, upload and signed-download routes.
- `server/src/repositories/health-record-repository.js` owns records and storage operations.
- `app/src/features/personalization/` owns capture, OCR, candidate review and explicit save.
- `app/src/features/medical-record/` owns record history/detail, local PDF and share state.
- `app/src/services/health-record-ocr.js` and record validation helpers own local extraction and candidate normalization.
- `supabase/migrations/` owns metadata RLS, private bucket, owner object policies and deletion support.

## Code Style

Treat OCR output as untrusted candidate text; never save without user confirmation:

```js
const recognized = await recognizeText({ uri: photo.uri }, { languages: ['vi', 'en'] });
const candidates = parseLabCandidates(recognized.text);
setReviewDraft(candidates.map(candidate => ({ ...candidate, confirmed: false })));
```

HTML values in PDFs are escaped. File APIs return safe metadata, not service credentials or persistent public URLs.

## Testing Strategy

- Unit tests: image MIME/size/path validation, OCR candidate parser against synthetic Vietnamese/English examples, malformed number handling and PDF HTML escaping.
- API/repository tests: owner scope, consent, signed upload/download constraints, file size/type/path, metadata CRUD, missing object handling and account deletion of stored objects.
- UI tests: permission denial/cancel/retry, OCR loading/error/unavailable, edit/add/remove candidates, explicit save, record list/detail/delete and PDF export.
- Android export verifies JavaScript bundling. A native development build/device check is required for OCR/permissions; workspace availability is reported separately.
- No real record images or lab values in tests, logs, fixtures or repository.

## Boundaries

- **Always:** disclose that images contain sensitive health data before capture/upload; require the user's explicit save confirmation; OCR runs on device and is never sent to a cloud OCR/model service; verify file bytes/type/size and derive owner/path on the server; use private storage, short-lived download links, RLS and owner checks; export PDF locally with escaped values; allow deletion of metadata and object together; present values as transcribed/user-reported and non-clinical.
- **Ask first:** none for this implementation; the user delegated dependency and design approval. Native build tooling may still be unavailable in this workspace.
- **Never:** infer diagnoses or clinical status, silently save OCR output, expose public object URLs, log result text, use real patient fixtures, or claim camera/OCR is device-verified when only bundle export passed.

## Success Criteria

- The user can take a photo or choose one image and receive on-device OCR text/candidate lab rows or a clear unsupported-device/model message.
- Every candidate's name, value, unit and optional reference range is editable; save persists only user-confirmed rows with source date/note and an account-owned source file.
- Users can list, view, edit and delete their own records; signed downloads expire; another account cannot list, read, overwrite or delete the file/metadata.
- Account export includes record metadata and confirmed values; account deletion deletes private objects before removing the Auth identity.
- A local PDF can be generated/shared from account-owned records, includes source/date/disclaimer and safely escapes all user values.
- OCR and upload failure preserve the draft and offer retry; no clinic interpretation or automatic nutrition-plan update occurs.

## Out of Scope (Deferred)

- Clinical interpretation, lab reference validation, clinician sign-off, provider sharing of records and automatic profile/plan updates.
- Server-side OCR, third-party OCR, PDF uploads above the bounded file limit and multi-file batch scanning.
- Real-data activation until privacy/security and qualified clinical review plus retention policy are supplied.

## Open Questions

None. Local OCR is selected to keep image bytes on device; user delegation covers the required native dependency.

## Source References

- [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [Expo AI Kit OCR guide](https://expo-ai-kit.dev/guides/vision)
- [Expo AI Kit repository and Expo SDK compatibility](https://github.com/saidkaban/expo-ai-kit)
