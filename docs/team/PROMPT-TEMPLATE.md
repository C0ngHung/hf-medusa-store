# Prompt template cho repo này

Template 6 thành phần, dùng được cho Claude Code, Antigravity, Cursor, Copilot. Bản này đã chỉnh cho
**hf-medusa-store** (Medusa 2.16 + Next.js 15, pnpm, TypeScript) — lệnh và ví dụ đều là thật.

Viết cho người mới: nếu bạn chưa quen viết prompt, đọc §0 rồi §1 là đủ dùng.

---

## 0. Trước khi dán template — thử slash command đã

Với các task hay gặp thì **đừng dán template**, gõ lệnh cho nhanh. Nội dung quy trình đã nhúng sẵn
CONSTRAINTS và SUCCESS CRITERIA của repo.

| Lệnh                                       | Dùng khi                                            | Antigravity có? |
| ------------------------------------------ | --------------------------------------------------- | --------------- |
| `/bugfix <mô tả>`                          | Đã biết lỗi ở đâu, cần sửa                          | ✅              |
| `/debug <triệu chứng>`                     | Chưa biết nguyên nhân, cần điều tra trước           | ✅              |
| `/feature <mô tả>`                         | Thêm feature mới — nó tự bắt plan trước, chờ duyệt  | ✅              |
| `/refactor <file/module>`                  | Đổi cấu trúc, giữ nguyên behavior                   | ✅              |
| `/review-diff`                             | Review diff chưa commit                             | ✅              |
| `/new-endpoint`                            | Scaffold một REST endpoint dưới `src/api/`          | ❌ Claude-only  |
| `/scaffold-module`                         | Scaffold module backend từ mẫu `suggestive-selling` | ❌ Claude-only  |
| `/review-pr`                               | Review một PR trên GitHub                           | ❌ Claude-only  |
| `/dev-backend`, `/dev-storefront`, `/seed` | Chạy dev server, seed DB                            | ❌ Claude-only  |

Năm lệnh đầu có **một bản gốc duy nhất** ở `.agents/skills/<tên>/SKILL.md`; `.claude/commands/` chỉ là
wrapper. Sửa nội dung thì sửa skill.

> ⚠️ **Việc thuộc VoucherEngine thì không dùng `/feature`.** Dùng skill riêng
> `execute-voucher-engine-tasks` (cho một slice task) hoặc `rebuild-voucher-engine`. Chúng có vòng
> plan → audit → build → verify → lessons riêng chạy theo `.claude/specs/voucher-engine/SPEC.md`.
> Chạy `/feature` song song sẽ tạo hai workflow cạnh tranh nhau.

Template dưới đây dành cho task **không khớp** lệnh nào ở trên.

---

## 1. Template gốc

```markdown
[CONTEXT]
App/Module:
File/Class/Function:
Scope:

[WHY]
Vấn đề hiện tại:
Kết quả mong muốn về mặt nghiệp vụ:

[CONSTRAINTS]

- Không dùng:
- Bắt buộc dùng:
- Convention:

[SUCCESS CRITERIA]

- [ ]
- [ ]

[OUTPUT FORMAT]

- Liệt kê file tạo/sửa trước khi code
- Test:
```

| Section          | Bắt buộc?                 | Mẹo                                                                               |
| ---------------- | ------------------------- | --------------------------------------------------------------------------------- |
| CONTEXT          | ✅                        | Càng hẹp càng tốt. `apps/backend` + tên module + tên hàm ăn hơn mô tả chung chung |
| WHY              | Khi task không hiển nhiên | Giúp agent chọn đúng hướng                                                        |
| CONSTRAINTS      | ✅                        | Viết dạng cấm/buộc. Đây là thứ ngăn agent tự thêm dependency                      |
| SUCCESS CRITERIA | ✅                        | Checkbox đo được **bằng lệnh**. Không đo được thì viết lại                        |
| OUTPUT FORMAT    | Khi cần format cụ thể     | "Liệt kê file trước khi code" là dòng đáng giá nhất                               |

> Phần lớn CONSTRAINTS cố định của repo **đã nằm sẵn** trong `AGENTS.md`, `apps/*/AGENTS.md` và
> `.claude/rules/` — tiền là số nguyên `1 = 1 VND`, làm tròn `Math.floor`, discount tính server-side,
> không thêm dependency khi chưa hỏi, cross-module ref không dùng FK. **Đừng nhắc lại.** Chỉ viết phần
> riêng của task này.

---

## 2. Lệnh dùng trong SUCCESS CRITERIA

Đây là chỗ người mới hay viết sai. Lệnh thật của repo:

| Chạy từ                                       | Lệnh                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| workspace root **trong** (`hf-medusa-store/`) | `pnpm lint` · `pnpm build` · `pnpm test`                                                                    |
| `apps/backend/`                               | `pnpm test:unit` · `pnpm test:integration:modules` · `pnpm test:integration:http` · `pnpm test:voucher:srs` |

Ba điều nhớ:

- **Không có script `typecheck`** — `pnpm build` là type gate.
- **Không gọi jest trực tiếp** — các script trên set `TEST_TYPE`.
- Có **hai** thư mục `hf-medusa-store/` lồng nhau; pnpm chạy ở thư mục **trong**.

Test file đặt ở đâu, tên thế nào: `apps/backend/AGENTS.md` § Tests.

---

## 3. Biến thể theo loại task

### 3.1 Bug fix

```markdown
[CONTEXT]
App: apps/backend
File/Function: **\_\_**
Repro: **\_\_**
Log/Stack trace:

---

[WHY]
Triệu chứng user gặp:
Đã thử gì rồi (để agent khỏi lặp lại):

[CONSTRAINTS]

- Chỉ sửa trong phạm vi file/function nêu trên. KHÔNG refactor rộng.
- Không đổi public API hay signature của hàm export.
- Không thêm dependency.

[SUCCESS CRITERIA]

- [ ] Repro steps không còn tái hiện lỗi
- [ ] `pnpm test:unit` xanh (từ apps/backend/) — test hiện có vẫn pass
- [ ] Thêm 1 regression test cho đúng case này
- [ ] `pnpm lint` sạch

[OUTPUT FORMAT]

- Giải thích root cause bằng 2-3 câu TRƯỚC khi sửa
- Diff tối thiểu
```

### 3.2 Feature mới

```markdown
[CONTEXT]
App: **\_\_**
File mẫu cần bám theo: **\_\_** (backend module mới -> src/modules/suggestive-selling/)

[WHY]
User story: Là **\_\_**, tôi muốn **\_\_** để **\_\_**

[CONSTRAINTS]

- Bám đúng pattern của file mẫu ở trên
- Không thêm dependency khi chưa hỏi
- Cross-module reference dùng model.text() + Link Module, KHÔNG dùng DB foreign key

[SUCCESS CRITERIA]

- [ ] Happy path: **\_\_**
- [ ] Edge case: **\_\_** (giỏ hàng/voucher thì luôn có: mutation đồng thời, Redis vắng mặt)
- [ ] Error state: message rõ ràng, không fail im lặng
- [ ] Unit test cho core logic
- [ ] `pnpm lint` + `pnpm build` sạch

[OUTPUT FORMAT]

- Bước 1: trình bày plan + danh sách file, DỪNG chờ tôi duyệt
- Bước 2: mới implement
```

### 3.3 Refactor

```markdown
[CONTEXT]
Target: **\_\_**
Phạm vi được phép chạm: **\_\_**
Phạm vi CẤM chạm: **\_\_**

[WHY]
Lý do refactor:

[CONSTRAINTS]

- Behavior giữ nguyên 100% — đây là refactor, không phải rewrite
- Không đổi public API
- Làm từng bước nhỏ, mỗi bước test vẫn xanh
- Nếu target chưa có test: viết test cho behavior HIỆN TẠI trước, xanh rồi mới refactor

[SUCCESS CRITERIA]

- [ ] Toàn bộ test pass, KHÔNG sửa test để nó pass
- [ ] Không có thay đổi hành vi quan sát được từ bên ngoài
- [ ] Nói cụ thể cái gì đã tốt hơn — "gọn hơn" không phải câu trả lời

[OUTPUT FORMAT]

- Liệt kê các bước refactor theo thứ tự trước khi làm
```

### 3.4 Debug (chưa biết nguyên nhân)

```markdown
[CONTEXT]
Triệu chứng: **\_\_**
Xảy ra khi: **\_\_** / KHÔNG xảy ra khi: **\_\_**
Môi trường: **\_\_** (local docker-compose / CI / có Redis hay không)

[CONSTRAINTS]

- KHÔNG sửa code cho tới khi xác định được root cause
- Đưa giả thuyết trước, kèm cách kiểm chứng từng cái

[SUCCESS CRITERIA]

- [ ] Liệt kê 3-5 giả thuyết, xếp theo xác suất
- [ ] Với mỗi giả thuyết: cách verify nhanh nhất
- [ ] Chốt root cause có bằng chứng (trích file:dòng), không đoán
```

---

## 4. Ví dụ hoàn chỉnh (điền thật)

```markdown
[CONTEXT]
App: apps/backend
Module: voucher-engine
File/Function: StackingEngine — hàm tính discount breakdown
Scope: Thêm nhánh xử lý khi giỏ hàng chỉ còn 1 item sau khi user xoá item khác

[WHY]
Hiện khi user xoá item, voucher vẫn giữ mức giảm tính theo giỏ cũ, nên tổng tiền
sai và có lúc âm. Cần tính lại từ đầu theo giỏ hiện tại.

[CONSTRAINTS]

- KHÔNG thêm dependency
- StackingEngine phải giữ nguyên là pure function, không I/O
- Không đổi signature của hàm đang export
- Thứ tự discount giữ nguyên: item promotion -> voucher -> cap 50% toàn cục;
  khi vượt cap thì CHỈ giảm voucher, không giảm item promotion
- Số nguyên toàn bộ, làm tròn Math.floor

[SUCCESS CRITERIA]

- [ ] Xoá item xong, tổng tiền tính lại từ giỏ hiện tại, không bao giờ âm
- [ ] Ba fixture SRS hiện có vẫn khớp ĐẾN TỪNG ĐỒNG (xem .claude/rules/testing.md)
- [ ] discount_capped / cap_explanation set đúng
- [ ] Unit test cho cả 3 case trên
- [ ] `pnpm test:unit` + `pnpm test:voucher:srs` xanh (từ apps/backend/)
- [ ] `pnpm lint` + `pnpm build` sạch (từ workspace root trong)

[OUTPUT FORMAT]

- Liệt kê file tạo/sửa trước khi code
- Giải thích root cause trước khi sửa
```

---

## 5. Lỗi hay gặp

| ❌ Sai                               | ✅ Sửa                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| "Fix lỗi voucher"                    | "`apps/backend`, StackingEngine trả tổng âm khi giỏ còn 1 item sau khi xoá item khác" |
| "Làm cho nó nhanh hơn"               | "Giảm thời gian `GET /store/carts/:id` từ 800ms xuống dưới 200ms"                     |
| "Viết clean code"                    | "Mỗi hàm dưới 30 dòng, không nested ternary"                                          |
| Nhồi 5 task vào 1 prompt             | Tách từng prompt riêng, chạy tuần tự                                                  |
| Không nói cấm gì                     | Luôn có ít nhất 1 dòng "KHÔNG dùng..."                                                |
| `mvn test` / `npm test`              | `pnpm test:unit` từ `apps/backend/`                                                   |
| Success criteria mơ hồ               | Checkbox đo được bằng lệnh                                                            |
| Lặp lại rule đã có trong `AGENTS.md` | Chỉ viết phần riêng của task                                                          |

---

## 6. Rules file theo tool

Template trên là **prompt cho từng task**. Ngoài ra mỗi tool còn đọc **rules file** tự động mỗi phiên,
để bạn khỏi lặp lại CONSTRAINTS hoài. Chi tiết ở [SETUP-AI-TOOLS.md](./SETUP-AI-TOOLS.md) §1.

Repo này đã dựng sẵn: constraints viết **một lần** ở `AGENTS.md` (và `apps/*/AGENTS.md` cho phần theo
app), các tool khác trỏ về.

---

## 7. Cheatsheet

```
CONTEXT: app nào, module nào, hàm nào
WHY: vì sao cần làm
CONSTRAINTS: cấm gì, buộc gì (đừng lặp AGENTS.md)
SUCCESS: checkbox đo được, kèm lệnh pnpm thật
OUTPUT: liệt kê file trước khi code
```
