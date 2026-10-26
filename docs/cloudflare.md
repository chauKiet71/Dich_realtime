# Cloudflare nhận dạng và dịch

Backend nhận PCM16 mono 24 kHz từ trình duyệt, bọc WAV và gọi:

1. `POST https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/@cf/openai/whisper-large-v3-turbo`
   với `{audio: "<WAV base64>", task: "transcribe"}`. Khi biết ngôn ngữ người nói
   trong phòng, thêm `language: "vi"` hoặc `"zh"`; một thiết bị để tự nhận diện.
2. `POST https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions`
   với model mặc định `@cf/qwen/qwen3-30b-a3b-fp8`. Model phát hiện ngôn ngữ nguồn,
   chuẩn hóa nhẹ và dịch sang ngôn ngữ còn lại của cặp đang chọn.
3. Google WaveNet đọc bản dịch, trả PCM 24 kHz về trình duyệt.

Whisper do OpenAI phát triển nhưng trong luồng này chạy trên Cloudflare;
không có yêu cầu gửi đến API OpenAI hoặc OpenRouter. Không dùng `task=translate`
cho Whisper vì cần giữ bản chép lời tiếng gốc trước khi dịch sang ngôn ngữ đích.

## Cấu hình Railway

Trong service Dich_realtime, đặt:

```dotenv
TRANSLATION_ENGINE=hybrid
TRANSLATION_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=<32 ký tự hex của tài khoản>
CLOUDFLARE_API_TOKEN=<token có quyền Workers AI trên tài khoản đó>
CLOUDFLARE_TRANSLATE_MODEL=@cf/qwen/qwen3-30b-a3b-fp8
GOOGLE_TTS_API_KEY=<key Google TTS hiện có>
```

Giữ cấu hình `PUBLIC_ORIGIN`, `APP_ACCESS_PASSWORD`, `NODE_ENV` và `PORT` hiện có.
Không nhập token vào chat, source hoặc câu lệnh có thể ghi vào lịch sử shell.
Nhập token trực tiếp vào Railway Variables rồi áp dụng bản triển khai có mã này.
Không tăng số replica vì hạn mức ứng dụng vẫn nằm trong RAM từng instance.

Không cần key OpenAI/OpenRouter/9Router để chạy chế độ Cloudflare. Các biến cũ
không được đọc bởi pipeline Cloudflare; có thể giữ để quay lại provider cũ.

## Cấu hình local

Tạo `.env.local` từ `.env.example`, điền Account ID, đường dẫn tệp chứa **một token
Cloudflare**, và đường dẫn key Google TTS. Tệp token có thể chứa token thuần hoặc
một dòng `API Token: ...` / `Get API Token: ...`, kèm Account ID nếu cần.
Từ chối tệp có nhiều dòng token. Không tải các tệp này lên Railway.
Biến `CLOUDFLARE_API_TOKEN` có ưu tiên hơn `CLOUDFLARE_API_TOKEN_FILE` nếu cùng tồn tại.

Chạy `npm start`. Kiểm tra `/api/health` sau khi đăng nhập:

```json
{
  "configured": true,
  "engine": "hybrid",
  "provider": "Cloudflare",
  "sttProvider": "Cloudflare",
  "sttModel": "@cf/openai/whisper-large-v3-turbo",
  "model": "@cf/qwen/qwen3-30b-a3b-fp8"
}
```

`configured` và `/healthz` chỉ kiểm tra cấu hình/đọc được key, không chứng minh
token còn hiệu lực hoặc còn hạn mức. Cần thử một câu nói sau khi cấu hình để kiểm
tra Cloudflare và Google thực tế. Kiểm thử tự động dùng nhà cung cấp giả lập,
không gửi âm thanh hoặc tốn hạn mức tài khoản.

## Giới hạn và lỗi

- Audio tối đa 30 giây/câu; giữ cơ chế chốt sau 700 ms im lặng và ngắt khi dừng.
- Hạn mức ứng dụng: 4 lượt đồng thời, 30 câu/phút, 600 câu/giờ/instance.
- HTTP 429 của Cloudflare được thử lại tối đa 2 lần ở bước đang lỗi,
  theo `Retry-After`, tối đa 20 giây chờ/bước và trong deadline chung 90 giây.
  Nếu dịch bị giới hạn, không thực hiện lại nhận dạng đã hoàn tất.
- Lỗi phân biệt bước nhận dạng Cloudflare, dịch Cloudflare hoặc đọc Google;
  không trả nội dung lỗi thô của nhà cung cấp, token hoặc đường dẫn tệp về client.
- Không tự chuyển về OpenAI/OpenRouter nếu Cloudflare lỗi.
- Âm thanh và văn bản gốc được gửi Cloudflare; bản dịch được gửi Google.
  Ứng dụng không ghi âm thanh/nội dung xuống đĩa. Chính sách của các nhà cung cấp áp dụng.
- Chất lượng dịch và độ trễ tiếng Việt/Trung cần kiểm thử thực tế trước khi
  đánh giá ngang bằng model đã dùng trước đây. `/no_think` là hướng dẫn cho Qwen3,
  không phải cam kết loại bỏ toàn bộ độ trễ suy luận.

Việc kiểm tra token bằng `/user/tokens/verify` hoặc `/accounts/{id}/tokens/verify`
có thể không phù hợp loại token được cấp. Với token được cung cấp cho lần tích hợp
này, endpoint kiểm tra token trả 401 nhưng gọi Workers AI trực tiếp được 200.
Vì vậy cần dựa vào lời gọi Workers AI thực tế thay vì suy ra token sai chỉ từ
endpoint kiểm tra token.

## Tài liệu chính thức

- [Whisper Large V3 Turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)
- [Ví dụ truyền audio base64](https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-workers-ai-whisper-with-chunking/)
- [Qwen3 30B A3B FP8](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)
- [OpenAI-compatible API](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)
- [Bảng giá và hạn mức miễn phí](https://developers.cloudflare.com/workers-ai/platform/pricing/)
