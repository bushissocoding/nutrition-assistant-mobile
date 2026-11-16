# Spec: API Foundation — V1

Module id: `api-foundation` (from [CAPABILITY-MAP.md](CAPABILITY-MAP.md))

## Mục tiêu

Tạo lớp lưu trữ bền vững tối thiểu và ranh giới demo an toàn để các API nhật ký bữa ăn và danh sách đi chợ có thể giữ dữ liệu sau khi backend khởi động lại. Module này không triển khai endpoint CRUD riêng của nhật ký hoặc danh sách; các hợp đồng và luồng đó thuộc spec của từng module.

Auth và định danh tài khoản trong issue #3 chưa có. Vì vậy, dữ liệu chỉ được phân vùng trong chế độ demo, không được xem là dữ liệu theo tài khoản và không được dùng với thông tin sức khỏe thật. API ghi dữ liệu demo phải tắt trong production.

## Giả định

1. Có thể dùng lưu trữ JSON cục bộ bằng thư viện chuẩn Node.js; chưa cần thêm package hay hệ quản trị cơ sở dữ liệu cho prototype.
2. Mỗi request demo có một namespace do client cung cấp để phân vùng dữ liệu. Namespace này không chứng minh danh tính và có thể bị giả mạo; không đảm bảo bảo mật giữa các tài khoản.
3. Chế độ demo chỉ bật khi được cấu hình tường minh trong môi trường không phải production; production luôn từ chối các API demo bất kể cờ cấu hình.
4. Dữ liệu lưu cục bộ có thể bị xóa khi reset môi trường phát triển. Không có backup, đồng bộ nhiều máy chủ, retention service hoặc bảo đảm vận hành production.

## Công nghệ

- Node.js 22, Express 4, JavaScript CommonJS như API hiện tại.
- `node:fs/promises` cho JSON store; không thêm dependency.
- Kho dữ liệu được truy cập qua repository; route không tự đọc/ghi file.
- Hợp đồng REST hiện tại tiếp tục dùng prefix `/api/v1`.

## Lệnh

- Chạy API demo: PowerShell `$env:DEMO_DATA_ENABLED='true'; npm run api` (chỉ môi trường phát triển; đặt lại biến môi trường sau phiên làm việc).
- Kiểm thử logic: `npm run test:unit`.
- Kiểm thử HTTP API: `npm run test:api`.
- Cả hai lệnh kiểm thử trên là kiểm tra bắt buộc trước khi bàn giao theo `CONSTRAINTS.md`.

## Cấu trúc dự kiến

- `server/src/repositories/demo-store.js` — đọc/ghi store JSON bền vững và cô lập chi tiết filesystem.
- `server/src/middleware/demo-scope.js` — kiểm tra chế độ demo và lấy namespace đã kiểm tra từ request.
- `server/server.js` — cấu hình middleware và điều kiện bật/tắt demo.
- `server/tests/` và `server/server.test.js` — kiểm thử repository, phạm vi demo và hành vi qua HTTP.
- `.gitignore` — loại trừ file dữ liệu runtime cục bộ.
- `server/README.md`, `README.md` — hướng dẫn bật demo và giới hạn lưu trữ.

## Quy ước mã

Giữ filesystem trong repository, validate request trước khi gọi service/repository, dùng lỗi HTTP rõ ràng và không nuốt lỗi ghi dữ liệu. Ví dụ minh họa ranh giới route:

```js
const scope = readDemoScope(req);
if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

const items = await repository.list(scope.namespace);
return res.json({ items });
```

Các route cụ thể của nhật ký và grocery sẽ được định nghĩa trong spec module tương ứng.

## Chiến lược kiểm thử

- Dùng Node.js test runner hiện có (`node:test`), không thêm framework.
- Kiểm thử repository đọc/ghi bền vững, dữ liệu hỏng/thiếu, cập nhật ghi an toàn và khả năng đọc lại sau khi tạo lại repository hoặc khởi động lại server.
- Kiểm thử thiếu/sai demo namespace, demo bị tắt và production luôn chặn API dữ liệu demo.
- Kiểm thử hai namespace khác nhau không thấy dữ liệu của nhau. Đây là kiểm thử phân vùng demo, không phải chứng minh bảo mật tài khoản.
- Chạy `npm run test:unit` và `npm run test:api` trước bàn giao.

## Ranh giới

- **Luôn làm:** dùng dữ liệu tổng hợp; lưu qua repository; ghi lỗi filesystem rõ ràng; giữ API tương thích `/api/v1`; mặc định đóng tính năng demo cho đến khi bật tường minh.
- **Cần duyệt trước:** thêm dependency hoặc hệ quản trị cơ sở dữ liệu; thay đổi hợp đồng API ngoài phạm vi demo; thay đổi CI hoặc cấu hình triển khai.
- **Không làm:** lưu hồ sơ sức khỏe thật; tuyên bố demo namespace là xác thực/phân quyền tài khoản; bật API demo trong production; đưa file runtime hoặc bí mật vào Git.

## Tiêu chí hoàn thành

- Store giữ được bản ghi sau khi process API dừng và chạy lại trên cùng môi trường cục bộ.
- Dữ liệu được truy cập theo namespace hợp lệ; namespace thiếu/sai bị từ chối, và namespace này được ghi rõ là không đáng tin cậy như thông tin xác thực.
- Cờ demo không bật thì API dữ liệu demo không hoạt động; khi `NODE_ENV=production`, cờ demo không thể bật các endpoint đó.
- Lỗi đọc/ghi được trả về theo lỗi HTTP có thông báo phù hợp; server không báo thành công nếu dữ liệu chưa được lưu.
- API và tài liệu ghi rõ không có auth, không có bảo đảm lưu trữ production, và cấm dữ liệu sức khỏe thật.
- `npm run test:unit` và `npm run test:api` chạy thành công sau khi triển khai.

## Ngoài phạm vi (để sau)

- Đăng nhập, quản lý phiên, định danh và phân quyền tài khoản (phụ thuộc issue #3).
- Cơ sở dữ liệu production, đồng bộ nhiều instance, backup, retention, xóa theo yêu cầu và hardening triển khai.
- Endpoint CRUD, UI, schema nghiệp vụ và quy tắc ngày của nhật ký hoặc danh sách đi chợ; các phần này thuộc spec riêng.
- Barcode, tra cứu catalog nâng cao và xử lý dữ liệu lâm sàng.

## Câu hỏi còn mở

- Issue #3 sẽ cung cấp danh tính/credential nào và ranh giới quyền sở hữu ra sao? Trước khi bật lưu dữ liệu cá nhân, cần thay demo namespace bằng định danh đã xác thực và thêm kiểm thử phân quyền thực sự.
- Có cần giới hạn kích thước hoặc dọn file demo trong giai đoạn prototype không? V1 chưa tự xóa dữ liệu vì chưa có chính sách retention được phê duyệt.
