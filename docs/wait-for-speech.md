# Chờ người dùng bắt đầu nói — 19/10/2026

Thay thế hành vi tự hủy sau 8 giây của `automatic-reply-turn.md`.

- Không tự cancel khi người được cấp lượt chưa nói. Micro và quyền nói được giữ.
- Trước giọng nói đầu tiên, browser chỉ giữ 3 frame PCM (khoảng 300 ms) trong RAM,
  không gửi im lặng đến OpenAI. Khi nghe giọng nói, gửi đệm để giữ đầu từ rồi
  stream bình thường. Chốt sau 2 giây im lặng như trước, kèm âm báo local.
- Bộ đếm thời lượng câu bắt đầu khi phát hiện giọng nói; server bắt đầu giới hạn
  audio/deadline khi nhận frame đầu tiên. Không còn deadline 35 giây tính từ lúc
  được cấp lượt. Giữ giới hạn câu khoảng 30 giây và tổng phòng 15 phút.
- Vẫn đóng khi rời trang, mất kết nối, rời phòng hoặc hết thời hạn phòng.

RED `57dee7a`: test fake clock chờ 3 phút khiến phòng bị xóa bởi deadline cũ.
GREEN: test chờ qua mốc 8 giây, 35 giây và 2 phút vẫn giữ lượt; khi bắt đầu gửi
PCM, deadline câu mới bắt đầu tính. Browser smoke hai context giữ micro mở sau
9,5 giây im lặng, không tăng byte gửi provider hay phát âm thanh; sau đó nói và
ngừng 2 giây vẫn dịch/chuyển lượt bình thường. Provider giả, không gọi API có phí.

`npm run check`, `git diff --check`, 37/37 tests PASS. Browser smoke protected,
bỏ Basic header ở upgrade PASS. Chưa kiểm tra loa/micro điện thoại vật lý.
