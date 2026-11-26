# Issue #4: Vietnamese food-composition data

**Reviewed:** 2026-11-26 (Asia/Saigon)

**Decision:** Prefer the Vietnamese food-composition tables published by the National Institute of Nutrition (NIN). No NIN food values are imported or served until redistribution rights are confirmed in writing.

## Findings

| Edition/source | What the source establishes | Rights status | Project decision |
|---|---|---|---|
| NIN *Vietnamese Food Composition Table* (2017) | FAO/INFOODS lists the 2017 table as print-only. NIN's official site hosts a book/PDF page, but the edition and reuse terms were not confirmed from that page. | No redistribution license or permission was verified. Public access to a PDF does not grant reuse rights. | Pending written permission. Do not copy, transcribe, bundle, or serve its values. |
| NIN *Vietnamese Food Composition Table* (2007) | FAO/INFOODS describes a PDF as free access. That access label does not specify a reuse license. | No redistribution permission or attribution terms were verified. | Pending written permission. Do not import values. |
| SMILING Vietnam table (2013) | FAO/INFOODS lists spreadsheets and value-level references; linked files were unavailable when reviewed. | No dataset-specific license or permission was verified. FAO general terms do not automatically clear third-party table rights. | Not selected as the active source. Obtain files and rights-holder terms before considering it. |

The source registry records NIN as the preferred source with editions 2007 and 2017, rights `unconfirmed`, and no imported rows. The active food catalog is empty with status `pending`. Source search, detail, sourced nutrient calculations, and meal-plan generation return unavailable; there is no fallback to prototype values. Synthetic fixtures remain test-only.

Historical diary, grocery, and meal-plan snapshots keep their original source IDs and versions. They are not relabelled as NIN data. Applied migrations remain unchanged to preserve migration history; a forward migration generalizes source identifiers for future authorized sources.

## Source links

- [NIN official book/PDF page](https://chuyentrang.viendinhduong.vn/viewfilenew/vi/thu-vien-sach-chuyen-nganh/189/1.html)
- [FAO/INFOODS record: 2017 Vietnam table](https://www.fao.org/food-composition/tables-and-databases/detail/%28viet-nam--2017%29-vietnamese-food-composition-table/en)
- [FAO/INFOODS record: 2007 Vietnam table](https://www.fao.org/food-composition/tables-and-databases/detail/%28viet-nam--2007%29-vietnamese-food-composition-table/en)
- [FAO/INFOODS record: 2013 SMILING Vietnam table](https://www.fao.org/food-composition/tables-and-databases/detail/%28vietnam--2013%29-smiling-food-composition-table-for-vietnam/en)
- [FAO/INFOODS international directory](https://www.fao.org/food-composition/tables-and-databases/)
- [FAO statistical database terms of use](https://www.fao.org/contact-us/terms/db-terms-of-use/)

## Work required before activation

1. Obtain written permission or a license from the rights holder, including attribution terms and permission for modified or derived records.
2. Record the exact edition, access date, row-level citations, preparation state, units, conversions, and transformation history for every imported value.
3. Have a qualified nutrition reviewer verify food identity, preparation, values, portions, and planner constraints.
4. Import through the existing strict catalog validator and approve the resulting change report before enabling the source.

## Registry and import safeguards

The source registry keeps NIN unconfirmed: `rights.license`, `rights.evidenceReference`, `rights.permittedActions`, `rights.verifiedBy`, `rights.verifiedOn`, and `rights.attribution` remain unset. Do not infer any permission from public access. Once written rights exist, update the registry with a controlled reference to the evidence and explicitly record permission to copy, transform, and redistribute, plus the exact attribution text. Keep private permission documents outside the repository.

Strict external records must carry provenance for identity, preparation, serving, and nutrition: source ID, exact source record and edition, row/cell reference, access date, and method. Nutrient units and unknown values stay explicit. The importer validates a candidate and emits a deterministic change report; its output cannot target the active catalog, and a qualified reviewer must approve records before the serving loader accepts them. It performs no download or scraping. The synthetic fixture is validation-only: CI runs `npm run catalog:fixture`, and the importer refuses to write a `synthetic-fixture` catalog.
