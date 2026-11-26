# Tasks: `records-labs`

Spec: `spec/SPEC-records-labs-v2.md`.

- [x] 1. Add health record/result schema, private storage bucket/object owner policies and migration contract tests.
  - Acceptance: objects are private; metadata, result and object ownership match `auth.uid()`; deletion plan includes objects.
  - Verify: migration contract tests and full unit suite.
- [x] 2. Implement authenticated metadata CRUD, bounded binary upload, private signed download and object deletion service.
  - Acceptance: allowlisted MIME/type/size/path only; server derives the account path; reads and deletes are owner-scoped.
  - Verify: repository/API tests for unauthorized, malformed, oversized and cross-owner requests.
- [x] 3. Add image picker and on-device OCR with deterministic editable candidate extraction.
  - Acceptance: OCR text stays on device until user-confirmed save; unavailable model/permission errors keep the draft.
  - Verify: parser/validation tests, focused UI tests and Android export.
- [x] 4. Persist reviewed results, browse/delete records and generate/share local record PDF.
  - Acceptance: only confirmed values are saved; PDF escapes data and has source/disclaimer; delete removes metadata and object.
  - Verify: UI/PDF tests and Android export; native OCR device check recorded if unavailable.
- [x] 5. Add account export/deletion lifecycle, architecture docs, capability map and review.
  - Acceptance: metadata included in export and private objects are deleted before Auth deletion.
  - Verify: required unit/UI/API checks, Android export, catalog validation and diff hygiene.

## Checkpoint

- [x] User can capture/select → OCR locally → review/edit → confirm → view/export → delete, with account isolation and no interpretation. Physical-device OCR and live RLS tests remain external.
