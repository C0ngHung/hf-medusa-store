# Postman — HF Medusa Suggestive Selling

API-only testing (SRS không yêu cầu UI). Import file collection vào Postman để test các Admin API `suggestion-rules`.

## File

- `HF-Medusa-Suggestive-Selling.postman_collection.json` — collection (đã kèm biến + test script tự lưu token/ruleId).

## Cách dùng

1. **Import**: Postman → Import → chọn file `.postman_collection.json`.
2. Chỉnh **collection variables** (tab Variables của collection) nếu cần:
   | Biến | Mặc định | Ghi chú |
   |---|---|---|
   | `baseUrl` | `http://localhost:9009` | cổng backend (theo `.env` PORT=9009) |
   | `adminEmail` / `adminPassword` | `postman@test.com` / `Supersecret123` | admin test đã tạo sẵn |
   | `sourceProductId` | `prod_…` astrox-99-pro | source product cho rule Tier-1 |
   | `suggestedProductId` | `prod_…` bg65 | product được gợi ý |
   | `token`, `ruleId` | _(trống)_ | tự điền bởi test script |
3. **Chạy theo thứ tự**:
   - `Auth › Login` → tự lưu `{{token}}`.
   - `Suggestion Rules › Create rule` → tự lưu `{{ruleId}}`.
   - `List` / `Get by id` / `Update` / `Delete`.

## Tạo admin test (nếu chưa có)

```bash
cd hf-medusa-store/apps/backend
npx medusa user -e postman@test.com -p Supersecret123
```

## Lấy product id thật (nếu seed khác)

```bash
docker exec hf_medusa_postgres psql -U hfmedusa -d hfmedusa -t \
  -c "SELECT handle, id FROM product WHERE deleted_at IS NULL ORDER BY handle;"
```

## Endpoint có trong collection

| Method | Path                              | TT                            |
| ------ | --------------------------------- | ----------------------------- |
| POST   | `/auth/user/emailpass`            | ✅                            |
| POST   | `/admin/suggestion-rules`         | ✅                            |
| GET    | `/admin/suggestion-rules`         | ✅                            |
| GET    | `/admin/suggestion-rules/:id`     | ✅                            |
| PUT    | `/admin/suggestion-rules/:id`     | ✅                            |
| DELETE | `/admin/suggestion-rules/:id`     | ✅ (soft delete)              |
| GET    | `/store/products/:id/suggestions` | ⏳ chưa implement (Sơn 2.5.1) |

> Evaluation engine (product-level) hiện chỉ có ở tầng **workflow** — chưa có Store API route, nên chưa test qua Postman được. Chạy thử bằng: `npx medusa exec ./src/scripts/try-evaluate.ts`.
