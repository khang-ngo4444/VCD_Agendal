# Agendal — kế hoạch kiểm thử toàn luồng

Ngày: 2026-10-21. Nhánh: `feature/hci-rules-audit`.

## Công việc

- [x] Đọc rule, kiểm kê route, màn hình, form và các bộ test hiện có.
- [x] Viết testcase có điều kiện đầu vào, hành động và kết quả cần chứng minh.
- [x] Chạy HTTP integration với MongoDB thật trong database test riêng.
- [x] Kiểm tra trực quan, mô tả, label, tên nút, bàn phím và responsive bằng trình duyệt.
- [x] Sửa lỗi có bằng chứng; bổ sung regression test và chạy lại.
- [x] Tự kiểm tra chéo kết quả với DB, HTTP response và UI; ghi giới hạn kiểm chứng.
- [x] Build lại và cập nhật bản chạy local để người dùng test.

## Phạm vi và cách xác nhận

Mỗi testcase phải có mã, hành vi mong đợi và kết quả thực chạy. Không đánh dấu
đạt chỉ vì response là 200. Đối chiếu dữ liệu trong DB khi thao tác ghi; kiểm tra
trang kế tiếp, thông báo, dữ liệu giữ lại và khả năng phục hồi khi có lỗi.

| Nhóm | Luồng và nhánh bắt buộc |
| --- | --- |
| Public/auth | Landing, legal, đăng ký hợp lệ/lỗi/trùng, onboarding/skip, login sai/lockout, logout, session hết hạn, forgot/reset hợp lệ/hết hạn/dùng lại, đổi mật khẩu và đăng xuất thiết bị khác |
| Projects/tasks | Tạo/sửa/xóa, validation/giữ bản nháp, màu, Inbox, hoàn tất/mở lại, Undo, soft delete/restore, lặp, lịch, reminder thêm/sửa/xóa/Undo, isolation giữa hai tài khoản |
| Today/Upcoming | Ngày hiện tại/khác/ngày lỗi, overdue, progress, nhóm việc và điều hướng tuần |
| Board | Tất cả/lọc project/Inbox, di chuyển bằng menu và kéo thả, hoàn tất và mở lại, rollback khi lỗi |
| Calendar/events | Day/week/month, tạo task theo slot, đổi lịch/bỏ lịch, sự kiện thường/all-day/lặp, sửa/xóa một lần/từ đây/cả chuỗi, ngày và giờ không hợp lệ |
| Habits | Bốn tần suất, tạo/sửa/lỗi, check-in/Undo/backfill/tương lai/trùng, streak/progress, month, archive/restore/delete/history |
| Focus | Chọn task, lọc, chọn độ dài, start/pause/resume/restart/skip/exit-cancel, complete, lưu block hợp lệ/trùng/chưa xong, reload và sự cố lưu |
| Insights | Khoảng ngày, bar/line, số liệu đúng, CSV và chống formula injection |
| Settings | Profile/time zone, avatar hợp lệ/lỗi, theme/accent/week start/calendar layout, notifications/summary, xóa tài khoản và cleanup dữ liệu |
| Admin | Phân quyền, overview/users/activity, tìm/lọc/paging, lock/unlock/self-lock, session người bị khóa |
| Cross-cutting | CSRF, ownership, XSS/escape, redirect an toàn, 404/403/500, empty/loading/success/error, descriptions và accessible names, focus và responsive |

## Môi trường

- Không reset hoặc xóa database `agendal` đang được người dùng test.
- Integration tạo database `agendal_flow_test_<timestamp>` trên MongoDB local,
  tự dọn đúng database được tạo sau khi test xong.
- Mail chỉ gửi tới Mailpit local. Không gửi email, notification hoặc ghi dữ liệu
  ra dịch vụ thật. OAuth và browser push cần cấu hình/provider thực sẽ ghi riêng
  trạng thái chưa kiểm chứng, không tính là đạt.
- Unit test hiện có là một lớp bằng chứng; HTTP/DB và browser bổ sung lớp còn thiếu.
- Kiểm tra description theo tác vụ: người dùng biết trang dùng làm gì, cần nhập
  gì, bắt buộc/tùy chọn, hậu quả và cách sửa. Không thêm đoạn mô tả thừa vào mọi nút.
- Không dùng số lượng testcase hay tỷ lệ test pass để khẳng định mọi tổ hợp đều đúng.
