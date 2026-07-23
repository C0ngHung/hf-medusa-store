# 🟨 Slide 5 — Slash Commands: Đóng gói quy trình lặp lại

## 🎯 Thông điệp chốt

> ▎ **"Slash Command biến một prompt dài lặp đi lặp lại thành một lệnh gõ tắt `/tên-lệnh`. Viết quy trình MỘT LẦN, commit vào repo → cả team gọi cùng một lệnh, ra cùng một chuẩn."**

*📌 **Ghi chú người thuyết trình:***
- Gõ `/` trên terminal để hiện toàn bộ danh sách lệnh — gồm cả lệnh built-in (`/clear`, `/model`, `/permissions`...) lẫn lệnh custom của team.
- **Bản chất rất đơn giản:** Mỗi command chỉ là 1 file Markdown (`.md`). Nội dung file chính là prompt được nạp khi bạn gọi lệnh. Không cần code, không cần cài đặt gì thêm.
- **Ý cần nhấn:** Đây là cách "chuẩn hóa thao tác con người" — thay vì mỗi dev gõ prompt mỗi kiểu, cả team dùng `/review-pr` giống nhau → kết quả nhất quán.

---

## 🗣️ Talking points

### 1. Vấn đề nó giải quyết
- Bạn cứ phải gõ lại cùng một hướng dẫn dài mỗi lần: *"Review PR theo checklist team..."*, *"Scaffold endpoint theo convention..."*.
- **Giải pháp:** Đóng gói thành 1 file, gọi bằng 1 lệnh ngắn, không gõ lại prompt dài.

### 2. Cách hoạt động — Chỉ là file Markdown
- File `.md` đặt trong thư mục `commands/`, tên file = tên lệnh (`review-pr.md` → `/review-pr`).
- 2 phạm vi hoạt động:

| Phạm vi | Đường dẫn | Áp dụng cho |
| :--- | :--- | :--- |
| **Personal** | `~/.claude/commands/` | Mọi dự án của bạn |
| **Project** | `.claude/commands/` | Chỉ dự án hiện tại *(commit vào repo → cả team cùng dùng)* |

### 3. Các thành phần trong 1 command (nhấn mạnh)
- **Frontmatter (Metadata ở đầu file):**
  - `description`: Mô tả hiển thị khi người dùng gõ `/`.
  - `argument-hint`: Gợi ý tham số cần truyền.
  - `allowed-tools`: Giới hạn tool command được phép dùng *(bảo mật nâng cao)*.
- **`$ARGUMENTS`:** Chèn tham số người dùng truyền vào *(vd: `/review-pr 42` → `$ARGUMENTS` = `42`)*.
- **Mở rộng:** Có thể chạy bash bằng tiền tố `!`, hoặc chèn nội dung file bằng `@đường-dẫn`.

### 4. Phân biệt với Skills (dễ nhầm — nói rõ)

> ▎ **Phân biệt:** **Slash Command** = Bạn chủ động gõ tay để chạy một quy trình. **Skill** = Kiến thức / hướng dẫn Claude tự động nạp khi thấy phù hợp. Command nằm ở `.claude/commands/`, Skill nằm ở `.claude/skills/`.

---

## 💡 Ví dụ demo — Command THẬT trong repo `hf-medusa-store`

**① Command đơn giản nhất — `dev-backend.md`:**

```yaml
---
description: Start the Medusa backend dev server
---
Start the backend in the background: `cd hf-medusa-store && pnpm backend:dev`.
Report the local URL once serving.
```

> ▎ Gõ `/dev-backend` là Claude tự động khởi động server backend.

**② Command đầy đủ — `review-pr.md` (đóng gói cả checklist review):**

```yaml
---
description: Review a GitHub pull request against this repo's conventions
argument-hint: <pr-number-or-url>
allowed-tools: Bash(git:*), Bash(gh pr view:*), Bash(gh pr diff:*), Read, Grep
---
Review pull request `$ARGUMENTS` for the hf-medusa-store repo.

1. Fetch it: `gh pr view $ARGUMENTS` and `gh pr diff $ARGUMENTS`...
2. Assess the diff against the repo's rules (Conventional Commits,
   module conventions, @dtc/* imports, no committed .env, tests...).
3. Output findings grouped by severity (Blocker / Should-fix / Nit),
   each with file:line. Do NOT push or comment unless asked — just report.
```

> ▎ **"Chỉ cần gõ /review-pr 42. Cả checklist review chuẩn của team — Conventional Commits, quy ước module, cấm commit .env, cách đặt tên test — được nạp tự động. Không ai phải nhớ, không ai review sót. Chú ý dòng allowed-tools: command này chỉ được đọc và chạy lệnh git/gh, không được sửa file."**
