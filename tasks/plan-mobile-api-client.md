# Implementation Plan: Mobile API Client — V1

Source spec: [SPEC-mobile-api-client.md](../SPEC-mobile-api-client.md)

## Tổng quan

Thay transport rải rác/fallback `localhost` hiện tại bằng một API client dùng chung cho Expo. Client validate `EXPO_PUBLIC_API_URL`, giữ demo namespace ổn định bằng SecureStore, áp timeout hữu hạn, chuẩn hóa lỗi HTTP/mạng và không tự retry mutation. Module này chưa thêm endpoint diary/grocery hay trạng thái UI của hai feature.

## Đồ thị phụ thuộc

```text
Validate cấu hình URL ──┐
                        ├─> transport + error mapping ─> nối service API hiện có ─> docs/kết nối thiết bị
Demo namespace storage ─┘
```

Phần URL validator, transport thuần và namespace storage có thể kiểm thử độc lập bằng Node. Tích hợp Expo client cần cả hai. Tài liệu và kiểm tra thiết bị cần client đã tích hợp.

## Quyết định triển khai

- Giữ `api.js` là module API singleton mà các feature hiện tại đang dùng; đây là điểm duy nhất trong app gọi `fetch`.
- Dùng `EXPO_PUBLIC_API_URL` được tham chiếu tĩnh. Cấu hình thiếu/sai phải tạo lỗi có loại rõ ràng trước khi gửi request; loại bỏ fallback âm thầm về `localhost`.
- Validate URL thuần trong module CommonJS để có thể kiểm thử bằng `node:test`; chấp nhận HTTP/HTTPS, từ chối credential/query/fragment và chuẩn hóa dấu `/` cuối.
- Đặt timeout hữu hạn cho mọi request, hỗ trợ caller abort, xử lý `204` không parse JSON, và chuyển lỗi mạng, timeout, parse, HTTP thành các lỗi client có loại, status khi có, và thông điệp tiếng Việt dễ hiểu.
- Không retry tự động. Mutation timeout có thể đã được server xử lý; chỉ feature ở module sau mới retry thủ công với idempotency key theo contract đã duyệt.
- Tạo demo namespace không mang ý nghĩa bảo mật, lưu lâu dài trong SecureStore và gửi qua `X-Demo-Namespace` cho request demo. Nếu storage hỏng thì dừng request, không tạo namespace khác theo từng lần gọi.
- SecureStore adapter nhận storage implementation có thể inject để test vòng đời tạo/lưu/tải lại mà không cần native runtime. Không lưu token hoặc payload sức khỏe vào namespace.
- Giữ không đổi payload/đường dẫn của các hàm `generateMealPlan`, `calculateNutrition`, `getFoods`; không thay contract `/api/v1` trong module này.
- Thêm test client/storage vào `npm run test:unit`, không thêm dependency.

## Trình tự triển khai dự kiến

### Giai đoạn 1: URL config và test transport thuần

Tạo validator base URL cùng test cho thiếu/sai scheme, malformed URL, credentials/query/fragment và URL hợp lệ. Thiết kế transport có `fetch`/clock/AbortController inject được để test không cần server hoặc native runtime.

**Điểm kiểm chứng:** test config và transport chứng minh request không chạy nếu URL invalid, request có header/body đúng, response JSON/204 hoạt động, lỗi mạng/API/JSON và timeout trả lỗi hữu hạn; không có mutation retry.

### Giai đoạn 2: Demo namespace bền vững

Tạo module namespace storage dùng adapter async. Tạo namespace đúng một lần, lưu lại, tải lại từ lần khởi tạo mới và từ chối request nếu đọc/ghi SecureStore thất bại.

**Điểm kiểm chứng:** test adapter giả chứng minh namespace được tái sử dụng; header chỉ chứa namespace demo ổn định; lỗi storage được giữ rõ ràng.

### Giai đoạn 3: Nối API client vào Expo app

Thay transport trong `app/src/services/api.js`, nối SecureStore native adapter, cập nhật các API hiện có và tìm mọi `fetch()` trong `app/src` để đảm bảo screen không gọi trực tiếp. Thêm test files vào script unit hiện tại.

**Điểm kiểm chứng:** `npm run test:unit` đạt; kiểm tra import/bundle Expo để bắt khác biệt Node CommonJS và Metro; `npm run test:api` xác nhận server contract hiện tại vẫn tương thích.

### Giai đoạn 4: Cấu hình và hướng dẫn theo môi trường

Thêm `.env.example`, xác nhận `.env` được Git bỏ qua, cập nhật README gốc và `server/README.md` với cách bật demo API, host URL cho Expo Go, Android Emulator, iOS Simulator, cùng LAN/firewall và xác minh `/health` từ chính thiết bị.

**Điểm kiểm chứng:** docs không coi Expo tunnel là địa chỉ backend, không hướng dẫn dùng `localhost` trên điện thoại thật và không đưa secret vào `EXPO_PUBLIC_*`.

### Giai đoạn 5: Kiểm tra tích hợp và thiết bị

Chạy `npm run test:unit`, `npm run test:api`, kiểm tra bundle Expo, và chạy backend demo để mở `/health` từ ít nhất một thiết bị/emulator. Khởi chạy app với cùng URL để xác nhận cấu hình đến được API.

**Điểm kiểm chứng:** request từ thiết bị nhận JSON health; ghi môi trường và URL loại host đã dùng (không ghi IP riêng nếu không cần). Nếu thiết bị không khả dụng, báo rõ phần chưa xác minh thay vì đánh dấu đạt.

## Rủi ro và giảm thiểu

| Rủi ro | Mức ảnh hưởng | Giảm thiểu |
|---|---|---|
| URL sai hoặc `localhost` không tới máy chủ trên thiết bị | Cao | Không fallback; bảng URL theo nền tảng và xác minh `/health` từ thiết bị. |
| Request treo khi mất mạng | Cao | Timeout mặc định hữu hạn, caller abort và test deadline bằng clock/fetch giả. |
| Timeout mutation nhưng server đã lưu | Cao | Không retry tự động; API feature sau phải dùng idempotency key ổn định khi retry. |
| SecureStore không khả dụng/lỗi | Trung bình | Báo lỗi storage rõ ràng và không gửi request với namespace thay đổi. |
| Public env bị dùng nhầm làm secret | Cao | Tài liệu nêu env được đóng gói vào client; cấm chứa credential. |
| Không có emulator/thiết bị trong môi trường hiện tại | Trung bình | Tìm lại thiết bị ở giai đoạn kiểm chứng; không thay bằng test host và không tuyên bố xác minh thiết bị nếu chưa thực hiện. |

## Ngoài phạm vi plan này

- CRUD diary/grocery, UI loading/rỗng/lỗi/thử lại, ngày theo múi giờ và idempotency contract cụ thể.
- Xác thực, quyền sở hữu tài khoản, đồng bộ dữ liệu sức khỏe thật và lưu trữ production.
- Barcode/catalog nâng cao, offline queue, đồng bộ nền, Expo Web storage.
