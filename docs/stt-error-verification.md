# Kiểm tra lỗi nhận dạng — 2026-10-29

## Chẩn đoán thực tế

- Website được người dùng chỉ định: https://dichrealtime-production.up.railway.app/.
- `/healthz` trả 200. Trang chính và `/api/health` trả 401 khi chưa xác thực, nên chưa đọc được cấu hình production hoặc tái hiện yêu cầu dịch trên website.
- Mật khẩu ứng dụng không có trong môi trường local; Railway CLI lưu trên máy trả Unauthorized. Không đổi mật khẩu, không nạp tiền, không đổi nhà cung cấp và không triển khai trong phiên kiểm tra này.
- Kiểm tra trực tiếp OpenAI bằng khóa cấu hình local và WAV im lặng tổng hợp 1 giây trả HTTP 429, `error.code=credit_balance_exhausted`, `error.type=insufficient_quota`. Không gửi giọng nói cá nhân, không in khóa hoặc nội dung file khóa.
- Kết quả xác nhận khóa local hết số dư, không chứng minh khóa trên Railway giống khóa local. Nếu production dùng cùng tài khoản/dự án, cần nạp số dư API; đổi giao diện hoặc thử lại không khắc phục được thiếu số dư.
- Local đặt `TRANSLATION_PROVIDER=cloudflare`, trong khi nhánh master hiện chỉ có OpenRouter/9Router và vẫn dùng OpenAI cho STT. Không sửa `.env.local` hoặc đưa code Cloudflare từ nhánh khác vào bản sửa này.

## Bản sửa

- Phân loại phản hồi lỗi của endpoint OpenAI STT bằng mã lỗi và HTTP status.
- Phân biệt hết số dư, hết quota, chạm mức chi tiêu, chạm mức sử dụng, sai khóa, thiếu quyền model và giới hạn tốc độ tạm thời.
- Kiểm tra mã cụ thể trước `error.type=insufficient_quota`; vì type này có thể bao phủ nhiều nguyên nhân billing khác nhau.
- Phản hồi STT bị từ chối dừng chuỗi trước dịch/TTS. Không thử lại tự động khi hết số dư, không đổi nhà cung cấp dự phòng.
- Chỉ đọc tối đa 16 KiB của lỗi STT; chỉ dùng mã và loại lỗi để chọn thông báo cố định. Không chuyển nguyên `error.message` của provider, request body hoặc khóa API về client.
- HTTP 503 cho các trạng thái STT cần điều chỉnh tài khoản/cấu hình hoặc chờ hết giới hạn; không đi vào nhánh HTTP 429 đặc thù của router dịch văn bản.

## Kiểm chứng

- RED: hai kiểm thử mới thất bại vì code cũ luôn trả 502 chung.
- GREEN: các trường hợp lỗi STT, mã lỗi ưu tiên, payload lỗi không hợp lệ/quá lớn và tích hợp HTTP đã có kiểm thử.
- `npm run check`, `git diff --check`: PASS. `npm run test:coverage`: 78/78 PASS; 92.76% dòng, 89.91% nhánh, 81.58% hàm cho phạm vi Node được đo.
- Rà soát bảo mật: thông báo cố định, mã cụ thể được ưu tiên trước type quota, không in/chuyển tiếp thông tin bí mật, không thêm dependency, không đổi kiểm tra origin/auth/quota của server.
- Bản sửa cải thiện chẩn đoán; không khôi phục dịch vụ khi tài khoản API vẫn hết số dư.

## Nguồn

- [OpenAI API error codes](https://developers.openai.com/api/docs/guides/error-codes): `credit_balance_exhausted` nghĩa là hết số dư trả trước; phân biệt với rate limit và các giới hạn chi tiêu/sử dụng.
- [OpenAI API billing](https://platform.openai.com/settings/organization/billing).
- [OpenAI API limits](https://platform.openai.com/settings/organization/limits).
