# 🟥 Slide 3 — Permission: Phân quyền Allow / Ask / Deny

## 🎯 Thông điệp chốt

> ▎ **"Permission là luật CỨNG — do Claude Code thực thi, không phải AI tự quyết. CLAUDE.md/rule chỉ định hướng 'AI nên làm gì'; Permission quyết định 'AI được phép làm gì'."**

*📌 **Ghi chú người thuyết trình — Bùng nổ ý "Guidance vs Enforced":***
- **Guidance (Hướng dẫn mềm — `CLAUDE.md` & `rules/`):** Nạp vào context dưới dạng Prompt. AI đọc để *gợi ý nên làm gì*, nhưng AI vẫn có thể quên hoặc làm sai (tuân thủ phụ thuộc vào AI).
- **Enforced (Luật cứng — `permissions` & `hooks` trong `settings.json`):** Thực thi trực tiếp ở **tầng hệ thống CLI (System Level)**. Nếu cấu hình `Deny` lệnh `git push` hay `rm -rf`, hệ thống chặn đứng ngay lập tức — AI **hoàn toàn không thể tự ý vượt qua** dù AI có muốn hay không.

---

## 🗣️ Talking points

### 1. Ba mức phân quyền

| Mức | Hành vi |
| :--- | :--- |
| **Allow** | Tự chạy, không hỏi |
| **Ask** (mặc định) | Hỏi `Y/N` trước khi chạy |
| **Deny** | Chặn hoàn toàn |

### 2. Thứ tự ưu tiên (điểm dễ nói sai — nhấn mạnh)

> ▎ **Rule ưu tiên:** **Deny → Ask → Allow**. Duyệt theo đúng thứ tự này, khớp cái nào trước thì áp cái đó. Độ cụ thể (*specificity*) KHÔNG đổi thứ tự.

*Hệ quả cần nói:*
- Deny rộng như `Bash(aws *)` sẽ chặn luôn cả `Bash(aws s3 ls)` dù có allow riêng → **Deny không mang ngoại lệ allowlist**.
- Deny ở bất kỳ tầng nào (*User / Project / Local*) đều thắng Allow ở tầng khác. Mảng rule được gộp across scopes.

### 3. Cú pháp & Wildcard
- Dạng `Tool(pattern)`: `Bash(npm test:*)` khớp mọi lệnh bắt đầu bằng `npm test`.
- Tool chỉ-đọc (`Read`, `Grep`) trong thư mục làm việc không cần hỏi. `Bash` cũng có sẵn danh sách lệnh read-only chạy tự do.
- Quản lý bằng lệnh `/permissions` — xem mọi rule + nguồn gốc từ file `settings.json` nào.

### 4. Permission Modes (nói nhanh — mở rộng tốc độ làm việc)
- `default`: Hỏi khi cần.
- `acceptEdits`: Tự nhận sửa file + các lệnh filesystem cơ bản (`mkdir`, `mv`, `cp`).
- `plan`: Chỉ nghiên cứu, không sửa.
- `bypassPermissions`: Bỏ qua mọi prompt; chỉ dùng trong môi trường cô lập (*container/VM*). *(Vẫn chặn `rm -rf /` như cầu dao an toàn)*.

### 5. Khuyến nghị bảo mật (nhấn mạnh)

> ▎ **Luôn Deny các lệnh nguy hiểm:** `rm -rf`, deploy thẳng Production, commit/git push thẳng vào `main`.
> 
> ▎ **Tổ chức:** Có thể khóa cứng bằng `disableBypassPermissionsMode` trong managed settings để không ai tự tắt.

---

## 💡 Ví dụ demo (repo thật — `settings.json`)

*Cấu hình ví dụ chiếu code thật lên:*

```json
"permissions": {
  "allow": ["Bash(pnpm test:*)", "Bash(pnpm lint:*)", "Bash(git diff:*)"],
  "deny":  ["Bash(rm -rf:*)", "Bash(git push:*)"]
}
```

> ▎ **"Dự án mình cho chạy test/lint tự do nhưng chặn cứng rm -rf và git push — AI không thể tự push dù muốn."**
