# 🟧 Slide 4 — Hooks: Tự động hóa theo vòng đời

## 🎯 Thông điệp chốt

> ▎ **"Hook là script của DỰ ÁN, tự động chạy tại các mốc vòng đời của Claude Code. Nếu Permission trả lời 'AI ĐƯỢC PHÉP làm gì', thì Hook trả lời 'hệ thống TỰ ĐỘNG làm thêm gì' — chắc chắn chạy, không phụ thuộc vào trí nhớ hay thiện chí của AI."**

*📌 **Ghi chú người thuyết trình — Phân biệt rạch ròi 3 tầng:***
- **`CLAUDE.md` / `rules` = Gợi ý mềm:** AI đọc để biết nên làm gì, nhưng có thể quên.
- **`Permission` = Rào chặn:** Quyết định AI được / không được chạy lệnh.
- **`Hook` = Hành động tự động bằng code:** CLI tự thực thi, chạy 100% mọi lần đúng thời điểm.
- *Câu chốt để nói:* "Đây là cách áp chuẩn team một cách xác định (deterministic) — không dựa vào việc AI có nhớ ra hay không."

---

## 🗣️ Talking points

### 1. Hook là gì?
- Là lệnh shell / script bất kỳ bạn khai báo trong `settings.json`, được CLI tự động kích hoạt tại một sự kiện cụ thể.
- Hook nhận dữ liệu sự kiện qua `stdin` (JSON), và có thể trả về JSON để can thiệp / chặn hành vi tiếp theo.

### 2. Các mốc vòng đời hay dùng (nhấn 3 cái chính trong tên slide)

| Event | Chạy khi nào | Ứng dụng điển hình |
| :--- | :--- | :--- |
| **`SessionStart`** | Khi mở phiên mới | Inject context, kiểm tra môi trường, ghi audit log |
| **`PreToolUse`** | Trước khi chạy tool | Validate & chặn lệnh sai chuẩn / chặn sửa file nhạy cảm |
| **`PostToolUse`** | Sau khi tool chạy xong | Tự động format code (Prettier/ESLint) sau khi sửa file |
| **`UserPromptSubmit`** | Mỗi lần bạn gửi prompt | Tự inject context (ngày giờ, nhánh git hiện tại...) |
| **`Stop` / `SubagentStop`** | Khi AI kết thúc task | Chạy test cuối, gửi thông báo hoàn thành |

### 3. Điểm mạnh cốt lõi (nhấn mạnh)
- **`PreToolUse` có quyền CHẶN:** Hook trả về `"deny"` → lệnh bị hủy trước khi chạy. Đây là lớp phòng thủ chủ động, bổ sung cho Permission.
- **Tính xác định (deterministic):** Việc format, lint, log... xảy ra mọi lần, không cần AI nhớ để làm.
- **Tách biệt trách nhiệm:** Permission = "Được phép làm gì" · Hook = "Tự động làm thêm việc gì".

### 4. `matcher` — Lọc hook theo tool

> ▎ `matcher` quyết định hook chỉ chạy với tool cụ thể (VD `Edit|Write|MultiEdit`, `Bash`). Bỏ trống hoặc `*` = áp dụng cho mọi tool.

### 5. Ứng dụng phổ biến (đọc lướt nhanh)
- ✅ **Tự động format code** sau mỗi lần Claude sửa file.
- ✅ **Chặn sửa file quan trọng:** `.env`, `package-lock.json`, `docker-compose.prod.yml`.
- ✅ **Ghi log** toàn bộ lệnh Claude đã chạy (audit log).
- ✅ **Gửi thông báo** (Slack / Desktop) khi Claude hoàn thành công việc.

### 6. ⚠️ Lưu ý bảo mật (điểm ăn tiền)

> ▎ **Lưu ý bảo mật:** Hook chạy lệnh shell tùy ý với quyền của bạn. Chỉ dùng hook từ nguồn tin cậy và review kỹ trước khi bật — nhất là hook đi kèm plugin/repo của người khác. Hook càng mạnh thì cũng càng là bề mặt rủi ro.

---

## 💡 Ví dụ demo — Code THẬT trong repo `hf-medusa-store`

**① Khai báo hook trong `.claude/settings.json`:**

```json
"hooks": {
  "PostToolUse": [
    {
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [
        {
          "type": "command",
          "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/format.sh\""
        }
      ]
    }
  ]
}
```

**② Script `.claude/hooks/format.sh` — Thiết kế an toàn (trích):**

```bash
#!/usr/bin/env bash
# PostToolUse hook: format the file Claude just edited with Prettier.
# Safe by design: known extensions only, gọi binary Prettier của workspace
# trực tiếp, và KHÔNG bao giờ chặn edit (luôn exit 0).

payload=$(cat)                       # nhận JSON sự kiện qua stdin
file=$(... .tool_input.file_path)    # lấy đường dẫn file vừa sửa
[ -f "$file" ] || exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.json|*.css|*.md)
    "$prettier_bin" --write --ignore-unknown "$file" >/dev/null 2>&1 ;;
esac
exit 0                               # luôn exit 0 → không cản trở Claude
```

> ▎ **"Mỗi lần Claude sửa/tạo file .ts, .tsx, .json... Prettier của chính workspace tự chạy format ngay. Hook được viết 'safe by design': chỉ đụng đuôi file đã biết, và luôn exit 0 để không bao giờ chặn nhầm công việc của AI."**
