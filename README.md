# Song Ngữ — phiên dịch Việt ↔ Trung và Việt ↔ Anh

Chọn một trong hai chế độ trước khi bật micro: **Việt ↔ Trung** (mặc định) hoặc **Việt ↔ Anh**.
Dừng phiên trước khi đổi chế độ; lần bắt đầu tiếp theo tạo kết nối mới với cấu hình ngôn ngữ tương ứng.
Ứng dụng tự chọn chiều dịch trong cặp đã chọn và giữ thời gian chốt câu 2 giây im lặng.
Trong chế độ Việt ↔ Anh, nhãn hiển thị cặp ngôn ngữ thay vì đoán tiếng nói dựa trên dấu tiếng Việt.

Website phiên dịch giọng nói cho hai người nói luân phiên trên một thiết bị,
hoặc **phòng gọi Việt–Trung giữa hai thiết bị** tại `/room`.
Nhận diện Mandarin hoặc tiếng Việt khi đang nói; chốt lượt sau khoảng 2 giây im lặng.
Âm báo ngắn xác nhận câu đã được nhận; bíp đôi báo bản dịch đã phát xong rồi ứng
dụng mới mở lại micro.

## Chạy trên máy này

Yêu cầu Node.js 22 trở lên. Chạy `npm ci` lần đầu để cài thư viện WebSocket `ws`.

```powershell
cd D:\Code\Dich_realtime
npm ci
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

## Phòng gọi giữa hai thiết bị (bản thử nghiệm)

1. Mở `/room` (hoặc chọn **Gọi giữa hai thiết bị** trên trang chủ).
2. Chọn ngôn ngữ mình nói: Việt hoặc Trung, bấm **Tạo phòng gọi**, cấp quyền micro.
3. Sao chép liên kết mời cho người kia. Họ mở liên kết và bấm **Tham gia**;
   hệ thống tự chọn ngôn ngữ đối ứng. Mật khẩu website vẫn áp dụng cho cả hai.
4. Khi báo **Sẵn sàng**, bấm **Đến lượt tôi nói**. Ngừng khoảng 2 giây để dịch,
   hoặc bấm **Dịch câu này**. Người kia nghe bản dịch bằng ngôn ngữ của họ.
   Sau khi tắt micro, máy người nói phát audio xác nhận do người dùng cung cấp
   (kể cả khi bấm chốt thủ công). Yêu cầu dịch được gửi ngay, không chờ âm báo
   kết thúc; bíp tổng hợp chỉ dùng nếu asset không tải được.
5. Sau khi nghe hết bản dịch, micro người nghe **tự mở để trả lời**. Không cần
   bấm nói ở mỗi lượt; máy chủ chuyển quyền nói sau xác nhận phát xong từ người nghe.
   Nếu trình duyệt chặn phát âm thanh, bấm **Bật âm thanh**; micro vẫn tắt đến khi
   phát xong và bíp đôi hoàn tất. Micro tiếp tục mở khi chưa có giọng nói, không
   có mốc chờ 8 giây.
   Sau khi nói rồi im lặng 2 giây, ứng dụng chốt câu và dịch. Im lặng trước câu
   không được gửi đến OpenAI; chỉ giữ 300 ms đệm cục bộ để tránh mất đầu từ.

Phòng hỗ trợ hai người, không phải hội thoại nói chồng hay truyền giọng gốc.
Hai bên đều thấy văn bản gốc và bản dịch; mỗi bên chỉ nghe giọng AI dịch lời người kia.
Chưa có tài khoản cá nhân, nhóm lâu dài, video hoặc đổ chuông.

### Kết nối và vận hành

- Chế độ một thiết bị vẫn dùng WebRTC trực tiếp với OpenAI. Phòng hai thiết bị
  dùng Web Audio (PCM16 mono 24 kHz) → WebSocket cùng origin → Node.js → OpenAI
  Realtime WebSocket. Âm thanh dịch quay về qua máy chủ đến đúng người nghe.
  Không cần LiveKit, STUN hay TURN. Đổi lại, máy chủ chịu băng thông âm thanh
  (đầu vào khoảng 48 KB/s khi nói, chưa tính overhead; kết nối OpenAI dùng base64).
- Mỗi phòng mở **hai phiên OpenAI** khi cả hai người đã kết nối. Cấu hình hướng
  dịch do server quyết định, API key không xuống trình duyệt. Quota 6 phiên/phút,
  60 phiên/giờ được dùng chung với chế độ một thiết bị. Quota tạo phòng riêng:
  6/phút, 60/giờ, tối đa 10 phòng trong RAM; không phải hạn mức chi phí cứng.
- Liên kết mời có token ngẫu nhiên trong fragment (`#`), không gửi token qua URL
  HTTP. Token thành viên riêng chỉ giữ trong RAM của tab, không dùng localStorage.
  Không lưu bản ghi vào đĩa; nội dung vẫn được gửi đến OpenAI để xử lý.
- Phòng tồn tại tối đa 15 phút, chờ tham gia hoặc trạng thái sẵn sàng tối đa 2 phút;
  khi đã đến lượt và micro đang mở thì chờ giọng nói đến hết thời hạn phòng.
  câu nói tối đa 30 giây. Mất kết nối, rời phòng hoặc server restart sẽ đóng phòng.
  Khi đang gọi, chuyển tab/ẩn trang cũng đóng phòng. Khi đang chờ người kia,
  có thể chuyển ứng dụng để gửi liên kết (micro đang tắt).
- Chạy **một replica**: phòng và quota ở RAM. Muốn scale cần kho trạng thái và
  cơ chế định tuyến kết nối dùng chung. Reverse proxy phải cho phép WebSocket
  upgrade và timeout phù hợp. Railway dùng HTTPS/WSS cùng tên miền sẵn có.
- `localhost` chỉ truy cập từ chính máy đang chạy. Để thử hai điện thoại hoặc
  hai mạng khác nhau, triển khai bản mới lên tên miền HTTPS có cấu hình production;
  gửi liên kết localhost cho điện thoại sẽ không hoạt động.
- Docker dùng `npm ci --omit=dev --ignore-scripts` với lockfile. Không đưa `.env*`
  hoặc `artifacts/` vào bản triển khai. Thay đổi này chưa tự triển khai lên Railway.

### Kiểm chứng phòng gọi

`npm test` kiểm thử HTTP, WebSocket và điều phối lượt với provider giả lập,
không gọi API có phí. `npm run test:browser` cần Playwright được cài sẵn và Chrome;
có thể đặt `PLAYWRIGHT_MODULE` thành file URL của module Playwright nếu dùng runtime
ngoài dự án. Bài kiểm tra dùng hai browser context, micro giả và provider giả,
bao gồm phát PCM, chặn playback, mời, rời phòng và bố cục điện thoại.

Kiểm thử OpenAI thật là lệnh **có phí**, tách khỏi `npm test`:

```powershell
node --env-file-if-exists=.env.local scripts/room-provider-smoke.mjs --confirm-paid artifacts/sample-vi.wav artifacts/sample-zh.wav
```

Hai file mẫu không nằm trong Git; cần WAV mono PCM16 24 kHz, dưới 25 giây.
Xem `docs/rooms-verification.md` để biết kết quả thực tế và giới hạn kiểm chứng.

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
