# Âm báo trạng thái lượt dịch — 19/10/2026

Nguồn: video người dùng cung cấp `2aOboR6VDlKZvheoXeVTCKfoMZOS2qRPsLIBioC0.mp4`.
Đã tách nguyên track audio bằng FFmpeg, bỏ video/metadata, xuất PCM16 WAV tại
`public/turn-end.wav`: 1,136327 giây, 200.526 byte. MD5 của PCM giải mã từ video
và WAV đều là `6836c22b34c7ba17cd43c6b5b02a6551`, xác nhận cùng nội dung audio.

- Chế độ phòng ưu tiên phát đúng `turn-end.wav` sau khi câu được chốt. `open()`
  đợi fetch và giải mã xong trước khi xin micro, tránh bỏ lỡ âm ở lượt đầu.
- Phòng phát audio cả khi tự chốt sau 2 giây lẫn khi người dùng bấm **Dịch câu
  này**; lượt không có giọng nói không phát.
- Chế độ một thiết bị dùng bíp thấp 620 Hz. Phòng cũng dùng bíp này làm fallback
  nếu WAV không tải hoặc không phát được, để luồng cuộc gọi không mắc kẹt.
- Cả hai chế độ dùng bíp đôi tăng dần 820/1040 Hz sau khi âm thanh dịch đã phát
  hết. Micro/chuyển lượt chỉ tiếp tục sau khi bíp đôi kết thúc.
- Flush PCM cuối và tắt capture trước; gửi commit rồi phát audio đồng bộ.
- Tách âm xác nhận câu khỏi hàng đợi audio dịch. Bíp hoàn tất nằm trước playback
  acknowledgement để tránh mở micro hoặc chuyển lượt khi âm báo còn đang phát.
- Nếu AudioContext bị suspend hoặc cả buffer lẫn oscillator đều không phát được
  thì cuộc gọi vẫn tiếp tục, không mắc kẹt ở bước chốt câu.

TDD bổ sung: `test/audio-cues.test.js` kiểm tra hình dạng hai âm, callback hoàn tất,
fallback khi audio bị suspend và hủy callback cũ. `test/room-cue.test.js` kiểm tra
phòng chỉ xác nhận playback sau khi bíp đôi đã kết thúc.

Kết quả kiểm tra mới nhất được ghi trong `docs/audio-cues.tdd.md`. Chưa nghe kiểm
chứng trên loa/micro vật lý của hai điện thoại.
