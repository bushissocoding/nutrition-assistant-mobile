# Release Operations Task List

Spec: [`SPEC-release-operations-v1.md`](../spec/SPEC-release-operations-v1.md)

## Tasks

- [x] 1. Inventory runtime services, configuration, data lifecycle, current safeguards and unverified external gates.
- [x] 2. Document staged deployment, additive migration, rollback, smoke check, incident, support and recovery procedures.
- [x] 3. Replace inaccurate demo-only security/operations statements with verified current behavior and limitations.
- [x] 4. Add bounded structured request telemetry with generated correlation IDs and tests proving private values are excluded.
- [x] 5. Run the repository acceptance checks, review the full branch diff, and record unavailable external checks with their blockers.

## Checkpoint

Repository completion does not mean production approval. The external release gate table must retain an owner/input and evidence requirement for every item that cannot be verified from this checkout.
