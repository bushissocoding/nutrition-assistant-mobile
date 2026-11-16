# Implementation Plan: API Foundation — V1

Source spec: [SPEC-api-foundation.md](../SPEC-api-foundation.md)

## Tổng quan

Xây nền lưu trữ JSON cục bộ có namespace và ranh giới demo cho các API dữ liệu sắp tới. Module này chỉ cung cấp repository, kiểm tra namespace/cấu hình và tài liệu giới hạn demo; không thêm endpoint nhật ký hoặc grocery. Giữ nguyên các API catalog, tính dinh dưỡng và tạo thực đơn.

## Đồ thị phụ thuộc

```text
Kiểm tra demo mode + namespace ─┐
                                ├─> cấu hình server dùng chung ─> API diary/grocery ở module sau
JSON repository có namespace ───┘
```

Repository và middleware có thể phát triển độc lập. Tích hợp server và hướng dẫn cần cả hai. Các module diary/grocery phụ thuộc nền này và sẽ có plan riêng sau khi spec tương ứng được duyệt.

## Quyết định kiến trúc đề xuất

- Dùng `node:fs/promises`, không thêm package. Mặc định lưu ở `server/.local-data/demo-store.json`; cho phép đổi đường dẫn bằng `DEMO_DATA_FILE` để test dùng thư mục tạm và môi trường dev chọn vị trí khác.
- Repository nhận đường dẫn qua constructor để kiểm thử độc lập. Ghi tuần tự và thay file tạm bằng rename để giảm nguy cơ mất cập nhật hoặc hỏng JSON khi hai request ghi gần nhau.
- Chỉ bật dữ liệu demo khi `DEMO_DATA_ENABLED=true` và `NODE_ENV` khác `production`. Production luôn từ chối, kể cả khi cờ demo được đặt.
- Chuẩn hóa namespace qua header `X-Demo-Namespace`; middleware xác thực định dạng và gắn namespace đã kiểm tra vào request. Header này chỉ phân vùng demo, không xác thực danh tính.
- Cho phép `X-Demo-Namespace` trong CORS preflight cùng `Content-Type`, để client web hiện có thể gửi header khi cần.
- Không tạo endpoint probe hoặc endpoint demo độc lập. Kiểm thử middleware bằng một Express app cô lập; API CRUD sẽ được kiểm thử HTTP khi module nhật ký/grocery thêm route.
- Thêm đường dẫn runtime vào `.gitignore`; README hướng dẫn bật/tắt store demo, đường dẫn dữ liệu và giới hạn không dùng dữ liệu sức khỏe thật.

## Trình tự triển khai dự kiến

### Giai đoạn 1: Store demo bền vững

Tạo repository JSON có namespace, đường dẫn cấu hình được, ghi tuần tự/atomic và thông báo lỗi I/O rõ ràng. Thêm unit test cho đọc/ghi, namespace tách biệt, file thiếu/hỏng, đọc lại bằng repository mới và lỗi ghi.

**Điểm kiểm chứng:** test repository chạy qua `npm run test:unit`; không có dữ liệu test trong thư mục runtime mặc định.

### Giai đoạn 2: Ranh giới demo request

Thêm hàm/middleware thuần để kiểm tra cờ demo, cấm production, yêu cầu và validate `X-Demo-Namespace`. Kiểm thử các trường hợp bật/tắt, production, header thiếu/sai/đúng và phản hồi lỗi có cấu trúc.

**Điểm kiểm chứng:** kiểm thử middleware chạy trong bộ unit test; không đổi kết quả các route API hiện có.

### Giai đoạn 3: Tích hợp và tài liệu

Nối cấu hình repository và middleware vào composition của server để feature routes sau có thể dùng chung. Bổ sung header vào CORS, `.gitignore`, cập nhật README gốc và `server/README.md`; kiểm tra preflight và chạy hai bộ kiểm thử bắt buộc.

**Điểm kiểm chứng:** `npm run test:unit` và `npm run test:api` đều đạt; các API hiện có giữ hợp đồng; demo API không bật trong production.

## Rủi ro và giảm thiểu

| Rủi ro | Mức ảnh hưởng | Giảm thiểu |
|---|---|---|
| Hai request cùng ghi file làm mất cập nhật | Cao | Tuần tự hóa thao tác ghi trong repository và thay file qua rename; thêm test cho cập nhật đồng thời. |
| Namespace bị giả mạo và lộ dữ liệu demo | Cao | Không lưu dữ liệu thật; ghi rõ header không phải auth; production luôn tắt demo data routes. |
| Store JSON hỏng hoặc không ghi được | Trung bình | Không báo thành công; trả lỗi rõ ràng; kiểm thử file hỏng và lỗi filesystem. |
| File dữ liệu cục bộ bị commit | Trung bình | Ignore thư mục `.local-data`; kiểm tra trạng thái Git sau kiểm thử. |

## Câu hỏi còn mở

- Issue #3 sẽ cung cấp credential và định danh nào để thay demo namespace bằng quyền sở hữu tài khoản đã xác thực?
- Chính sách giới hạn kích thước và xóa store demo có cần thiết trước khi module diary/grocery được dùng rộng hơn? V1 không tự dọn file.

## Ngoài phạm vi plan này

- Hợp đồng CRUD và UI của nhật ký/grocery; API base URL và cấu hình thiết bị Expo.
- Auth, cơ sở dữ liệu production, backup, retention, chia sẻ nhiều instance và lưu dữ liệu sức khỏe thật.
- Barcode/catalog nâng cao và tư vấn dinh dưỡng lâm sàng.
