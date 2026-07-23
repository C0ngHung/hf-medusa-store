# Bruno API collection — HF Medusa

Bruno collection thay cho Postman (nhẹ hơn, `.bru` plaintext hợp git). Cấu trúc:

```
bruno/
├── bruno.json                  # collection config
├── collection.bru              # auth bearer {{token}} + docs dùng chung
├── environments/local.bru      # biến môi trường (baseUrl, creds, ids…)
├── .env.sample                 # mẫu dotenv (Bruno nạp {{process.env.*}})
├── .env                        # (gitignored) do scripts/sync-env.sh sinh ra
├── scripts/sync-env.sh         # fetch PORT + publishable key → ghi .env
├── Auth/                        # Login admin → tự lưu {{token}}
├── Suggestion Rules (Admin)/    # CRUD suggestion rules (SRS §6.1)
├── Voucher Engine (Admin)/      # Day 4 voucher: create + analytics (3.4.11–13)
└── Store (Suggestions)/         # public store suggestion endpoints
```

## Dùng

1. Mở Bruno → **Open Collection** → chọn thư mục `bruno/` này.
2. `./scripts/sync-env.sh` (từ git root) để sinh `bruno/.env` — tự đọc `PORT` từ backend `.env`
   và fetch **publishable key** từ Postgres đang chạy. Cần docker stack lên + đã `pnpm backend:seed`.
3. Chọn environment **local** (góc trên phải), sửa biến khác nếu cần.
4. Chạy **Auth › Login** trước (lưu `{{token}}` cho các request Admin).

## Environment & .env

- **environments/local.bru** — biến tĩnh (baseUrl, adminEmail/Password, product ids, sessionId).
  Muốn thêm môi trường khác (dev/staging) → tạo `environments/<tên>.bru` rồi chọn ở dropdown.
- **bruno/.env** (gitignored) — chỉ chứa giá trị **secret/động**: `PUBLISHABLE_KEY` (+ `BASE_URL` tuỳ chọn).
  Bruno tự nạp và expose qua `{{process.env.VAR}}`; `local.bru` map `publishableKey: {{process.env.PUBLISHABLE_KEY}}`.
  Sinh lại bất cứ lúc nào bằng `scripts/sync-env.sh`; hoặc copy `.env.sample` → `.env` rồi điền tay.
  Publishable key KHÔNG bao giờ commit (security.md).

Nguồn gốc: convert 1:1 từ `../postman/HF-Medusa-Suggestive-Selling.postman_collection.json`
(`pm.collectionVariables.set` → `bru.setVar`, `pm.response` → `res`, `pm.test` → `test`).
Product ids trong env đổi sau mỗi lần reseed — refresh sau `db:migrate`/`backend:seed`.
