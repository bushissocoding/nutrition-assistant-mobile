# Spec: Persistent Meal Diary — V1

Module id: `meal-diary` (from [CAPABILITY-MAP.md](CAPABILITY-MAP.md))

Status: approved

## Mục tiêu

Thay nhật ký trong memory bằng luồng ghi bữa ăn bền vững qua API demo: tạo, xem theo ngày, sửa và xóa bản ghi. Mỗi bản ghi tham chiếu thực phẩm trong catalog, lưu khẩu phần/thời điểm/múi giờ/ghi chú; server tự tính dinh dưỡng từ catalog và trả đúng giá trị để UI hiển thị. Sau khi đóng/mở app, màn nhật ký tải lại dữ liệu từ server.

Cho đến khi issue #3 cung cấp xác thực và định danh tài khoản, API chỉ cho phép ở môi trường demo được bật rõ ràng ngoài production. `X-Demo-Namespace` chỉ phân vùng dữ liệu demo, do client cung cấp, không phải quyền sở hữu an toàn. Chỉ dùng dữ liệu tổng hợp, không nhập sức khỏe cá nhân thật.

## Phạm vi

- CRUD nhật ký cho một món catalog trên mỗi bản ghi.
- Xem nhật ký theo ngày/múi giờ; điều hướng ngày trước/sau.
- Chọn thực phẩm, nhập khẩu phần gram, loại bữa, thời điểm và ghi chú tùy chọn.
- Sửa/xóa bản ghi đã lưu; tổng dinh dưỡng hằng ngày đến từ backend.
- Loading, empty, error, retry, save/delete pending và thông báo thành công chỉ sau phản hồi lưu thành công.
- Test route/service, phân vùng demo, dữ liệu thiếu/sai, idempotency/retry và UI state chính.

## Ngoài phạm vi

- Barcode, camera/OCR, tra cứu thực phẩm ngoài catalog hiện tại hoặc món tự do không có `foodId`.
- Hồ sơ/tài khoản thật, lưu dữ liệu sức khỏe thật, phân quyền production, offline queue hay đồng bộ nền.
- Tư vấn, chẩn đoán hoặc mục tiêu dinh dưỡng lâm sàng.
- Tạo danh sách đi chợ từ thực đơn; thuộc module `grocery-list`.

## Hợp đồng API

Giữ prefix `/api/v1` và response lỗi tương thích client hiện tại. Tất cả route yêu cầu `X-Demo-Namespace` hợp lệ và demo mode bật ngoài production; middleware từ chối khi thiếu/sai namespace hoặc demo mode tắt. Namespace là demo partition không đáng tin cậy, không phải user identity.

### Schema bản ghi

Input tạo:

```json
{
  "foodId": "veg-spinach",
  "portion": { "amount": 120, "unit": "g" },
  "mealType": "LUNCH",
  "consumedAt": "2026-11-16T12:15:00+07:00",
  "timeZone": "Asia/Ho_Chi_Minh",
  "notes": "Luộc, không thêm muối"
}
```

- `foodId`: chuỗi id phải tồn tại trong catalog server.
- `portion.amount`: số hữu hạn lớn hơn 0 và không quá 5000; đơn vị V1 chỉ là `g`, phù hợp với cách tính theo 100 g hiện có.
- `mealType`: một trong `BREAKFAST`, `LUNCH`, `DINNER`, `SNACK`.
- `consumedAt`: ISO-8601 hợp lệ, bắt buộc có `Z` hoặc offset; server chuẩn hóa thời điểm lưu thành UTC.
- `timeZone`: tên IANA hợp lệ, ví dụ `Asia/Ho_Chi_Minh`; dùng để phân định ngày lịch, không suy luận bằng timezone của server.
- `notes`: tùy chọn, trim khoảng trắng, tối đa 500 ký tự; giá trị rỗng được chuẩn hóa thành `null`.
- Không nhận `nutrients`, tổng ngày hoặc tên món từ client. Server tính từ food catalog và khẩu phần để client không thể làm sai lệch số dinh dưỡng.

Bản ghi trả về có dạng:

```json
{
  "id": "generated-id",
  "foodId": "veg-spinach",
  "foodName": "Rau chân vịt",
  "portion": { "amount": 120, "unit": "g" },
  "mealType": "LUNCH",
  "consumedAt": "2026-11-16T05:15:00.000Z",
  "timeZone": "Asia/Ho_Chi_Minh",
  "notes": "Luộc, không thêm muối",
  "nutrients": {
    "energyKcal": 27,
    "proteinG": 3.4,
    "carbohydrateG": 4.3,
    "fatG": 0.4,
    "fiberG": 2.6,
    "sodiumMg": 79
  },
  "createdAt": "2026-11-16T05:16:00.000Z",
  "updatedAt": "2026-11-16T05:16:00.000Z"
}
```

Các số trên là ví dụ schema, không phải hằng số cho món cụ thể. Giá trị thật phải bằng backend `calculateFood` cho đúng `foodId` và số gram, cùng quy tắc làm tròn của API dinh dưỡng hiện có.

### Endpoints

| Method/path | Hành vi thành công | Lỗi chính |
|---|---|---|
| `POST /api/v1/meal-entries` | `201` và `{ item, disclaimer }`; nhận `Idempotency-Key` bắt buộc. | `400` input/header sai; `409` key đã dùng với payload khác; `410` lần tạo gốc đã bị xóa; `503` demo data tắt. |
| `GET /api/v1/meal-entries?date=YYYY-MM-DD&timeZone=IANA&limit=50&offset=0` | `200` `{ date, timeZone, items, totals, pagination, disclaimer }`; date và timezone bắt buộc. | `400` date/timezone/pagination sai; `503` demo data tắt. |
| `GET /api/v1/meal-entries/:id` | `200` `{ item, disclaimer }`. | `404` không tồn tại trong namespace hiện tại. |
| `PATCH /api/v1/meal-entries/:id` | `200` `{ item, disclaimer }`; chỉ cập nhật field được gửi. | `400` patch rỗng hoặc field sai; `404` không tồn tại trong namespace hiện tại. |
| `DELETE /api/v1/meal-entries/:id` | `204`, không body; xóa lặp lại vẫn `204`. | `503` demo data tắt. |
| `DELETE /api/v1/meal-entries` | `204`, xóa toàn bộ entry và idempotency ledger trong namespace hiện tại. Dùng khi người dùng xóa hồ sơ/thu hồi đồng ý. | `503` demo data tắt. |

`PATCH` hỗ trợ `foodId`, toàn bộ `portion`, `mealType`, `consumedAt`, `timeZone`, `notes`; field dinh dưỡng/ID/timestamp hệ thống và field lạ bị từ chối. Nếu food hoặc portion đổi, backend tính lại `nutrients`. Mọi list được sort theo `consumedAt` tăng dần rồi `id`; pagination dùng `limit` mặc định 50/tối đa 100 và `offset` không âm. `totals` tính trên toàn bộ bản ghi trong ngày trước khi cắt trang. Bổ sung `Idempotency-Key` vào danh sách request headers CORS cùng `X-Demo-Namespace` để request POST từ client qua preflight được phép.

Ngày được định nghĩa theo khoảng nửa mở `[00:00 date trong timeZone, 00:00 ngày kế trong timeZone)`, rồi chuyển sang UTC; không cộng cố định 24 giờ vì ngày có thể đổi offset do DST. `consumedAt` được định dạng về timezone gửi kèm cho UI. Ngày không hợp lệ và timezone không được runtime hỗ trợ trả lỗi `400`.

### Idempotency và lỗi

- Mỗi ý định tạo mới sinh một `Idempotency-Key` một lần (8–128 ký tự ASCII chữ/số, `_`, `-`, `.`, `:`); nút thử lại dùng lại đúng key và cùng body. Tạo ý định mới dùng key khác. Transport không tự retry mutation.
- Normalize input trước khi tạo SHA-256 fingerprint. Trong cùng một atomic `updateCollection`, lưu entry và một row ledger `{ kind, key, fingerprint, resourceId, createdAt }` trong collection `meal_entries`; list chỉ đọc row entry. Cùng key/cùng fingerprint trả lại bản ghi gốc (status `200`, không tạo bản sao); cùng key/khác fingerprint trả `409`.
- Ledger chỉ giữ key, fingerprint và resource id; khi xóa, xóa row entry nhưng giữ ledger. Nếu bản ghi đã xóa mà request create cũ được gửi lại, trả `410` và không tạo lại bản ghi. Không lưu lại nội dung ghi chú đã xóa trong ledger.
- Key tồn tại trong suốt thời gian demo store còn giữ ledger. Không có TTL/dọn dẹp tự động ở MVP; xóa demo store sẽ xóa cả dữ liệu và ledger.
- New route errors use `{ "error": "Thông điệp dễ hiểu.", "code": "VALIDATION_ERROR" }`; giữ `error` dạng chuỗi để tương thích API client và không đổi response các route hiện tại. Không trả stack trace.
- `404` dùng chung cho id không có hoặc không thuộc namespace hiện tại; không tiết lộ dữ liệu namespace khác.

## Luồng UI

- Khi mở tab Nhật ký, tải ngày hiện tại theo timezone thiết bị; người dùng có thể sang ngày trước/sau và tải lại ngày đã chọn.
- Tách trạng thái tải danh sách, tìm thực phẩm và lưu mutation để một thao tác không khóa toàn màn hình. Mỗi loading có deadline từ API client và kết thúc thành error có thể thử lại.
- Có trạng thái empty cho ngày chưa ghi; lỗi list có nút tải lại. Lỗi create/edit giữ nguyên form và nội dung để sửa/thử lại; chỉ hiện thành công/đưa bản ghi vào list sau phản hồi server.
- Khi tạo, giữ cùng idempotency key cho lần gửi lại của cùng ý định. Đổi nội dung sau lỗi tạo ý định mới và key mới. Không có tự retry hoặc offline queue.
- Sửa/xóa có phản hồi từ server trước khi cập nhật list. Xóa cần xác nhận. Khi đổi ngày trong lúc request cũ đang chạy, bỏ qua response của ngày cũ để tránh ghi đè UI ngày mới.
- Khi xóa hồ sơ hoặc thu hồi đồng ý, purge nhật ký ở server trước rồi mới xóa profile/consent trên thiết bị. Nếu API purge lỗi/mất mạng, giữ dữ liệu local và consent/profile, hiển thị lỗi dễ hiểu cùng nút thử lại; không báo đã xóa.
- Dùng `nutrients`/`totals` trả về, không tự tính trong app. Hiển thị banner rằng giá trị là ước tính từ catalog demo, không phải tư vấn y tế.

## Dữ liệu và bảo mật

- Repository JSON đã có namespace; entry và idempotency ledger được cô lập theo `X-Demo-Namespace`.
- Không dùng hồ sơ demo/hard-code như danh tính người dùng. Namespace do client giữ trong SecureStore chỉ ổn định phân vùng demo và có thể bị giả mạo.
- Demo API phải giữ disabled mặc định và luôn từ chối ở `NODE_ENV=production`. Không cho phép real health data cho đến khi issue #3, data lifecycle và bảo vệ production hoàn tất.
- Không log body, ghi chú hoặc dinh dưỡng bản ghi.

## Kiểm thử

- API tests: create/list/get/PATCH/DELETE item and DELETE collection; namespace isolation; demo disabled/production; boundary theo timezone (bao gồm ngày DST ngắn/dài); validation field thiếu/sai/field lạ; nutrient từ backend; duplicate create cùng key; khác payload cùng key; duplicate đồng thời; retry sau xóa; purge xóa cả ledger; không thành công giả khi store lỗi.
- UI component tests mô phỏng response API: loading, empty, error + retry, create/edit/delete chỉ cập nhật sau server success, cùng idempotency key khi retry và banner ước tính. Dùng Jest + `jest-expo` + React Native Testing Library với native modules được mock; đây là devDependencies phục vụ yêu cầu UI test.
- `npm run test:unit`, `npm run test:api`, và `npm run test:ui` đều đạt trước bàn giao; CI phải chạy thêm UI suite để các test component mới không chỉ được chạy thủ công.

## Tiêu chí hoàn thành

- Diary CRUD và xem theo ngày hoạt động qua API, tải lại app vẫn thấy bản ghi đã lưu.
- Dữ liệu và số dinh dưỡng hiển thị lấy từ response backend; giá trị bị tính lại khi portion/food được sửa.
- Date filtering dùng timezone IANA của người dùng; retry cùng một ý định không sinh bản ghi trùng.
- Dữ liệu demo namespace khác không thể đọc/sửa qua API namespace hiện tại; tài liệu không gọi đây là account ownership/auth.
- UI có loading/empty/error/retry và không báo thành công trước khi server xác nhận.
- Xóa hồ sơ/thu hồi đồng ý không để lại nhật ký trong server namespace; lỗi purge không xóa profile/consent local và không báo thành công.
- Test API/UI liên quan chạy; chỉ dùng synthetic demo data, không bật persistence này ở production.

## Tham khảo kiểm thử Expo

Expo hướng dẫn Jest với `jest-expo` để mock phần native và cài React Native Testing Library để kiểm thử component; React Native mô tả component test là kiểm tra interaction/render trong Node nhưng không thay cho xác minh iOS/Android runtime. [Expo unit testing](https://docs.expo.dev/develop/unit-testing/), [React Native testing overview](https://reactnative.dev/docs/testing-overview).
