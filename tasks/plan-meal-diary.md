# Implementation Plan: Persistent Meal Diary — V1

Source spec: [SPEC-meal-diary.md](../SPEC-meal-diary.md)

Status: implementation complete; physical-phone verification confirmed by the user

## Tổng quan

Thêm diary CRUD bền vững trên demo JSON store hiện có, tính dinh dưỡng trong backend, lọc theo ngày/múi giờ, chống tạo trùng, và nối screen/UI với API client chung. Giữ giới hạn demo-only đến khi có auth thật; purge nhật ký trên server khi người dùng xóa hồ sơ hoặc thu hồi đồng ý. Không thêm barcode hoặc grocery flows trong module này.

## Đồ thị phụ thuộc

```text
Jest/RNTL test harness ────────────────────────────────┐
                                                       ├─> DiaryScreen + component tests
Schema + IANA timezone model ─> repository/idempotency ├─> API router + route tests
                                                       │
Shared Expo API client ────────────────────────────────┴─> AppShell hydration + consent purge
                                                                    │
                                                                    └─> docs, CI, final verification
```

Test harness và domain model bắt đầu độc lập. Repository phụ thuộc model đã chuẩn hóa; route phụ thuộc repository và model; mobile client methods phụ thuộc route contract; screen/app-shell phụ thuộc methods. Các checkpoint giữ API cũ, planner và client hiện hữu chạy được.

## Quyết định kiến trúc

- Thêm feature router `server/src/routes/meal-entries.js`, service thuần cho validation/timezone/nutrient mapping, và repository wrapper riêng trên `demoContext.store`; giữ `api.js` làm nơi mount router, không đưa quy tắc nghiệp vụ vào Express route.
- Giữ `/api/v1` và kiểu lỗi hiện tại `{ error: string }`; các route mới thêm `code` dạng chuỗi ở cùng object, không đổi response của foods/nutrition/meal-plans.
- Lưu UTC instant `consumedAt`; date query yêu cầu `YYYY-MM-DD` và IANA `timeZone`. Tính khoảng nửa mở giữa hai local midnight bằng `Intl`, hỗ trợ DST thay vì giả định ngày luôn 24 giờ.
- Chuẩn hóa input trước khi tính nutrition/fingerprint. Tính từng bản ghi bằng `calculateFood`, tổng ngày dùng cùng quy tắc làm tròn `calculateTotals`; chỉ trả nutrient từ backend.
- Dùng một atomic `updateCollection` trên `meal_entries` cho entry và idempotency ledger. Row có `kind: 'entry'` hoặc `kind: 'idempotency'`; query chỉ đọc entry. Ledger giữ key/fingerprint/resourceId, không giữ body hoặc note; xóa item giữ ledger, purge namespace xóa cả hai.
- Không thêm database/dependency runtime. Thêm `jest`, `jest-expo`, `@testing-library/react-native` làm devDependencies để đáp ứng UI component tests; dùng Expo CLI chọn bản tương thích SDK 58, cấu hình `jest-expo`, và chạy test UI trong CI.
- API client methods chỉ gọi `client.request`, truyền `X-Demo-Namespace` chung và `Idempotency-Key` cho create. Screen giữ cùng key khi retry cùng form/body, tạo key mới nếu người dùng đổi intent.
- `DiaryScreen` tải ngày đang chọn từ API; `AppShell` giữ cache của ngày hiện tại để Home/Dashboard hydrate từ API sau khi mở app và được cập nhật khi diary mutation thành công. Cache không là nguồn bền vững.
- Consent revoke/profile delete purge remote diary trước; chỉ sau `204` mới xóa local profile/consent. Lỗi mạng giữ nguyên local data và báo lỗi, không khẳng định đã xóa.

## Trình tự triển khai

### Phase 1: Test harness và domain/date model

1. Cài/cấu hình Jest + `jest-expo` + React Native Testing Library và thêm `npm run test:ui`; thêm step vào CI và quality bar trong `CONSTRAINTS.md`. Bắt đầu bằng component smoke test để xác nhận preset hoạt động với Expo SDK hiện tại.
2. Viết test trước cho normalize/validate entry, IANA timezone, local-date UTC boundaries, DST 23/25 giờ, sort/pagination helpers và nutrient mapping; sau đó thêm service/domain model thuần.

**Checkpoint:** `npm run test:unit` và `npm run test:ui` đạt; Metro/Expo bundle không đổi; không có dependency runtime mới.

### Phase 2: Atomic repository và idempotency

3. Viết repository tests với demo store dùng file tạm: create entry+ledger atomic, cùng key/body replay, cùng key/body khác conflict, duplicate đồng thời không tạo bản sao, update/delete item, purge collection và persistence sau khi mở repository mới.
4. Implement `meal-entry-repository.js` trên collection `meal_entries`. Giữ ledger không chứa note/payload; DELETE collection xóa cả entry và ledger.

**Checkpoint:** focused repository tests và `npm run test:unit` đạt; namespace khác không đọc được row; test không tạo default runtime JSON file.

### Phase 3: API CRUD theo contract

5. Viết HTTP route tests trước cho POST, GET theo ngày/timezone, GET id, PATCH, DELETE id và DELETE collection; bao gồm `demoContext.requireScope`, CORS `Idempotency-Key`, missing/invalid input, 404 namespace, 409 replay conflict, 410 deleted-result retry, store failure và backend-calculated nutrients.
6. Mount feature router, map lỗi `{ error, code }`, tính totals trên toàn ngày trước pagination; xác nhận old API routes và `/api/v1` responses không đổi.

**Checkpoint:** route tests, `npm run test:unit`, `npm run test:api` đạt; API không phục vụ diary khi demo disabled/production.

### Phase 4: Mobile contract methods và màn nhật ký

7. Mở rộng `createApiMethods` và tests cho create/list/get/update/delete/purge, encode query đúng, truyền idempotency key/header và không thay `/api/v1` legacy methods.
8. Refactor `DiaryScreen`: date navigation/time input, search food, portion/meal/note form, create/edit/delete, backend nutrients/totals, estimate disclaimer và loading/empty/error/retry. Không cập nhật success state trước response thành công.
9. Component tests dùng RNTL và mock API: loading, empty, error/retry, create/edit/delete, retry cùng key, server failure giữ form/list, và nhãn ước tính.

**Checkpoint:** `npm run test:ui`, unit/API tests và Expo Android bundle đạt; không có `fetch()` trong screen.

### Phase 5: App-shell hydration, consent deletion và docs

10. Hydrate today's diary summary khi app mở để Home/Dashboard hiển thị server state sau restart; mutation ngày hiện tại cập nhật cache, request ngày cũ không ghi đè ngày mới.
11. Nối purge API vào luồng xóa profile/thu hồi consent; nếu purge thất bại, giữ local profile/consent và cho phép thử lại. Thêm tests cho delete error/success order.
12. Cập nhật API docs, architecture, README và `CONSTRAINTS.md` với contract, timezone/idempotency, demo-only ownership boundary, purge behavior, test commands và nutrition estimate disclaimer.

**Checkpoint:** required checks `npm run test:unit`, `npm run test:api`, `npm run test:ui` đạt; app bundle đạt; không có local store, `.env` hoặc dữ liệu thật trong diff.

## Rủi ro và giảm thiểu

| Rủi ro | Mức ảnh hưởng | Giảm thiểu |
|---|---|---|
| DST/timezone tạo ngày sai | Cao | Dùng IANA timezone, local-midnight range, test ngày ngắn/dài và biên nửa đêm. |
| Retry tạo duplicate khi response timeout | Cao | Cùng atomic collection update ghi entry+fingerprint ledger; concurrent duplicate test. |
| Xóa item làm mất khả năng nhận diện retry | Trung bình | Giữ ledger chỉ chứa key/hash/resourceId đến khi purge store. |
| Client tính nutrition khác server | Cao | Không nhận nutrients từ client; dùng `calculateFood`/`calculateTotals` và so sánh route tests với API nutrition. |
| Consent bị xóa nhưng server diary còn | Cao | Purge trước; lỗi purge không xóa local consent/profile hoặc báo thành công. |
| Namespace demo bị giả mạo | Cao | Không gọi là auth; production luôn disable; chỉ dữ liệu synthetic. |
| Jest/RNTL không tương thích SDK 58 | Trung bình | Chọn dependency bằng Expo CLI, smoke test preset sớm, đồng bộ `react-test-renderer` với phiên bản React. |
| Không có Android emulator trong môi trường | Trung bình | Người dùng đã xác nhận checklist chạy trên điện thoại thật; ghi nhận model/OS chưa được cung cấp. |

## Xác minh thiết bị

Người dùng xác nhận checklist trên điện thoại hoạt động tốt: truy cập API `/health`, mở app từ phiên Expo mới, thêm nhật ký và mở lại app. Model/OS không được ghi lại; Android emulator không có sẵn.

## Ngoài phạm vi plan

- Grocery list, barcode/OCR, auth thật và account ownership.
- Cơ sở dữ liệu production, retention service, offline queue hoặc đồng bộ nền.
- Chia sẻ hồ sơ, tư vấn y tế hoặc clinical validation.
