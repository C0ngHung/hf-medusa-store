# Project Brief: RallyGear – Badminton Equipment & Accessories Store

## Overview

Client E-Commerce Application for Badminton Equipment & Accessories (RallyGear) built on MedusaJS v2 (backend), NextJS (storefront), Postgres, and Redis. The project focuses on two core custom modules to drive revenue growth: SuggestiveSelling and VoucherEngine.

## Core Requirements

- **SuggestiveSelling**: 3-tier rules (Manual Curation, Category Complement, Behavioral - Phase 2), 4 cart-level rules (CR-01..04), dynamic threshold nudging, exclusion filtering, and interaction analytics.
- **VoucherEngine**: Voucher validation (V1-V8), pure-function stacking engine, global discount capping (max 50% in VND integer arithmetic), and conflict resolution.

## Goals

- **Increase Average Order Value (AOV)** via timely product recommendations ("Complete Your Setup", "You Might Also Need").
- **Increase Checkout Conversion** with immediate voucher application and smart stacking.
- **Protect Profit Margins** with a hard 50% global discount cap.
- **Provide Frictionless UX** with one-tap add-to-cart, 3-second undo, and resilient error-handling.

## Scope

### In Scope

- Suggestive Selling Engine (product-level and cart-level).
- Voucher Engine at Checkout.
- Event tracking and order attribution for analytics.
- Admin APIs & Medusa Admin Dashboard integration for rule/voucher management.
- Caching strategy via Redis (TTL 5m).

### Out of Scope

- Full catalog & menu management.
- Authentication & user account management.
- Payment processing (MoMo, Payoo, COD).
- Order tracking & delivery.
- Custom standalone admin frontend (Voucher management is integrated directly into Medusa's native admin dashboard per Decision I).

## Key Stakeholders

- Product Owner, Tech Lead, BA, QA.

## Success Criteria

- Cache hit rate > 85%, p95 latency targets met (<800ms for product suggestions, <400ms for voucher validation).
- Correct financial arithmetic (VND integers, 50% max cap strictly enforced).
- Zero UX-blocking errors (graceful degradation to hidden sections).
