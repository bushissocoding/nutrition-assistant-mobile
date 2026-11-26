# Implementation Plan: Licensed Food-Data Pipeline Readiness

Source spec: `spec/SPEC-nutrition-catalog-planning.md` and `docs/research/issue-4-food-data-sources.md`.

## Overview

Prepare the existing food catalog pipeline for a future dataset only after written reuse rights and qualified review are recorded. Strengthen rights checks and record-level provenance, keep candidate imports separate from serving, and ensure the synthetic fixture can only be used for validation/tests. This work does not fetch, scrape, transcribe, or add real food-composition values.

## Architecture Decisions

- Keep the `/api/v1` contract and the active NIN catalog pending while permission is unconfirmed.
- Store a structured rights evidence reference, verification identity/date, exact required permissions (copy, transform, redistribute), and attribution in the source registry; do not commit private permission documents.
- Require exact source record, edition, row/cell reference, access date, and method for external record provenance.
- Permit candidate review/import checks, but only serve externally sourced records with complete rights and approved review metadata.
- Keep the synthetic fixture test-only; validation remains available, while import writes must reject fixture catalogs.
- Commit each implementation task separately; merge the completed branch into `codex/fix-bug` and delete the task branch.

## Task List

### Phase 1: Rights and provenance validation

- [x] Task 1: Validate explicit source rights evidence and permission scope.
- [x] Task 2: Require auditable provenance for external source records.

### Checkpoint: Source validation

- [x] Pending NIN remains unimportable; tests use synthetic records only.
- [x] A synthetic licensed-source test record passes only when rights and provenance fields are complete.

### Phase 2: Safe import and publication gates

- [ ] Task 3: Keep synthetic fixtures out of import outputs and require complete approval before serving.

### Checkpoint: Fixture and runtime safety

- [ ] `catalog:fixture` validates the fixture without writing catalog output.
- [ ] The API fails closed for synthetic, unlicensed, incomplete-provenance, or unreviewed records.

### Phase 3: Documentation and acceptance

- [ ] Task 4: Document the rights checklist, candidate review workflow, and synthetic-only fixture boundary; add CI catalog checks.
- [ ] Run all required tests and catalog checks, review the diff, and confirm no real dataset or secrets were added.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Permission status is represented without evidence | Unauthorized reuse could be enabled by a mistaken registry edit | Require a rights evidence reference, verifier/date, explicit scopes, license/permission details, and attribution. |
| Test values are mistaken for real food data | Users could receive fabricated nutrition values | Reject synthetic fixture writes and fail closed in the serving repository. |
| Provenance is too coarse to audit a future import | Values cannot be traced to the source material | Require row/cell reference, exact edition, access date, method, and nutrient units/missingness. |
| No permission has been obtained | A live dataset cannot be activated | Keep the active catalog empty and pending; this work prepares the pipeline only. |

## Open Questions

- None. No external dataset is being selected or imported in this work.
