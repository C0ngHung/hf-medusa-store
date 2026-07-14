# DEMO SCENARIOS — HF BADMINTON STORE

File tổng hợp **các kịch bản demo**. Mỗi mục = 1 tính năng cần trình diễn: mục tiêu → dữ liệu → các bước → kết quả kỳ vọng. Bổ sung dần các scenario khác (voucher, cart-level CR-01..04, one-tap add…).

> **Chuẩn bị chung:** backend chạy (`pnpm backend:dev` → http://localhost:9009), DB đã `db:migrate`
> (bước này **tự chain toàn bộ seed** — catalog → suggestive → voucher → customers → orders →
> job top-seller, xem [ONBOARDING.md](./ONBOARDING.md)). Store endpoint cần header
> `x-publishable-api-key` (lấy key ở Admin → Settings → Publishable API Keys, hoặc bảng `api_key`).

## Tài khoản demo (dev-only, KHÔNG phải secret)

| Email                | Mật khẩu      | Tên       |
| -------------------- | ------------- | --------- |
| `conghung@gmail.com` | `supersecret` | Cong Hung |
| `ngocthuc@gmail.com` | `supersecret` | Ngoc Thuc |
| `congson@gmail.com`  | `supersecret` | Cong Son  |

Login lấy token (test luồng theo khách, vd filter đã-mua-30-ngày 2.3.4):

```
POST http://localhost:9009/auth/customer/emailpass   { "email": "...", "password": "supersecret" }
→ { "token": "<JWT>" }
```

Rồi gọi store endpoint kèm 2 header: `Authorization: Bearer <JWT>` + `x-publishable-api-key: <pak>`.

---

## 1. Top-Seller / Tier-2 Category-Complement Backfill (SUGG-001, SPEC A.6)

**Mục tiêu:** khi 1 sản phẩm có **< 3 gợi ý Tier-1 (manual)**, hệ thống backfill bằng **top-seller của các category bổ trợ** — và thứ tự top-seller **lấy từ đơn hàng thật**: `order` → job `compute-category-top-sellers` → bảng `category_top_seller` → evaluator xếp hạng.

### Dữ liệu

`db:migrate` đã seed sẵn (customers + orders + chạy job). Muốn seed lại thủ công (trong `apps/backend`):

```bash
npx medusa exec ./src/scripts/seed-customers.ts       # 3 account demo
npx medusa exec ./src/scripts/seed-orders.ts          # đơn mẫu (17 units) cho 3 account
npx medusa exec ./src/scripts/run-topseller-job.ts    # aggregate order → category_top_seller
```

> Cold-start không có order: `npx medusa exec ./src/scripts/seed-category-top-sellers.ts` (snapshot
> tổng hợp giả). `run-topseller-job` **ghi đè** snapshot; nếu chạy cả hai, order là nguồn thắng.

### Các bước demo (Postman)

1. **Product kích hoạt backfill:** `lining-axforce-80` (chỉ 2 Tier-1 manual → thiếu slot).
   Trong Postman collection `HF-Medusa-Suggestive-Selling` dùng biến `tier2ProductId`, request
   **"GET product suggestions — Tier-2 backfill"**.
2. Kết quả kỳ vọng: **5 gợi ý = 2 `manual` + 3 `category`**; nhóm `category` xếp theo `sales_count`
   từ order:

   ```
   1. [manual]   lining-no1-string
   2. [manual]   victor-gr262-grip
   3. [category] yonex-bg65            (bán 6)
   4. [category] yonex-pro-bag-92026   (bán 4)
   5. [category] yonex-ac102-towel-grip (bán 3)
   ```

3. **Đối chứng (không backfill):** product `yonex-astrox-99-pro` (biến `sourceProductId`) có đủ 3
   Tier-1 → chỉ trả 3 `manual`, không có `category`.

### Chứng minh nhân quả (top-seller đổi → thứ tự đổi)

Tăng lượng bán 1 sản phẩm rồi chạy lại job → gọi lại endpoint → nó nhảy lên đầu nhóm `category`:

```bash
# ví dụ: đẩy yonex-pro-bag-92026 lên top rồi rebuild snapshot
docker exec hf_medusa_postgres psql -U hfmedusa -d hfmedusa -c \
  "update category_top_seller set sales_count=999 where product_id=(select id from product where handle='yonex-pro-bag-92026');"
```

> ⚠️ **Cache 5 phút** — kết quả gợi ý cache ở Redis `medusa:suggest:product:v3:{id}` (TTL 300s).
> Sau khi đổi snapshot phải flush mới thấy ngay:
>
> ```bash
> docker exec hf_medusa_redis sh -c "redis-cli --scan --pattern '*suggest:product*' | xargs -r redis-cli del"
> ```

### Demo cron thật

Tạm đổi `schedule` trong `src/jobs/compute-category-top-sellers.ts` thành `"*/2 * * * *"` (2 phút),
chạy backend, thêm/sửa order → chờ 2 phút → snapshot tự cập nhật. **Trả lại `"0 */6 * * *"` sau demo.**

---

_Scenario khác sẽ bổ sung sau._
