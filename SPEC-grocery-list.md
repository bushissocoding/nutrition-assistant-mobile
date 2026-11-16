# Spec: Persistent Grocery List — V1

Module id: `grocery-list` (from [CAPABILITY-MAP.md](CAPABILITY-MAP.md))

Status: implementation complete; Android device/emulator verification pending

## Mục tiêu

Thay danh sách đi chợ tạm trong memory bằng một danh sách hiện hành được lưu trong API demo. Người dùng tạo danh sách từ phần grocery mà backend trả về cùng thực đơn, mở lại danh sách đã lưu, chỉnh số lượng/đơn vị, đánh dấu đã mua và xóa từng mục. Trạng thái chỉ được báo lưu sau khi API xác nhận và còn sau khi đóng/mở ứng dụng.

Cho đến khi issue #3 cung cấp xác thực và định danh tài khoản, API chỉ cho phép khi demo mode được bật ngoài production. `X-Demo-Namespace` chỉ tách dữ liệu demo do caller chọn; không phải xác thực hay bảo vệ quyền sở hữu. Chỉ dùng dữ liệu tổng hợp.

## Phạm vi

- Một danh sách hiện hành cho mỗi demo namespace; list mới thay list hiện hành sau khi người dùng xác nhận trong UI.
- Khởi tạo danh sách từ `grocery` trong response thực đơn backend. Server kiểm tra catalog ID, số lượng và đơn vị nhưng không thể chứng minh snapshot client gửi thật sự xuất phát từ một thực đơn đã lưu.
- Đọc danh sách hiện hành sau khi mở màn hình để dữ liệu được phục hồi từ API.
- Sửa số lượng/đơn vị, đổi trạng thái đã mua/chưa mua và xóa từng mục.
- Loading, empty, error/retry, pending mutation và thông báo thành công chỉ sau khi API xác nhận.
- Idempotent create retry, kiểm tra namespace demo, validation API và kiểm thử UI cho các trạng thái chính.
- Xóa danh sách hiện hành trong quy trình purge demo trước khi xóa hồ sơ/thu hồi đồng ý trên thiết bị.

## Ngoài phạm vi

- Lịch sử nhiều danh sách, chia sẻ/mời thành viên, đồng bộ offline hoặc đồng bộ nền.
- Barcode, catalog thực phẩm nâng cao, giá thực tế, tồn kho, hóa đơn hoặc tích hợp cửa hàng.
- Tài khoản thật, phân quyền production, dữ liệu cá nhân/sức khỏe thật hoặc lưu trữ production.
- Chỉnh sửa công thức/thực đơn hoặc tính lại dinh dưỡng từ danh sách mua sắm.

## Hợp đồng API

Giữ prefix `/api/v1`. Mọi endpoint yêu cầu `X-Demo-Namespace` hợp lệ và demo mode bật; production luôn từ chối. Dữ liệu được lưu trong collection riêng `shopping_lists`, theo cùng JSON demo store namespaced; không trộn với nhật ký bữa ăn.

### Schema

Request tạo:

```json
{
  "items": [
    { "foodId": "rice-steamed", "amount": 300, "unit": "g" },
    { "foodId": "egg-boiled", "amount": 2, "unit": "piece" }
  ]
}
```

- Danh sách phải có 1–100 mục.
- `foodId` phải tồn tại trong catalog server. Mỗi `foodId` chỉ xuất hiện một lần; API từ chối mục trùng để tránh cộng nhầm lượng.
- `amount` là số hữu hạn lớn hơn 0 và không quá 1,000,000.
- `unit` thuộc enum V1: `g`, `kg`, `ml`, `l`, `piece`, `bunch`, `pack`. Danh sách được tạo từ thực đơn dùng `g` và `amount` bằng lượng gram backend trả về.
- `purchased` là boolean do server khởi tạo `false`; client không được đặt giá trị này khi tạo list.
- Không nhận tên thực phẩm, dinh dưỡng, trạng thái timestamp hoặc ID mục từ client; tên được tra từ catalog, ID mục và timestamp do server tạo.

Item response:

```json
{
  "id": "generated-item-id",
  "foodId": "rice-steamed",
  "name": "Cơm trắng",
  "amount": 300,
  "unit": "g",
  "purchased": false,
  "createdAt": "2026-11-16T05:16:00.000Z",
  "updatedAt": "2026-11-16T05:16:00.000Z"
}
```

List response:

```json
{
  "list": {
    "id": "generated-list-id",
    "source": "meal-plan",
    "items": [],
    "createdAt": "2026-11-16T05:16:00.000Z",
    "updatedAt": "2026-11-16T05:16:00.000Z"
  },
  "disclaimer": "Danh sách là ước tính từ thực đơn mẫu; không phải tư vấn y tế."
}
```

### Endpoints

| Method/path | Hành vi thành công | Lỗi chính |
|---|---|---|
| `POST /api/v1/shopping-lists` | Tạo/thay danh sách hiện hành, trả `201` `{ list, disclaimer }`; yêu cầu `Idempotency-Key`. | `400` schema/header sai; `409` key đã dùng với body khác; `410` lần tạo gốc đã bị thay hoặc xóa; `503` demo data tắt. |
| `GET /api/v1/shopping-lists/current` | `200` `{ list: object|null, disclaimer }`; `null` nếu danh sách chưa có. | `503` demo data tắt. |
| `PATCH /api/v1/shopping-lists/current/items/:itemId` | `200` `{ item, disclaimer }`; chỉ nhận một hoặc cả `amount`, `unit`, `purchased`. | `400` body rỗng/field sai; `404` item không có trong namespace hiện tại; `503` demo data tắt. |
| `DELETE /api/v1/shopping-lists/current/items/:itemId` | `204`; xóa mục trong danh sách hiện hành. | `404` list/mục không có trong namespace hiện tại; `503` demo data tắt. |
| `DELETE /api/v1/shopping-lists/current` | `204`; xóa list hiện hành nhưng giữ tombstone idempotency tối thiểu để retry key cũ không tạo list lại. | `503` demo data tắt. |
| `DELETE /api/v1/shopping-lists` | `204`; purge toàn bộ list và idempotency ledger trong demo namespace hiện tại. Dùng trong luồng xóa hồ sơ/thu hồi đồng ý. | `503` demo data tắt. |

Nếu list hiện tại không còn item sau khi xóa mục cuối, giữ list rỗng để UI phân biệt danh sách đã tạo nhưng rỗng với trạng thái chưa có list; `GET` trả object có `items: []`. API không tự xóa list khi không còn mục.

### Idempotency và lỗi

- Tạo list cần key ASCII dài 8–128 ký tự chỉ gồm chữ/số, `_`, `-`, `.`, `:`. Retry cùng ý định phải dùng lại chính key và cùng normalized body; lần tạo mới dùng key mới. Client không tự retry mutation.
- Fingerprint SHA-256 được tính từ payload đã chuẩn hóa. Cùng key/cùng fingerprint trả lại cùng list nếu nó vẫn là list hiện hành (status `200`); không sinh ID hay mục mới. Cùng key/khác fingerprint trả `409`.
- Một key cũ trỏ tới list đã bị thay hoặc xóa trả `410`, không làm sống lại list cũ. Ledger chỉ chứa key, fingerprint, resource ID và timestamp; không giữ nội dung mục. Xóa list hiện hành giữ ledger dạng tombstone đến khi purge toàn namespace.
- Mỗi lần tạo với key mới thay toàn bộ list hiện hành bằng list mới; UI phải xác nhận trước khi gọi API nếu đang có list để tránh mất checkbox và chỉnh sửa hiện tại.
- Lỗi mới có dạng `{ "error": "Thông điệp dễ hiểu.", "code": "VALIDATION_ERROR" }`; không trả stack trace hoặc log body.
- Item không tồn tại hoặc không thuộc namespace hiện tại cùng trả `404`, không tiết lộ namespace khác.

## Luồng UI

- Nút từ thực đơn tạo danh sách từ `result.grocery`; trước khi thay list đã lưu hiện tại, hỏi xác nhận rõ rằng trạng thái đã mua và chỉnh sửa sẽ bị thay.
- Màn danh sách tải `GET current` khi mở. Có loading hữu hạn; lỗi có thông báo và nút thử lại; chưa có list hiển thị empty state. Không thay empty/error bằng dữ liệu mẫu.
- Với list đã lưu, cho phép tick đã mua/chưa mua, nhập số lượng và chọn/nhập đơn vị được hỗ trợ, xóa mục sau xác nhận. UI chỉ phản ánh mutation sau response thành công; khi lỗi giữ dữ liệu hiện tại và cho retry.
- Tạo list dùng một key cho đúng intent; retry request sau lỗi transport dùng lại key và body. Mở lại màn hình gọi GET để xác nhận dữ liệu từ server.
- Xóa hồ sơ/thu hồi đồng ý phải purge cả nhật ký lẫn danh sách đi chợ trước khi xóa profile/consent local. Nếu một API purge lỗi, giữ nguyên local state và cho retry; purge repeat-safe.
- Hiển thị rõ đây là danh sách từ thực đơn demo; dữ liệu giá/dinh dưỡng/thực đơn vẫn là ước tính và không phải tư vấn y tế.

## Dữ liệu và giới hạn

- Repository tách biệt theo demo namespace caller-supplied. Không gọi đây là quyền sở hữu tài khoản; người biết namespace có thể đọc/sửa dữ liệu namespace đó.
- Demo routes disabled mặc định và luôn bị từ chối ở production. Chỉ dữ liệu tổng hợp cho đến khi issue #3 cung cấp identity/ownership và lớp lưu trữ production.
- JSON file local tồn tại qua lần khởi động API nếu giữ nguyên file, nhưng không có backup, retention, đồng bộ nhiều máy chủ hoặc đảm bảo độ bền production.
- Idempotency tombstones không có TTL và có thể tăng theo số lần thay list; purge namespace hoặc xóa demo store sẽ xóa ledger.
- Danh sách ghi nhận snapshot từ planner; chỉnh số lượng mua không cập nhật món/khẩu phần/dinh dưỡng của thực đơn.

## Kiểm thử

- API/service/repository: tạo và đọc lại list, thay list, patch amount/unit/purchased, xóa item, empty list, xóa list, persistence khi mở store mới, tách namespace, disabled/production scope, missing/invalid/unknown fields, food không có trong catalog, duplicate foodId, amount/unit sai, idempotent replay/conflict, retry sau replace/delete, store failure không báo thành công.
- UI: loading, no-list empty, loaded list, load error/retry, mutation lỗi giữ state cũ, trạng thái purchased, edit quantity/unit, delete item, tạo list và xác nhận thay list.
- Required checks: `npm run test:unit`, `npm run test:api`, `npm run test:ui`, Expo Android export và `git diff --check`.

## Tiêu chí hoàn thành

- Danh sách tạo từ response thực đơn được lưu qua API và xuất hiện khi mở lại màn/app.
- Số lượng, đơn vị, trạng thái đã mua và xóa mục được lưu bền vững, chỉ xác nhận UI khi server đã lưu.
- Data được phân vùng theo demo namespace; tài liệu nêu rõ chưa có auth/ownership thật và không cho dùng dữ liệu cá nhân thật.
- API/UI có loading, empty, lỗi, retry, trạng thái pending hữu hạn; không có fallback danh sách mẫu.
- Retry tạo không sinh danh sách/mục trùng; purge hồ sơ bao gồm list demo.
- Kiểm thử liên quan và required checks đạt; hướng dẫn không tuyên bố đã kiểm chứng thiết bị nếu môi trường hiện tại không có thiết bị/emulator.

## Quy ước triển khai và kiểm chứng

### Commands

- API local: `npm run api` (bật `DEMO_DATA_ENABLED=true` trong môi trường demo theo [server/README.md](server/README.md)).
- Unit/repository: `npm run test:unit`.
- API smoke/HTTP: `npm run test:api`.
- UI components: `npm run test:ui`.
- Android bundle: `npx expo export --platform android`.
- Diff whitespace: `git diff --check`.

### Project structure and code style

- API service: `server/src/services/shopping-lists.js`; repository: `server/src/repositories/shopping-list-repository.js`; route: `server/src/routes/shopping-lists.js`; focused Node tests: `server/tests/` and API smoke coverage: `server/server.test.js`.
- Mobile shared methods: `app/src/services/api-client.cjs`; screen/UI tests: `app/src/features/grocery/` with Jest, `jest-expo`, and React Native Testing Library.
- Match existing conventions: CommonJS modules and `node:test` for server pure logic; Express route handlers validate input and return `{ error, code }`; React Native screens use functional components/hooks and call `api` methods, never direct `fetch()`.

### Testing strategy

- Service/repository tests cover normalization, catalog references, limits, atomic idempotency, persistence, namespace separation, and store failure.
- HTTP smoke tests exercise route status/body behavior, demo-disabled/production scope, error mapping, and CRUD/retry/purge contracts.
- Component tests cover loading, empty, error/retry, create/replace confirmation, edits, purchased state, and delete behavior with mocked API responses.
- Required checks are the commands listed above; Expo export is not a substitute for device/emulator connectivity verification.

### Boundaries

- Always: validate API input, use synthetic demo data only, retain non-clinical wording, use the shared mobile client, and keep purge-before-local-delete behavior.
- Ask first: runtime dependency additions, changes to `/api/v1` semantics beyond this spec, production persistence/auth, or enabling real-user data.
- Never: treat the caller namespace as authentication, log list bodies or health data, add barcode behavior, or report UI success before server confirmation.

## Open Questions

None block this approved V1. Real account ownership and production persistence remain dependent on issue #3.
