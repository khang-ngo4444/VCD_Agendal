# Agendal — kết quả kiểm thử toàn luồng

Ngày 2026-10-21 · nhánh `feature/hci-rules-audit`.

## Kết quả và cách đọc

- 236/236 test Jest, 29 suite: logic, controller và mô phỏng DOM/timer.
- 169/169 testcase HTTP với MongoDB thật; kiểm tra dữ liệu sau ghi và email trong Mailpit local.
- 28 testcase tương tác trình duyệt dưới đây, cùng kiểm tra trực quan form, popup và navigation mobile.
- 132 lượt đo bố cục, tương ứng 128 cặp trang/kích thước khác nhau trên 35 địa chỉ màn hình. App/admin ở 320, 360, 768, 1280px; public ở 320 và 1280px. Không phát hiện tràn ngang toàn trang. Bảng/lịch có vùng cuộn nội bộ không được tính là tràn toàn trang.
- Build CSS thành công. Database `agendal` đã seed ở lượt trước được giữ lại; không chạy seed lại khi QA.

PASS có nghĩa là đáp ứng điều kiện trong testcase, không phải chứng nhận mọi tổ hợp hoặc WCAG đầy đủ. Các lớp test có thể kiểm tra cùng hành vi; không cộng chúng thành số flow độc lập.

## Môi trường, dữ liệu và chạy lại

Điều kiện: Node.js 22, dependencies đã cài, MongoDB local ở 27017, Mailpit SMTP 1025/API 8025. Không cần OAuth hoặc VAPID thật.

```powershell
npm test -- --runInBand
npm run test:flows
npm run css
```

`scripts/test-flows.js` là testcase thực thi: mỗi `check(id, expectation, action)` ghi rõ đầu vào/thao tác, expected và assertion HTTP/DB. Nó tạo owner/peer/admin trong `agendal_flow_test_<timestamp>`, dùng cookie và CSRF thật, tắt jobs tự động và provider ngoài. Khi kết thúc chỉ xóa database khớp tên test đã tạo. `test-results/flows.json` và log là bằng chứng cục bộ, được bỏ qua khỏi Git. Lỗi bất ngờ trên server làm testcase cuối thất bại, kể cả khi một assertion trước đó đã đạt.

Trình duyệt dùng DB riêng `agendal_flow_ui_20261021`, cổng 3999, tài khoản demo/admin local. Các fixture `QA UI Task`, `QA UI Habit`, `QA UI Event`, `QA Renamed Project`, `QA Slot Task` không nằm trong DB dùng thử của bạn. Thử gián đoạn chỉ dừng tiến trình 3999, không dừng bản 3000. Các test đổi mật khẩu, reset, xóa tài khoản chạy qua HTTP trong DB test; không thao tác credential của người dùng trong browser.

## Lỗi đã sửa và bằng chứng

| Vấn đề được tái hiện | Sửa | Kiểm lại |
| --- | --- | --- |
| Project không hợp lệ khi quick-add trả 404, khó sửa draft | Trả 422, giữ title/project/slot và chỉ lỗi tại field | HTTP invalid/foreign project; Jest quick-add |
| Đổi tên project lỗi mất input/ngữ cảnh | Giữ popup mở, giá trị đã nhập và lỗi cụ thể | HTTP rename; quan sát popup 320px |
| Calendar slot 422 chỉ báo kết quả không rõ | Đưa lỗi server vào form đang mở, focus field lỗi; xóa lỗi cũ ở lần thử tiếp theo | UI-C01; Jest background form |
| Hai tab hoàn tất task lặp tạo nhiều task tiếp theo | Unique index previousOccurrence, xử lý concurrent winner | HTTP đồng thời; DB chỉ có một lần tiếp theo |
| Lưu focus đồng thời có nguy cơ trùng block | Unique owner/task/startedAt và upsert idempotent | HTTP retry/concurrent |
| Rời Focus khi block hoàn tất chưa lưu có thể mất block | Hàng chờ riêng; chỉ bỏ sau xác nhận JSON; thử lại khi trở về Focus | Jest fake-clock/mất mạng/rời task/lưu lại |
| Occurrence chuyển ra ngoài ngày danh nghĩa biến mất khỏi lịch | Truy vấn và khai triển cả exception có giờ mới trong cửa sổ | HTTP calendar và DB |
| Sửa location/notes/project của một occurrence bị bỏ qua im lặng | Báo giới hạn scope rõ ràng, 422 giữ input, hướng dẫn following/all | HTTP; UI-E04 |
| Payload check-in không hợp lệ có thể xóa lịch sử | Chỉ nhận done=0 hoặc 1 | HTTP invalid flag và DB history |
| Xóa project để lại event tham chiếu project đã mất | Bỏ project của event, giữ ngày/giờ; confirmation mô tả rõ | HTTP đối chiếu số event và ref |
| Xóa account gặp file avatar bị khóa có thể báo lỗi sau khi dữ liệu đã mất | Xóa avatar trước phần xóa dữ liệu | Jest EBUSY; HTTP upload/delete thành công |
| Reset filters dùng query cũ sau live search | Cập nhật link theo kết quả mới và đóng dropdown khi Show tasks | UI-S01/S02 |
| Tên nút habit không phản ánh check-in/Undo | Tên có hành động, ngày và habit; trạng thái cập nhật sau thao tác | UI-H03; kiểm tra accessible names |
| Thiếu hướng dẫn hoặc nội dung dễ hiểu nhầm | Bổ sung Board, Calendar, task/event/habit, timer, delete-account, push chưa cấu hình, thống kê admin; sửa label/ARIA | HTTP semantics + đọc DOM và ảnh thật |

Hai unique index mới đã được đối chiếu database local trước khi chạy: không có nhóm trùng. Database khác khi triển khai cần kiểm tra dữ liệu trùng trước khi tạo index; báo cáo này không xác nhận migration trên môi trường khác.

## Testcase tương tác trình duyệt

Điều kiện chung: đăng nhập demo trong DB UI test riêng; tên bắt đầu `QA` là fixture của lượt QA. Mỗi hàng ghi mục tiêu, thao tác, kết quả quan sát. Những ca dùng thời gian dài hoặc lỗi đồng thời được kiểm thêm bằng Jest/HTTP, không giả nhận là đã chờ 25 phút ngoài trình duyệt.

| ID | Thao tác và kết quả cần đạt | Kết quả thực chạy |
| --- | --- | --- |
| UI-P01 | Tạo project, mở đúng project và thông báo thành công | PASS — project mới và detail đúng tên |
| UI-P02 | Đổi tên rồi mở lại, tên mới lưu | PASS — QA Renamed Project |
| UI-T01 | Quick-add task và mở sửa | PASS — QA UI Task ở project đã chọn |
| UI-T02 | Nhập giờ kết thúc trước bắt đầu, giữ notes và sửa lại | PASS — lỗi inline, notes còn nguyên, giờ hợp lệ lưu được |
| UI-T03 | Complete rồi Undo | PASS — task trở lại open |
| UI-R01 | Đặt reminder 15 phút trước task 10:00 | PASS — hiển thị 09:45 |
| UI-R02 | Xóa reminder rồi Undo | PASS — reminder được khôi phục |
| UI-B01 | Chuyển task bằng menu Move | PASS — vào Active |
| UI-B02 | Kéo task Active sang Done bằng chuột | PASS — task ở Done, trạng thái được lưu |
| UI-F01 | Pause, Resume, Restart | PASS — dừng/tiếp tục, Restart về 25:00 |
| UI-F02 | Skip focus, skip break, Exit | PASS — chuyển phase đúng và có xác nhận thoát |
| UI-F03 | Cancel Exit và reload | PASS — giữ block, countdown tiếp tục cùng block |
| UI-F04 | Complete trong Focus | PASS — về danh sách Focus, task hoàn tất |
| UI-H01 | Chosen days nhưng chưa chọn ngày | PASS — giữ tên, báo thiếu ngày |
| UI-H02 | Chọn ngày, tạo habit, mở stats | PASS — habit đúng tần suất và có detail |
| UI-H03 | Check-in 21 Oct rồi Undo | PASS — tên nút đổi theo action; 1 day/100%/1 of 1 rồi khôi phục |
| UI-H04 | Archive rồi unarchive | PASS — vẫn vào được history, khôi phục được |
| UI-E01 | Tạo weekly event có location | PASS — xuất hiện trên lịch đúng giờ, location |
| UI-E02 | Đổi title một occurrence | PASS — QA Edited Event ở ngày được chọn |
| UI-E03 | Cancel delete rồi xóa một occurrence | PASS — Cancel giữ; lần đã chọn mất, 29 Oct vẫn còn QA UI Event |
| UI-S01 | Gõ tìm task không nhấn Enter | PASS — URL và kết quả cập nhật |
| UI-S02 | Show tasks rồi Reset filters | PASS — panel đóng, link reset giữ query hiện tại |
| UI-C01 | Click slot trống, submit thiếu title, sửa và submit lại | PASS — giữ 22 Oct 11:00–12:00, lỗi tại Title, focus Title, tạo task thành công |
| UI-C02 | Kéo QA Slot Task thêm một giờ, reload | PASS — 12:00–13:00 vẫn được lưu |
| UI-C03 | Dừng server test, kéo tiếp một giờ | PASS — hoàn tác về 12:00–13:00, cảnh báo chưa xác nhận, không báo thành công |
| UI-A01 | Sai password, show password, đăng nhập lại đúng | PASS — giữ email, xóa password sau lỗi, focus password; admin đăng nhập được |
| UI-AD01 | Mở hộp thoại khóa tài khoản và Cancel | PASS — giải thích đăng xuất mọi thiết bị, giữ task/habit; Cancel không khóa demo |
| UI-E04 | Đổi location trong scope This event only | PASS — lỗi scope cụ thể, QA changed room còn trong input |

Kiểm tra thêm: theme Light lưu sau reload; form task có label nhìn thấy ở 320px; popup rename vừa chiều rộng; navigation mobile mở được, Escape đóng và trả focus Open navigation. Pointer cancellation được kiểm bằng DOM regression test; kéo thành công và rollback lỗi mạng được kiểm bằng trình duyệt thật.

## Tự kiểm tra chéo và giới hạn

- Không dùng HTTP 200 làm bằng chứng duy nhất: kiểm tra response/redirect, dữ liệu DB, state UI sau reload và thông báo. Avatar-delete từng có khả năng test xanh dù response lỗi; đã siết assertion redirect và thêm chặn server error.
- Tách hoạt ảnh số liệu admin khỏi lỗi: số đếm ban đầu 0 chạy tới giá trị thật; Total users=1 do loại 2 admin, trong khi Users liệt kê 3 account. Đã bổ sung mô tả quy tắc đếm.
- Kiểm kê label, tên control, ID trùng và liên kết lỗi ARIA bằng JSDOM trên các màn hình test. Mô tả được xét theo nhiệm vụ, không ép mọi màn hình/nút có tooltip hay meta description.
- Chưa kiểm live Google OAuth, browser push với provider/VAPID thật hoặc quyền notification của thiết bị. Email được chứng minh bằng SMTP/Mailpit local, không xác nhận deliverability tới hộp thư ngoài.
- Chưa có người dùng đại diện thử độc lập, kiểm screen reader thực, toàn bộ contrast/target cho mọi accent, thiết bị touch thật, Safari/Firefox hay field Core Web Vitals. Không tuyên bố đạt WCAG đầy đủ.
- Tính bền vững của focus draft cần localStorage hoạt động; private mode/storage hết chỗ có giới hạn. Không thêm offline cache/PWA.
- Chưa truy cập được Trello/Figma trong phiên; đánh giá dựa trên code/rule và design tokens có trong repository. Notification-only service worker có xung đột rule đã ghi ở AGENTS.md; giữ nguyên tính năng hiện hữu chờ quyết định của chủ dự án.

## Chi tiết 169 testcase HTTP/DB

Mỗi hàng dưới đây tương ứng một `check` trong script; đọc hành động/assertion ngay tại script để tái hiện. Báo cáo ghi lần chạy cuối, không tính các lần chạy lỗi trước khi sửa là PASS.

| ID | Expected | Result |
| --- | --- | --- |
| PUB / | Page has a title, main heading and usable content | PASS |
| PUB /privacy | Page has a title, main heading and usable content | PASS |
| PUB /terms | Page has a title, main heading and usable content | PASS |
| PUB /login | Page has a title, main heading and usable content | PASS |
| PUB /register | Page has a title, main heading and usable content | PASS |
| PUB /forgot-password | Page has a title, main heading and usable content | PASS |
| AUTH guest /today | Guest is redirected to login | PASS |
| AUTH guest /upcoming | Guest is redirected to login | PASS |
| AUTH guest /board | Guest is redirected to login | PASS |
| AUTH guest /calendar | Guest is redirected to login | PASS |
| AUTH guest /habits | Guest is redirected to login | PASS |
| AUTH guest /search | Guest is redirected to login | PASS |
| AUTH guest /focus | Guest is redirected to login | PASS |
| AUTH guest /insights | Guest is redirected to login | PASS |
| AUTH guest /settings/account | Guest is redirected to login | PASS |
| AUTH guest /admin | Guest is redirected to login | PASS |
| AUTH csrf | A POST without a CSRF token is rejected with actionable 403 | PASS |
| AUTH registration errors | Invalid registration keeps email and explains field errors | PASS |
| AUTH registration success | Valid registration creates an account and requires onboarding | PASS |
| AUTH onboarding | Onboarding persists timezone, week start and starter project | PASS |
| AUTH duplicate | Duplicate email is rejected without creating another account | PASS |
| AUTH wrong login | Wrong credentials are rejected | PASS |
| AUTH forgot invalid | Malformed reset email has an inline error | PASS |
| AUTH forgot unknown | Unknown email gets the neutral response | PASS |
| AUTH invalid reset | Invalid or expired reset link returns 410 with recovery | PASS |
| AUTH onboarding skip | Skip uses defaults and does not create a starter project | PASS |
| AUTH reset email delivery | Known-account reset sends a usable link to local Mailpit | PASS |
| SCREEN /today | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /today?date=2026-10-01 | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /today?date=bad | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /upcoming | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /board | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /board?project=inbox | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /calendar?view=day | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /calendar?view=week | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /calendar?view=month | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /calendar?view=bad&date=bad | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /habits | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /habits/new | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /search | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /search?q=nothing-will-match | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /focus | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /insights | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /insights?range=week | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /projects | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /inbox | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /tasks/new | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /events/new | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /settings/profile | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /settings/appearance | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /settings/notifications | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /settings/account | Authenticated screen renders with main heading and private cache policy | PASS |
| SCREEN /settings/account/delete | Authenticated screen renders with main heading and private cache policy | PASS |
| PROJECT empty | Empty project name is rejected inline | PASS |
| PROJECT create | Create project and open its page | PASS |
| PROJECT rename | Rename persists and is reflected in the sidebar | PASS |
| PROJECT rename error | Invalid rename keeps the edit open with a field error and stored name unchanged | PASS |
| PROJECT colour | Valid colour is saved; crafted CSS value is rejected | PASS |
| TASK empty | Quick-add shows inline errors and retains chosen project | PASS |
| TASK project validation | Invalid project is a recoverable 422 and preserves draft | PASS |
| TASK create | Title-only task is owned, open and placed in selected project | PASS |
| TASK validation long title | Invalid quick-add is rejected with 422 and saves no extra task | PASS |
| TASK validation array title | Invalid quick-add is rejected with 422 and saves no extra task | PASS |
| TASK validation partial schedule | Invalid quick-add is rejected with 422 and saves no extra task | PASS |
| TASK validation foreign project | Invalid quick-add is rejected with 422 and saves no extra task | PASS |
| TASK invalid edit | Invalid edit keeps the draft and does not change stored task | PASS |
| TASK update | Task detail saves description, due date, priority and local schedule | PASS |
| BOARD upcoming | Moving column updates completion consistently | PASS |
| BOARD active | Moving column updates completion consistently | PASS |
| BOARD done | Moving column updates completion consistently | PASS |
| BOARD backlog | Moving column updates completion consistently | PASS |
| TASK complete reopen | Complete and reopen change progress and completion flag | PASS |
| TASK repeat daily | Completion makes one next occurrence; duplicate completion and Undo do not duplicate it | PASS |
| TASK repeat weekly | Completion makes one next occurrence; duplicate completion and Undo do not duplicate it | PASS |
| TASK repeat monthly | Completion makes one next occurrence; duplicate completion and Undo do not duplicate it | PASS |
| TASK repeat yearly | Completion makes one next occurrence; duplicate completion and Undo do not duplicate it | PASS |
| TASK repeat until | A repeat ending on this occurrence creates no task beyond the end | PASS |
| TASK reminder preset | Preset reminder is created before scheduled start | PASS |
| TASK reminder move preset | Preset reminder follows a moved task schedule | PASS |
| TASK reminder invalid | Past or malformed reminder shows a useful error and leaves existing reminder intact | PASS |
| TASK reminder custom | Custom reminder persists the users local date and time | PASS |
| TASK reminder undo | Remove and Undo restore a pending reminder | PASS |
| CAL reschedule | Moving time changes UTC schedule and unschedule removes it | PASS |
| TASK delete restore | Soft-delete hides task and Undo restores it | PASS |
| SEARCH find | Search finds owned tasks and excludes another accounts data | PASS |
| SEARCH filters | Project, priority and completed filters include only matching tasks | PASS |
| BOARD project filter | Board project filter excludes tasks from other projects and includes Inbox separately | PASS |
| XSS content | Task titles are escaped as text | PASS |
| HABIT invalid | Missing habit name and invalid frequency are explained inline | PASS |
| HABIT create daily | Each supported frequency creates the correct habit | PASS |
| HABIT create weekdays | Each supported frequency creates the correct habit | PASS |
| HABIT create days | Each supported frequency creates the correct habit | PASS |
| HABIT create timesPerWeek | Each supported frequency creates the correct habit | PASS |
| HABIT edit | Habit detail, edit and month navigation render and save changes | PASS |
| HABIT check-in duplicate | Repeated check-in creates only one history entry | PASS |
| HABIT undo/backfill | Undo removes today; allowed historical day can be checked in | PASS |
| HABIT invalid toggle | Malformed done value cannot silently remove a valid check-in | PASS |
| HABIT future/too-old | Future and more-than-six-days-old check-ins never persist | PASS |
| HABIT archive/restore | Archive preserves history and unarchive restores visibility | PASS |
| HABIT validation no chosen days | Frequency, colour and reminder boundary errors return 422 without saving | PASS |
| HABIT validation zero weekly target | Frequency, colour and reminder boundary errors return 422 without saving | PASS |
| HABIT validation over weekly target | Frequency, colour and reminder boundary errors return 422 without saving | PASS |
| HABIT validation bad colour | Frequency, colour and reminder boundary errors return 422 without saving | PASS |
| HABIT validation bad reminder | Frequency, colour and reminder boundary errors return 422 without saving | PASS |
| EVENT invalid | Invalid time does not save an event and preserves title | PASS |
| EVENT create/edit | Timed event stores timezone-correct times and editable details | PASS |
| EVENT all-day | All-day event spans one local calendar day | PASS |
| EVENT recurring | Recurring event occurrence opens with scope controls | PASS |
| EVENT recurring edit this | Editing the selected scope changes only the intended occurrences | PASS |
| EVENT recurring edit following | Editing the selected scope changes only the intended occurrences | PASS |
| EVENT recurring edit all | Editing the selected scope changes only the intended occurrences | PASS |
| EVENT recurring delete this | Deleting the selected scope preserves or removes the correct part of the series | PASS |
| EVENT recurring delete following | Deleting the selected scope preserves or removes the correct part of the series | PASS |
| EVENT recurring delete all | Deleting the selected scope preserves or removes the correct part of the series | PASS |
| EVENT moved earlier | An occurrence moved before its series start is visible on its new calendar day | PASS |
| EVENT scope unsupported | Single-occurrence edits must not silently discard changes to place or notes | PASS |
| EVENT foreign project | Foreign project is a field error and cannot attach another owners project | PASS |
| FOCUS length | Focus length preference persists | PASS |
| FOCUS early block | Unfinished block is refused | PASS |
| FOCUS save/deduplicate | Finished block saves once and duplicate is idempotent | PASS |
| FOCUS concurrent save | Simultaneous retries cannot create duplicate completed focus blocks | PASS |
| TASK concurrent repeat | Simultaneous completions create only one next repeating task | PASS |
| INSIGHTS chart | Chart selection persists and stats alias points to Insights | PASS |
| EXPORT tasks.csv | CSV export responds with correct media type and attachment | PASS |
| EXPORT habit-checkins.csv | CSV export responds with correct media type and attachment | PASS |
| EXPORT formula injection | CSV escapes spreadsheet formulas and excludes foreign or deleted tasks | PASS |
| ISOLATION GET Project | Another owner cannot read the resource | PASS |
| ISOLATION POST Project | Another owner cannot change/delete the resource | PASS |
| ISOLATION GET Task | Another owner cannot read the resource | PASS |
| ISOLATION POST Task | Another owner cannot change/delete the resource | PASS |
| ISOLATION GET Habit | Another owner cannot read the resource | PASS |
| ISOLATION POST Habit | Another owner cannot change/delete the resource | PASS |
| ISOLATION GET Event | Another owner cannot read the resource | PASS |
| ISOLATION POST Event | Another owner cannot change/delete the resource | PASS |
| REDIRECT external | returnTo cannot redirect outside the application | PASS |
| PROFILE validation | Bad timezone retains typed name and shows a field error | PASS |
| PROFILE save | Profile name and timezone save | PASS |
| PROFILE avatar invalid | A file pretending to be an image is rejected without altering avatar | PASS |
| PROFILE avatar valid | Valid image is re-encoded to a 256px WebP avatar | PASS |
| PROFILE avatar size | Oversize upload explains 2 MB limit and retains existing avatar | PASS |
| APPEARANCE save | Theme, accent, week start and calendar layout persist | PASS |
| NOTIFY invalid | Invalid summary time is an inline error and retains choices | PASS |
| NOTIFY save | Notification settings and summary time persist | PASS |
| NOTIFY push missing | Push test reports unavailable delivery instead of false success | PASS |
| NOTIFY bad subscription | Malformed browser subscription is rejected | PASS |
| NOTIFY unsubscribe/resubscribe | Signed email link changes only the intended account without requiring login | PASS |
| NOTIFY task email job | Due reminder is delivered to local Mailpit once and recorded as sent | PASS |
| NOTIFY habit email job | Due habit reminder is sent once using the users local time | PASS |
| NOTIFY daily summary job | Daily summary is sent once and marks the local day delivered | PASS |
| ADMIN denied | Non-admin cannot read or mutate the admin area | PASS |
| ADMIN screen /admin | Admin page renders without server error | PASS |
| ADMIN screen /admin/users | Admin page renders without server error | PASS |
| ADMIN screen /admin/users?q=peer&status=active | Admin page renders without server error | PASS |
| ADMIN screen /admin/users?page=2 | Admin page renders without server error | PASS |
| ADMIN screen /admin/activity | Admin page renders without server error | PASS |
| ADMIN screen /admin/activity?q=flows | Admin page renders without server error | PASS |
| ADMIN self-lock | Admin cannot lock their own account | PASS |
| ADMIN lock/unlock | Lock revokes sessions, blocks login; unlock permits login again | PASS |
| HABIT delete | Deleting a habit removes its history | PASS |
| EVENT delete | Delete removes the event | PASS |
| PROJECT delete keeps tasks/events | Deleting project moves tasks to Inbox and unassigns events without deleting them | PASS |
| AUTH password validation | Wrong current password cannot change credentials | PASS |
| AUTH change password | Password change keeps this session and revokes a second session | PASS |
| AUTH reset password | Valid reset updates password, invalidates token and logs in | PASS |
| ACCOUNT delete validation | Account deletion requires current password and explicit acknowledgement | PASS |
| ACCOUNT deletion | Deletion removes all owned data and revokes the session | PASS |
| AUTH logout | Logout revokes access and clears session | PASS |
| ERROR unknown route | Unknown address is a real 404 with recovery | PASS |
| SERVER errors | No unexpected server error was hidden behind a passing assertion | PASS |
