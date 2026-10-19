# Tự mở micro trả lời — 19/10/2026

Lượt đầu bắt đầu bằng nút nói. Sau khi listener xác nhận buffer âm thanh dịch
đã phát hết (`played`, đúng turnId), máy chủ cấp ngay lượt nói mới cho listener.
Không phát state `ready` trung gian để người nói trước không giành lại lượt.
Client nhận state `listening` và bật micro người được cấp lượt như cơ chế cũ.

Không chuyển lượt ở `response.done` hoặc `audio-end`: chúng chỉ báo đã tạo xong
audio, chưa xác nhận loa phát hết. AudioContext bị suspend vẫn giữ micro tắt;
người dùng bấm bật âm thanh và nghe xong mới được mở micro.

Giữ hành vi chống vòng lặp im lặng: nếu chưa phát hiện tiếng nói trong khoảng
8 giây, client cancel buffer, tắt micro và phòng về ready. Người dùng bấm nói
để tiếp tục. Nếu đã nói thì chốt sau 2 giây im lặng, phát âm báo local và dịch.
Rời phòng hoặc mất kết nối vẫn đóng micro. Không thêm gọi nền.

## Kiểm chứng

- RED `88dbab7`: test hai chiều timeout khi chờ listener nhận lượt tự động.
- GREEN: test hai chiều chỉ gửi `speak` một lần đầu, mỗi `played` cấp đúng
  listener làm speaker với turnId mới. `played` từ sai người/turnId cũ bị từ chối.
- Browser smoke protected + bỏ Basic ở upgrade PASS: bốn lượt liên tục sau
  một lần bấm bắt đầu, hai lượt chốt thủ công và hai lượt tự chốt; micro mở cho
  bên nghe sau playback, chỉ một bên thu; playback suspend giữ khóa; âm báo chỉ
  phát ở người chốt; lượt tự mở không có tiếng nói tự tắt sau 8 giây, không dịch.
- `npm run test:coverage`: 36/36 PASS; coverage Node 89,35% dòng / 88,15% nhánh /
  79,01% hàm. Frontend được kiểm tra riêng trong browser smoke, không tính vào
  coverage Node. `npm run check` và `git diff --check` PASS.
- Provider trong các kiểm thử trên là giả lập; không gọi OpenAI có phí cho thay
  đổi điều phối này. Script kiểm tra provider thật được cập nhật để theo lượt
  tự động. Chưa thử trên hai điện thoại/micro/loa vật lý.
