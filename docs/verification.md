# Bằng chứng kiểm tra — MVP 0.1.0

Ngày: 19/10/2026. Phạm vi: chạy cục bộ trên Windows, Node 24.11.1,
trình duyệt Chromium qua công cụ Chrome DevTools của ECC.

## TDD

Hành vi lấy từ yêu cầu người dùng: nhận diện hai ngôn ngữ liên tục, chốt sau
2000ms im lặng, nói tiếp thì dời hạn chốt, không dịch im lặng/tiếng động ngắn,
và ghép các transcript đến không đúng thứ tự.

- RED: `npm test` với lớp stub, 5 tests thực thi; 3 thất bại đúng ở chốt 2000ms,
  đặt lại hạn chốt và lưu transcript. Không phải lỗi dependency hoặc cú pháp.
- GREEN: triển khai `SilenceGate`, `TranscriptStore`, cùng bộ test đó đạt 5/5.
- Bổ sung test API, ngưỡng tùy chỉnh, thời gian còn lại, giới hạn lưu transcript.
- Cuối cùng `npm run test:coverage`: **15/15 đạt**; không test bị bỏ qua.
- Coverage các module được test: **97,35% dòng**, **93,42% nhánh**.
  `public/core.js`: 100% dòng/nhánh; `lib/session.js`: 100% dòng;
  `server.js`: 95,18% dòng. Không tính `public/app.js`/DOM vào tỷ lệ này.
- Không có Git repository trong thư mục ban đầu nên không tạo checkpoint commit.

## Kiểm tra tự động

| Hành vi | Bằng chứng |
| --- | --- |
| Im lặng không tự tạo lượt dịch | `test/core.test.js` |
| Chờ đủ 2000ms, không gửi lặp | `test/core.test.js` |
| Nói tiếp đặt lại hạn chốt | `test/core.test.js` |
| Tiếng động ngắn và reset không tạo lượt giả | `test/core.test.js` |
| Ghép transcript theo ID và giữ bản cuối | `test/core.test.js` |
| Không trả key qua health hoặc lỗi API | `test/server.test.js` |
| Chặn Origin/Host lạ, SDP quá lớn/sai định dạng | `test/server.test.js` |
| Giới hạn tạo phiên, không phục vụ env/source bí mật | `test/server.test.js` |
| Cấu hình dịch do máy chủ tạo; chỉ SDP trả về trình duyệt | `test/server.test.js` |

`npm run check`: đạt kiểm tra cú pháp cả 4 module sản phẩm.
Build/TypeScript/lint chuyên biệt: không áp dụng cho stack JS buildless hiện tại.
Không có dependency runtime bên thứ ba.

## Kiểm thử API thật và trình duyệt

Đã dùng key từ tệp được người dùng chỉ định, không in nội dung key.
Danh sách model trả 200 và tạo client secret với cấu hình phiên trả 200.
Giá trị client secret không được in hoặc lưu vào dự án.

Hai đoạn giọng nói tổng hợp được tạo qua API TTS, đưa vào MediaStream của trình
duyệt thay micro bằng Web Audio. Sau đó sử dụng luồng WebRTC thật và UI thật.

| Chiều | Bản chép lời | Bản dịch nhận được | Chữ đầu sau khi bắt đầu nói | Phát âm thanh sau commit |
| --- | --- | --- | --- | --- |
| Việt → Trung | Xin chào. Tôi muốn đặt một bàn cho hai người lúc bảy giờ tối | 我想预订一张两人桌，晚上七点。 | 1478ms | 743ms |
| Trung → Việt | 你好。请问从这里到机场需要多长时间？ | Xin chào, cho hỏi từ đây đến sân bay mất bao lâu? | 1489ms | 552ms |

Đây là hai phép thử đơn lẻ, không phải benchmark hoặc bảo đảm độ trễ.
Ở chiều Việt → Trung model đã bỏ phần chào đầu câu; cần thêm tập đánh giá
độ trung thành bản dịch, tên riêng, số và câu dài trước khi dùng cho tình huống
đòi hỏi độ chính xác cao. Không coi việc kết nối thành công là chứng minh chất lượng dịch.

Quan sát được sự kiện transcript delta trong lúc đoạn âm thanh vẫn đang phát;
`response.done` đến trước `output_audio_buffer.stopped`. Micro mở lại sau sự kiện
playback stopped. Sau bấm Dừng, track chuyển `ended`, audio được gỡ khỏi phần tử.
Không có lỗi API trong hai lượt.

Các kiểm tra UI bổ sung:

- Desktop và mobile 390px: không tràn ngang; xem ảnh thực tế.
- Tùy chỉnh mở/đóng hoạt động.
- Từ chối micro: thông báo tiếng Việt, nút bắt đầu được khôi phục.
- Hủy khi đang chờ cấp quyền: track được cấp muộn vẫn bị dừng, không rò micro.
- Các override phục vụ QA đã được xóa bằng tải lại trang; không nằm trong source sản phẩm.

## Bảo mật và giới hạn

Đã rà soát: key ở máy chủ; không dùng innerHTML với transcript; không lưu nội dung
trong localStorage/sessionStorage; tài nguyên tĩnh theo allowlist; CSP, kiểm tra
Origin/Host, giới hạn tạo phiên; log chỉ URL máy chủ; không log transcript hoặc key.

Chưa thử micro/loa vật lý, môi trường ồn, Safari/iOS hoặc độ ổn định phiên dài.
Chưa triển khai công khai, chưa có tài khoản người dùng/quota production.
WebRTC thực tế đã chạy nhưng không thu thập coverage trình duyệt.
Sẵn sàng dùng thử cục bộ; cần thử trên thiết bị thật và bổ sung kiểm soát production
trước khi công khai.
