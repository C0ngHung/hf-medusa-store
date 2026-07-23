Prompt Implement Runtime Foundation - Suggestive Selling (MedusaJS)

Đọc kỹ toàn bộ tài liệu (SRS, SPEC, API Contract, Solution Define) trước khi bắt đầu. Chỉ hiện thực các task thuộc Runtime Foundation của module Suggestive Selling, tuân thủ đúng kiến trúc MedusaJS v2 và coding style của project.

Yêu cầu chung
1. Tuân thủ SPEC tuyệt đối
Không tự ý thay đổi business rule.
Không tự thêm tính năng ngoài SPEC.
Mọi quyết định phải bám theo SRS/SPEC/API Contract.
Mỗi class/function nên comment requirement tương ứng (SPEC / BR / SUGG / D / SF).

2. Tuân thủ architectural pattern
Không hardcode logic vào controller/service.
Luôn dùng Repository để query data.
Sử dụng Service/Manager layer đúng purpose.
Áp dụng Dependency Injection đúng chuẩn.
3. Performance & Security
Luôn tối ưu query (join đúng cách, index hợp lý).
Không load toàn bộ data khi không cần.
Input validation + sanitize nghiêm ngặt.
Áp dụng rule MedusaJS chuẩn.
4. Logging
Sử dụng Logger chuẩn MedusaJS.
Log có context (orderId, customerId, productId, ruleId, etc).
Các error phải đủ chi tiết để debug dễ dàng.
Không log sensitive data (PII, tokens, credit card).
5. Error Handling
Nên throw DomainError với error code chuẩn.
Controller catch error và trả response đúng format.
Không return lỗi lòng vòng (n-levels nested).
6. Code Style
Tuân thủ TypeScript chuẩn.
Không return lỗi kiểu generic (return error object có message và type).
7. Testability
Mỗi method nên nhỏ, focus, dễ unit test.
Sử dụng interfaces cho các dependency.
Không hardcode business rule bên trong service.

 Kiến trúc

Giữ đúng kiến trúc MedusaJS:

module
models
services
workflows
evaluator
constants
utilities

Logic nghiệp vụ phải được tách khỏi I/O.

Những phần có thể unit test phải là pure function.