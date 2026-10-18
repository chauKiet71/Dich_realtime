# Song Ngữ — phiên dịch Trung ↔ Việt

Website phiên dịch giọng nói cho hai người nói luân phiên trên một thiết bị.
Nhận diện Mandarin hoặc tiếng Việt khi đang nói; chốt lượt sau khoảng 2 giây im lặng;
phát giọng nói bản dịch và mở lại micro khi phát xong.

## Chạy trên máy này

Yêu cầu Node.js 22 trở lên. Không cần cài thư viện ngoài.

```powershell
cd D:\Code\Dich_realtime
npm start
```

Mở http://localhost:3000 bằng Chrome hoặc Edge, bấm **Bắt đầu phiên dịch**,
cho phép micro rồi nói. Nút **Dừng phiên dịch** đóng kết nối và giải phóng micro.
Nếu môi trường ồn, mở **Tùy chỉnh** để tăng ngưỡng nhận giọng nói.
Khi chuyển sang tab khác, phiên sẽ tự dừng. Phiên có giới hạn 15 phút.

## API key

Máy chủ đọc key trực tiếp từ tệp người dùng đã chỉ định:
`C:/Users/DELL/Documents/open_api_key.txt`. Đường dẫn được đặt trong `.env.local`
bằng `OPENAI_API_KEY_FILE`. Nội dung key không được sao chép vào dự án, gửi xuống
trình duyệt hoặc ghi log. `.env.local` nằm trong `.gitignore`.

Trên máy khác, sao chép `.env.example` thành `.env.local` và chỉnh đường dẫn tệp key.
Cũng có thể cung cấp `OPENAI_API_KEY` qua môi trường của máy chủ.
Khởi động lại máy chủ sau khi thay cấu hình model hoặc cổng.

## Kiến trúc và lựa chọn dịch vụ

- **OpenAI Realtime `gpt-realtime-2.1`**: nghe và dịch trực tiếp thành âm thanh;
  không phải chờ một chuỗi ba API nhận diện → dịch văn bản → TTS.
- **`gpt-live-transcribe`**: bản chép lời tăng dần, giới hạn ngôn ngữ dự kiến là `zh`, `vi`.
- **WebRTC**: âm thanh truyền trực tiếp giữa trình duyệt và OpenAI. Node.js chỉ
  chuyển tiếp SDP để thiết lập phiên, giữ API key ở máy chủ.
- **Web Audio**: đo mức âm thanh mỗi 40ms; ngưỡng im lặng 2000ms, bỏ qua tiếng
  động quá ngắn. Có thể điều chỉnh ngưỡng trong giao diện. Đây là bộ dò năng lượng
  đơn giản, chưa phải bộ phân loại giọng nói chuyên dụng cho phòng nhiều tiếng ồn.
- Micro tắt trong lúc chờ dịch và phát bản dịch; không cho người thứ hai nói chen
  trong giai đoạn này. Mở lại sau sự kiện `output_audio_buffer.stopped`, không phải
  `response.done` (sự kiện tạo xong có thể đến trước lúc loa đọc xong).
- Văn bản được ghép theo ID để tránh sai thứ tự do sự kiện nhận diện đến muộn;
  lịch sử chỉ trong bộ nhớ tab. Giọng nói phát ra là giọng AI.
- Giao diện HTML/CSS/JS thuần, Node HTTP server, không có bước build hoặc DB.

Khoảng 2 giây là thời gian chờ im lặng, không phải cam kết tổng độ trễ. Mạng,
model, độ dài câu và tiếng ồn ảnh hưởng kết quả. Trong phép thử ngày 19/10/2026
bằng hai đoạn âm thanh tổng hợp, bản chép lời bắt đầu sau khoảng 1,5 giây và
âm thanh dịch bắt đầu 0,55–0,74 giây sau sự kiện commit. Đây là số đo mẫu,
không phải benchmark. Chưa đo với micro/loa vật lý của người dùng.

## Kiểm thử

```powershell
npm test
npm run test:coverage
npm run check
```

`check` kiểm tra cú pháp JavaScript, không phải kiểm tra TypeScript/lint chuyên biệt.
Unit/integration test sử dụng API giả lập, không phát sinh phí. Phép thử giọng nói
thật đã dùng API có phí và hai fixture tổng hợp trong `artifacts/` (không đưa vào Git).
Xem `docs/verification.md` để biết bằng chứng và giới hạn kiểm chứng.

## Phạm vi bản đầu tiên

Máy chủ chỉ lắng nghe `127.0.0.1`; giao diện dùng trên máy này. Có kiểm tra Host,
Origin, giới hạn dung lượng SDP, tốc độ tạo phiên, CSP và danh sách tài nguyên tĩnh
cho phép. API key không được phục vụ qua HTTP.

Chưa triển khai công khai. Trước khi đưa lên Internet cần HTTPS, đăng nhập,
quota theo người dùng và quản lý chi phí ở máy chủ; không mở endpoint tạo phiên
có phí cho khách không xác thực. Key hiện ở tệp cục bộ sẽ không tự có trên hosting.

## Tài liệu API đã đối chiếu

- https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime
- https://developers.openai.com/api/docs/guides/realtime-transcription
- https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create
