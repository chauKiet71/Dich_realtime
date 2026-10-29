# OpenRouter nhận dạng + dịch — 2026-10-29

## Cấu hình và hành vi

- `TRANSLATION_ENGINE=hybrid`, `TRANSLATION_PROVIDER=openrouter`, `STT_PROVIDER=openrouter`.
- Nhận dạng: `openai/whisper-large-v3-turbo`, endpoint cố định `https://openrouter.ai/api/v1/audio/transcriptions`, JSON với WAV base64 và `format=wav`.
- Dịch: DeepSeek V3.2 qua `https://openrouter.ai/api/v1/chat/completions`, cấu hình chuẩn hóa nhẹ và reasoning hiện có.
- Hai bước dùng chung `OPENROUTER_API_KEY` hoặc `OPENROUTER_API_KEY_FILE`. Cấu hình này không đọc khóa OpenAI và không gọi trực tiếp `api.openai.com`, kể cả khi OpenAI hết số dư hoặc thiếu khóa.
- Google WaveNet vẫn đọc bản dịch bằng khóa Google riêng. Các nhà cung cấp model phía sau OpenRouter có thể xử lý âm thanh và văn bản; giao diện đã cập nhật thông báo này.
- Khi chọn provider dịch OpenRouter mà không đặt `STT_PROVIDER`, nhận dạng mặc định cũng là OpenRouter. Muốn giữ OpenAI STT trực tiếp phải đặt rõ `STT_PROVIDER=openai`; chế độ Realtime không thay đổi.
- Chọn STT provider không hợp lệ làm readiness thất bại. Không tự đổi về khóa OpenAI hoặc khóa 9Router khi khóa OpenRouter thiếu/bị từ chối.
- Lỗi 401/402/429 STT có thông báo cố định theo đúng nhà cung cấp, không chuyển tiếp thông tin provider thô. HTTP 402 được mô tả là thiếu số dư; nhận dạng lỗi dừng trước dịch/TTS.
- `/api/health` có `sttProvider` và `sttModel`; không có khóa, đường dẫn khóa hoặc số dư tài khoản. `configured=true` chỉ xác nhận đọc được cấu hình khóa, không thay cho kiểm tra số dư từ xa.

## Khóa và cấu hình local

- Tệp người dùng chỉ định được xác thực bằng `/api/v1/key`, trả 200.
- `.env.local` trỏ đến tệp này qua `OPENROUTER_API_KEY_FILE`; không sao chép khóa vào mã hoặc tệp cấu hình.
- Đã đổi lựa chọn provider local sang OpenRouter và khởi động ứng dụng tại http://localhost:3000/.
- `.env.local` và toàn bộ `artifacts/` nằm ngoài Git. Không in khóa, phản hồi thông tin tài khoản hoặc nội dung file khóa.

## Kiểm chứng tự động

- RED commit: `a11cb26`, sáu kiểm thử mới thất bại vì luồng cũ vẫn đọc khóa và gọi OpenAI STT trực tiếp.
- GREEN: sáu kiểm thử mới đạt, bao gồm định dạng WAV/JSON, ngôn ngữ phòng gọi, STT model tùy chỉnh, tách biệt khóa, thiếu khóa, lỗi upstream, fail-closed khi STT provider sai và metadata health.
- Kiểm thử OpenAI STT cũ đặt rõ `STT_PROVIDER=openai` để xác nhận chế độ legacy vẫn hoạt động.
- `npm run check`, `git diff --check`: PASS.
- `npm run test:coverage`: 84/84 PASS; coverage Node 92.78% dòng, 90.64% nhánh, 81.58% hàm.
- IAB đọc thông báo thực tế trong DOM: âm thanh và văn bản qua OpenRouter, bản dịch qua Google; không có console error/warning.
- Security review: endpoints STT cố định HTTPS, không theo redirect; không thêm dependency, không thay origin/auth/quota hoặc giới hạn PCM; không đưa khóa về browser.

## Kiểm thử thực tế

Đầu vào là ba câu tổng hợp bằng Google WaveNet, không phải bản ghi cá nhân. Gửi qua HTTP API local, không đưa `sourceLanguage` để mô phỏng thiết bị dùng chung tự nhận ngôn ngữ.

| Chiều | Thời gian chuỗi STT → dịch → TTS | PCM đầu ra |
| --- | ---: | ---: |
| Việt → Trung | 6744 ms | 157396 byte |
| Trung → Việt | 5267 ms | 167220 byte |
| Việt → Anh | 4732 ms | 164602 byte |
| Anh → Việt | 3915 ms | 158532 byte |

- Cả bốn hướng trong lượt kiểm tra cuối trả đúng mã ngôn ngữ nguồn/đích, văn bản không rỗng và PCM đọc được.
- Trace xác nhận chỉ `openrouter.ai` cho STT/dịch và `texttospeech.googleapis.com` cho TTS; không có gọi OpenAI trực tiếp.
- Bằng chứng tổng hợp ở `artifacts/openrouter-key-migration/results.json`, script tại cùng thư mục.
- Trong lượt kiểm tra ban đầu, một câu Trung trả mã nguồn `vi` thay vì `zh`; lượt chẩn đoán riêng và lượt kiểm tra đầy đủ sau đó đều đạt. Không xác định được nguyên nhân từ response đầu vì script dừng trước khi lưu nội dung đó. Chưa thay prompt/model dịch vì lỗi này; kết quả mẫu không đảm bảo độ chính xác hoặc độ trễ cho mọi cuộc hội thoại.
- Chưa kiểm tra micro/loa điện thoại thật, chưa đo thời gian từ lúc người dùng dừng nói đến lúc nghe được bản dịch.

## Production

Chưa đổi biến hay triển khai Railway. Phiên Railway lưu trên máy đã trả Unauthorized trong lượt chẩn đoán trước; cần đăng nhập lại để cập nhật service đúng. README có danh sách biến cần đặt. Chỉ cập nhật các biến provider/model và `OPENROUTER_API_KEY`, giữ Google TTS, mật khẩu truy cập và HTTPS origin hiện có. Không upload `.env*`, `artifacts/` hoặc file khóa.

## Tài liệu đã đối chiếu

- [OpenRouter Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt).
- [Danh sách model STT](https://openrouter.ai/api/v1/models?output_modalities=transcription), xác nhận model đã chọn có modality transcription.
- [Whisper Large V3 Turbo trên OpenRouter](https://openrouter.ai/openai/whisper-large-v3-turbo).
