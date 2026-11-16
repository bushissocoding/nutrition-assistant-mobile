# Spec: Mobile API Client — V1

Module id: `mobile-api-client` (from [CAPABILITY-MAP.md](CAPABILITY-MAP.md))

Status: proposed

## Mục tiêu

Chuẩn hóa mọi HTTP request từ Expo app qua một API client dùng chung. Client lấy URL từ `EXPO_PUBLIC_API_URL`, báo lỗi cấu hình rõ ràng khi thiếu/sai, giới hạn thời gian chờ, chuyển lỗi mạng/API thành lỗi dễ xử lý, và đính kèm demo namespace ổn định khi gọi các route lưu dữ liệu. Màn hình không tự gọi `fetch()`.

Client phục vụ Android, iOS và Expo Go. UI loading/rỗng/lỗi/thử lại thuộc spec của `meal-diary` và `grocery-list`; client cung cấp kết quả/lỗi để các màn hình thể hiện những trạng thái đó.

## Giả định

1. Expo CLI chạy từ thư mục gốc repo; `.env`/`.env.example` ở đó là nguồn cấu hình `EXPO_PUBLIC_API_URL`.
2. Không có auth từ issue #3. Client tạo một demo namespace cục bộ ổn định qua SecureStore; namespace này chỉ phân vùng dữ liệu demo và không phải credential hay danh tính tài khoản.
3. SecureStore đã có trong dependencies hiện tại. Không cần thêm package cho URL, timeout, storage hoặc test.
4. V1 hỗ trợ điện thoại thật, Android Emulator và iOS Simulator. Expo Web không phải mục tiêu lưu trữ namespace của module này.
5. Không tự gửi lại mutation khi timeout hoặc mất mạng. Feature có thể gọi lại thủ công; API feature sẽ định nghĩa idempotency key và tái sử dụng cùng key khi retry.

## Công nghệ

- Expo SDK 52, React Native 0.76.5, JavaScript hiện có.
- `process.env.EXPO_PUBLIC_API_URL` được truy cập trực tiếp theo cú pháp tĩnh để Expo CLI inline giá trị vào bundle.
- `fetch`/`AbortController` để gửi HTTP và dừng request quá hạn.
- `expo-secure-store` đã là dependency để giữ demo namespace qua lần mở app; không bật `requireAuthentication`.
- `node:test` hiện có để kiểm thử các phần client thuần qua `fetch` và storage adapter có thể inject.

Expo public environment variables được đọc từ `.env` và xuất hiện trong bundle client, vì vậy không được chứa bí mật: [Expo environment variables](https://docs.expo.dev/guides/environment-variables/). SecureStore cung cấp lưu trữ key-value bền qua lần mở app; API bất đồng bộ dùng `getItemAsync`/`setItemAsync`: [Expo SecureStore](https://docs.expo.dev/versions/v52.0.0/sdk/securestore/).

## Lệnh

- Cài dependencies: `npm ci`.
- Chạy API demo khi phát triển: PowerShell `$env:DEMO_DATA_ENABLED='true'; npm run api`.
- Chạy Expo: `npm start`.
- Kiểm thử logic/client: `npm run test:unit`.
- Kiểm thử API: `npm run test:api`.
- Xác nhận backend có thể truy cập từ thiết bị: mở `http://<backend-host>:4000/health` trên browser của chính thiết bị/emulator và kiểm tra JSON có `status: "ok"`.

## Cấu trúc dự kiến

- `app/src/services/api.js` — export API client singleton và các hàm gọi API; đây là chỗ duy nhất trong app dùng `fetch`.
- `app/src/services/api-config.cjs` — validate URL, chuẩn hóa base URL và tạo lỗi cấu hình có thể kiểm thử bằng Node.
- `app/src/services/demo-namespace-storage.cjs` — lấy/tạo namespace ổn định qua storage adapter; không đưa hồ sơ mẫu vào namespace.
- `app/src/services/api-client.test.cjs` — test URL, request, timeout, lỗi HTTP/mạng và header.
- `app/src/services/demo-namespace-storage.test.cjs` — test tạo/lưu/đọc lại namespace qua adapter giả lập.
- `.env.example`, `README.md`, `server/README.md` — cấu hình Expo và hướng dẫn kết nối API theo thiết bị.
- `package.json` — mở rộng `test:unit` để chạy test service mobile mới bằng Node test runner hiện có.

## Quy ước mã

Feature gọi API qua service và chỉ nhận dữ liệu khi response thành công. Ví dụ:

```js
const result = await api.getFoods(query);
setFoods(result.items);
```

Client dùng chung chịu trách nhiệm URL, namespace, timeout, JSON/error mapping và HTTP status. Feature quyết định loading, retry thủ công, empty state và khi nào cập nhật UI sau khi server xác nhận.

## Chiến lược kiểm thử

- Test URL thiếu, sai scheme, malformed URL, credentials/query/hash không hợp lệ và base URL hợp lệ.
- Với `fetch` inject được, test header/body, response JSON, `204`, lỗi 4xx/5xx, JSON lỗi sai định dạng, network reject, timeout và caller abort.
- Test lỗi config/mạng không trả dữ liệu giả và không tự gọi lại mutation.
- Test namespace được tạo một lần, lưu và dùng lại sau lần khởi tạo client mới; lỗi SecureStore phải thành lỗi rõ ràng thay vì tạo namespace mới từng request.
- `npm run test:unit` và `npm run test:api` là kiểm tra bắt buộc trước bàn giao.
- Kiểm thử thực tế ít nhất một Android emulator hoặc điện thoại thật: chạy backend, gọi `/health` từ thiết bị, rồi mở app bằng chính URL đó. Hiện môi trường Windows này không có `adb` hoặc Android Emulator trong PATH/thư mục SDK mặc định; cần xác minh lại khi đến bước kiểm thử thiết bị.

## Cấu hình và kết nối theo môi trường

Tạo `.env` ở thư mục gốc từ `.env.example`. `EXPO_PUBLIC_API_URL` là URL public, không phải secret. Không giữ fallback âm thầm về `localhost`: khi thiếu hoặc sai cấu hình, API client trả lỗi cấu hình trước khi gửi request. Sau khi đổi `.env`, khởi động lại Expo CLI và reload app để chắc chắn bundle dùng URL mới.

| Môi trường | Giá trị mẫu cho `EXPO_PUBLIC_API_URL` | Điều kiện |
|---|---|---|
| Expo Go trên điện thoại thật | `http://192.168.1.20:4000` | Thay bằng IPv4 LAN của máy chạy backend; điện thoại và máy tính cùng mạng LAN, firewall cho phép TCP 4000. |
| Android Emulator (Android Studio) | `http://10.0.2.2:4000` | `10.0.2.2` là alias của loopback máy host trong Android Emulator; không dùng giá trị này trên điện thoại thật. [Android Emulator networking](https://developer.android.com/studio/run/emulator-networking-address). |
| iOS Simulator trên Mac cùng chạy backend | `http://localhost:4000` | `localhost` là máy Mac chạy simulator/backend. iOS Simulator chỉ chạy trên macOS; từ repo trên Windows cần iPhone thật hoặc simulator từ xa. [Expo iOS Simulator](https://docs.expo.dev/workflow/ios-simulator/). |
| iOS Simulator trên Mac, backend chạy trên máy khác | `http://<backend-host-LAN-IP>:4000` | Backend host phải truy cập được qua mạng; cùng LAN/VPN và firewall cho phép port 4000. |

Backend hiện bind `0.0.0.0:4000`. Để xác nhận kết nối, mở `http://<đúng-host>:4000/health` trên thiết bị/emulator; response phải có `{"status":"ok"}`. Nếu không truy cập được, kiểm tra host/IP, cùng mạng, firewall và server đang chạy. Expo CLI có thể bị LAN/firewall hạn chế và hỗ trợ tunnel cho Metro; tunnel của Metro không thay thế địa chỉ có thể truy cập cho API backend: [Expo CLI networking](https://docs.expo.dev/more/expo-cli/).

## Ranh giới

- **Luôn làm:** dùng một client chung; xác thực URL trước request; timeout hữu hạn; chỉ cập nhật dữ liệu sau response thành công; không log payload sức khỏe; giữ demo namespace ổn định và ghi rõ nó không phải auth.
- **Cần duyệt trước:** thêm dependency; thay đổi contract `/api/v1`; bật lưu dữ liệu thật hoặc thay demo namespace bằng auth trước khi issue #3 xác định identity.
- **Không làm:** hard-code URL thiết bị vào source; gửi secret qua `EXPO_PUBLIC_*`; tự báo thành công khi server lỗi; tự retry write không có idempotency key; gọi `fetch()` trực tiếp trong screen.

## Tiêu chí hoàn thành

- App không tự rơi về `localhost` khi thiếu cấu hình; thiếu/sai URL hiển thị lỗi dễ hiểu khi gọi API.
- Mọi request của màn hình đi qua client dùng chung; timeout và lỗi mạng/API kết thúc hữu hạn, có mã/loại lỗi và thông điệp phù hợp.
- 4xx/5xx hoặc network failure không được trả như thành công; response `204` được xử lý mà không cố parse JSON.
- Demo namespace được giữ qua lần mở app, gửi trong `X-Demo-Namespace` cho route demo và không được mô tả là xác thực.
- `.env.example` và docs hướng dẫn đủ cho Expo Go điện thoại thật, Android Emulator, iOS Simulator, LAN/firewall và cách kiểm tra `/health`.
- `npm run test:unit`, `npm run test:api` đạt; ít nhất một thiết bị/emulator truy cập thành công `/health`.

## Ngoài phạm vi (để sau)

- Hợp đồng CRUD, schema theo ngày/múi giờ, idempotency cụ thể và UI loading/rỗng/lỗi/thử lại của nhật ký/grocery; thuộc spec riêng của hai feature.
- Đăng nhập, tài khoản, phân quyền thật (issue #3), lưu trữ production và dữ liệu sức khỏe thật.
- Barcode, catalog thực phẩm nâng cao, UI web, offline queue, đồng bộ nền hoặc tự retry mutation.

## Câu hỏi còn mở

- Máy làm việc hiện không có Android SDK/emulator. Khi thực hiện, cần có Android emulator cài sẵn hoặc điện thoại kết nối để đạt tiêu chí kiểm thử thiết bị; tài liệu và test API trên host không thay thế xác minh đó.
- Nếu Expo Web cần được hỗ trợ cùng mobile, cần một quyết định riêng về lưu demo namespace phía browser vì `expo-secure-store` chỉ hỗ trợ native mobile.
