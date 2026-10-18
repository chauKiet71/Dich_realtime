# Dùng ECC trong Codex

ECC 2.2.3 được cài bằng plugin native `ecc@ecc` trong Codex home của người dùng. Quy ước riêng của dự án nằm trong `AGENTS.md`.

## Bắt đầu

1. Khởi động lại Codex và mở dự án `D:\Code\Dich_realtime` để tải plugin mới.
2. Nhập `$` và tìm skill ECC, ví dụ `tdd-workflow`, `verification-loop`, `security-review` hoặc `configure-ecc`.
3. Có thể yêu cầu bằng tiếng Việt; không cần dùng các lệnh `/ecc:...` của Claude Code.

Ví dụ:

```text
Hãy lập kế hoạch MVP cho dự án này. Trước tiên làm rõ nguồn dữ liệu đầu vào,
ngôn ngữ cần dịch, nền tảng và yêu cầu độ trễ, rồi đề xuất công nghệ.
```

```text
Dùng skill tdd-workflow của ECC để triển khai tính năng đã thống nhất.
```

```text
Dùng skill verification-loop của ECC để kiểm tra thay đổi và báo rõ
những kiểm tra đã chạy, kết quả và phần chưa kiểm chứng.
```

## Hook tùy chọn

ECC có hook SessionStart để nạp ngữ cảnh trước đó và phát hiện package manager.
Việc cài plugin không tự cấp quyền tin cậy cho hook. Trong phiên Codex CLI mới,
mở `/hooks` để xem và tin cậy định nghĩa ECC nếu muốn bật tự động hóa này.
Các skill vẫn dùng được mà không cần bật hook. Mức hooks Standard của Claude
Code không áp dụng cho Codex.

## Kiểm tra cài đặt

Chạy trong PowerShell:

```powershell
codex plugin list --json
node C:\Users\DELL\.codex\plugins\cache\ecc\ecc\2.2.3\scripts\codex\check-plugin-cache.js
```

Không cài thêm legacy sync lên plugin native vì có thể tạo nội dung trùng lặp.
