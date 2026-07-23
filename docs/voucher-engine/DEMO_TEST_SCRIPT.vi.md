# Kịch bản test cho demo — VoucherEngine

Đây là kịch bản **một mạch liên tục** dùng khi thuyết trình: ít thao tác setup
nhất có thể, nhưng mỗi bước cố tình chọn để cover thêm 1-2 requirement SRS.
Không phải bản test đầy đủ cho QA — bản đó xem
`docs/voucher-engine/MANUAL_TEST_SCRIPT_VOUCHER_ENGINE.vi.md` (đầy đủ toàn
bộ `T-VOUCH-01..12`). Đi kèm outline nói gì ở `DEMO_PRESENTATION_OUTLINE.vi.md`.

**Toàn bộ sản phẩm, voucher và automatic Promotion dưới đây đã có sẵn trong
seed hiện tại của repo** (`apps/backend/src/migration-scripts/initial-data-seed.ts`,
chạy qua `pnpm backend:seed` — idempotent, chạy lại bao nhiêu lần cũng ra
đúng data này). **Không cần tạo thêm sản phẩm/voucher nào mới** — chỉ cần
bật/tắt status của một vài automatic Promotion đúng lúc (xem cảnh báo ngay
dưới đây), vì tất cả seed sẵn ở trạng thái active cùng lúc.

## ⚠️ Lưu ý bắt buộc đọc trước khi demo: 4 automatic Promotion trùng category

Seed tạo sẵn 4 automatic Promotion, và **2 cặp trùng category, cùng active
mặc định**:

- `AUTO20_RACKET` (20%) và `AUTO40_RACKET` (40%) — cùng target category `Rackets`.
- `AUTO30_STRING` (30%) và `AUTO50_SUGGESTED` (50%) — cùng target category `Strings`.

Nếu để nguyên cả 4 active cùng lúc, một Racket trong cart sẽ bị cộng dồn CẢ
20% lẫn 40% (tương tự Strings bị cộng cả 30% lẫn 50%) — không khớp với bảng
tính bên dưới. **Trước mỗi bước có tính stacking (Bước 6, 7, 9), vào Admin →
Promotions và set status đúng như bảng chỉ định**, các Promotion không được
liệt kê ở bước đó thì để `Inactive`.

## Quy ước dữ liệu dùng xuyên suốt

- Tiền tệ: VND, số nguyên, không phần thập phân.
- Cap toàn cục dùng đúng **giá trị default hiện tại của môi trường**
  (`DiscountCapConfig.max_discount_percentage`, seed = `4000` bps = **40%**)
  — không set override thủ công, để demo tự nhiên chứng minh CR "trần 40%"
  đã có hiệu lực mà không cần cấu hình gì thêm.
- Sản phẩm thật dùng trong catalog seed (`PRODUCTS` trong
  `initial-data-seed.ts`) — nếu giá trong catalog thực tế đã bị đổi khác số
  dưới đây, **phải tính lại theo giá thật lúc demo**, không dùng số cũ:

  | Sản phẩm                | Category      |    Giá gốc | Vai trò trong demo |
  | ------------------------ | ------------- | ---------: | ------------------- |
  | `Yonex Astrox 99 Pro`    | `Rackets`     | `4.500.000` | item cho case stacking (có auto promo) |
  | `Yonex BG80 Power`       | `Strings`     |   `150.000` | item thứ 2 cho case vượt cap |
  | `Victor GR262`           | `Grips`       |    `70.000` | item KHÔNG có automatic Promotion nào target — dùng cho happy-path/replace/min-order-fail |
  | `Yonex Mavis 350`        | `Shuttlecocks`|   `350.000` | item cho case scope `SHUTTLE20` |

  `Grips`/`Bags`/`Shoes`/`Socks`/`Insoles`/`Tubes` không có automatic
  Promotion nào seed sẵn — bất kỳ sản phẩm nào các category này đều an toàn
  để demo "không có item promotion" mà không cần tắt Promotion nào.

- Voucher đã seed sẵn (native Promotion, code-based, không automatic — mỗi
  cái đã Enable VoucherEngine sẵn qua `attachVoucherConfigWorkflow`):

  | Code        | Discount           | VoucherEngine config                         | Dùng ở bước |
  | ----------- | ------------------ | ---------------------------------------------- | ----------- |
  | `SAVE10`    | 10%, unscoped       | per-user limit `10`                             | 3, 4, 5     |
  | `MEGA20`    | 20%, unscoped       | per-user limit `10`                             | 5, 7        |
  | `MEGA50`    | 50%, unscoped       | per-user limit `10`                             | 9           |
  | `SHUTTLE20` | 20%, scope `Shuttlecocks` | `min_order_value = 200.000`, per-user limit `10` | 8, 10 |
  | `ONCE10`    | 10%, unscoped       | `per_user_limit = 1`                            | 11          |
  | `OLDEXP10`  | 10%, unscoped       | hết hạn (`valid_to` quá khứ)                    | nhắc nhanh ở Bước 2 nếu còn giờ |

- Automatic Promotion đã seed sẵn (Bước "⚠️" ở trên nhắc lại khi nào bật/tắt
  cái nào):

  | Code               | Discount | Category    |
  | ------------------ | -------: | ----------- |
  | `AUTO20_RACKET`     |     20%  | `Rackets`   |
  | `AUTO40_RACKET`     |     40%  | `Rackets`   |
  | `AUTO30_STRING`     |     30%  | `Strings`   |
  | `AUTO50_SUGGESTED`  |     50%  | `Strings`   |

- Với mỗi bước có tính toán số, ghi lại đúng 5 con số này trước khi apply:
  `original_subtotal`, `item_promotion_discount`, `post_promotion_subtotal`,
  `raw_voucher_discount`, `final_voucher_discount` — rồi so với bảng kỳ vọng.
  Không chỉ nhìn UI, phải đối chiếu số trên network response.

## Kỳ vọng chung (áp dụng cho mọi bước, không nhắc lại từng bước)

- Toàn bộ tính discount chạy server — không tin số trên UI nếu network
  response không khớp.
- Không bước nào được để cart total âm hoặc giảm sai automatic Promotion.
- Mọi lỗi phải có `code` trong response (không chỉ message hiển thị).

---

## Bước 1 — Admin: xác nhận ranh giới Promotion vs VoucherEngine (US-05)

Voucher đã seed sẵn nên không cần tạo mới — chỉ dùng để minh hoạ UI:

1. Admin → Promotions → mở Promotion `SAVE10`.
2. Mở widget `VoucherEngine settings` → xác nhận badge `Enabled`, các field
   VoucherEngine-specific (per-user limit, min order, scope...) hiển thị ở
   widget riêng — `code`/discount/date vẫn ở Promotion UI gốc, không nhập
   trùng.
3. Bấm Disable rồi Enable lại ngay để minh hoạ toast:
   - Disable → `VoucherEngine disabled for this Promotion.`
   - Enable lại → `VoucherEngine enabled for this Promotion.` (dùng lại đúng
     `VoucherConfig`/history cũ, không tạo row trùng).

## Bước 2 — Storefront: mã sai + rate limit (V1, EC-10/SEC-02)

1. Cart trống hoặc có 1 `Victor GR262`. Mở discount input.
2. Nhập `KHONGTONTAI` → Apply. Lặp lại 5 lần liên tiếp bằng mã sai khác nhau
   hoặc giống nhau.

Kỳ vọng:
- Các lần đầu: HTTP `404`, code `VOUCHER_NOT_FOUND`, message
  `Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!`.
- Từ lần thứ 5 (hoặc theo ngưỡng cấu hình): HTTP `429`, cooldown ~30 phút.
- Nhập `SAVE10` (mã đúng) ngay sau đó trong lúc cooldown → vẫn bị chặn
  (chứng minh rate limit tính theo customer/IP, không phải theo riêng mã sai).
- Nếu còn giờ, minh hoạ thêm `OLDEXP10` → code `VOUCHER_EXPIRED`, message
  `Mã giảm giá đã hết hạn rồi. Bạn xem thêm mã trong "Ví voucher" nhé!`.

## Bước 3 — Apply voucher hợp lệ, không có item promotion (VOUCH-001)

1. Cart mới, chỉ có 1 `Victor GR262` (`70.000₫`) — category `Grips`, không
   automatic Promotion nào target.
2. Nhập `save10` (chữ thường, minh hoạ case-insensitive) → Apply.

Kỳ vọng:
- `POST /store/carts/:id/voucher` → `200`.
- Savings = `7.000₫` (10% × 70.000).
- Cart total: `70.000 → 63.000`.
- Không có `cap_explanation`.

## Bước 4 — Remove voucher (VOUCH-004)

1. Bấm remove trên voucher tag.

Kỳ vọng:
- `DELETE /store/carts/:id/voucher` → `200`.
- Cart total trở về `70.000`.
- Kiểm tra DB/API: `usage_count` của `SAVE10` **không tăng**, chưa có
  `VoucherUsageLog` nào cho voucher này.

## Bước 5 — Apply lại rồi replace bằng voucher khác (V8, "1 voucher active")

1. Apply lại `SAVE10` trên cùng cart (vẫn thành công — chưa đặt hàng nên
   chưa tính vào per-user limit).
2. Nhập `MEGA20` trong khi `SAVE10` đang active → Apply.

Kỳ vọng:
- Request đầu tiên: `409`, code `VOUCHER_REPLACE_REQUIRED`, message
  `Bạn đang dùng mã SAVE10. Thay bằng mã mới chứ?`.
- Bấm Cancel → `SAVE10` vẫn active, total không đổi (`63.000₫`).
- Nhập lại `MEGA20`, khi hỏi lại bấm Confirm →
  `POST /store/carts/:id/voucher?replace=true` → `200`.
- Voucher tag đổi từ `SAVE10` sang `MEGA20`, savings mới = 20% × 70.000 =
  `14.000₫`, không có 2 voucher cùng lúc.

## Bước 6 — Stacking dưới cap (VOUCH-003 rule 1-4, happy path)

**Chuẩn bị:** Admin → Promotions → `AUTO20_RACKET` = Active,
`AUTO40_RACKET` = Inactive (tắt trước khi demo bước này).

1. Cart mới, chỉ có `Yonex Astrox 99 Pro` (`4.500.000₫`) → `AUTO20_RACKET`
   tự áp.
2. Xác nhận trước khi nhập voucher: automatic discount = `900.000₫`, cart
   còn `3.600.000₫`, chưa có voucher row.
3. Nhập `SAVE10` → Apply.

Bảng tính kỳ vọng:

| Biến                        |     Giá trị |
| --------------------------- | ----------: |
| `original_subtotal`         |  `4.500.000` |
| `item_promotion_discount`   |    `900.000` (20% × 4.500.000) |
| `post_promotion_subtotal`   |  `3.600.000` |
| `raw_voucher_discount`      |    `360.000` (10% × 3.600.000) |
| cap 40% của original        |  `1.800.000` |
| combined discount trước cap |  `1.260.000` (< 1.800.000, chưa vượt cap) |
| `final_voucher_discount`    |    `360.000` |
| `final_total`               |  `3.240.000` |

Kỳ vọng UI: có dòng automatic discount riêng + dòng voucher `360.000₫`,
không có cap explanation, `discount_capped = false`.

## Bước 7 — Stacking vượt cap 40% (VOUCH-003 rule 6-7 + Phase 5 CR, điểm nhấn chính)

**Chuẩn bị:** Admin → Promotions → `AUTO20_RACKET` = Inactive,
`AUTO40_RACKET` = Active, `AUTO30_STRING` = Active, `AUTO50_SUGGESTED` =
Inactive.

1. Cart mới, gồm `Yonex Astrox 99 Pro` (`4.500.000₫`, → `AUTO40_RACKET` tự
   áp) và `Yonex BG80 Power` (`150.000₫`, → `AUTO30_STRING` tự áp).
2. Xác nhận trước khi nhập voucher: automatic discount Racket = `1.800.000₫`
   (40%), automatic discount String = `45.000₫` (30%), tổng automatic
   discount = `1.845.000₫`.
3. Nhập `MEGA20` (20%) → Apply.

Bảng tính kỳ vọng:

| Biến                          |     Giá trị |
| ------------------------------ | ----------: |
| `original_subtotal`            |  `4.650.000` |
| `item_promotion_discount`      |  `1.845.000` (1.800.000 + 45.000) |
| `post_promotion_subtotal`      |  `2.805.000` |
| `raw_voucher_discount`         |    `561.000` (20% × 2.805.000) |
| `maximum_combined_discount`    |  `1.860.000` (**40%** của 4.650.000 — giá trị mới sau CR Phase 5, trước đây sẽ là `2.325.000` ở mức 50%) |
| Combined discount trước cap    |  `2.406.000` (1.845.000 + 561.000, vượt 1.860.000) |
| Cap còn lại cho voucher        |     `15.000` (1.860.000 − 1.845.000) |
| `final_voucher_discount`       |     `15.000` |
| `combined_discount` thực tế    |  `1.860.000` |
| `final_total`                  |  `2.790.000` |

Kỳ vọng UI:
- Automatic discount vẫn giữ nguyên `1.845.000₫` (không bị đụng vào).
- Voucher hiển thị savings cuối chỉ `15.000₫`, không phải `561.000₫` — đây là
  điểm dễ gây bất ngờ nhất khi demo, nên nói rõ: item promotion đã ăn gần hết
  cap, phần còn lại cho voucher rất nhỏ.
- Có `cap_explanation`, ví dụ: "Giảm giá voucher được điều chỉnh từ 561.000₫
  xuống 15.000₫, vì tổng mức giảm giá (đã gồm khuyến mãi tự động) không được
  vượt quá 40% giá trị đơn hàng." — số **40%** ở đây chính là bằng chứng sống
  cho CR Phase 5 (trước đây câu này sẽ ghi 50%).
- Network response: `original_discount = 561.000`, `discount_capped = true`.
- Nếu automatic discount bị giảm xuống dưới `1.845.000₫`, hoặc `final_total`
  khác `2.790.000`, case này FAIL — đây là chỗ hay sai nhất trong toàn bộ demo.

## Bước 8 — Sai điều kiện: min order rồi sai scope (V5, V6)

1. Cart mới, chỉ có `Victor GR262` (`70.000₫`).
2. Nhập `SHUTTLE20` (scope `Shuttlecocks`, min order `200.000`) → Apply.

Kỳ vọng: V5 fail trước (đúng thứ tự V1→V8 — V5 đứng trước V6), code
`VOUCHER_MIN_ORDER_NOT_MET`, message
`Mua thêm 130.000 nữa để dùng được mã này nhé!` (`200.000 − 70.000`).

3. Thêm `Yonex Astrox 99 Pro` (`4.500.000₫`) vào cart (giờ cart đủ min order
   nhưng vẫn không có `Shuttlecocks`), nhập lại `SHUTTLE20` → Apply.

Kỳ vọng: giờ V5 pass nhưng V6 fail, code `VOUCHER_NO_ELIGIBLE_ITEMS`,
message `Mã này chỉ áp dụng cho một số sản phẩm/danh mục nhất định. Giỏ hàng
chưa có sản phẩm phù hợp.`

4. Đổi cart chỉ còn `Yonex Mavis 350` (`350.000₫`, category `Shuttlecocks`),
   nhập lại `SHUTTLE20` → Apply thành công.

Kỳ vọng: cả V5 và V6 pass, savings = 20% × 350.000 = `70.000₫` (Mavis 350
không có automatic Promotion nào).

## Bước 9 — Cap chặn khi item promotion một mình đã ăn hết cap (EC-03, cơ chế `VOUCHER_CAP_EXHAUSTED`)

**Chuẩn bị:** Admin → Promotions → `AUTO50_SUGGESTED` = Active,
`AUTO30_STRING` = Inactive (và cả 2 Promotion Racket = Inactive, để chắc
chắn Racket không ảnh hưởng).

1. Cart mới, chỉ có `Yonex BG80 Power` (`150.000₫`) → `AUTO50_SUGGESTED` tự
   áp 50%.
2. Xác nhận trước khi nhập voucher: automatic discount = `75.000₫`, cart còn
   `75.000₫`.
3. Nhập `MEGA50` (50%) → Apply.

Bảng tính kỳ vọng (before-apply check):

| Biến                            |   Giá trị |
| -------------------------------- | --------: |
| `original_subtotal`              | `150.000` |
| `item_promotion_discount`        |  `75.000` (50% × 150.000) |
| `maximum_combined_discount` (40%)|  `60.000` |
| `item_promotion_discount >= cap` |    `true` → `cap_exhausted_by_promotion` |

Kỳ vọng:
- Request **bị từ chối ngay**, HTTP `422`, code `VOUCHER_CAP_EXHAUSTED`,
  message `Giỏ hàng của bạn đã đạt mức giảm giá tối đa từ chương trình
  khuyến mãi hiện tại, không thể áp dụng thêm voucher.`
- Đây là hành vi CR 2026-07-22 (khác SRS gốc §10.2/EC-03 nói "giảm về 0,
  không reject" — team đã quyết định reject thẳng để tránh hiển thị voucher
  "áp dụng thành công" nhưng savings = 0đ gây hiểu lầm). Nên nói rõ điểm này
  khi ban giám khảo hỏi tại sao không khớp y nguyên SRS worked example.
- `automatic discount` vẫn giữ nguyên `75.000₫`, cart total vẫn `75.000₫`,
  không âm.
- Nếu muốn minh hoạ thêm trạng thái chủ động: mở "Available vouchers" trên
  cart này trước khi nhập mã — trường `cap_status.cap_exhausted_by_promotion`
  phải là `true`, để storefront có thể tắt sẵn ô nhập mã thay vì để khách
  gõ xong mới báo lỗi.

## Bước 10 — Cart thay đổi tự làm rớt điều kiện voucher (VOUCH-005, EC-02)

1. Từ cart ở bước 8.4 (đang có `SHUTTLE20` active nhờ `Yonex Mavis 350`),
   xoá `Yonex Mavis 350` khỏi cart (có thể thêm tạm 1 `Victor GR262` để cart
   không trống hẳn).

Kỳ vọng:
- Subscriber `cart.updated` tự trigger revalidate, voucher `SHUTTLE20` tự bị
  remove (không cần khách bấm remove tay).
- UI hiển thị notice auto-remove, reason tương ứng
  `VOUCHER_NO_ELIGIBLE_ITEMS` (không còn Shuttlecocks trong cart).
- Cart total không còn discount của voucher.

## Bước 11 — Checkout thành công → audit + per-user limit (VOUCH-004, T-VOUCH-04, bugfix 2026-07-23)

1. Cart mới, có 1 `Victor GR262` (`70.000₫`), apply `ONCE10` (`per_user_limit = 1`).
2. Hoàn tất checkout (payment test/manual).

Kỳ vọng sau khi order thành công:
- `VoucherUsageLog` có đúng 1 row cho `voucher_id` (`ONCE10`) + `order_id`.
- `discount_applied`, `was_capped`, `original_discount`, `applied_at` khớp
  với số đã tính lúc apply (`7.000₫`, `was_capped = false`).
- `usage_count` của `ONCE10` tăng đúng 1.
- Nếu gửi lại event `order.placed` lần nữa (nếu có công cụ test lại
  workflow): không tạo thêm row, không tăng `usage_count` lần 2 (idempotency
  theo voucher + order).

3. Cùng customer, mở modal `Available vouchers` (không cần cart_id hoặc với
   cart mới bất kỳ).

Kỳ vọng (bugfix 2026-07-23 — trước đó đây là bug): `ONCE10` **không còn hiện
là `eligible: true`** trong danh sách nữa — phải có `eligible: false` với
`ineligible_reason` tương ứng "đã dùng hết lượt", vì customer này đã redeem
đúng `per_user_limit` (`1`) lần. Nếu `ONCE10` vẫn hiện `eligible: true` ở
đây, đây là bug đã từng có thật, cần báo lại ngay.

4. Tạo cart mới, nhập lại `ONCE10` thủ công → Apply.

Kỳ vọng: `422`, code `VOUCHER_PER_USER_LIMIT_REACHED`, message
`Bạn đã dùng hết lượt cho mã này rồi.`

## Bước 12 — Admin xem lại analytics sau order

1. Quay lại Admin → Promotion Detail của `ONCE10` → widget analytics.

Kỳ vọng:
- `total_uses` tăng lên `1`, `total_discount_given = 7.000`.
- `capped_count` không tăng (order này không bị cap).
- Nếu muốn demo `capped_count` tăng, hoàn tất checkout cho case Bước 7 (bị
  cap) trước đó, rồi kiểm tra lại Promotion Detail của `MEGA20`.

---

## Bảng đối chiếu nhanh: bước nào cover requirement nào

| Bước | Requirement chính                                              |
| ----: | ---------------------------------------------------------------- |
| 1     | US-05, ranh giới Promotion/VoucherEngine                        |
| 2     | V1, V2 (`VOUCHER_EXPIRED`), EC-10/SEC-02 (rate limit)            |
| 3     | VOUCH-001 happy path                                             |
| 4     | VOUCH-004, usage_count chưa tăng khi apply                       |
| 5     | V8, "chỉ 1 voucher active", replace confirm                      |
| 6     | VOUCH-003 rule 1-4, dưới cap                                     |
| 7     | VOUCH-003 rule 6-7, EC-01, **CR Phase 5 (cap 40%)**              |
| 8     | V5, V6, đúng thứ tự fail-fast                                    |
| 9     | EC-03, `VOUCHER_CAP_EXHAUSTED` (CR 2026-07-22)                   |
| 10    | VOUCH-005, EC-02, auto-remove                                    |
| 11    | usage_count atomic, VoucherUsageLog append-only, idempotency, T-VOUCH-04, bugfix per_user_limit trong Available Vouchers |
| 12    | Admin analytics widget                                           |

Nếu thiếu thời gian, ưu tiên giữ bước **3, 6, 7, 9, 11** — đây là nhóm chứng
minh trực tiếp phần khó nhất (stacking + cap + cap-exhausted) và phần audit
gắn với bugfix vừa sửa, còn 1/2/5/8/10/12 có thể tóm tắt bằng lời nếu hết giờ.

## Dọn dẹp sau demo

Vì Bước 6/7/9 yêu cầu tắt/bật status của `AUTO20_RACKET`, `AUTO40_RACKET`,
`AUTO30_STRING`, `AUTO50_SUGGESTED`, **nhớ set cả 4 về đúng trạng thái ban
đầu (Active) sau khi demo xong** — nếu không, môi trường sẽ ở trạng thái
"2 automatic Promotion cùng category cộng dồn" khi người khác dùng lại để
test việc khác.
