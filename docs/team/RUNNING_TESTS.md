# Hướng dẫn chạy Unit Test (backend `@dtc/backend`)

> Tài liệu thực hành cho **unit test** của backend Medusa trong repo này. Nguồn quy ước:
> [.claude/rules/testing.md](../../.claude/rules/testing.md) và [project-conventions.md](../../.claude/rules/project-conventions.md).
> Phần integration test (`:modules`, `:http`) tóm tắt ở [§8](#8-liên-quan-integration-test).

---

## 0. TL;DR

```bash
# Đứng ở workspace root (thư mục chứa pnpm-workspace.yaml)
cd hf-medusa-store

# Chạy TOÀN BỘ unit test của backend
pnpm --filter @dtc/backend test:unit
```

hoặc chạy trực tiếp trong package backend:

```bash
cd hf-medusa-store/apps/backend
pnpm test:unit
```

- ✅ **Không cần** Postgres, Redis, hay `.env` — unit test là pure function, không I/O.
- ✅ Nhanh (< 3s cho cả bộ).
- ✅ Chạy được offline, trên CI, hay máy trống.

---

## 1. Unit test là gì trong repo này

Unit test **chỉ** kiểm tra các **pure function** (không I/O, không Medusa runtime, không clock/network):
StackingEngine/validators (VoucherEngine), evaluator pipeline & cart-rules (SuggestiveSelling), money math, v.v.
Mọi dependency (cache, query, service) được **inject bằng fake/DI** nên không đụng DB/Redis.

> Ba loại test trong repo (đặt `TEST_TYPE` qua script — **không bao giờ gọi `jest` trực tiếp** cho CI):
>
> | Loại               | Script                          | Cần hạ tầng?         | testMatch                                  |
> | ------------------ | ------------------------------- | -------------------- | ------------------------------------------ |
> | **Unit**           | `pnpm test:unit`                | ❌ Không             | `**/src/**/__tests__/**/*.unit.spec.[jt]s` |
> | Module integration | `pnpm test:integration:modules` | ✅ Postgres (+Redis) | `**/src/modules/*/__tests__/**/*.[jt]s`    |
> | HTTP integration   | `pnpm test:integration:http`    | ✅ Postgres (+Redis) | `**/integration-tests/http/*.spec.[jt]s`   |

---

## 2. Điều kiện tiên quyết

- **Node ≥ 20**, **pnpm 11.8.0** (không dùng npm/yarn).
- Đã cài dependency: từ workspace root chạy `pnpm install` một lần.
- **Không cần** gì thêm cho unit test (không DB/Redis/.env).

> ⚠️ **Repo có 2 tầng thư mục `hf-medusa-store/`** (xem [CLAUDE.md](../../CLAUDE.md)). Workspace root là thư mục
> **bên trong** chứa `pnpm-workspace.yaml`, `apps/`. Mọi lệnh pnpm/turbo chạy ở đó.

---

## 3. Các cách chạy

### 3.1 Toàn bộ unit test

```bash
cd hf-medusa-store/apps/backend
pnpm test:unit
```

Script thực thi (trong `apps/backend/package.json`):

```
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules jest --silent --runInBand --forceExit
```

- `TEST_TYPE=unit` → `jest.config.js` chọn đúng `testMatch` cho file `*.unit.spec.ts` trong `__tests__/`.
- `--silent` → nuốt `console.*` (log gọn). Muốn xem log, dùng [§3.5](#35-xem-log-console-bỏ---silent).
- `--runInBand` → chạy tuần tự (ổn định, dễ đọc lỗi).
- `--forceExit` → thoát ngay sau khi xong (Jest đôi khi cảnh báo "open handles" — vô hại với unit).

### 3.2 Chỉ một file

Truyền path/regex làm positional arg — pnpm nối vào cuối lệnh jest:

```bash
# Theo đường dẫn
pnpm test:unit src/modules/suggestive-selling/__tests__/pipeline.unit.spec.ts

# Theo mẫu tên (regex trên path)
pnpm test:unit pipeline
pnpm test:unit voucher-engine
```

### 3.3 Chỉ một `describe`/`it` cụ thể

Dùng `-t` (test name pattern):

```bash
pnpm test:unit -t "T-SUGG-05"
pnpm test:unit -t "rankAndLimit"
pnpm test:unit pipeline -t "drops a dismissed product"   # kết hợp file + tên
```

### 3.4 Watch mode (chạy lại khi sửa file) — khi đang code

Watch không có sẵn trong script; gọi jest trực tiếp với `TEST_TYPE`:

```bash
cd hf-medusa-store/apps/backend
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --watch pipeline
```

### 3.5 Xem log console (bỏ `--silent`)

```bash
cd hf-medusa-store/apps/backend
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest pipeline
```

### 3.6 Từ workspace root (không `cd` vào backend)

```bash
cd hf-medusa-store
pnpm --filter @dtc/backend test:unit
pnpm --filter @dtc/backend test:unit -- pipeline -t "T-SUGG-01"
```

> Lưu ý: qua `--filter` cần `--` trước các arg truyền cho script con.

### 3.7 Coverage (tuỳ chọn)

```bash
cd hf-medusa-store/apps/backend
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --coverage
```

---

## 4. Đọc kết quả

```
PASS src/modules/suggestive-selling/__tests__/pipeline.unit.spec.ts
PASS src/workflows/suggestive-selling/__tests__/evaluate.unit.spec.ts
...
Test Suites: N passed, N total
Tests:       M passed, M total
Snapshots:   0 total
Time:        ~2 s
```

- `PASS`/`FAIL` theo **từng file** (suite).
- Dòng `Tests:` là tổng số `it()`.
- Khi FAIL: Jest in `Expected` vs `Received` + stack trỏ tới `file:line` (click được trong IDE).

Liệt kê nhanh các file unit hiện có:

```bash
cd hf-medusa-store/apps/backend
find src -name "*.unit.spec.ts" | sort
```

---

## 5. Quy ước viết unit test (bắt buộc để test được nhận diện)

- **Tên & vị trí:** `*.unit.spec.ts` đặt trong thư mục `__tests__/` **cạnh code** nó test.
  Ví dụ: `src/modules/suggestive-selling/__tests__/pipeline.unit.spec.ts`.
  → Sai tên/thư mục thì `testMatch` **không bắt** và test bị bỏ qua âm thầm.
- **Pure only:** không import Medusa runtime, không gọi DB/Redis/network/clock. Nếu cần dependency,
  **inject fake** (xem mẫu `suggestion-cache.unit.spec.ts` dùng `FakeCache` + container giả).
- **Integer money (INT-01):** khẳng định số nguyên VND (`Math.floor`), không float. Với StackingEngine phải
  khớp fixture SRS **tới từng đồng** (xem [testing.md §StackingEngine](../../.claude/rules/testing.md)).
- **Trace spec:** comment nêu mã spec đang test (vd `// T-SUGG-05`, `// VOUCH-003 cap`).

Khung tối thiểu:

```ts
import { finalizeSuggestions } from "../evaluator/pipeline";

describe("finalizeSuggestions — SUGG-002", () => {
  it("drops a dismissed product (T-SUGG-05)", () => {
    const result = finalizeSuggestions(/* candidates */, /* ctx */, 5);
    expect(result.map((s) => s.product_id)).toEqual([/* ... */]);
  });
});
```

Sau khi thêm file mới, chỉ cần chạy lại `pnpm test:unit` — không cần đăng ký ở đâu.

---

## 6. Cơ chế bên dưới (để hiểu khi cần chỉnh)

- **`apps/backend/jest.config.js`** dùng `@swc/jest` để transpile TS (nhanh, **không typecheck** — muốn typecheck chạy
  `npx tsc --noEmit`). Chọn `testMatch` theo `process.env.TEST_TYPE`.
- **`apps/backend/integration-tests/setup.js`** là `setupFiles` chạy trước framework; với unit test nó gần như no-op
  (chỉ set `MEDUSA_WORKER_MODE`). **Không** thêm `beforeEach/afterEach` vào đây.
- `NODE_OPTIONS=--experimental-vm-modules` cần cho ESM trong quá trình test.

---

## 7. Xử lý sự cố (unit)

| Triệu chứng                                           | Nguyên nhân & cách xử lý                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Test mới không chạy                                   | Sai tên/vị trí: phải là `*.unit.spec.ts` trong `__tests__/`. Kiểm tra bằng `find src -name "*.unit.spec.ts"`. |
| `Cannot find module '@medusajs/...'`                  | Chưa `pnpm install` ở workspace root, hoặc đang chạy sai thư mục.                                             |
| Lỗi TS nhưng test vẫn "chạy"                          | `@swc/jest` không typecheck. Chạy `npx tsc --noEmit` để bắt lỗi type.                                         |
| Test đọc thời gian/`Date.now()` cho kết quả khác nhau | Unit phải deterministic — inject clock/giá trị thay vì đọc thời gian thật.                                    |
| Cảnh báo "Jest did not exit / open handles"           | Vô hại với unit (đã có `--forceExit`); nếu xuất hiện nghĩa là có I/O lẻ — xem lại có gọi runtime thật không.  |
| Cần xem `console.log` mà không thấy                   | Bỏ `--silent`: chạy `npx jest ...` trực tiếp ([§3.5](#35-xem-log-console-bỏ---silent)).                       |

---

## 8. Liên quan: integration test

Unit không đủ cho luồng qua DB/route. Khi cần:

```bash
cd hf-medusa-store/apps/backend
pnpm test:integration:modules   # module service + migration trên DB thật
pnpm test:integration:http      # route end-to-end (full app + DB)
```

Hai lệnh này **cần Postgres** (docker `hf_medusa_postgres` :5433) và cấu hình test riêng — xem
[docs/day6-suggestive-selling-review.md §4](../day6-suggestive-selling-review.md) (yêu cầu `pg-god` + `apps/backend/.env.test`,
seed trong `beforeEach`, publishable key cho `/store/*`). Bằng chứng test đính kèm PR theo
[CONTRIBUTING §Evidence](./CONTRIBUTING.md).
