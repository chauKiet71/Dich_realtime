# Phòng gọi Việt–Trung hai thiết bị — 19/10/2026

## Bản sửa kết nối Railway

Người dùng báo lỗi mở WebSocket trên Railway. Kiểm tra ban đầu bằng Chrome có
HTTP Basic vẫn tạo phòng thành công, nên chưa xác định được nguyên nhân riêng
trên thiết bị của người dùng. Đã sửa hai điểm tương thích: cookie HttpOnly ký
HMAC, hạn 15 phút, Secure trên production, SameSite=Strict, chỉ cho đường dẫn
socket; và CSP chỉ rõ origin WSS của ứng dụng. Cookie chỉ được cấp sau khi tạo
hoặc tham gia phòng qua HTTP đã xác thực; quyền thành viên vẫn kiểm tra riêng.

- RED: thiếu cookie xác thực và thiếu origin WebSocket trong CSP, 2 tests fail
  (`895773e`). GREEN: 11 tests phòng đạt sau sửa (`a8e21dc`).
- Tổng kiểm tra: 33/33 tests, coverage Node 96,83% dòng / 89,75% nhánh;
  `npm run check`, `npm audit --omit=dev` và `git diff --check` đạt.
- Browser smoke `--protected --omit-ws-basic`: hai browser context có mật khẩu,
  chủ động xóa Authorization ở upgrade, vẫn truyền/phát hai chiều thành công.
- Đã triển khai Railway: `fa653907-817a-4694-a761-70721d7697e3`, trạng thái SUCCESS.
  Chrome trên tên miền thật mở phòng được, nhận cookie Secure/HttpOnly và CSP mới.
  WebSocket chỉ gửi cookie (không Basic Authorization) nhận HTTP 101.
- Phép kiểm tra production chỉ tạo một thành viên nên không mở phiên OpenAI.
  Chưa tái kiểm tra trên thiết bị cụ thể đã báo lỗi. Người dùng cần tải lại trang
  và tạo phòng mới. Phần bên dưới giữ nguyên bằng chứng của bản triển khai đầu.

## Phạm vi

Yêu cầu được lấy trực tiếp từ cuộc trao đổi: phát triển web hiện có với một phòng
hai thiết bị, dịch Việt–Trung hai chiều. Bản này dùng gọi theo lượt, chỉ truyền
giọng AI dịch cho người nghe; chưa có tài khoản riêng, nhóm lâu dài hay video.
Không triển khai production trong lần thực hiện này.

## Bằng chứng TDD

| Hành vi | RED thực tế | GREEN thực tế |
| --- | --- | --- |
| Tạo/tham gia phòng riêng, chỉ hai người, ngôn ngữ đối ứng, giới hạn đầu vào | `node --test test/rooms.test.js`: 3 fail do API trả 404 thay vì 201/400 | Cùng lệnh: 3 pass |
| Hủy lượt im lặng, từ chối invite Unicode | `node --test test/room-call.test.js`: 5 pass, 2 fail (timeout khi cancel và RangeError khi so token) | Cùng lệnh: 7 pass |
| Không bỏ phần âm thanh cuối dưới 100 ms | `node --test test/pcm-worklet.test.js`: 1 pass, 1 fail (thiếu 2.000 byte cuối) | Cùng lệnh: 2 pass |
| Chuyển ứng dụng gửi lời mời khi đang chờ không đóng phòng | Browser smoke thất bại: `#call` bị ẩn sau visibilitychange | Browser smoke pass sau sửa; micro vẫn tắt |

Checkpoint trên nhánh hiện tại: `0d415a6` → `e533db2`, `83bd936` → `8c573f1`,
`ebc9275` → `641058f`. Không squash trong phiên thực hiện.

## Kết quả kiểm tra cuối

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| `npm run check` | PASS: cú pháp server, session, room hub, frontend và worklet |
| `npm run test:coverage` | PASS: 32/32 tests; 96,67% dòng, 88,85% nhánh, 83,87% hàm trong các module được Node đo |
| `npm run test:browser` | PASS: hai Chrome context độc lập; fake microphone, AudioWorklet thật; PCM truyền/phát hai chiều; chỉ người nghe nhận âm thanh; micro tắt khi nghe; giữ khóa lượt khi AudioContext bị suspend, mở lại sau nút bật âm thanh; cleanup khi rời; không tràn màn hình 390 px; không có pageerror |
| `npm audit --omit=dev` | PASS: 0 vulnerabilities; dependency runtime duy nhất là `ws` được khóa phiên bản |
| OpenAI thật | PASS: hai lượt từ WAV tổng hợp sẵn có, qua API phòng và WebSocket thật |
| Build/TypeScript/lint | Không có bước build, TypeScript hoặc lint trong dự án; không báo cú pháp như một kết quả lint |
| Docker/production | Đã sửa Dockerfile và allowlist `.dockerignore` để cài từ lockfile; `docker info` không kết nối được Docker Desktop Linux daemon, nên chưa build container. Chưa triển khai Railway |

Coverage Node không bao gồm độ phủ dòng của `room.js`, `room-audio.js` và worklet
chạy trong browser/VM. Browser smoke xác minh hành vi của chúng nhưng chưa đo
coverage của frontend. `npm test` và browser smoke không gọi OpenAI có phí.

Browser smoke dùng Playwright có sẵn trong runtime của máy, qua biến
`PLAYWRIGHT_MODULE` trỏ tới module; không thêm dependency kiểm thử vào production.
Ảnh kiểm tra nằm ở `artifacts/room-mobile.png` và bị loại khỏi Git/deploy.

## Phép thử OpenAI thật

Lệnh thực sự đã chạy (có phí; hai fixture bị ignore):

```powershell
node --env-file-if-exists=.env.local scripts/room-provider-smoke.mjs --confirm-paid artifacts/sample-vi.wav artifacts/sample-zh.wav
```

| Chiều | Bản dịch nhận được | Audio đầu tiên sau commit | PCM đầu ra |
| --- | --- | --- | --- |
| Việt → Trung | 你好，我想预订一张两个人的桌子，晚上7点。 | 782 ms | 225.456 byte |
| Trung → Việt | Xin hỏi từ đây đến sân bay mất bao lâu? | 1.323 ms | 112.186 byte |

Đây là mẫu chức năng, không phải benchmark. Thời gian đo không gồm 2 giây chờ
im lặng, không đo thời điểm loa vật lý phát tiếng. Chưa kiểm chứng hai điện thoại,
mạng di động, Safari/iOS, tiếng vọng loa/micro thật hoặc chất lượng dịch trong
hội thoại dài. Browser smoke dùng provider giả; provider smoke dùng client Node.

## Rà soát bảo mật và vận hành

- API HTTP và WebSocket giữ kiểm tra Host, Origin và HTTP Basic của production.
  Upgrade sai origin/thiếu xác thực bị từ chối trước khi nối OpenAI.
- Invite ngẫu nhiên 192 bit, phòng 128 bit, token từng thành viên tách biệt.
  Invite ở fragment, được xóa khỏi thanh địa chỉ sau khi đọc; token không ghi log
  hoặc localStorage. Người thứ ba và attach trùng bị từ chối.
- Máy chủ nắm quyền nói, định tuyến audio và cấu hình hướng dịch. Không chuyển
  tiếp sự kiện tùy ý từ trình duyệt đến OpenAI; token/API key không nằm trong HTML.
- Giới hạn JSON, WebSocket payload, tần suất message, buffer, tốc độ gửi PCM,
  độ dài input/output, thời hạn kết nối/phiên và số phòng. Heartbeat dọn socket chết.
- Lỗi provider được thay bằng thông báo chung. Nội dung giao diện dùng textContent.
  API key vẫn nạp phía server; không đọc/in nội dung file key trong quá trình kiểm tra.
- RAM dùng chung trong một process, chưa hỗ trợ nhiều replica. Phòng đóng khi
  mất kết nối/restart; không có phục hồi phiên. Quota phiên không phải ngân sách cứng.
- Có truyền nội dung qua server/OpenAI; không phải mã hóa đầu cuối giữa hai người.
  Không ghi audio hoặc transcript vào đĩa. Browser giữ tối đa 100 lượt trong RAM.

## Thử nghiệm chấp nhận trên thiết bị thật tiếp theo

Sau khi triển khai bản này lên HTTPS, dùng một điện thoại Wi-Fi và một thiết bị
mạng di động: tạo/mời, nói mỗi chiều, kiểm tra số/tên/negation trong bản dịch,
chặn rồi bật lại âm thanh, mất mạng và rời phòng. Dùng tai nghe trước, sau đó đo
tiếng vọng với loa ngoài. Không coi những bước chưa chạy này là đã PASS.
