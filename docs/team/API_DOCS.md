# API Docs (Swagger UI cục bộ)

Hướng dẫn xem toàn bộ API kiểu Swagger cho backend Medusa 2.16, và cách nó tự cập nhật khi
bạn thêm API.

> Medusa v2 dùng **REST** (không phải GraphQL). Trang docs cục bộ này được dựng trong
> `apps/backend/src/api/docs/`.

---

## TL;DR — Thêm API custom mới có tự hiện không?

**CÓ.** Thêm một route dưới `src/api/**/route.ts` là nó **tự lên** `/docs` sau khi dev server
reload — **không cần sửa file spec, không cần chạy lệnh gì.**

- **Path + method**: đọc trực tiếp từ file route (tên hàm `GET`/`POST`/… export ra).
- **Request body + query có kiểu**: tự lấy từ `validators.ts` (zod) cạnh route, qua
  `z.toJSONSchema`.

Cách tận dụng tối đa khi viết route mới:

1. Viết route: `src/api/store/abc/route.ts` (export `GET`/`POST`/…).
2. (Nếu có body) tạo `validators.ts` cùng thư mục, export zod schema đặt tên theo quy ước:
   - `Create*` / `Apply*` / `Post*` → dùng cho **POST** body.
   - `Update*` → dùng cho **PUT/PATCH** body.
   - `*Query*` → dùng cho **query params** có kiểu.
   - Route dạng `[id]/route.ts` sẽ tự lấy `validators.ts` ở **thư mục cha**.
3. Lưu → server reload → mở `/docs`, chọn tab **Custom** trong dropdown. Xong.

Cái KHÔNG tự có: mô tả response chi tiết (mọi op để mặc định `200 OK`) và văn bản
summary/description đẹp. Muốn chi tiết hơn thì bổ sung tay (xem §4).

---

## 1. Mở trang docs

```bash
cd hf-medusa-store          # workspace root (thư mục hf-medusa-store BÊN TRONG)
pnpm backend:dev            # server chạy ở port 9009 (theo .env)
```

Mở: **http://localhost:9009/docs** — Swagger UI. Dropdown **"Select a definition"** (thanh
trên cùng, góc phải) đổi giữa 2 spec:

| Định nghĩa          | Endpoint JSON        | Nội dung           | Cơ chế                                      |
| ------------------- | -------------------- | ------------------ | ------------------------------------------- |
| **Custom API**      | `/docs/openapi`      | route team tự viết | **Tự sinh lúc chạy** (quét `src/api` + zod) |
| **Medusa Core API** | `/docs/openapi/core` | ~321 endpoint lõi  | Sinh bằng `medusa-oas` (chạy tay)           |

> Không thấy dropdown? Hard-refresh (Ctrl+Shift+R). Trang trắng → mở DevTools/Console, thường
> do CDN unpkg bị chặn mạng (asset Swagger load từ CDN).

`/docs` là **công cụ dev**, không có auth (không nằm dưới `/admin` hay `/store`). **Đừng
expose ra production public.**

---

## 2. Custom API — tự sinh, không phải làm gì

Route `apps/backend/src/api/docs/openapi/route.ts` build spec **ngay lúc có request**:

1. Duyệt `src/api/**` tìm mọi `route.ts` (bỏ qua thư mục `docs/`).
2. Path = đường dẫn thư mục, `[x]` → `{x}`. Method = các hàm `GET/POST/PUT/PATCH/DELETE`
   được export (đọc từ text file).
3. Body/query lấy từ `validators.ts` (cùng thư mục hoặc thư mục cha) bằng `z.toJSONSchema`.
   Validators được nạp qua `require` theo loader của Medusa nên import lồng nhau vẫn resolve.
   Route nào không có validator (hoặc nạp lỗi) vẫn hiện path + method.

Vì build lúc chạy nên **không có bước sinh file** — thêm/sửa route là thấy ngay sau reload.

## 3. Core API — sinh bằng `medusa-oas` (chạy tay)

File `apps/backend/oas/combined.oas.json` do CLI `@medusajs/medusa-oas-cli` sinh ra. Chỉ cần
chạy lại khi **nâng version Medusa** (bạn code tính năng thì hầu như không đụng nhóm core):

```bash
pnpm --filter @dtc/backend oas
# = medusa-oas oas --type combined --out-dir ./oas
```

`oas/` được `.gitignore`. Chưa chạy thì tab Core trả `503` kèm hướng dẫn — không crash.

---

## 4. (Tùy chọn) Làm chi tiết hơn phần custom

Bộ tự sinh cố tình đơn giản (response luôn là `200 OK`, summary mặc định). Nếu một endpoint
cần mô tả response/nhiều mã lỗi/ví dụ, có 2 cách bổ sung mà **không phá cơ chế auto**:

- **Đặt tên schema đúng quy ước** ở §TL;DR để body/query được nhận diện chính xác. Đây là
  cách rẻ nhất để "đủ body".
- **Mô tả tay từng op**: nếu cần chuẩn chỉnh (response schema, ví dụ, mã lỗi 4xx), có thể mở
  rộng `route.ts` của trang docs để đọc thêm JSDoc `@oas` trên handler (định dạng
  swagger-inline). Hiện chưa bật — nhắn team nếu muốn thêm.

Quy ước nhận diện schema (khớp regex trong `docs/openapi/route.ts`):

| Method         | Lấy schema tên khớp                         | Ghi chú                                                      |
| -------------- | ------------------------------------------- | ------------------------------------------------------------ |
| POST           | `create` / `apply` / `post` / bắt đầu `add` | Bỏ qua tên chứa `query`/`remove`                             |
| PUT, PATCH     | `update`                                    |                                                              |
| (query params) | `query`                                     | Nếu không có → suy từ `req.query.x` trong code (kiểu string) |

---

## 5. Ghi chú kỹ thuật (đã xử lý sẵn)

- **Cài `medusa-oas-cli` từng làm hỏng lint** của `medusa develop`
  (`Cannot find module '@typescript-eslint/typescript-estree'`): `@medusajs/eslint-plugin`
  gọi module đó nhưng không khai báo (phantom dep). **Đã fix** bằng cách thêm
  `@typescript-eslint/typescript-estree@^8.49.0` vào devDependencies của backend. Đừng gỡ.
- `pnpm-workspace.yaml` có `allowBuilds.core-js: false` (core-js đến kèm oas-cli).
- Trang custom nạp validators bằng `createRequire(__filename)` + `require(...)` (không phải
  `import()` động — `import()` gãy ở import lồng không đuôi). `z.toJSONSchema` dùng
  `unrepresentable: "any"` để field kiểu `z.coerce.date()` ra `{}` thay vì ném lỗi cả body.
- Asset Swagger UI load từ CDN unpkg (tiện cho dev). Cần offline hoàn toàn thì cài
  `swagger-ui-dist` và serve nội bộ.

## Tóm tắt lệnh

```bash
cd hf-medusa-store
pnpm backend:dev                 # mở http://localhost:9009/docs (Custom tab tự cập nhật)
pnpm --filter @dtc/backend oas   # chỉ khi cần sinh lại Core OAS (nâng version Medusa)
```
