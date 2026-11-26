# Windows: cài đặt và chạy app Android

> Tài liệu này hướng dẫn chạy app trên Android Emulator cùng API và Supabase local. Không cần điện thoại cắm USB và không cần cài Scoop. Chỉ dùng dữ liệu giả; môi trường local này không dành cho dữ liệu sức khỏe thật hoặc dùng production.

## 1. Cài công cụ cần thiết

### Git và Node.js

1. Cài Git for Windows và Node.js từ các trang chính thức ở cuối tài liệu.
2. Dự án yêu cầu Node.js `22.13.0+` trên nhánh 22, `24.3.0+` trên nhánh 24, hoặc `26+`; npm `10.9.0` đến dưới `12`.
3. Mở PowerShell mới và kiểm tra:

   ```powershell
   git --version
   node --version
   npm --version
   ```

### WSL 2 và Docker Desktop

Supabase local chạy trong Docker. Docker Desktop với backend WSL 2 là cách được khuyến nghị trên Windows.

1. Kiểm tra WSL trong PowerShell:

   ```powershell
   wsl --version
   wsl --status
   ```

2. Nếu WSL chưa được cài, chạy PowerShell bằng quyền Administrator, thực hiện `wsl --install`, khởi động lại Windows rồi kiểm tra lại. Nếu đã có WSL, không cài lại; chỉ chạy `wsl --update` khi Docker yêu cầu cập nhật.
3. Tải và cài Docker Desktop. Trong quá trình cài, chọn backend **WSL 2**. Mở Docker Desktop và chờ trạng thái chạy.
4. Kiểm tra Docker từ PowerShell:

   ```powershell
   docker --version
   docker info
   ```

   `docker info` phải có phần **Server** và cho biết Docker Desktop đang chạy Linux containers. Nếu chỉ có phần Client hoặc báo không kết nối được daemon, mở Docker Desktop và chờ khởi động xong.

Không cần mở Ubuntu/WSL để chạy các lệnh app bên dưới; chạy chúng trong PowerShell tại thư mục dự án.

### Android Studio, SDK và Emulator

1. Tải và cài Android Studio. Trong Setup Wizard, chọn cài đặt Standard và Android Emulator.
2. Đặt **Android SDK Location** thành một đường dẫn không có dấu cách, ví dụ `D:\Android\Sdk`. Tránh đặt dưới `C:\Users\<tên người dùng có dấu cách>\...` vì một số công cụ NDK/CMake gặp lỗi với đường dẫn có dấu cách.
3. Trong Android Studio, mở **Tools → SDK Manager**.
   - Ở **SDK Platforms**, cài Android SDK Platform API 37 nếu có trong danh sách.
   - Ở **SDK Tools**, cài **Android SDK Platform-Tools**, **Android SDK Command-line Tools (latest)**, **Android Emulator**, **NDK (Side by side)** và **CMake**.
   - Build hiện tại của dự án báo `compileSdk 37`, Build Tools `37.0.0`, NDK `27.1.12297006`; nếu các phiên bản này xuất hiện trong **Show Package Details**, hãy cài đúng các phiên bản đó. Bản CMake dùng để build trên máy đã thiết lập là `4.1.2`.
4. Tạo emulator trong **Tools → Device Manager → Create Device**. Chọn một thiết bị Pixel và system image x86_64 phù hợp; tải image nếu Android Studio yêu cầu. Khởi động emulator và giữ nó chạy.
5. Thêm biến môi trường người dùng trong Windows (**Edit the system environment variables → Environment Variables**):
   - `ANDROID_HOME` = `D:\Android\Sdk`
   - `ANDROID_SDK_ROOT` = `D:\Android\Sdk`
   - Thêm `%ANDROID_HOME%\platform-tools` vào `Path`.

   Thay `D:\Android\Sdk` nếu chọn SDK Location khác. Đóng và mở lại PowerShell sau khi đổi biến môi trường.
6. Kiểm tra SDK và emulator:

   ```powershell
   Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe"
   where.exe adb
   adb devices -l
   ```

   Dòng đầu phải trả `True`; emulator phải có trạng thái `device`. Trạng thái `offline` nghĩa là emulator/ADB chưa sẵn sàng. Không cần cắm điện thoại khi dùng emulator.

#### Nếu Gradle chọn nhầm CMake

Nếu lỗi build nhắc tới một CMake ngoài Android SDK, ví dụ `C:\mingw64\bin\cmake`, hãy kiểm tra phiên bản đã cài:

```powershell
Get-ChildItem "$env:ANDROID_HOME\cmake" -Directory
```

`npx expo run:android --device` tạo thư mục `android` nếu repo chưa có. Nếu build dừng ở bước CMake, mở (hoặc tạo) `android\local.properties`. Giữ các dòng đang có; nếu thiếu `sdk.dir`, thêm nó. Thêm `cmake.dir` với đúng thư mục CMake trong Android SDK. Ví dụ cho đường dẫn và phiên bản đã dùng trong lần chạy đầu tiên:

```properties
sdk.dir=D:/Android/Sdk
cmake.dir=D:/Android/Sdk/cmake/4.1.2
```

Nếu SDK hoặc phiên bản CMake của bạn khác, sửa đường dẫn cho khớp. `android/local.properties` là cấu hình riêng của máy và được Git bỏ qua; không commit file này.

## 2. Lấy mã nguồn và cài dependencies

Clone repository từ GitHub, sau đó mở PowerShell tại thư mục `nutrition-assistant-mobile`:

```powershell
git clone <URL-repository-GitHub>
cd nutrition-assistant-mobile
npm ci
```

Không chạy `supabase init`: repo đã có `supabase/config.toml` và migrations.

## 3. Khởi động Supabase local

Không bắt buộc cài Scoop. Cách dưới đây chạy Supabase CLI `2.122.1` bằng `npx` trong thư mục dự án:

```powershell
npx --yes supabase@2.122.1 --version
npx --yes supabase@2.122.1 start
```

Lần đầu chạy sẽ tải các Docker images và có thể mất vài phút. Lấy **Project URL**, **publishable key** và **secret key** từ kết quả lệnh hoặc chạy:

```powershell
npx --yes supabase@2.122.1 status
```

Áp dụng migrations và chạy kiểm thử SQL local:

```powershell
npx --yes supabase@2.122.1 db reset
npx --yes supabase@2.122.1 test db
```

`db reset` xóa rồi dựng lại dữ liệu **Supabase local**. Không dùng lệnh này nếu muốn giữ dữ liệu local hiện có. Nó không được chạy trên hosted Supabase trong quy trình này. Repo cần giữ redirect scheme `nutritionassistant://auth/callback` trong `supabase/config.toml` để xác thực có thể quay lại app. Email local, nếu app yêu cầu xác nhận, được xem trong trang mail local mà CLI hiển thị (thường `http://localhost:54324`); không có email thật được gửi.

## 4. Tạo và cấu hình file môi trường

Tạo file local chỉ khi chưa có, để không ghi đè cấu hình hiện tại:

```powershell
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item '.env.example' '.env' }
if (-not (Test-Path -LiteralPath 'server/.env')) { Copy-Item 'server/.env.example' 'server/.env' }
```

Sửa `.env` ở thư mục gốc cho Android Emulator. Lấy key từ Supabase local; không dùng key của production:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local-publishable-key>
```

Sửa `server/.env` để API trên Windows kết nối đến Supabase local. Giữ các cấu hình mẫu khác và điền các key tương ứng từ `supabase start`:

```dotenv
API_HOST=0.0.0.0
PORT=4000
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<local-publishable-key>
SUPABASE_SECRET_KEY=<local-secret-key>
```

`10.0.2.2` là địa chỉ từ Android Emulator tới máy Windows; `127.0.0.1` trong `server/.env` là địa chỉ loopback cho API đang chạy trên Windows. Không đổi cả hai thành `localhost` trong `.env` của app. Không đưa secret key vào `.env` gốc, `EXPO_PUBLIC_*`, source code, log, ảnh chụp hoặc Git. Hai file `.env` đã được Git bỏ qua.

## 5. Chạy API và mở app lần đầu

Mở ba cửa sổ PowerShell tại thư mục repo.

**Cửa sổ 1 — API:**

```powershell
npm run api
```

Trên Chrome của emulator, mở `http://10.0.2.2:4000/health`. Kết quả phải có `{"status":"ok"}`. `/health` chỉ xác nhận API đang phản hồi; nó chưa chứng minh các dịch vụ bên ngoài đã cấu hình.

**Cửa sổ 2 — build và cài app:**

```powershell
npx expo run:android --device
```

Chọn emulator nếu được hỏi. Lần build đầu có thể mất thời gian vì tải Gradle/Android dependencies. Dự án dùng native module nên cần development build; Expo Go không thay thế được app build này.

**Cửa sổ 3 — dùng cho các lần chạy sau khi app đã cài:**

```powershell
npx expo start --dev-client
```

Mở app đã cài trong emulator và nạp development server. Thay đổi JavaScript thường chỉ cần khởi động lại Metro hoặc reload app. Thay đổi native dependency, Android config hoặc plugin cần build lại bằng `npx expo run:android --device`. Sau khi thay đổi `.env`, khởi động lại Metro để nạp giá trị mới.

## 6. Kiểm tra luồng đầu tiên trong app

Dùng email và thông tin sức khỏe giả:

1. Đăng ký, đăng xuất rồi đăng nhập lại.
2. Hoàn thành đánh giá sức khỏe với tuổi/cân nặng/chiều cao giả, chọn tình trạng sức khỏe và dị ứng.
3. Mở hồ sơ/cá nhân hóa, thay đổi một lựa chọn, lưu rồi mở lại để kiểm tra.
4. Thêm một bữa ăn thử, xác nhận và kiểm tra nhật ký/thống kê.
5. Mở thông báo, đánh dấu đã đọc; kiểm tra trạng thái sau khi rời màn hình và quay lại.
6. Thử danh sách thực phẩm, meal plan, hồ sơ xét nghiệm/PDF, lịch hẹn và chat. Tra cứu thực phẩm và tạo meal plan theo dữ liệu nguồn đang không khả dụng cho tới khi có quyền tái phân phối bảng của Viện Dinh dưỡng và hoàn tất rà soát chuyên môn. Assistant cần `OPENAI_API_KEY`; thanh toán cần PayOS sandbox và credentials; gửi push cần cấu hình Expo Push. Nếu chưa có các credentials này, các tính năng tương ứng có thể báo không khả dụng. Không nhập thẻ thật hoặc dữ liệu xét nghiệm/người bệnh thật.

Chạy các kiểm tra tự động từ PowerShell tại repo khi cần:

```powershell
npm run test:unit
npm run test:ui
npm run test:api
npm run test:supabase-api
```

`test:supabase-api` cần Supabase local đang chạy. Các lệnh này kiểm tra mã/API; chúng không thay thế việc mở và thao tác app trên emulator.

## 7. Sự cố thường gặp

| Lỗi | Cách kiểm tra |
|---|---|
| `adb` không được nhận diện hoặc không thấy thiết bị | Kiểm tra `ANDROID_HOME`, `%ANDROID_HOME%\platform-tools` trong `Path`, mở emulator và chạy `adb devices -l`. Trạng thái cần là `device`. |
| `offline` | Chờ emulator khởi động xong, rồi chạy `adb kill-server`, `adb start-server`, `adb devices -l`. |
| `Failed to resolve Android SDK path` | Mở terminal mới sau khi đặt `ANDROID_HOME`/`ANDROID_SDK_ROOT`; kiểm tra `Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe"`. |
| CMake chạy từ `C:\mingw64` hoặc build CMake dừng | Cài Android SDK CMake qua SDK Manager; kiểm tra `android\local.properties` có `cmake.dir` trỏ tới thư mục SDK CMake đã cài. |
| App mở nhưng API không kết nối | Mở `http://10.0.2.2:4000/health` trong Chrome emulator; xác nhận API đang chạy và `EXPO_PUBLIC_API_URL` dùng `10.0.2.2`, không phải `localhost`. |
| API chạy nhưng xác thực Supabase lỗi | Xác nhận Supabase đang chạy; app dùng `http://10.0.2.2:54321`, API dùng `http://127.0.0.1:54321`, và từng key nằm đúng file môi trường. Không gửi secret key khi nhờ hỗ trợ. |

## 8. Dừng các dịch vụ

- Nhấn `Ctrl+C` trong terminal API và Expo.
- Dừng Supabase local khi không dùng:

  ```powershell
  npx --yes supabase@2.122.1 stop
  ```

`supabase stop` dừng containers nhưng giữ database local; `db reset` mới là lệnh dựng lại và xóa dữ liệu local.

## Tài liệu chính thức

- [Node.js downloads](https://nodejs.org/en/download)
- [Git for Windows](https://git-scm.com/download/win)
- [Docker Desktop trên Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Cài WSL](https://learn.microsoft.com/en-us/windows/wsl/install)
- [Supabase CLI và local development](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Cài Android Studio](https://developer.android.com/studio/install)
- [Cài Android SDK NDK và CMake](https://developer.android.com/studio/projects/install-ndk)
- [Chạy app trên Android Emulator](https://developer.android.com/studio/run/emulator)
- [Mạng trong Android Emulator](https://developer.android.com/studio/run/emulator-networking-address)
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
