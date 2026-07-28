# Setup AI tools trên máy mới

Repo này cấu hình sẵn cho **Claude Code** và **Antigravity** (IDE + CLI `agy`) dùng chung một nguồn
rule. Phần config nằm trong git — `git pull` là đủ. Doc này liệt kê những thứ **nằm ngoài git** phải
làm tay, cộng những cái bẫy đã dính thật.

Mọi kết luận về hành vi tool ở đây **đã chạy thử**, không suy từ tài liệu. Phiên bản kiểm: Claude Code
**2.1.220**.

---

## 1. Kiến trúc config — hiểu trước khi sửa

```
AGENTS.md                     <- NGUỒN DUY NHẤT cho rule chung
├── CLAUDE.md                 <- @AGENTS.md + phần riêng Claude Code
└── hf-medusa-store/AGENTS.md <- con trỏ về file trên (workspace root)

hf-medusa-store/apps/backend/AGENTS.md    <- quy ước backend  ─┐ cả hai tool đọc được
hf-medusa-store/apps/storefront/AGENTS.md <- quy ước storefront ┘
    └── CLAUDE.md cạnh nó chỉ có @AGENTS.md

.agents/                      <- CUSTOMIZATION ROOT của Antigravity
├── skills/                   <- NGUỒN của 5 quy trình + 9 skill nền
├── rules/                    <- protocol + index skill
├── hooks.json + hooks/       <- cưỡng chế §Prohibited (validate-tool-call.mjs)
└── protected-paths.txt       <- đường dẫn cấm ghi (xem §5 về giới hạn)

.claude/
├── commands/                 <- wrapper mỏng, @-import từ .agents/skills/
├── rules/                    <- rule sâu, CHỈ Claude Code đọc
└── settings.json             <- cưỡng chế §Prohibited cho Claude Code
```

**Quy tắc vàng: sửa nội dung ở `AGENTS.md`, `apps/*/AGENTS.md`, `.agents/skills/`. Đừng sửa wrapper.**

### Tool nào đọc file nào

|             | Rule chung                         | Rule theo path                          | Slash command       | Cưỡng chế               |
| ----------- | ---------------------------------- | --------------------------------------- | ------------------- | ----------------------- |
| Claude Code | `CLAUDE.md` (import `AGENTS.md`)   | `.claude/rules/*.md` + `CLAUDE.md` lồng | `.claude/commands/` | `.claude/settings.json` |
| Antigravity | mọi `AGENTS.md` trên đường walk-up | `.agents/rules/`                        | `.agents/skills/`   | `.agents/hooks.json`    |

Hai điều rút ra, và cả hai đều đã gây lỗi thật:

1. **Antigravity không đọc `CLAUDE.md`; Claude Code không đọc `AGENTS.md` trực tiếp** (nó vào qua
   `@AGENTS.md` trong `CLAUDE.md`). Vì thế quy ước tầng app phải nằm ở `apps/*/AGENTS.md` — trước đây
   chúng nằm trong `apps/*/CLAUDE.md` và Antigravity chạy mù ở tầng module/storefront.
2. **`.claude/rules/` chỉ Claude Code đọc được.** Nên body dùng chung của 5 quy trình **không được
   trích** `.claude/rules/*` — chỉ được trích `AGENTS.md`, `apps/*/AGENTS.md`, `docs/team/*`. Chính vì
   thiếu quy tắc này mà hai bản command/skill từng lệch nhau ở cả 5 cặp.

---

## 2. Cài đặt

| Cần         | Ghi chú                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| Node >= 20  | `node -v`                                                                    |
| pnpm 11.8.0 | `corepack enable` rồi `corepack use pnpm@11.8.0`. **Không bao giờ npm/yarn** |
| Docker      | `docker compose up -d` từ **git root** → Postgres `:5433`, Redis `:6380`     |
| Claude Code | https://claude.com/claude-code · `claude --version` >= 2.1.220               |
| Antigravity | https://antigravity.google · CLI `agy` đi kèm                                |

⚠️ **Hai thư mục `hf-medusa-store/` lồng nhau.** Mọi lệnh pnpm/turbo chạy ở thư mục **trong**.
`AGENTS.md` gọi đây là lỗi hay gặp nhất trên repo này.

Script có thật (từ workspace root **trong**): `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`,
`pnpm backend:dev`, `pnpm backend:seed`, `pnpm storefront:dev`.
Từ `apps/backend/`: `pnpm test:unit`, `pnpm test:integration:modules`, `pnpm test:integration:http`,
`pnpm test:voucher:srs`. **Không gọi jest trực tiếp** — các script này set `TEST_TYPE`.

Không có script `typecheck` — **`pnpm build` là type gate**.

---

## 3. Thứ git KHÔNG mang theo

| Việc                              | Chi tiết                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`.env`**                        | Dựng từ `.env.template` trong `apps/backend/` (và `.env.test` từ `.env.test.template`). Không commit `.env`                                                                                                                         |
| **Gate `USE_AGENT_MD`**           | Antigravity → Settings → tìm `agent md` → **bật**. Không bật thì Antigravity mất sạch rule dự án, dù `AGENTS.md` nằm ngay trong repo                                                                                                |
| **`~/.gemini/GEMINI.md`**         | Rule global của Antigravity, tuỳ chọn. Không có thì vẫn chạy                                                                                                                                                                        |
| **Plugin marketplace**            | `.claude/settings.json` khai `medusajs/medusa-agent-skills` và bật `ecommerce-storefront@medusa`. Claude Code tự cài lần đầu                                                                                                        |
| **`.claude/settings.local.json`** | Đã gitignore — state từng máy. Bản trên máy hiện tại **đang tắt 4 command** qua `skillOverrides` (`new-endpoint`, `review-pr`, `scaffold-module`, `seed`), nên máy mới sẽ thấy **11** command còn máy đó chỉ thấy 7. Không phải lỗi |
| **MCP**                           | `.agents/mcp_config.json` là ví dụ, chứa placeholder. `node .agents/hooks/sync-mcp.mjs --check` trước khi làm gì                                                                                                                    |

---

## 4. Cưỡng chế §Prohibited — hai lớp, không đối xứng

### 4.1. Claude Code — `.claude/settings.json`

Ba tầng: `allow` (chạy thẳng), `ask` (hỏi trước), `deny` (chặn cứng).
Lệnh git nguy hiểm nằm ở `ask` chứ không `deny`, vì `AGENTS.md` nói "never without explicit
approval" — tức là _hỏi_, không phải _cấm_. Riêng `git push --force` thì `deny`.

Bốn điều về cú pháp, **đã kiểm trên 2.1.220**, sai là mất tác dụng âm thầm:

| Điều                                                     | Vì sao quan trọng                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Edit(...)` đã phủ `Write`, `MultiEdit`, `NotebookEdit`  | Thêm rule deny `Write(...)` **sinh cảnh báo lúc khởi động** từ 2.1.210+. Đừng viết cặp `Edit`+`Write`                                                                                 |
| Với `deny`/`ask`, pattern một đoạn khớp ở **mọi độ sâu** | `Edit(.medusa/**)` là đủ, không cần `**/.medusa/**`. Đã kiểm: nó chặn được cả `apps/backend/.medusa/server/package.json`                                                              |
| Tiền tố `./` **neo vào project root**                    | `Read(./.env)` **không** bảo vệ `apps/backend/.env` — file thật nằm ở đó, không ở root. Phải viết `Read(.env)` (không có `./`)                                                        |
| 🔴 **Không bao giờ dùng `Read(./.env.*)`**               | Nó khớp cả `.env.template`, file mà `AGENTS.md` yêu cầu commit và người mới cần đọc. Và vì **`deny` thắng `allow` ở mọi scope**, không có cách nào mở lại. Phải liệt kê tên chính xác |

Thêm hai điều hữu ích: deny `Read(...)` **cũng chặn `cat`/`head`/`tail`/`sed` trong Bash** (nhưng
không chặn subprocess tuỳ ý như script python). Và `Bash(npm:*)` **không** khớp `npx` — điều này cố ý,
vì quy ước seed script _bắt buộc_ dùng `npx medusa exec`. Chỉ `npx pnpm` bị chặn.

### 4.2. Antigravity — `.agents/hooks.json`

Hook `PreToolUse` chạy `hooks/validate-tool-call.mjs`. Chín rule: 5 thảm hoạ cấp OS
(`rm -rf /`, `mkfs`, `dd of=/dev/sd*`, format ổ Windows) + 4 cấp project (`git push --force`,
`git reset --hard`, `git clean -f`, `DROP TABLE/DATABASE` qua db client).

**Mọi rule đều neo vào vị trí đầu lệnh** — đầu chuỗi, hoặc ngay sau `;` `&&` `||` `|` `$(`. Không neo
thì guard chặn cả văn bản _nhắc đến_ lệnh, mà repo này đầy doc dạy học trích lệnh nguy hiểm (kể cả
chính file bạn đang đọc). **Backtick cố ý không tính là vị trí đầu lệnh** — trong repo này một backtick
gần như luôn mở inline code của Markdown.

Đánh đổi: `bash -c "git push --force"` lọt qua. Đây là **rào chắn chống tai nạn, không phải sandbox**;
`AGENTS.md § Prohibited` vẫn là hợp đồng chính.

**Contract output:** `deny` khi dính rule, `ask` cho phần còn lại, **không bao giờ** `{}` trần và
**không bao giờ** `allow`. Với Antigravity, thiếu field `decision` bị hiểu là **DENY** — trả `{}` sẽ
chặn sạch mọi lệnh khớp matcher. Có test riêng khoá chuyện này.

### 4.3. 🔴 Giới hạn phải biết trước khi tin vào lớp này

Matcher trong `hooks.json` **chỉ gồm `run_command`**, cố ý không gồm nhóm tool ghi file. Chạy guard
trên nhóm đó nghĩa là mọi lần sửa file đều phải qua guard, mà phần kiểm đường dẫn chỉ là heuristic —
phiền nhiều hơn lợi.

Hệ quả: **`.agents/protected-paths.txt` chỉ được cưỡng chế thật ở Claude Code** qua `permissions.deny`.
Máy nào chỉ chạy Antigravity thì `node_modules/`, `.medusa/`, `.env` chỉ được bảo vệ bằng văn xuôi
`AGENTS.md § Prohibited`. Muốn bật: thêm tên các tool ghi file vào `matcher`; logic guard đã có sẵn.

Danh sách trong `protected-paths.txt` và `permissions.deny` **phải khớp nhau** — sửa một, sửa cả hai.

---

## 5. Verify

```bash
# 1) Hook: 14 test, phải pass hết
node --test .agents/hooks/tests/antigravity.test.mjs

# 2) Hook chặn đúng, và KHÔNG chặn oan
printf '%s' '{"toolCall":{"name":"run_command","args":{"CommandLine":"git push --force"}}}' \
  | node .agents/hooks/validate-tool-call.mjs        # -> {"decision":"deny",...}
printf '%s' '{"toolCall":{"name":"run_command","args":{"CommandLine":"grep -rn \"DROP TABLE\" ."}}}' \
  | node .agents/hooks/validate-tool-call.mjs        # -> {"decision":"ask"}  KHÔNG deny

# 3) Workspace Antigravity hợp lệ (1 WARNING về placeholder MCP là bình thường)
node .agents/hooks/antigravity-doctor.mjs

# 4) Wrapper slash command có nạp được body dùng chung
claude -p "/bugfix probe . Do not use any tool. One line: does your context contain 'Root cause'? YES/NO." \
  --model claude-haiku-4-5-20251001 --allowedTools ""

# 5) Rule tầng app có tự nạp
claude -p "Read hf-medusa-store/apps/backend/medusa-config.ts . One line: does your context contain 'inventing a second style'? YES/NO." \
  --model claude-haiku-4-5-20251001 --allowedTools Read

# 6) Antigravity thấy đủ skill
agy --print --effort low 'Khong dung tool. Liet ke ten cac skill ban thay trong workspace nay.'

# 7) Không hỏng gì — từ workspace root TRONG
pnpm lint
pnpm build
```

Bốn ca cưỡng chế kiểm bằng tay (tất cả đã chạy đúng trên máy hiện tại):

| Thử                                 | Mong đợi                            |
| ----------------------------------- | ----------------------------------- |
| `Read` `apps/backend/.env`          | bị chặn                             |
| `Read` `apps/backend/.env.template` | **đọc được** — đây là ca dễ vỡ nhất |
| `Edit` file trong `.medusa/`        | bị chặn                             |
| `npx --version` / `npm --version`   | npx chạy · npm bị chặn              |

Trong session tương tác: `/context` phải có `CLAUDE.md` ở Memory files · `/doctor` **không cảnh báo**
(rule deny sai dạng sẽ hiện ở đây) · gõ `/` thấy đủ command.

---

## 6. Thêm slash command mới

Tạo **file gốc** `.agents/skills/<tên>/SKILL.md`:

```markdown
---
name: <tên>
description: Mô tả ngắn, hiện trong autocomplete
when_to_use: "Khi nào agent nên tự kích hoạt — viết ở ngôi thứ ba."
allowed-tools: Read, Edit, Glob, Grep, Bash
---

# Tiêu đề

Nội dung quy trình. Diễn đạt input bằng lời, không dùng $ARGUMENTS.
```

Rồi wrapper `.claude/commands/<tên>.md`:

```markdown
---
description: Mô tả ngắn
argument-hint: [cần truyền gì vào]
allowed-tools: ...
---

# Tiêu đề: $ARGUMENTS

@.agents/skills/<tên>/SKILL.md
```

Bốn cái bẫy, tất cả đã dính thật:

- **`$ARGUMENTS` không được thay thế trong `SKILL.md`** — nó sẽ hiện ra nguyên văn. Chỉ dùng ở wrapper.
- **Cú pháp `` !`lệnh` `` không chạy qua `@import`** — muốn nhúng output shell thì đặt ở wrapper và
  khai `allowed-tools`. Xem `.claude/commands/review-diff.md` làm mẫu.
- **Base resolve path của `@import` khác nhau giữa hai loại file** (đã kiểm trên 2.1.220):
  trong **command file** là **project root** → viết `@.agents/skills/<tên>/SKILL.md`;
  trong **`CLAUDE.md`** là **thư mục chứa file đó** → `apps/backend/CLAUDE.md` viết `@AGENTS.md` là
  lấy file cạnh nó, không phải file ở root. Nhầm chỗ này thì import im lặng không nạp.
- **Frontmatter của file được import KHÔNG bị strip** — 4 dòng YAML của `SKILL.md` sẽ hiện dạng text
  trong prompt. Vô hại, nhưng đừng tưởng là lỗi.

Cách kiểm import có chạy: marker `@...` **vẫn hiện nguyên văn cả khi đã nạp thành công**, nên đừng lấy
đó làm dấu hiệu. Chỉ dấu tin cậy là **nội dung file đích có mặt trong prompt**. Và probe kiểu "trả lời
một từ YES/NO" cho kết quả sai — dùng probe có sentinel + hỏi nhiều dòng có cấu trúc.

**Cẩn thận trùng tên với command built-in của Claude Code** (`/review`, `/init`, `/security-review`,
`/simplify`). Đó là lý do command review của repo tên `/review-diff`.

Cuối cùng, cập nhật `.agents/rules/quick-reference.md` (index skill).

---

## 7. Khi kéo skill mới từ AG Kit về

`.agents/` là **fork** của AG Kit `2026.7.27`, upstream update không apply cleanly
(`.agents/README.md § Provenance`). Skill generic của AG Kit đã gây lỗi thật ở repo này — bốn file
từng bị xoá vì **sai ngữ cảnh**, xem mục "Removed on purpose" trong `quick-reference.md`. Tệ nhất là
`tailwind-patterns`: nó dạy Tailwind **v4** trong khi storefront chạy `tailwindcss@^3`, và khuyên
"migrate fully to CSS-first" — tức chủ động phá cấu hình đang chạy tốt.

Nên trước khi giữ một skill kéo về, kiểm ba câu:

1. Nó có nói về **lựa chọn** mà repo đã chốt rồi không? (framework, ORM, test runner, phiên bản
   Tailwind, package manager) → sửa `when_to_use` để neo về stack thật, hoặc bỏ.
2. `when_to_use` của nó có **đè** một trong 5 quy trình của repo không? → bỏ.
3. Nó có trỏ tới workflow/command **không tồn tại** ở repo này không? → sửa hoặc bỏ.

Copy rule sai ngữ cảnh còn tệ hơn không copy: agent sẽ áp ràng buộc không tồn tại, một cách rất tự tin.
