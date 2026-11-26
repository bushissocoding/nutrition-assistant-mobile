# Task List: Licensed Food-Data Pipeline Readiness

## Task 1: Validate explicit source rights evidence and permission scope

**Description:** Extend external source registry records and strict validation so an external dataset cannot be imported without a documented evidence reference, verifier/date, permission to copy/transform/redistribute, license or written permission details, and required attribution.

**Acceptance criteria:**
- [x] The pending NIN entry records the expected fields as unconfirmed/null without inventing permission.
- [x] Strict external-source validation rejects missing or incomplete rights evidence and scope.
- [x] Synthetic tests prove the gate without copying real source values.

**Verification:** [x] `node --test server/tests/food-catalog.test.js` (12 passed); [x] `npm run catalog:validate`.

**Dependencies:** None.

**Files likely touched:** `server/data/sources.json`, `server/src/services/food-catalog.js`, `server/tests/food-catalog.test.js`.

**Estimated scope:** Small.

## Task 2: Require auditable provenance for external source records

**Description:** Require each external provenance group to retain an exact source record/edition, row or cell reference, access date, and transformation method while preserving nutrient units and explicit missingness.

**Acceptance criteria:**
- [ ] Strict validation rejects absent, malformed, or unknown external references and access dates.
- [ ] Synthetic test records demonstrate accepted provenance and each rejected omission.
- [ ] The validator does not convert missing nutrient values into zero.

**Verification:** `npm run test:unit` and focused food-catalog tests.

**Dependencies:** Task 1.

**Files likely touched:** `server/src/services/food-catalog.js`, `server/tests/food-catalog.test.js`, `server/data/fixtures/synthetic-foods.json` only if its fixture schema requires an explicit test marker.

**Estimated scope:** Small.

## Task 3: Keep synthetic fixtures out of import outputs and require complete approval before serving

**Description:** Preserve fixture validation for tests while blocking fixture write-mode imports. Make the active catalog loader require strict rights/provenance checks and approved review metadata for external records.

**Acceptance criteria:**
- [ ] `catalog:fixture` remains validation-only; fixture write attempts fail before creating output/report files.
- [ ] The active catalog loader rejects synthetic catalogs and external records without confirmed rights, complete provenance, and approved review metadata.
- [ ] Pending production data continues to load with an empty catalog.

**Verification:** `npm run test:unit`, `npm run catalog:fixture`, and focused loader/importer tests.

**Dependencies:** Tasks 1–2.

**Files likely touched:** `server/scripts/import-food-catalog.js`, `server/src/repositories/catalog.js`, `server/tests/food-catalog.test.js`, `server/tests/catalog-repository.test.js`.

**Estimated scope:** Medium.

## Task 4: Document the rights checklist, candidate review workflow, and synthetic-only fixture boundary; add CI catalog checks

**Description:** Align the source research and developer docs with the structured gate, explain how to stage a licensed candidate without activating it, and run catalog validation/fixture checks in CI.

**Acceptance criteria:**
- [ ] Documentation states that written rights and qualified review are still outstanding and does not imply that NIN values are imported.
- [ ] The documented workflow keeps permission documents private and uses a reference in the registry.
- [ ] CI validates the empty active catalog and synthetic fixture without writing fixture data into the active catalog.

**Verification:** `npm run test:unit`, `npm run test:ui`, `npm run test:api`, `npm run catalog:validate`, `npm run catalog:fixture`, and workflow YAML review.

**Dependencies:** Tasks 1–3.

**Files likely touched:** `README.md`, `server/README.md`, `docs/research/issue-4-food-data-sources.md`, `.github/workflows/ci.yml`.

**Estimated scope:** Medium.
