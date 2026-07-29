# Product Context

## Why RallyGear Exists

RallyGear is a specialized badminton e-commerce store designed to offer high-quality rackets, strings, shuttlecocks, shoes, and court accessories. In badminton retail, customers frequently purchase complementary products (e.g. racket + stringing service + grip tape). RallyGear leverages intelligent suggestive selling and seamless voucher stacking to increase Average Order Value (AOV) and customer satisfaction.

## Target User Experiences

### 1. Product Recommendations (Suggestive Selling)

- **"Complete Your Setup" Widget**: When a user views a high-value item (like a racket), the system suggests complementary accessories (strings, grips, thermal bags).
- **Cart-Level Nudging**: Suggests small add-on items (e.g., shuttlecock tubes) to hit free shipping or tier discount thresholds (CR-01 to CR-04).
- **One-Tap Add to Cart**: Allows users to add suggested items immediately with a 3-second undo window.
- **Graceful Degradation**: If recommendation API times out or returns an error, recommendation UI sections silently hide without blocking browsing or checkout.

### 2. Voucher & Discount Stacking (Voucher Engine)

- **Single Voucher Application**: Simple code entry at checkout validating against eligibility rules V1 to V8 (expiration, minimum spend, category rules, user limits).
- **Clear Discount Visibility**: Storefront explicitly distinguishes between auto-applied catalog promotions and custom user-entered vouchers.
- **Margin Guardrail**: Customers get the maximum allowed stackable benefit up to a strict 50% total order discount cap.
- **Instant Feedback**: Clear validation messages (e.g., "Voucher applied! Saved 50,000 VND" or "Minimum spend of 500,000 VND required").
