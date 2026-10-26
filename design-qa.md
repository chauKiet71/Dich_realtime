# Kiểm tra giao diện một trang

final result: passed

## Bằng chứng

- Mẫu: `C:/Users/DELL/AppData/Local/Temp/codex-clipboard-76e7912d-55b2-46e9-82a8-b40c38cd81d4.png` (402 × 657 px).
- URL: http://localhost:3210/.
- Ảnh triển khai: `artifacts/single-page/mobile.png` (402 × 656 px).
- So sánh toàn màn hình: `artifacts/single-page/comparison.png`.
- So sánh riêng typography, nút và các khung: `artifacts/single-page/comparison-panels.png`.
- Trạng thái: Việt ↔ Trung, đã dừng, nội dung chào ban đầu, tùy chọn đóng.
- IAB có viewport tối thiểu 480 CSS px. Đo thực tế viewport 480 × 656, cột ứng dụng 402 × 656 tại x=39. Ảnh raw 960 × 1312 chứa trang ở góc trên trái với tỷ lệ nội dung 1:1 và phần canvas thừa; chỉ cắt cột ứng dụng x=39..441, y=0..656, không co giãn. Không suy ra mật độ từ riêng kích thước canvas. Sai lệch chiều cao so với mẫu: 1 px.
- Desktop: kiểm tra ở viewport thực tế 1280 × 900; cột ứng dụng 402 × 760 nằm giữa, không tràn trang, nút micro trong vùng nhìn thấy.

## Kết quả đối chiếu

- Fonts/typography: Segoe UI với fallback Arial, nội dung 18 px, line-height 1.45, nhãn 10–12 px, nút ngôn ngữ 18 px. Dấu tiếng Việt và xuống dòng đúng mẫu. Sai khác nhỏ về nét font so với ảnh raster được xếp P3.
- Spacing/layout: nút cao 52 px, khung nguồn y=85 và khung dịch y=223, mỗi khung cao 124 px, khoảng cách 14 px. Nội dung dài cuộn bên trong khung để giữ chiều cao. Cụm điều khiển được đưa lên khoảng 40 px để giữ lịch sử, tùy chỉnh và thông báo AI trên cùng trang; đây là điều chỉnh có chủ đích theo phạm vi một trang, đã thông báo trong phiên làm việc.
- Colors/tokens: xanh #3e70fa, nền nguồn #f0f6ff, nền dịch #f4f5f8. Nút micro đỏ khi đang kết nối/đang chạy; chấm trạng thái xám khi dừng để phân biệt với phiên đang hoạt động. Mẫu dùng chấm xanh khi dừng; khác biệt ngữ nghĩa có chủ đích.
- Assets: không có ảnh minh họa cần tạo. Ba icon giao diện dùng nguồn [Heroicons](https://heroicons.com/), nhúng thành data URI để không phát sinh yêu cầu mạng lúc chạy. Giấy phép MIT lưu tại `docs/heroicons-LICENSE.txt`. Không có asset giả hoặc ảnh chụp dùng thay giao diện.
- Copy/content: giữ nội dung hai khung theo mẫu. Nhãn ngôn ngữ hai chiều giữ đúng động cơ phiên dịch hiện có. Thêm mục thu gọn và dòng thông báo AI. Nhãn micro và trạng thái phản ánh kết nối thực tế.
- Không còn phát hiện P0/P1/P2 trong phạm vi thiết kế đã điều chỉnh.

## Lịch sử sửa và xác nhận lại

1. Phát hiện các quy tắc giao diện cũ có specificity cao hơn, gây lệch khung và nút micro. Ghi đè bằng selector có phạm vi `.compact-ui`, bỏ margin lệch hai khung và đặt nhãn nút vào luồng bố cục bình thường.
2. Đo trang cao 686 px trong viewport cao 656 px. Giảm padding trên cụm điều khiển xuống 28 px. Đo lại `scrollHeight=656`, `scrollWidth=480`, khung ứng dụng 402 × 656. Nút micro và tùy chọn đều trong vùng nhìn thấy.
3. Đối chiếu ảnh toàn màn hình và ảnh chi tiết sau sửa, bằng chứng tại các đường dẫn trên. Giới hạn hai khung ở 124 px để nội dung dài không đẩy nút micro ra khỏi màn hình.

## Tương tác đã kiểm tra trong IAB

- Mở thẳng phiên dịch, không qua trang giới thiệu/chọn chế độ.
- Chuyển Việt ↔ Anh: nút được chọn, tiêu đề và nhãn bản dịch cập nhật.
- Bấm micro: nhãn chuyển thành “Hủy kết nối”, hai nút ngôn ngữ bị khóa.
- Hủy kết nối: trở lại “Đã dừng phiên dịch”, hai nút ngôn ngữ mở lại.
- Mở lịch sử và tùy chỉnh trong cùng trang; cài đặt hiện/ẩn đúng.
- Tăng độ nhạy bằng bàn phím: giá trị 18 → 19.
- Xóa nội dung khi dừng và đóng mục thu gọn.
- Console: không có lỗi/cảnh báo qua `tab.dev.logs`.
- `/room` vẫn hiển thị giao diện tạo phòng qua module UI dùng chung.

## Kiểm chứng kỹ thuật và giới hạn

- JavaScript syntax: PASS (`npm run check`, gọi npm CLI trực tiếp vì wrapper npm của máy trỏ vào thư mục bị hạn chế).
- Tests: PASS, 85/85; coverage 92.94% dòng, 90.71% nhánh, 81.25% hàm. Coverage này thuộc phạm vi unit/integration hiện có, không bao gồm giao diện trình duyệt.
- Build/TypeScript/lint: không có các bước riêng trong dự án buildless này.
- Diff whitespace: PASS. Không đổi logic phiên dịch, thông tin xác thực hoặc chính sách bảo mật; không thêm runtime dependency hay khóa vào client.
- Script browser smoke đã cập nhật để dùng luồng một trang, kiểm tra cú pháp đạt; chưa chạy script Playwright này trong phiên làm việc.
- Chưa thử giọng nói thật hoặc gọi nhà cung cấp dịch thật. Kiểm tra bắt đầu/hủy được thực hiện trước khi cấp quyền micro.
- Chưa xác nhận thiết bị thật có chiều rộng dưới 402 px; có quy tắc responsive cho <=360 px, cần kiểm tra riêng nếu muốn chứng nhận các thiết bị đó.

## Implementation checklist

- [x] Một màn hình chính theo ảnh.
- [x] Đổi ngôn ngữ và khóa lựa chọn theo trạng thái phiên.
- [x] Lịch sử/cài đặt thu gọn trong cùng trang.
- [x] So sánh toàn màn hình và vùng chi tiết sau sửa.
- [x] Syntax, tests, coverage và diff review.
- [ ] Kiểm thử hội thoại bằng micro thật trên điện thoại.

## Follow-up polish

- P3: có thể tự lưu trữ Roboto nếu cần khớp nét chữ sát hơn; [nguồn Google Fonts](https://github.com/google/fonts/tree/main/ofl/roboto) hỗ trợ Vietnamese. Hiện dùng font hệ thống để giữ thay đổi gọn.
