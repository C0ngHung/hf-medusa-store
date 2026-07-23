# 🟩 Slide 2 — Project Rules: "Nội quy team" mà AI phải theo

## 🎯 Thông điệp chốt

> ▎ **"Project Rules biến một AI chung chung thành thành viên hiểu văn hóa code của team — quy tắc áp cho mọi phiên làm việc trên dự án."**

---

## 🗣️ Talking points

### 1. Rule gồm những gì (nội dung nên đặt)
- **Style & Stack:** Coding style, thư viện bị cấm / được ưu tiên *(vd: dùng Tailwind thay CSS thuần)*.
- **Git Conventions:** Chuẩn commit message (*Conventional Commits*), quy tắc đặt tên branch.
- **Workflows:** Quy trình bắt buộc *(vd: chạy Linter trước commit, không push thẳng main)*.

> ▎ **Mẹo vàng:** Rule phải cụ thể, kiểm chứng được. *"Luôn dùng hàm fetch"* tốt hơn *"viết code sạch"*. Rule tốt = giảm số lần phải sửa tay.

### 2. Đặt rule ở đâu — 2 cách
- **Gộp trong `CLAUDE.md`:** Cho vài rule ngắn.
- **Tách ra `.claude/rules/`:** Mỗi chủ đề 1 file *(nên làm khi `CLAUDE.md` gần chạm 200 dòng)*.
  - **Cấp dự án:** `./.claude/rules/` *(commit chung)*.
  - **Cấp cá nhân:** `~/.claude/rules/` *(nạp trước rule dự án → rule dự án ưu tiên hơn)*.

### 3. Điểm "ăn tiền": Nạp có điều kiện theo `paths:`

| Loại rule | Khi nào nạp |
| :--- | :--- |
| **Không có `paths:`** | Nạp ngay đầu phiên, ngang hàng `CLAUDE.md` |
| **Có `paths:` (glob)** | Chỉ nạp khi Claude ĐỌC file khớp pattern → **tiết kiệm context** |

*Ví dụ cấu hình rule có `paths:`:*

```yaml
---
paths:
  - "src/api/**/*.ts"
---
# API Design Rules
- Mọi endpoint phải validate input bằng Zod
- Trả về đúng dạng { data } | { error }
```

> ▎ **Nói:** "Rule test chỉ nạp khi Claude đụng file test, rule API chỉ nạp khi sửa API — không nhồi hết vào context mọi lúc."

- **Bonus:** 
  - Hỗ trợ brace expansion gộp nhiều đuôi 1 dòng: `"src/**/*.{ts,tsx}"`.
  - Thư mục con tự nhận diện: `.claude/rules/frontend/react.md`.
  - Hỗ trợ symlink để chia sẻ rule chung giữa các dự án.

---

## 💡 Ví dụ demo (repo thật)

> ▎ **"Dự án mình tách CLAUDE.md thành 5 rule theo chủ đề:"**
> - `coding.md` — tiền tệ = số nguyên, `Math.floor`
> - `security.md` — rate-limit 5 lần fail/15' → 429
> - `testing.md` · `medusa.md` · `project-conventions.md`
>
> ▎ **→ `CLAUDE.md` gốc gọn, mỗi rule sống riêng, dễ bảo trì.**

*(Lưu ý: Câu "rule là guidance, không phải luật" để dành bung ở Slide 3 — Permissions & Hooks, tránh lặp lại).*
