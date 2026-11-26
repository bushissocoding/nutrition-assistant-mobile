# Nutrition catalog and meal planning

Status: food-data integration is paused pending redistribution permission for the Vietnamese food-composition tables published by the National Institute of Nutrition (NIN).

## Objective

Use NIN as the preferred source for Vietnamese food composition when reuse rights and qualified review are in place. Until then, the active catalog stays empty, food lookup and source-based calculations stay unavailable, and the API must not fall back to project estimates or another dataset. Existing account snapshots preserve their original source/version.

## Current contract

- `GET /api/v1/foods/search?q=&page=`, `GET /api/v1/foods/vietnam-nin/:recordId`, and `POST /api/v1/nutrition/calculate-sourced` validate bounded requests and return `503 FOOD_SOURCE_UNAVAILABLE` while NIN data are not authorized and integrated.
- `POST /api/v1/meal-plans/generate` returns an unavailable response with an empty plan while the catalog is pending. It does not create or persist a plan from sample values.
- `GET /api/v1/foods` and `POST /api/v1/nutrition/calculate` retain the `/api/v1` response contract. The catalog is empty; synthetic planner fixtures are restricted to tests.
- The source registry records the preferred NIN table, candidate editions 2007 and 2017, and unconfirmed redistribution status. No food values are present in the active catalog.
- Saved diary, grocery, and meal-plan snapshots keep their existing source attribution. They are never relabelled as NIN records.

## Activation requirements

1. Obtain written permission or a license from the NIN rights holder that covers redistribution and derived/modified values, and record required attribution.
2. Select an edition and preserve row-level references, preparation state, nutrient units, missingness, access date, and every conversion in an auditable source manifest.
3. Have a qualified nutrition reviewer verify imported values, food identity, preparation, portions, and planner behavior.
4. Import using the strict catalog validator, inspect and approve its deterministic change report, then implement an authorized source adapter that preserves the route contract.
5. Add focused tests for the real approved source manifest without copying protected table values into unauthorized fixtures.

## Boundaries

- Do not scrape, transcribe, bundle, or serve table values before rights are confirmed.
- Do not treat public access as permission to redistribute.
- Do not populate the production catalog with synthetic values, project estimates, or a differently sourced comparator.
- Preserve unknown nutrients as unknown; never convert missing values to zero.
- Keep allergy and hard-limit behavior fail-closed; food-composition records alone do not establish contamination safety or clinical suitability.
- Keep recipes and meal plans informational and non-clinical.

## Source notes

- [NIN official book/PDF page](https://chuyentrang.viendinhduong.vn/viewfilenew/vi/thu-vien-sach-chuyen-nganh/189/1.html)
- [FAO/INFOODS record: 2017 Vietnam table](https://www.fao.org/food-composition/tables-and-databases/detail/%28viet-nam--2017%29-vietnamese-food-composition-table/en)
- [FAO/INFOODS record: 2007 Vietnam table](https://www.fao.org/food-composition/tables-and-databases/detail/%28viet-nam--2007%29-vietnamese-food-composition-table/en)
- Rights findings and activation checklist: [`docs/research/issue-4-food-data-sources.md`](../docs/research/issue-4-food-data-sources.md)
