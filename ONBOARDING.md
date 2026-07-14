# Onboarding — HF Badminton Store (MedusaJS v2)

Hướng dẫn cho thành viên mới **pull `main` về và chạy được** backend + data mẫu.

- Backend: MedusaJS **2.16.0** (thư mục `hf-medusa-store/apps/backend`)
- Storefront: Next.js (`hf-medusa-store/apps/storefront`)
- Hạ tầng: Postgres `:5433` + Redis `:6380` (container riêng của dự án — **không** đụng `:5432/:6379` của máy)

---

## 0. Yêu cầu

- Docker + Docker Compose
- Node ≥ 20, `pnpm` (repo pin `pnpm@11.8.0` — `corepack enable` là có)

## 1. Hạ tầng (Postgres + Redis)

```bash
cd team-medusa-store        # thư mục repo (chứa docker-compose.yml)
docker compose up -d        # postgres:5433, redis:6380
docker compose ps           # kiểm tra 2 container "healthy/up"
```

## 2. Cài dependencies

```bash
cd hf-medusa-store
pnpm install
```

## 3. Cấu hình `.env` cho backend

```bash
cd apps/backend
cp .env.template .env
```

Sửa trong `.env`:

- `JWT_SECRET`, `COOKIE_SECRET`: chuỗi bất kỳ (dev).
- `AUTH_MFA_ENCRYPTION_KEY`: sinh bằng `openssl rand -hex 32`.
- `S3_*`: **chỉ cần khi muốn upload ảnh mới** lên S3. Bỏ trống → Medusa dùng local file, app vẫn chạy.

> `.env` **không** commit (đã gitignore). Ports/URLs mặc định trong `.env.template` đã khớp docker-compose.

## 4. Tạo bảng + seed catalog (tự động)

```bash
npx medusa db:migrate
```

`db:migrate` chạy migrations **và tự chạy** `src/migration-scripts/initial-data-seed.ts`, file này
**chain toàn bộ seed theo thứ tự** — một lệnh là xong, không phải chạy từng script:

1. Catalog: Store (VND) + region Vietnam + sales channel + publishable API key + **9 category, 30 sản phẩm** kèm ảnh S3
2. SuggestiveSelling: 6 mapping Tier-2 (`Rackets→Strings/Grips/Bags`, `Shoes→Socks/Insoles`, `Shuttlecocks→Tubes`) + Tier-1 product rules + bulk mapping + **4 cart rule CR-01…CR-04** kèm điều kiện (chạy section "Bạn có thể cần thêm" trên giỏ — thiếu chúng thì giỏ không hiện gợi ý)
3. VoucherEngine: voucher configs + global cap 50%
4. Customers: 3 account demo (xem [DEMO_SCENARIOS.md](./DEMO_SCENARIOS.md))
5. Orders: đơn mẫu cho 3 account
6. Job top-seller: aggregate order → `category_top_seller` (Tier-2 ranking từ đơn hàng thật)

> Idempotent: nếu DB đã seed (đã có "Default Sales Channel") thì **toàn bộ** bước seed tự bỏ qua.
> Mỗi seed con vẫn chạy tay được (vd `npx medusa exec ./src/scripts/seed-suggestive-selling.ts`).

## 5. Dữ liệu & kịch bản demo

Các kịch bản demo tính năng (top-seller/Tier-2, tài khoản demo, cron, cache…) gom riêng ở **[DEMO_SCENARIOS.md](./DEMO_SCENARIOS.md)** — đây chỉ là phần cài đặt/chạy.

## 6. Tạo tài khoản admin

```bash
npx medusa user -e admin@admin.com -p 'supersecret'
```

## 7. Chạy backend

```bash
cd ../..            # về gốc hf-medusa-store
pnpm backend:dev    # http://localhost:9009/app
```

---

## Storefront (tuỳ chọn)

Cần publishable API key (seed đã tạo sẵn):

1. Vào `http://localhost:9009/app` → **Settings → Publishable API Keys** → copy key.
2. `apps/storefront/.env.local`: đặt `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<key>` và `MEDUSA_BACKEND_URL=http://localhost:9009`.
3. Chạy: `pnpm storefront:dev` → `http://localhost:8008`.

---

## Lỗi hay gặp

- **`ENOSPC: file watchers reached`** khi chạy **backend + storefront cùng lúc**: giới hạn `inotify` của Linux thấp. Cách an toàn: khi làm API chỉ chạy backend một mình. (Storefront đã cấu hình webpack + ignore `node_modules`.)
- **Port bận (`EADDRINUSE :::9009`)**: đã có backend chạy — tắt bớt hoặc `PORT=9019 npx medusa develop`.
- **Ảnh không hiển thị ở storefront**: URL ảnh là S3 public — kiểm tra `apps/storefront/next.config.js` cho phép host `*.s3.*.amazonaws.com` (đã cấu hình sẵn).

---

## Làm lại DB từ đầu (wipe)

Medusa 2.16 không có `db:reset`. Xoá sạch:

```bash
docker exec hf_medusa_postgres psql -U hfmedusa -d postgres -c "DROP DATABASE IF EXISTS hfmedusa WITH (FORCE);"
docker exec hf_medusa_postgres psql -U hfmedusa -d postgres -c "CREATE DATABASE hfmedusa OWNER hfmedusa;"
# rồi chạy lại bước 4 (db:migrate — tự chain hết seed) + bước 6 (tạo admin)
```

---

## Lệnh hay dùng

| Việc                             | Lệnh (trong `apps/backend`)                                  |
| -------------------------------- | ------------------------------------------------------------ |
| Migrate + seed TẤT CẢ (chain)    | `npx medusa db:migrate`                                      |
| Seed suggestive (chạy tay)       | `npx medusa exec ./src/scripts/seed-suggestive-selling.ts`   |
| Seed voucher (chạy tay)          | `npx medusa exec ./src/scripts/seed-voucher-engine.ts`       |
| Seed customer demo               | `npx medusa exec ./src/scripts/seed-customers.ts`            |
| Seed order demo                  | `npx medusa exec ./src/scripts/seed-orders.ts`               |
| Build top-seller từ order        | `npx medusa exec ./src/scripts/run-topseller-job.ts`         |
| Seed top-seller synthetic        | `npx medusa exec ./src/scripts/seed-category-top-sellers.ts` |
| Tạo admin                        | `npx medusa user -e <email> -p <pass>`                       |
| Sinh migration sau khi sửa model | `npx medusa db:generate suggestiveSelling`                   |
| Chạy backend (từ gốc)            | `pnpm backend:dev`                                           |
| Chạy storefront (từ gốc)         | `pnpm storefront:dev`                                        |
