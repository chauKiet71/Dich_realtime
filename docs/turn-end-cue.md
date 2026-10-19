# Âm báo tự chốt câu — 19/10/2026

Nguồn: video người dùng cung cấp `2aOboR6VDlKZvheoXeVTCKfoMZOS2qRPsLIBioC0.mp4`.
Đã tách nguyên track audio bằng FFmpeg, bỏ video/metadata, xuất PCM16 WAV tại
`public/turn-end.wav`: 1,136327 giây, 200.526 byte. Không đưa video gốc vào repository.

- Chỉ nhánh SilenceGate chốt sau 2 giây im lặng phát âm báo; bấm nút, không có
  giọng nói hoặc giới hạn 29 giây không kích hoạt âm báo.
- Flush PCM cuối và tắt capture trước; gửi commit rồi phát âm báo đồng bộ,
  không await playback. Buffer âm báo preload lúc tham gia và chỉ nối loa local.
- Tách âm báo khỏi hàng đợi audio dịch/played acknowledgement. Mở micro lượt mới
  hoặc đóng phòng sẽ dừng âm báo còn lại, tránh lọt vào lượt thu tiếp theo.
- Nếu tải/giải mã/phát âm báo lỗi thì tiếp tục dịch; không phát trễ khi tải xong.

TDD RED (`f187fd3`): browser smoke báo speaker có 1 lần phát thay vì 2, chứng minh
thiếu âm báo sau tự chốt. GREEN: hai browser context, synthetic speech rồi silence,
hai chiều đều tự chốt; speaker tăng đúng một lần phát âm báo, listener chỉ tăng
một lần phát bản dịch; micro tắt khi âm báo bắt đầu. Commit và âm báo cách nhau
dưới 200 ms, không đợi âm báo dài hơn một giây. Manual turns không thêm âm báo.

Kiểm tra: 36/36 Node tests PASS; `npm run check`, `git diff --check` PASS.
Browser smoke `--protected --omit-ws-basic` PASS (provider giả, không phí API).
Coverage Node: 89,31% dòng / 87,90% nhánh / 79,01% hàm; frontend open/play PCM được
kiểm chứng riêng bằng browser smoke, không được tính vào coverage Node.
Chưa nghe kiểm chứng trên loa/micro vật lý của hai điện thoại.
