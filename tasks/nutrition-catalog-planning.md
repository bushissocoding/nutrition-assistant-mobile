# Nutrition catalog and planning — current status

Spec: [`spec/SPEC-nutrition-catalog-planning.md`](../spec/SPEC-nutrition-catalog-planning.md). The National Institute of Nutrition tables are the preferred future source. Redistribution permission has not been confirmed, so no values are imported or served.

## Completed in the source-retirement change

- [x] Remove the active external provider adapter and its server credential/configuration.
- [x] Make the active catalog empty and pending; retain the NIN source entry with rights marked unconfirmed.
- [x] Return a stable unavailable response from lookup and sourced calculations; return no generated plan while the catalog is pending.
- [x] Keep synthetic records in test-only fixtures and preserve the `/api/v1` contract.
- [x] Generalize database source-ID constraints through a forward migration while preserving already-applied migration history.
- [x] Update app copy, documentation, specifications and task notes. Keep old snapshot provenance unchanged.

## Required before reactivation

- [ ] Obtain written redistribution permission, including attribution and derived-value terms.
- [ ] Select and document an edition, row-level references, preparation state, units, missingness, conversions and access date.
- [ ] Complete qualified nutrition review.
- [ ] Import through the strict catalog validator, approve its change report, then implement the authorized source adapter.
- [ ] Add focused tests and run required repository checks after source activation.

## Verification

- Focused pending-source, catalog, planner and API tests use synthetic values only.
- `npm run test:unit`, `npm run test:ui`, and `npm run test:api` are required by `CONSTRAINTS.md` before handoff.
- Local Supabase migration/RLS execution requires Docker and the Supabase CLI; static migration tests do not establish live database behavior.
