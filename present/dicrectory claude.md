# Slide: Cấu trúc thư mục `.claude/`

## 🎯 Thông điệp mở đầu (1 câu chốt)

> ▎ **".claude/ là nơi Claude Code đọc mọi cấu hình dành riêng cho dự án. Có 2 tầng: tầng dự án (.claude/ trong repo — commit để cả team dùng chung) và tầng cá nhân (~/.claude/ ở home — áp cho mọi dự án, không bao giờ commit)."**

*Đây là ý quan trọng nhất — nhấn mạnh project vs global trước, rồi mới đi vào từng file.*

---

## Ý 1 — Phân biệt CỐT LÕI: "Guidance" vs "Enforced"

*Đây là điểm nhiều người hiểu sai, nên nói kỹ:*

| Loại | File | Bản chất |
| :--- | :--- | :--- |
| **Guidance** (AI đọc làm gợi ý, có thể không theo) | `CLAUDE.md`, `rules/` | Chỉ dẫn |
| **Enforced** (Claude Code ép chạy, dù AI muốn hay không) | `settings.json` (`permissions`, `hooks`) | Bắt buộc |

> ▎ **Câu dẫn:** "Muốn AI nên làm gì → viết vào `CLAUDE.md`/`rules`. Muốn chắc chắn chặn hoặc tự động chạy → dùng `permissions`/`hooks` trong `settings.json`."

---

## Ý 2 — 3 file nằm ở GỐC repo, KHÔNG nằm trong `.claude/`

*Lưu ý này hay bị nhầm — slide nên tách rõ:*
- `CLAUDE.md` — "hiến pháp" dự án, nạp tự động mỗi phiên (nên `< 200` dòng).
- `.mcp.json` — khai báo MCP server dùng chung cho cả team (secret dùng biến môi trường `${TOKEN}`, không hardcode).
- `.worktreeinclude` — liệt kê file gitignored (vd `.env`) cần copy vào worktree mới.

---

## Ý 3 — Bên trong `.claude/` (tầng dự án, commit chung)

| Mục | Vai trò | Điểm nhấn khi nói |
| :--- | :--- | :--- |
| `settings.json` ✅committed | `permissions`, `hooks`, `statusLine`, `model`, `env` | Cấu hình được thực thi, không phải gợi ý |
| `settings.local.json` 🚫gitignored | Override cá nhân cho riêng dự án này | Ghi đè `settings.json`, không commit |
| `rules/` | Chỉ dẫn tách theo chủ đề | Có `paths:` → chỉ nạp khi mở file khớp (tiết kiệm context). Không có `paths:` → nạp như `CLAUDE.md` |
| `skills/` | Prompt tái sử dụng, gọi bằng `/tên` | Mỗi skill = 1 thư mục có `SKILL.md` + file phụ đính kèm |
| `commands/` | Prompt 1 file, gọi `/tên` | Legacy — docs khuyến nghị dùng `skills/` cho cái mới; skill trùng tên sẽ ưu tiên hơn command |
| `agents/` | Sub-agent (context window riêng) | Giới hạn quyền qua `tools:`; gọi bằng `@tên` (repo mình có `EXPLORER`, `MEDUSA`) |
| `workflows/` | Script điều phối nhiều sub-agent | Do Claude sinh ra, lưu từ `/workflows` |
| `output-styles/` | Đổi phong cách trả lời | Thường để ở global, chỉ đặt đây nếu team dùng chung |
| `agent-memory/` | Bộ nhớ bền của sub-agent | Chỉ tạo khi agent được khởi tạo / sử dụng |

---

## Ý 4 — Tầng cá nhân `~/.claude/` (áp cho MỌI dự án)

*Nói lướt, đối xứng với tầng dự án:*
- `.claude.json` — trạng thái app + UI (theme, OAuth, MCP cá nhân), quản qua `/config`.
- `CLAUDE.md` / `settings.json` — sở thích & mặc định cá nhân.
- `keybindings.json`, `themes/` — phím tắt, giao diện.
- `projects/<project>/memory/` — auto memory: Claude tự ghi chú qua từng phiên (bạn không tự viết).
- Còn lại `rules/`, `skills/`, `commands/`, `agents/`, `workflows/` — phiên bản cá nhân, dùng ở mọi dự án.

---

## Ý 5 — Quy tắc ưu tiên (nói 1 câu, rất quan trọng)

> ▎ "Khi trùng key: managed settings → CLI flag → `settings.local.json` → project `settings.json` → global `settings`. (Lưu ý: với danh sách như `permissions.allow`) thì gộp tất cả tầng; với giá trị đơn (như model) thì lấy tầng cụ thể nhất."

Và với `CLAUDE.md`: global + project cùng được nạp (không merge từng key), khi mâu thuẫn thì project thắng.

---

## 💡 Câu chốt slide

> ▎ "Tóm lại: `.claude/` biến Claude thành một thành viên hiểu văn hóa team — commit tầng dự án để chia sẻ riêng, và nhớ rằng `permissions`/`hooks` là luật cứng, `CLAUDE.md`/`rules` là hướng dẫn mềm."

---

# Slide demo: `.claude/` thật trong dự án `hf-medusa-store`

## Cây thư mục thật (rút gọn để trình chiếu)

```text
hf-medusa-store/
├── CLAUDE.md                    ← "hiến pháp" dự án (ở gốc repo, không nằm trong .claude/)
└── .claude/
    ├── settings.json            ✅ committed — permissions + hooks + plugins
    ├── settings.local.json      🚫 gitignored — override cá nhân
    ├── rules/                   5 file: coding · medusa · security · testing · project-conventions
    ├── skills/                  2 skill (mỗi cái có references/ đính kèm)
    │   ├── execute-voucher-engine-tasks/SKILL.md
    │   └── rebuild-voucher-engine/SKILL.md
    ├── commands/                6 lệnh: dev-backend · seed · new-endpoint · review-pr · …
    ├── hooks/format.sh          script auto-format sau khi sửa file
    ├── specs/voucher-engine/    ⚙️ tự chế: SPEC.md (nguồn sự thật)
    ├── lessons/voucher-engine/  ⚙️ tự chế: 14 bài học đúc kết khi code
    └── progress/                ⚙️ tự chế: theo dõi tiến độ từng phase
```

---

## Điểm nhấn 1 — `settings.json`: Luật CỨNG có thật

*Đây là ví dụ sống, chiếu code thật lên:*

```json
"permissions": {
  "allow": ["Bash(pnpm test:*)", "Bash(git diff:*)", "Bash(grep:*)"],
  "deny":  ["Bash(rm -rf:*)", "Bash(git push:*)"]     ← chặn xóa & push
},
"hooks": { 
  "PostToolUse": [{ 
    "matcher": "Edit|Write",
    "command": ".claude/hooks/format.sh" 
  }] 
}                                                     ← tự format mỗi lần sửa
```

> ▎ **Câu dẫn:** "Dự án này chặn `git push` và `rm -rf` ở tầng cấu hình — AI không thể tự push dù muốn. Đó là 'enforced', khác hoàn toàn với gợi ý trong `CLAUDE.md`."

*Còn khai báo plugins (`medusa-dev`, `ecommerce-storefront`) cũng nằm đây → chứng minh ý "plugin = bundle cài sẵn".*

---

## Điểm nhấn 2 — `rules/`: Tách `CLAUDE.md` theo chủ đề

> ▎ "CLAUDE.md gốc chỉ ~200 dòng, phần chi tiết được tách ra 5 rule: `coding.md` (tiền = số nguyên, Math.floor), `security.md` (rate-limit 429), `testing.md`, `medusa.md`, `project-conventions.md`. Đúng best-practice docs: CLAUDE.md dài quá thì tách sang rules/."

---

## Điểm nhấn 3 — `skills/`: Mỗi skill = 1 thư mục + file phụ

> ▎ "Không phải 1 file — skill `execute-voucher-engine-tasks` là cả thư mục: `SKILL.md` là entrypoint, kèm `references/` (`testing.md`, `workflow.md`, `spec-sync.md`…) mà Claude chỉ đọc khi cần. Đây chính là điểm skill hơn command: đóng gói kèm tài liệu."

---

## Điểm nhấn 4 — Thư mục "tự chế" (điểm khác biệt để khoe) ⚙️

> ▎ "3 thư mục `specs/`, `lessons/`, `progress/` không có trong chuẩn Claude Code — team tự tạo và cho skill của mình đọc. `specs/` là nguồn sự thật của VoucherEngine, `lessons/` lưu 14 bài học đã đúc kết (vd: 'không đặt tên field prefix `raw_`'), `progress/` bám tiến độ. Cho thấy `.claude/` mở rộng tự do được, không bó buộc."

---

## Đối chiếu với slide gốc (nói 1 câu cho khớp)

> ▎ "Slide trước mình vẽ có `agents/` (`EXPLORER`, `MEDUSA`) và `workflows/` — repo này chưa tạo file agent riêng; `EXPLORER`/`MEDUSA` là subagent do plugin/hệ thống cấp, không phải file trong `.claude/agents/`. Nên nếu chiếu cây thật thì bỏ 2 nhánh đó, hoặc ghi chú 'đến từ plugin'."

---

## 💡 Chốt slide

> ▎ ".claude/ của dự án này = cấu hình chuẩn (settings, rules, skills, commands, hooks) + phần mở rộng riêng (specs, lessons, progress) để phục vụ VoucherEngine. Commit hết để cả 4 dev cùng dùng một 'bộ não chung'."



