# Bằng chứng TDD — âm báo và luồng giao diện

Ngày thực hiện: 19/10/2026.

## Nguồn và hành trình người dùng

Không dùng plan file. Tiêu chí được rút ra trực tiếp từ yêu cầu:

1. Là người đang nói, tôi muốn nghe một âm báo ngay khi câu đã được chốt để biết
   micro đã tắt và không cần lặp lại câu.
2. Là người đang nghe, tôi muốn nghe một âm báo khác sau khi bản dịch đã phát hết
   để biết có thể bắt đầu lượt tiếp theo.
3. Là người dùng mới, tôi muốn thấy ba bước Nói → Đợi dịch → Nghe để hiểu trạng
   thái hiện tại mà không phải đọc hướng dẫn dài.

## Báo cáo thực thi

| Hành vi | RED | GREEN | Điều được bảo đảm |
| --- | --- | --- | --- |
| Hai âm báo phân biệt và không khóa ứng dụng khi audio lỗi | `node --test test/audio-cues.test.js` thất bại với `ERR_MODULE_NOT_FOUND` trước khi có `public/audio-cues.js` | Cùng lệnh PASS 4/4 | Bíp chốt câu là một âm 620 Hz; bíp hoàn tất tăng 820/1040 Hz; fallback vẫn gọi completion; cue cũ có thể bị hủy an toàn |
| Phòng chờ bíp hoàn tất trước khi xác nhận playback | `node --test test/audio-cues.test.js test/room-cue.test.js test/server.test.js` thất bại vì thiếu `playTranslationEnd` và asset trả 404 | Cùng lệnh PASS 18/18 | Module được phục vụ qua allowlist; callback chuyển lượt chỉ chạy sau khi bíp đôi kết thúc |
| Phòng luôn bíp khi chốt câu, không phụ thuộc WAV tải nền | `node --test --test-name-pattern="speech completion beeps" test/room-cue.test.js` thất bại vì `playTurnEnd()` trả `undefined` khi chưa có buffer | Cùng lệnh PASS sau khi chuyển sang Web Audio | Một oscillator 620 Hz được tạo ngay cả khi legacy WAV chưa tải; suspend/synthesis error vẫn không khóa cuộc gọi |
| Toàn bộ hồi quy máy chủ và điều phối lượt | Không áp dụng RED riêng; dùng suite hồi quy hiện có sau GREEN | `npm run test:coverage` PASS 44/44 | Không làm hỏng quota, xác thực, WebSocket, thứ tự lượt, giới hạn thời gian và xử lý transcript |

Checkpoint TDD trên nhánh hiện tại:

- `1d39f32` — test RED cho bộ âm báo.
- `bfb4aed` — test RED cho tích hợp phòng và allowlist.
- `ca6a2dc` — triển khai GREEN cho âm báo và chỉ dẫn giao diện.
- `0e08054` — refactor trạng thái bước hiện tại và bổ sung `aria-current`.
- `82ed1fa` — test RED tái hiện phòng không bíp khi WAV chưa tải.
- `26031cf` — fix GREEN chuyển bíp kết thúc câu của phòng sang Web Audio.

## Coverage và kiểm chứng

- `npm run test:coverage`: 44/44 PASS; line 91,28%, branch 87,85%, function 80,95%.
- `npm run check`: PASS cho toàn bộ JavaScript chạy thực tế, gồm `audio-cues.js`.
- `git diff --check`: PASS.
- Rà `sk-`, `OPENAI_API_KEY=` và `console.log`: không phát hiện secret; các
  `console.log` còn lại chỉ là thông báo khởi động và output của smoke script.
- Kiểm tra trực quan localhost: bố cục ba bước hiển thị đầy đủ ở desktop và chỉ
  giữ bước hiện tại trên viewport hẹp.

## Khoảng trống có chủ ý

- `npm run test:browser` chưa chạy được trong môi trường hiện tại vì package
  Playwright không được cài. Không cài dependency mới chỉ để chạy kiểm tra tùy
  chọn này; kiểm tra Node và kiểm tra trực quan localhost vẫn hoàn tất.
- Chưa nghe thử âm lượng trên loa/micro vật lý của hai điện thoại. Tần số và thời
  lượng được kiểm tra tự động, còn cảm nhận âm lượng cần kiểm tra thiết bị thật.
