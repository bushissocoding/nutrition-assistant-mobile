# Implementation Plan: Persistent Grocery List — V1

Source spec: [SPEC-grocery-list.md](../SPEC-grocery-list.md)

Status: implementation complete; Android device/emulator verification pending

## Tổng quan

Lưu một grocery list hiện hành trên demo API từ snapshot `grocery` do planner trả về; đọc lại list đã lưu, sửa số lượng/đơn vị, đổi trạng thái đã mua và xóa mục. Giữ dữ liệu trong JSON demo store tách namespace, không thêm runtime dependency hoặc auth. Tích hợp purge với luồng profile/consent hiện có.

## Đồ thị phụ thuộc

```text
Schema/validation service ─> repository + idempotency ─> HTTP contract
                                                        │
                                                        └─> API client ─> Grocery UI
                                                                             │
                                                                             ├─> planner create/open flow
                                                                             └─> profile/consent purge
                                                                                         │
                                                                                         └─> docs + final checks
```

Domain/repository và test API có thể phát triển theo lát dọc nhưng route cần cả service lẫn repository. UI phụ thuộc API contract/client. Purge chỉ nối sau khi API method và screen flow sẵn sàng. Tài liệu chốt sau khi hành vi được kiểm chứng.

## Quyết định kiến trúc

- Thêm `server/src/services/shopping-lists.js`, `server/src/repositories/shopping-list-repository.js`, và feature router `server/src/routes/shopping-lists.js`; giữ validation ở boundary/router và thao tác lưu trong repository.
- Dùng collection `shopping_lists` trong demo JSON store. Collection có một row list hiện hành và các row idempotency metadata; `updateCollection` atomically thay list + tạo ledger, hoặc sửa item. Không lưu request body trong ledger.
- Mobile map snapshot planner `{ foodId, name, grams }` thành API item `{ foodId, amount: grams, unit: 'g' }`; server chỉ nhận wire schema đã duyệt, tra tên từ catalog, tạo ID/timestamp phía server, và kiểm tra duplicate food IDs, enum unit cùng amount hữu hạn.
- Tạo list yêu cầu `Idempotency-Key`; cùng key/payload trả list hiện hành nếu chưa bị thay, key khác payload trả `409`, key của list đã thay/xóa trả `410`. List mới thay list hiện hành. Xóa list hiện hành giữ tombstone; `DELETE /shopping-lists` purge toàn collection.
- Route áp dụng `demoContext.requireScope`. `Idempotency-Key` đã được cho phép trong CORS từ mobile API foundation; không cần thay CORS nếu kiểm tra vẫn xác nhận header/method.
- Mở Grocery screen luôn tải `GET current`; không dùng fallback mẫu. Planner cung cấp hành động riêng để mở list đã lưu và hành động tạo từ plan hiện tại. Nếu có list, hỏi xác nhận trước khi thay. Mutation UI chỉ áp dụng response server.
- Profile deletion/consent withdrawal purge diary và shopping list trước khi xóa dữ liệu local. Nếu một purge lỗi, local state được giữ; gọi lại hai purge là an toàn.
- Không thêm database/dependency/runtime logging mới; dùng test harness Jest/RNTL đã được thêm cho module diary.

## Task List

### Phase 1: Domain, persistence, and API contract

- [x] Task 1: Define grocery item/list normalization and validation.
- [x] Task 2: Persist current list and idempotency ledger atomically.
- [x] Task 3: Expose scoped shopping-list endpoints and route tests.

### Checkpoint: API contract

- [x] Unit/repository tests pass; API tests cover CRUD, validation, retry, demo mode and namespace separation.
- [x] Existing `/api/v1` planner, diary, and catalog contracts remain unchanged.

### Phase 2: Mobile and user flow

- [x] Task 4: Add shared API methods for list get/create/patch/delete/purge.
- [x] Task 5: Implement load/edit/purchase/delete UI and planner create/open actions.
- [x] Task 6: Purge grocery data before local profile/consent deletion.

### Checkpoint: Mobile flow

- [x] UI tests cover loading, empty, retry, mutations, and replace confirmation.
- [x] Reopening Grocery loads the server list; failed mutations do not report success.
- [x] Profile deletion remains blocked locally unless both remote purges succeed.

### Phase 3: Documentation and handoff

- [x] Task 7: Document contract, demo boundary, setup behavior, and MVP limitations.
- [x] Task 8: Run required suites and Android export; report unavailable device verification.

### Checkpoint: Complete

- [x] Spec criteria are met; all required tests and `git diff --check` pass.
- [x] No grocery/barcode test data or generated output is tracked; demo store stays out of Git.

## Rủi ro và giảm thiểu

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Caller can forge `X-Demo-Namespace` or grocery snapshot | Cao | Keep routes demo-only/out of production; validate all food IDs/amounts; clearly document that source-plan validation and account ownership are absent. |
| Retry creates duplicate/revives a replaced list | Cao | Atomic list+ledger write, keep minimal tombstones for replaced/deleted list keys, test same/different payload and stale retries. |
| New list overwrites purchased/edited state | Trung bình | Require explicit UI confirmation when a current list exists; only replace after server success. |
| Store write fails after a UI action | Cao | Return finite API error; update screen only from successful response; test injected store failure. |
| One purge succeeds and the other fails | Trung bình | Keep local profile/consent until both succeed; make each purge repeat-safe so the user can retry. |
| No Android device/emulator available | Trung bình | Run host API/UI tests and Expo bundle; report device check as pending rather than claiming it passed. |

## Ngoài phạm vi plan

List history, multi-user sharing, barcode/catalog search, actual prices/stock, offline queue/background sync, production storage/auth, and nutrition recalculation from shopping edits.
