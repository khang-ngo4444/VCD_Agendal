---
name: apply-hci-web-design
description: Apply human-computer interaction principles when designing, implementing, or reviewing website interfaces and user flows. Use for web usability, navigation, forms, feedback, error recovery, accessibility, and task-based UX decisions. Do not use for purely decorative asset creation or backend-only work.
---

# Apply HCI in website design

Thiết kế theo cách con người hiểu, tìm thông tin, ra quyết định, thao tác và sửa sai. Tối ưu khả năng hoàn thành nhiệm vụ, công sức, lỗi và sự hài lòng; không dùng vẻ đẹp hoặc conversion làm bằng chứng duy nhất về chất lượng UX.

Áp dụng hướng dẫn trong phạm vi yêu cầu. Giữ mục tiêu sản phẩm, hệ thống thiết kế và ràng buộc dự án. Khi có xung đột, giải thích đánh đổi và chọn giải pháp theo nhiệm vụ, bối cảnh và rủi ro. Không mở rộng phạm vi thay đổi khi chưa có căn cứ từ yêu cầu.

## Quy ước áp dụng

- **Phải / Không được:** yêu cầu bắt buộc trong phạm vi và điều kiện được nêu.
- **Nên / Ưu tiên:** hướng giải quyết mặc định; chỉ thay đổi khi có căn cứ theo bối cảnh.
- **Khi / Nếu:** điều kiện kích hoạt quy tắc; không áp dụng ngoài điều kiện đó.
- Phân biệt yêu cầu của tiêu chuẩn, khuyến nghị thiết kế và quyết định riêng của dự án. Không trình bày khuyến nghị như yêu cầu tiêu chuẩn.
- Suy ra giải pháp từ nhiệm vụ và ràng buộc thực tế. Không tự bổ sung nội dung nghiệp vụ, thành phần giao diện hoặc luồng ngoài phạm vi cần giải quyết.

## Workflow

### 1. Xác định nhiệm vụ và phạm vi

- Xác định người dùng chính, việc họ cần hoàn thành, điểm bắt đầu, kết quả mong muốn và bối cảnh thiết bị/mạng.
- Phân biệt dữ kiện đã biết với giả định. Nếu thiếu thông tin nhưng có thể tiếp tục, ghi giả định ngắn; chỉ hỏi khi câu trả lời có thể thay đổi đáng kể giải pháp.
- Khi làm với sản phẩm có sẵn, xem luồng và component hiện tại trước khi đề xuất thay đổi.
- Xác định tiêu chí đánh giá khả năng hoàn thành độc lập, công sức, lỗi, khả năng phục hồi và sự hài lòng theo nhiệm vụ. Không đặt ngưỡng khi chưa có căn cứ.

### 2. Thiết kế luồng và nội dung

- Phác luồng chính cùng nhánh lỗi, quay lại, hủy và phục hồi. Đưa thông tin cần cho quyết định tới trước thời điểm cam kết.
- Dùng các quy tắc bên dưới để chọn cấu trúc, component và hành vi.
- Khi có nhiều phương án hợp lý, chọn phương án có lý do rõ theo nhu cầu người dùng; không ép thành công thức cố định.

### 3. Triển khai hoặc đặc tả đủ hành vi

- Khi thiết kế, phải đặc tả trạng thái và tương tác cần thiết cho việc triển khai.
- Khi triển khai, phải ưu tiên thành phần sẵn có phù hợp, cấu trúc ngữ nghĩa và hành vi tương tác có thể tiếp cận.
- Khi đánh giá, phải phân biệt phát hiện đã xác minh với vấn đề nghi ngờ; liên kết phát hiện với ảnh hưởng và điều kiện kiểm chứng.

### 4. Kiểm tra theo phạm vi và mức rủi ro

- Thử nhiệm vụ cốt lõi từ đầu đến cuối; thêm nhánh lỗi, quay lại và hủy liên quan đến thay đổi.
- Chọn kiểm tra thủ công, công cụ hoặc người dùng phù hợp với đầu ra và tài nguyên thực có.
- Báo rõ đã kiểm tra gì, bằng phương pháp nào, còn gì chưa xác minh. Không tự tuyên bố đã user-test hoặc đạt WCAG nếu chưa có bằng chứng.

## Rules

### A. Mental model, information architecture và nhận thức

1. **Dùng ngôn ngữ của người dùng.** Nhãn phải mô tả rõ đối tượng, hành động hoặc kết quả. Không sử dụng thuật ngữ nội bộ hoặc từ mơ hồ khi chưa xác minh người dùng hiểu đúng.
2. **Nhóm nội dung theo nhiệm vụ.** Không sao chép cơ cấu phòng ban thành menu nếu người dùng không tìm thông tin theo cách đó.
3. **Cho biết vị trí và đường đi.** Tiêu đề, trạng thái điều hướng và đường quay về phải giúp người vào trực tiếp trang sâu tiếp tục nhiệm vụ. Dùng breadcrumb khi cấu trúc phân cấp cần nó.
4. **Ưu tiên nhận biết hơn ghi nhớ.** Phải cung cấp thông tin liên quan tại điểm ra quyết định. Không buộc người dùng ghi nhớ hoặc chuyển thông tin giữa các bước khi hệ thống có thể duy trì thông tin đó.
5. **Giảm mơ hồ ở mỗi lựa chọn.** Người dùng phải nhận biết được ý nghĩa và dự đoán được kết quả thao tác. Đánh giá công sức toàn luồng thay vì chỉ số lượng thao tác.
6. **Hỗ trợ đọc lướt và đọc sâu.** Phải phân cấp nội dung theo ý nghĩa và mức quan trọng. Đưa thông tin cần cho nhiệm vụ tới vị trí có thể nhận biết trước khi xử lý chi tiết.
7. **Tiết lộ thông tin theo nhu cầu.** Nên trì hoãn thông tin chưa cần thiết để giảm tải nhận thức. Phải cung cấp điều kiện, giới hạn và hậu quả liên quan trước khi người dùng cam kết.

### B. Tương tác, phản hồi và quyền kiểm soát

8. **Làm rõ vùng có thể thao tác.** Thành phần tương tác phải có tín hiệu nhận biết phù hợp với phương thức nhập. Không phụ thuộc duy nhất vào trạng thái khi trỏ chuột.
9. **Giữ nhất quán về ý nghĩa và hành vi.** Cùng hành động dùng cùng nhãn và quy ước. Ưu tiên pattern đã quen thuộc khi không có lý do nhiệm vụ để thay đổi.
10. **Phân cấp hành động theo bước hiện tại.** Phải phân biệt mức ưu tiên và hậu quả của các hành động. Số lượng và vị trí hành động phải xuất phát từ nhiệm vụ, không từ một giới hạn cố định.
11. **Đặc tả các trạng thái có liên quan.** Phải xác định trạng thái và chuyển tiếp trạng thái theo vòng đời thực tế của thành phần. Không bổ sung trạng thái thiếu mục đích hoặc thiếu hành vi xác định.
12. **Phản hồi ngay khi hệ thống nhận thao tác.** Khi đang chờ, cho biết tiến trình hoặc tình trạng phù hợp; xử lý nguy cơ gửi lặp mà vẫn cho phục hồi khi lỗi.
13. **Kết thúc tác vụ rõ ràng.** Phải xác nhận kết quả thực tế, thông tin cần duy trì và bước tiếp theo nếu có. Không biểu thị hoàn tất khi kết quả xử lý chưa được xác minh.
14. **Giữ công sức khi quay lại hoặc sửa.** Bảo toàn dữ liệu hợp lệ và lựa chọn liên quan; không bắt làm lại vì lỗi ở một trường khác.
15. **Hỗ trợ kiểm soát và phục hồi.** Phải cung cấp cơ chế ngăn sai sót hoặc phục hồi tương xứng với hậu quả. Chỉ yêu cầu xác nhận khi việc xác nhận giúp giảm rủi ro; không tạo bước cản trở thiếu mục đích.

### C. Forms và phòng lỗi

16. **Chỉ hỏi thông tin có mục đích.** Phân biệt bắt buộc và tùy chọn; giải thích khi yêu cầu nhạy cảm hoặc bất ngờ.
17. **Giữ nhãn nhìn thấy sau khi nhập.** Liên kết label với control; placeholder không thay label. Đặt định dạng và hướng dẫn gần trường liên quan.
18. **Ngăn lỗi trước khi báo lỗi.** Dùng input type, giới hạn và gợi ý sát dữ liệu; chấp nhận biến thể định dạng hợp lý, kể cả dữ liệu dán vào.
19. **Lỗi phải nói được cách sửa.** Chỉ rõ vấn đề bằng chữ, gắn với trường tương ứng, giữ phần đã nhập đúng. Với form dài, cân nhắc tóm tắt lỗi có liên kết tới từng trường.
20. **Tái sử dụng dữ liệu trong cùng quy trình.** Cho tự điền hoặc chọn lại thông tin đã cung cấp khi phù hợp; xét ngoại lệ thiết yếu, bảo mật và thông tin không còn hợp lệ.
21. **Hỗ trợ xác thực có thể tiếp cận.** Không cản trở công cụ hỗ trợ nhập hoặc quản lý thông tin xác thực. Phải đánh giá yêu cầu nhận thức, phương án hỗ trợ và khả năng phục hồi trong toàn bộ quy trình xác thực theo tiêu chí áp dụng.

### D. Khả năng tiếp cận và responsive

Dùng WCAG 2.2 AA làm mục tiêu kỹ thuật mặc định nếu dự án không chỉ định khác. AA bao gồm các tiêu chí A và AA. Các mục dưới là những điểm kiểm quan trọng, không thay toàn bộ tiêu chuẩn hoặc nhu cầu người khuyết tật.

22. **Thao tác được bằng bàn phím.** Phải hỗ trợ thao tác bàn phím theo quy ước của thành phần và không tạo bẫy bàn phím. Khi giao diện thay đổi ngữ cảnh, phải quản lý và khôi phục focus hợp lý. Chỉ áp dụng ngoại lệ theo bản chất tác vụ và tiêu chí tiêu chuẩn.
23. **Focus nhìn thấy và đi đúng thứ tự.** Phải duy trì chỉ báo focus nhìn thấy và thứ tự focus bảo toàn ý nghĩa, khả năng thao tác. WCAG 2.4.11 AA yêu cầu thành phần nhận focus không bị nội dung do tác giả tạo che kín. Nên giữ toàn bộ thành phần nhận focus nhìn thấy; yêu cầu không bị che bất kỳ phần nào thuộc WCAG 2.4.12 AAA.
24. **Dùng semantics và tên có nghĩa.** Ưu tiên HTML native; phân biệt link điều hướng với button thực hiện hành động. Cung cấp tên, vai trò và trạng thái cho control; thông báo trạng thái cần được công nghệ hỗ trợ nhận biết phù hợp.
25. **Đo tương phản.** Phải kiểm tra tỷ lệ tương phản theo loại nội dung và ngoại lệ của tiêu chí. WCAG AA quy định tối thiểu 4.5:1 cho chữ thông thường và 3:1 cho chữ lớn; chữ lớn từ 18pt thường hoặc 14pt đậm. Thông tin thị giác cần thiết để nhận biết thành phần tương tác, trạng thái và đồ họa phải đạt 3:1 với màu kề khi thuộc phạm vi tiêu chí tương phản phi văn bản.
26. **Không chỉ dùng màu.** Lỗi, trạng thái và thông tin quan trọng cần thêm chữ, hình dạng hoặc tín hiệu tương đương. Ảnh mang thông tin cần text alternative theo mục đích; ảnh thuần trang trí cần được xử lý phù hợp.
27. **Đo hit area và khoảng cách.** WCAG 2.5.8 AA dùng mốc 24×24 CSS px, với ngoại lệ khoảng cách, inline, control tương đương, mặc định trình duyệt và thiết yếu. Target nhỏ phải được đánh giá đúng phép thử khoảng cách của tiêu chuẩn. Ưu tiên khoảng 44×44 CSS px cho thao tác touch thường xuyên khi phù hợp; 44px thuộc tiêu chí AAA có ngoại lệ riêng, không phải mức AA chung.
28. **Giữ khả năng phóng to và tái bố trí nội dung.** Không được vô hiệu hóa khả năng phóng to của người dùng. Nội dung cuộn dọc phải dùng được ở chiều rộng tương đương 320 CSS px, không mất thông tin hoặc chức năng và không cần cuộn hai chiều, trừ phần đáp ứng ngoại lệ bố cục hai chiều của tiêu chuẩn.
29. **Chọn điểm đổi bố cục theo nội dung.** Phải xác định điểm đổi bố cục từ khả năng đọc và thao tác. Kiểm tra tính liên tục của bố cục trên phạm vi kích thước, độ dài nội dung, ngôn ngữ và phương thức nhập liên quan; không chỉ kiểm tại các kích thước thiết kế cố định.
30. **Hỗ trợ kiểm soát nội dung động.** Khi có chuyển động, phát tự động hoặc cập nhật tự động, phải đánh giá khả năng giảm chuyển động, dừng và tạm dừng theo tiêu chí áp dụng. Không làm khả năng hiểu thông tin phụ thuộc vào hiệu ứng.

### E. Hiệu năng và lựa chọn có hiểu biết

31. **Giữ ổn định khi tải và tương tác.** Phải kiểm soát thay đổi bố cục và duy trì tính toàn vẹn của thao tác khi xử lý bất đồng bộ. Phải quản lý dữ liệu chưa hoàn tất và nguy cơ thực hiện lặp theo mức rủi ro khi kết nối gián đoạn.
32. **Đo trải nghiệm tốc độ thực.** Mục tiêu Core Web Vitals “good”: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 tại phân vị 75, tách mobile/desktop. Dùng field data để đánh giá, lab để chẩn đoán; nếu chưa có field data, báo thiếu bằng chứng. Không đồng nhất Lighthouse score với usability hoặc bảo đảm SEO.
33. **Bảo đảm quyết định có đủ thông tin.** Phải công bố thông tin trọng yếu trước thời điểm quyết định. Không trình bày thông tin sai lệch, tạo áp lực giả hoặc định hướng lựa chọn bằng cách che giấu hậu quả.
34. **Bảo toàn quyền từ chối và hủy.** Người dùng phải nhận biết và thực hiện được các lựa chọn này khi chúng thuộc phạm vi dịch vụ. Không cố ý tăng công sức hoặc gây hiểu nhầm để cản trở lựa chọn.
35. **Giới hạn thu thập dữ liệu.** Phải xác định mục đích đo lường trước khi ghi dữ liệu và chỉ thu thập trong phạm vi cần thiết. Không để thông tin xác thực hoặc dữ liệu nhạy cảm bị ghi nhận ngoài mục đích và cơ chế bảo vệ đã xác định.

### F. Kiểm chứng

36. **Test nhiệm vụ, không hướng dẫn click.** Đưa mục tiêu thực tế, quan sát người đại diện hoàn thành độc lập, mắc lỗi, cần trợ giúp hoặc bỏ dở. Kiểm lại sau khi sửa.
37. **Kết hợp phương pháp.** Heuristic review, công cụ tự động, kiểm tra thủ công và thử với người dùng có điểm mạnh khác nhau. Không dùng kết quả của một phương pháp để thay bằng chứng mà nó không cung cấp.
38. **Ưu tiên theo hậu quả.** Cân nhắc mức cản trở, số nhóm bị ảnh hưởng, tần suất và khả năng phục hồi. Sau phát hành, theo dõi lỗi và công sức cùng với conversion.

## Ràng buộc suy luận

- Không áp giới hạn số lượng hoặc cấu trúc cố định khi chưa có yêu cầu tiêu chuẩn hay bằng chứng phù hợp với tác vụ.
- Không suy rộng kết quả nghiên cứu vượt phạm vi mẫu, phương pháp và bối cảnh đã kiểm tra.
- Không biến mô hình nhận thức hoặc quy luật tương tác thành thông số giao diện tuyệt đối ngoài điều kiện của mô hình.
- Không hy sinh tính dễ hiểu, quyền kiểm soát hoặc khả năng tiếp cận chỉ để giảm số bước hoặc giảm số thành phần thị giác.

## Checklist trước khi bàn giao

Chọn mục liên quan đến phạm vi thay đổi. Nếu chưa kiểm được, ghi rõ thay vì đánh dấu đạt.

- [ ] Người dùng biết vị trí hiện tại, việc cần làm và kết quả hành động.
- [ ] Luồng chính hoàn thành được; nhánh lỗi, hủy và quay lại giữ dữ liệu hợp lý.
- [ ] Loading, empty, success và error có hành vi rõ khi áp dụng.
- [ ] Form có label, hướng dẫn, lỗi cụ thể và khả năng sửa.
- [ ] Bàn phím, focus, semantics, contrast, target và reflow đã được kiểm phù hợp.
- [ ] Thiết bị hẹp, nội dung dài, mạng yếu và thao tác touch được xét.
- [ ] Thông tin trọng yếu và quyền lựa chọn được trình bày rõ trước quyết định.
- [ ] Có phân biệt bằng chứng, giả định và phần chưa kiểm chứng.

## Cách trình bày kết quả

Điều chỉnh độ chi tiết theo yêu cầu; không buộc đầu ra nhỏ thành báo cáo dài.

- **Thiết kế/triển khai:** đưa giải pháp, lý do HCI cho quyết định quan trọng, trạng thái cần thiết và kết quả kiểm tra thực có.
- **Review:** với mỗi phát hiện, nêu vị trí → hành vi hoặc bằng chứng → hậu quả → sửa đề xuất → cách xác nhận. Ưu tiên lỗi có ảnh hưởng thực tế, tránh danh sách sở thích thẩm mỹ.
- **Brief:** ghi người dùng, tác vụ, ràng buộc, hành vi mong muốn và điều kiện nghiệm thu quan sát được.

Khi cần phân mức vấn đề, phải dùng quy ước của dự án. Nếu chưa có quy ước, xác định mức ưu tiên theo hậu quả, phạm vi ảnh hưởng và khả năng phục hồi; không gán cách phân mức nội bộ cho tiêu chuẩn bên ngoài.

## Nguồn để đối chiếu khi cần

Đây là bộ hướng dẫn tổng hợp, không phải trích nguyên văn sách. Nền tảng sách được tham khảo qua lời tựa, chương mẫu và tài liệu tác giả công khai; không tuyên bố đã đọc toàn văn. Chỉ tra thêm khi cần xác minh yêu cầu, ngoại lệ hoặc nội dung đã thay đổi.

- Norman, *The Design of Everyday Things*, revised edition, 2013: [trang sách](https://jnd.org/books/the-design-of-everyday-things-revised-and-expanded-edition/), [lời tựa](https://jnd.org/preface-design-of-everyday-things-revised-edition/).
- Shneiderman và cộng sự, *Designing the User Interface*, 6th edition, 2016: [Eight Golden Rules](https://www.cs.umd.edu/users/ben/goldenrules.html).
- Rogers, Sharp và Preece, *Interaction Design*, 6th edition, 2023: [chương mẫu Wiley](https://catalogimages.wiley.com/images/db/pdf/9781119901099.excerpt.pdf).
- Krug, *Don't Make Me Think, Revisited*, 3rd edition, 2014: [chương mẫu 4](https://sensible.com/downloads/DMMT-Revisited-sample-chapter.pdf).
- [Nielsen: Usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), [GOV.UK: User needs](https://www.gov.uk/service-manual/user-research/start-by-learning-user-needs).
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [WAI: Forms](https://www.w3.org/WAI/tutorials/forms/), [Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum/).
- [web.dev: Web Vitals](https://web.dev/articles/vitals), [W3C: Ethical Web Principles](https://www.w3.org/TR/ethical-web-principles/).
