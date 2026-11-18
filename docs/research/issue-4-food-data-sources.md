# Issue #4: food composition data rights research

**Verified:** 2026-11-17 (Asia/Saigon)
**Decision:** No Vietnamese dataset was imported. Availability of a table or file is not evidence of redistribution permission.

## Findings

| Source / edition | What the official source establishes | Rights, redistribution, attribution | Issue #4 disposition |
|---|---|---|---|
| Vietnam Institute of Nutrition, *Vietnamese Food Composition Table* (2017; Ministry of Health, 302 pp.) | FAO/INFOODS identifies the 2017 edition and describes it as **print-only**. The Institute also serves a separate PDF under its official domain; its edition was not confirmed in this check, and no explicit redistribution grant was located. | No license, redistribution permission, or attribution terms were verified for the 2017 table. A publicly reachable PDF does not resolve those rights. | **Blocked:** do not transcribe, scrape, bundle, or redistribute values pending written permission/license from the rights holder. Do not claim project values are official Institute values. |
| Vietnam Institute of Nutrition, 2007 table | FAO’s record describes a 567-page PDF as “Free access” and provides a contact/download link. “Free access” does not state a reuse license. | No redistribution grant/license or attribution requirements were verified. FAO’s database terms warn that third-party datasets may require provider consent or have different restrictions. | **Blocked:** do not import absent rights confirmation. |
| SMILING Vietnam Food Composition Table (2013) | FAO/INFOODS lists 162 foods in two Excel files, with value-level references and a quality-assessment file; the download names include “protected”. The record names the National Institute of Nutrition and Wageningen University as contributors. The two linked spreadsheets returned 404 when opened on 2026-11-17. | No dataset-specific license or permission to redistribute was found in the FAO record. FAO statistical-database CC BY terms cannot be assumed to grant rights to third-party source data; the terms explicitly require checking third-party restrictions. | **Blocked:** obtain the source file and rights-holder terms before any import. |
| FAO/INFOODS tables directory and terms | The directory is an index/catalog of published tables; inclusion is not endorsement. FAO corporate statistical database terms generally permit copy, adaptation and redistribution under CC BY 4.0 unless metadata/page says otherwise, with additional terms; third-party data may need separate permission. | If a qualifying FAO database dataset is used, follow its specific metadata and FAO terms, attribute using FAO’s prescribed citation (database, dataset, last update, access date, URL, CC BY 4.0), preserve notices, and do not imply FAO endorsement. This general policy is not blanket clearance for a listed Vietnamese book/table. | Directory listing alone is insufficient licensing evidence. |
| USDA FoodData Central (existing comparator source family) | USDA states that FDC data are public domain, not copyrighted, and published under CC0 1.0. It requests listing FoodData Central as the source and supplies a suggested citation. The download page lists SR Legacy’s final release as 04/2018 and current Foundation Foods as 10/2026. Data types are distinct. | Redistribution is permitted for FDC data under CC0 1.0. Requested attribution: “U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. [Internet]. [cited date]. Available from https://fdc.nal.usda.gov/.” | Existing prototype entries mention FDC and comparator food descriptions, but do not persist a FoodData Central ID or edition/release. Their exact FDC row and release cannot be confirmed from the catalog as written. Do not backfill a release by guess. For any future FDC import, record dataset type, FDC ID, release, access date and transformation. Keep the entries marked as approximate, non-Vietnamese comparators. |

## Source links

- [Vietnam Institute of Nutrition book/PDF page](https://chuyentrang.viendinhduong.vn/viewfilenew/vi/thu-vien-sach-chuyen-nganh/189/1.html)
- [FAO/INFOODS record: 2017 Vietnam table](https://www.fao.org/food-composition/tables-and-databases/detail/%28viet-nam--2017%29-vietnamese-food-composition-table/en)
- [FAO/INFOODS record: 2007 Vietnam table](https://www.fao.org/food-composition/tables-and-databases/detail/%28viet-nam--2007%29-vietnamese-food-composition-table/en)
- [FAO/INFOODS record: 2013 SMILING Vietnam table](https://www.fao.org/food-composition/tables-and-databases/detail/%28vietnam--2013%29-smiling-food-composition-table-for-vietnam/en)
- [FAO/INFOODS international directory](https://www.fao.org/food-composition/tables-and-databases/)
- [FAO statistical database terms of use](https://www.fao.org/contact-us/terms/db-terms-of-use/)
- [USDA FoodData Central licensing and attribution](https://fdc.nal.usda.gov/)
- [USDA FoodData Central dataset releases](https://fdc.nal.usda.gov/download-datasets/)
- [USDA FoodData Central data-type documentation](https://fdc.nal.usda.gov/data-documentation/)

## Handoff blockers

1. Vietnamese composition-table redistribution rights are still unverified; request written authorization or a license from the relevant rights holder, including required attribution and whether modified/derived records may be redistributed.
2. A qualified nutrition reviewer must assess food identity, preparation state, portions, units/conversions, and the imported values before any Vietnamese catalog is presented as reviewed.
3. Until both are resolved, keep the catalog labelled as a prototype and use only synthetic fixtures for pipeline tests; existing USDA comparator rows are not Vietnam-specific.

## Follow-up verification: 2026-11-18

The USDA publisher homepage's Licensing section was checked directly again on 2026-11-18: it publishes FDC data under CC0 and requests source attribution. The registry now retains that publisher page as `rights.evidenceUrl`. This confirms the published general reuse terms only; it does not recover missing legacy record IDs or editions. Other source findings above retain their original check date; no new Vietnamese rights grant or expert review has been obtained.

For the Vietnam 2007/2017 and SMILING candidates, contact the publisher/rights holder through its official publication/contact page and request terms covering the exact edition, digitization, translation, transformations, API display, downloadable redistribution, attribution, commercial/noncommercial scope and withdrawal conditions. Preserve the written response and have the project owner or qualified rights reviewer record the permitted scope and evidence before import. If permission is absent, keep import blocked; even internal use must comply with the actual terms. Use FDC with exact source records or synthetic test inputs as the available alternatives, without claiming Vietnamese representativeness.
