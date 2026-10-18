# Song Ngữ — phiên dịch Việt ↔ Trung và Việt ↔ Anh

Chọn một trong hai chế độ trước khi bật micro: **Việt ↔ Trung** (mặc định) hoặc **Việt ↔ Anh**.
Dừng phiên trước khi đổi chế độ; lần bắt đầu tiếp theo tạo kết nối mới với cấu hình ngôn ngữ tương ứng.
Ứng dụng tự chọn chiều dịch trong cặp đã chọn và giữ thời gian chốt câu 2 giây im lặng.
Trong chế độ Việt ↔ Anh, nhãn hiển thị cặp ngôn ngữ thay vì đoán tiếng nói dựa trên dấu tiếng Việt.

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

Bản local chỉ phục vụ trên máy này. Bản Railway có HTTPS, đăng nhập và giới hạn
tạo phiên phía máy chủ như phần bên dưới. Tệp key cục bộ không tự có trên hosting.

## Triển khai Railway

Phiên bản Railway dùng `Dockerfile` (Node 24, user không phải root) và readiness
endpoint `/healthz`, cấu hình trực tiếp trong service Railway (timeout 120s,
restart tối đa 3 lần). Không phụ thuộc `railway.json` đã deprecated. Trong production, máy chủ nghe
`0.0.0.0:$PORT` và chỉ chấp nhận tên miền được cấu hình bằng `PUBLIC_ORIGIN`.
Các quy định localhost ở trên vẫn áp dụng cho bản chạy local; bản Railway dùng
HTTPS và đăng nhập HTTP Basic của trình duyệt cho cả giao diện lẫn API.

- Website: https://dichrealtime-production.up.railway.app
- Username: `songngu`.
- Mật khẩu tạo riêng được lưu cục bộ trong `artifacts/railway-access.txt` (bị loại
  khỏi Git và gói triển khai). Không dùng API key làm mật khẩu đăng nhập.
- Biến Railway: `OPENAI_API_KEY`, `APP_ACCESS_PASSWORD`, `PUBLIC_ORIGIN`,
  `NODE_ENV=production`, `PORT=8080` và hai biến model như `.env.example`.
- API key được chuyển vào Railway Variables qua stdin của CLI; tệp key trên máy
  người dùng và `.env.local` không được tải lên.
- Giới hạn phía máy chủ: tối đa 6 lần tạo phiên/phút và 60 lần/giờ cho dịch vụ.
  Bộ đếm trong RAM của một instance, reset khi khởi động lại. Đây không phải
  giới hạn chi tiêu cứng; chủ key nên đặt ngân sách trên OpenAI. Không tăng replica
  trước khi chuyển bộ đếm sang kho dùng chung.
- Không cấu hình đủ origin HTTPS/mật khẩu/key thì readiness không đạt, Railway
  không chuyển sang bản mới.

CLI đã liên kết đúng project/service/environment. Triển khai lại source local:

```powershell
npm test
npm run check
npx --yes @railway/cli up --service 54f63013-fb7c-457d-b979-c5c72d6bb2a5 --environment f1ae971e-2a89-4487-a25b-09f37f3910e7 --project 7ab7c02b-210b-4af4-95e0-c49ed6406e85 --detach
```

Dịch vụ vẫn liên kết GitHub. Bản CLI chứa thay đổi local; trước khi dùng lại tự
động triển khai từ GitHub cần đồng bộ các thay đổi này lên repository để không
ghi đè bản Railway bằng code cũ.

## Tài liệu API đã đối chiếu

- https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime
- https://developers.openai.com/api/docs/guides/realtime-transcription
- https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create
