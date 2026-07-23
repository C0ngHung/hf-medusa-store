# 🟦 Slide 1 — `CLAUDE.md`: Bộ nhớ / "Hiến pháp" dự án

## 🎯 Thông điệp chốt

> ▎ **"CLAUDE.md là file luôn được nạp tự động vào đầu mỗi phiên — bản 'hiến pháp' / 'onboarding doc' mà mọi phiên làm việc của Claude đều đọc trước."**

---

## 🗣️ Talking points

### 1. Nó là gì & khi nào được đọc
- File markdown chứa chỉ dẫn riêng cho dự án: lệnh build/test, quy ước code, kiến trúc, các rule "luôn luôn làm X".
- Được nạp vào context ngay đầu mỗi session (khác `skill`/`rule` — chỉ nạp khi cần).

### 2. Tạo nhanh & chỉnh sửa
- `/init` → Claude tự quét dự án và sinh bản nháp `CLAUDE.md`.
- `/memory` → mở/sửa `CLAUDE.md` ngay trong phiên.
- `/context` → kiểm tra file đã nạp chưa.

### 3. Best practice: giữ NGẮN
- Khuyến nghị `< 200` dòng (dài hơn vẫn nạp đủ nhưng AI tuân thủ kém đi).
- **Mẹo docs:** Cái gì chỉ cần cho một số task → tách sang `skill` hoặc `rule` có `paths:`, đừng nhồi hết vào `CLAUDE.md`.
- **Mẹo thực chiến:** Claude sai cùng 1 lỗi 2 lần → thêm 1 rule vào `CLAUDE.md` để sửa vĩnh viễn.

### 4. Có 4 TẦNG (nạp từ rộng → hẹp, tầng hẹp đọc sau nên thắng)

| Tầng | Vị trí | Cho ai |
| :--- | :--- | :--- |
| **Managed (tổ chức)** | `/etc/claude-code/CLAUDE.md` | IT áp toàn công ty, không ai tắt được |
| **User** | `~/.claude/CLAUDE.md` | Cá nhân, mọi dự án |
| **Project** | `./CLAUDE.md` (hoặc `.claude/CLAUDE.md`) | Cả team, commit chung |
| **Local** | `./CLAUDE.local.md` | Cá nhân trong 1 dự án, gitignore |

> ▎ **Nói:** "Cả các tầng cùng được nạp, không merge từng dòng; khi mâu thuẫn → tầng cụ thể hơn thắng (Project thắng User, Local thắng Project)."

### 5. Hai ý nâng cao (hợp đúng dự án)
- **Monorepo — `CLAUDE.md` lồng nhau:** File ở thư mục cha nạp ngay lúc mở; file trong thư mục con chỉ nạp khi Claude đụng file trong đó. *(Dự án mình có 2 folder `hf-medusa-store` lồng nhau → đúng cơ chế này).*
- **`@import`:** `CLAUDE.md` kéo file khác vào bằng `@path/to/file` (tối đa 4 tầng). *Lưu ý: không tiết kiệm context — file vẫn nạp lúc launch, chỉ gọn về tổ chức.*

### 6. Câu chốt (nối sang slide Hooks)

> ▎ **"CLAUDE.md là guidance, không phải luật — Claude đọc như một user message, không đảm bảo tuân thủ 100%. Cái gì bắt buộc phải chạy (vd trước mỗi commit) → dùng Hook, không dựa vào CLAUDE.md."**

---

## 💡 Ví dụ demo (repo thật)

> ▎ **"CLAUDE.md dự án mình ghi rõ 'dùng pnpm, tiền tệ là số nguyên với Math.floor' → Claude tự viết đúng chuẩn team mà không cần nhắc lại mỗi lần."**
