# 🟩 Slide 6 — Custom Commands: Tự tạo lệnh riêng cho team

## 🎯 Thông điệp chốt

> ▎ **"Custom Command = Một file Markdown = Một lệnh `/tên-lệnh` do bạn tự định nghĩa. Không cần code, không cần build — viết prompt một lần, commit vào `.claude/commands/`, cả team gõ được ngay."**

*📌 **Ghi chú người thuyết trình:***
- **Sự đơn giản bất ngờ:** Tạo một lệnh riêng cho cả team dùng chỉ tốn đúng một file `.md`.
- **Quy tắc đặt tên:** Tên file quyết định tên lệnh (`review-pr.md` → `/review-pr`). Đặt trong thư mục con sẽ tự động thành namespace (`.claude/commands/db/seed.md` → `/db:seed`).
- **Nối tiếp Slide 5:** Slash Command là "menu lệnh" (gõ `/`), còn Custom Command là "phần bạn tự viết thêm vào menu đó".

---

## 🗣️ Talking points

### 1. Cấu trúc một Custom Command

Một file `.md` gồm 2 phần rõ ràng:

| Phần | Vai trò |
| :--- | :--- |
| **Frontmatter** (giữa `--- ---`) | Metadata: `description`, `argument-hint`, `allowed-tools`, `model`... |
| **Body** (nội dung Markdown) | Chính là prompt được nạp vào context khi gọi lệnh |

### 2. Các "vũ khí" khi viết command (nhấn mạnh)
- **`$ARGUMENTS`:** Chèn tham số người dùng truyền vào *(vd: `/review-pr 42` → `$ARGUMENTS` = `42`)*. Dùng `$1`, `$2` để tách từng tham số riêng biệt.
- **`allowed-tools`:** Giới hạn quyền của command (bảo mật): chỉ cho phép đúng những tool cần thiết.
- **Tiền tố `!`:** Chạy lệnh bash và nhét trực tiếp kết quả vào prompt *(VD: `!git status`)*.
- **Tiền tố `@`:** Chèn trực tiếp nội dung file vào prompt *(VD: `@src/config.ts`)*.

### 3. Phạm vi (Scope)

| Phạm vi | Đường dẫn | Dùng khi |
| :--- | :--- | :--- |
| **Personal** | `~/.claude/commands/` | Lệnh cá nhân, dùng ở mọi dự án |
| **Project** | `.claude/commands/` | Lệnh của team, commit vào repo → ai clone về cũng có |

### 4. Khi nào nên tạo Custom Command?
- ✅ **Quy trình lặp lại nhiều lần** *(scaffold module, review PR, seed data...)*.
- ✅ **Cần cả team làm giống nhau** *(chuẩn hóa thao tác)*.
- ✅ **Prompt dài, nhiều bước** *(ngại gõ lại thủ công mỗi lần)*.

---

## 💡 Ví dụ demo — Command THẬT trong repo `hf-medusa-store`

Repo đã có sẵn **6 lệnh** team tự tạo: `/dev-backend`, `/dev-storefront`, `/seed`, `/new-endpoint`, `/scaffold-module`, `/review-pr`.

**Chiếu file `new-endpoint.md` — đóng gói cả convention tạo REST endpoint:**

```yaml
---
description: Scaffold a Medusa REST endpoint (admin or store) under src/api/
argument-hint: <admin|store>/<route-path> [methods: GET,POST,…]
allowed-tools: Read, Write, Edit, Bash(ls:*), Bash(find:*), Grep
---
Scaffold a Medusa REST route for `$ARGUMENTS` in the backend.

Parse `$ARGUMENTS`: first token is the route path, MUST start with `admin/`
or `store/`. An optional trailing token lists HTTP methods (default GET).

Steps:
1. Create .../api/<path>/route.ts với handler cho mỗi method, dùng type
   `MedusaRequest, MedusaResponse`. Bám theo style route đang có sẵn.
2. Route non-trivial: scaffold thêm `validators.ts` (Zod) + `helpers.ts`.
3. Resolve service qua `req.scope.resolve(<MODULE>_MODULE)` — không tự
   khởi tạo service. KHÔNG bịa business logic, để lại `// TODO`.
```

> ▎ **"Gõ `/new-endpoint store/wishlist GET,POST` — Claude tạo đúng cấu trúc route theo convention Medusa của team: dùng đúng type, resolve service đúng cách, không bịa logic. Toàn bộ 'know-how' tạo endpoint được đóng gói trong 1 file, khỏi cần onboarding thủ công cho dev mới. Chú ý `allowed-tools` chỉ cho phép Read/Write/Edit + vài lệnh đọc — command không thể chạy git hay lệnh nguy hiểm."**
