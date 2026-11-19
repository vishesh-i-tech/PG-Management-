# Technical Implementation Plan & Architecture Specification
## PG Manager by The Layout Office

**Document Version:** 1.0.0  
**Date:** November 20, 2026  
**Status:** Architectural Proposal (Pending User Approval)  
**Author:** Senior Full-Stack Software Architect & Technical Lead  

---

## 1. Executive Summary & Workspace Assessment

### 1.1 Current Workspace State
An exhaustive inspection of the working directory (`D:\TECH\PG MANAGEMENT`) confirms:
- **Project Status:** Fresh workspace. No existing application codebase, Next.js configuration, or `package.json` file is present.
- **Directory Contents:** The workspace contains only an `.agents/` folder housing AI development skills and configurations. No files will be overwritten or corrupted.
- **Git Status:** Git repository is not yet initialized (`fatal: not a git repository`).
- **Host Runtime Environment:**
  - **Node.js:** `v25.1.0` (Active)
  - **npm:** `11.6.2` (Active)
  - **Git:** `2.51.2.windows.1` (Active)
  - **Package Management:** Standard `npm` with Node `v25.1.0`. Can also use `npx` for executing binaries such as the Supabase CLI (`npx supabase`).

### 1.2 Product Vision & Core Mission
**PG Manager by The Layout Office** is an enterprise-grade, mobile-first Progressive Web Application (PWA) tailored specifically for the Indian Paying Guest (PG) and hostel ecosystem. It provides multi-tenant operations bridging three distinct user personas:
1. **Owners:** Business oversight, room & bed inventory, financial health (rent collection vs. operational expenses), occupancy reports, and staff delegation.
2. **Wardens:** Ground-level operations, physical bed vacancy checks, student/guest check-in & check-out, digital gate entry/exit register, and immediate complaint resolution.
3. **Tenants:** Mobile-first dashboard for rent payments via UPI/cards, instant GST-compliant PDF receipts, transparent mess food schedules, maintenance ticket tracking, and gate pass management.

---

## 2. System Architecture & High-Level Design

```
+---------------------------------------------------------------------------------------+
|                                    CLIENT TIER                                        |
|  Mobile / Tablet / Desktop Browser (Mobile-First PWA, Installable, Offline Cache)     |
|  - Owner Portal  |  - Warden Portal  |  - Tenant Portal  |  - Shared Public/Auth      |
+-------------------------------------------+-------------------------------------------+
                                            | HTTPS / WSS
                                            v
+---------------------------------------------------------------------------------------+
|                              EDGE / NEXT.JS APPLICATION LAYER                         |
|  - App Router (React 19 / Server Components + Client Islands)                         |
|  - Next.js Middleware (Role Guards, Multi-Tenant PG Context Switcher, Session Check)    |
|  - Server Actions & Route Handlers (Zod Input Validation, Atomic Transactions)        |
+-------------------+-------------------------------+-----------------------------------+
                    |                               |
       Postgres Wire / Supabase SDK                 | REST / Webhooks
                    v                               v
+-----------------------------------+   +-----------------------------------------------+
|     SUPABASE BACKEND (PostgreSQL) |   |             EXTERNAL INTEGRATIONS             |
| - Row Level Security (RLS)        |   | - Razorpay API & Webhooks (Payments & Orders) |
| - Phone OTP Auth (E.164 +91)      |   | - WhatsApp Cloud API / BSP (WATI/Interakt)   |
| - Storage Buckets (KYC, Receipts) |   | - Vercel Cron / pg_cron (Scheduled Jobs)      |
| - pg_cron & pg_net (Automations)  |   | - Cloudflare Turnstile / Bot Mitigation       |
+-----------------------------------+   +-----------------------------------------------+
```

### 2.1 Architectural Principles
- **Strict Server-Enforced Security:** Zero reliance on client-side security checks. All authorization is backed by PostgreSQL Row Level Security (RLS) joined with tenant membership tables.
- **Mobile-First Touch Ergonomics:** 90%+ of end users (tenants and wardens) will interact via low-to-mid range mobile devices on 4G/5G connections. Minimal JavaScript payload, system fonts or optimized font subsets, native-feeling drawer sheets, bottom navigation bars, and instant touch feedback.
- **Idempotent Financial & Messaging Processing:** Webhooks from payment gateways (Razorpay) and messaging queues (WhatsApp) must be strictly idempotent to prevent double billing, duplicate receipts, or repeated notifications.
- **Fail-Safe Third-Party Providers:** Decoupled service layer abstractions allowing seamless switching between WhatsApp BSPs (Interakt, WATI) or Meta's Direct WhatsApp Cloud API without altering business logic.

---

## 3. Multi-Tenant Isolation & Security Strategy

Multi-tenancy in PG Manager is architected at the database row level with membership-based Row Level Security (RLS). Every operational business record belongs to a specific PG business (`pg_id`).

### 3.1 Tenancy Hierarchy
```
[Platform Account / Super Admin]
        |
        v
    [pgs] (Independent PG Businesses / Properties)
        |
        +---> [pg_members] (User-to-PG Role Mapping: owner, warden, tenant)
        |           |
        |           v
        |      [user_profiles] (Linked 1-to-1 with Supabase auth.users)
        |
        +---> [rooms] ---> [beds] ---> [tenant_bed_assignments]
        +---> [tenants]
        +---> [rent_records] ---> [payments]
        +---> [complaints]
        +---> [expenses]
        +---> [gate_logs]
        +---> [mess_menu]
        +---> [whatsapp_message_logs]
```

### 3.2 Row Level Security (RLS) Architecture
Every table has RLS explicitly enabled:
```sql
ALTER TABLE pgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_bed_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
```

#### Database Helper Functions (Security Definer)
To prevent recursive policy checks and maximize query planner performance:
1. `public.get_auth_user_role(target_pg_id UUID)`: Returns `'owner'`, `'warden'`, `'tenant'`, or `NULL` by checking `pg_members`.
2. `public.is_pg_owner(target_pg_id UUID)`: Returns `BOOLEAN`.
3. `public.is_pg_staff(target_pg_id UUID)`: Returns `TRUE` if user is either `'owner'` or `'warden'`.
4. `public.get_tenant_record_id(target_pg_id UUID)`: Returns the `tenants.id` corresponding to `auth.uid()` in that PG.

#### Example RLS Policy Matrix
| Table | Owner Access | Warden Access | Tenant Access |
|---|---|---|---|
| `pgs` | Full CRUD on own PG | Read-only for assigned PG | Read-only (basic info: name, address, rules) |
| `rooms` & `beds` | Full CRUD | Read & Update status (vacant/occupied/cleaning) | Read-only (own room/bed details) |
| `tenants` | Full CRUD | Read all, Create/Update tenant KYC | Read/Update own personal profile |
| `rent_records` | Full CRUD | Read-only | Read-only for own rent records |
| `payments` | Full CRUD (including manual cash entry) | Read & record cash payments (if permitted) | Read own payment history & initiate online pay |
| `complaints` | Full CRUD | View all, update status & resolution notes | View own, create new, submit feedback rating |
| `expenses` | Full CRUD | Create (daily petty cash), Read assigned | No access |
| `gate_logs` | Full CRUD | Full CRUD (log check-in/out, verify entries) | Read own logs, submit leave/night-out request |
| `mess_menu` | Full CRUD | Full CRUD | Read-only |
| `whatsapp_logs`| Read-only | No access | No access |

---

## 4. Comprehensive Database Schema Design

All tables utilize UUID primary keys (`gen_random_uuid()`), automatic timestamp triggers (`created_at`, `updated_at`), foreign keys with explicit cascade/restrict rules, check constraints, and performance indexes.

### 4.1 Schema Definitions (PostgreSQL DDL Reference)

```sql
-- 1. USER PROFILES (1-to-1 with Supabase auth.users)
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PGS (PG Business / Property)
CREATE TABLE public.pgs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode VARCHAR(6) NOT NULL,
    contact_phone VARCHAR(15) NOT NULL,
    contact_email TEXT,
    gender_type TEXT NOT NULL CHECK (gender_type IN ('boys', 'girls', 'coed')),
    gate_closing_time TIME NOT NULL DEFAULT '22:00:00',
    rules_and_regulations TEXT,
    bank_upi_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PG MEMBERS (Role-Based Membership & Multi-Tenancy Anchor)
CREATE TABLE public.pg_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'warden', 'tenant')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pg_id, user_id)
);

-- 4. ROOMS
CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    room_number VARCHAR(20) NOT NULL,
    floor_number INT NOT NULL DEFAULT 0,
    room_type TEXT NOT NULL CHECK (room_type IN ('single', 'double', 'triple', 'four_sharing', 'dormitory')),
    has_attached_bathroom BOOLEAN NOT NULL DEFAULT FALSE,
    has_ac BOOLEAN NOT NULL DEFAULT FALSE,
    has_balcony BOOLEAN NOT NULL DEFAULT FALSE,
    base_monthly_rent NUMERIC(10, 2) NOT NULL CHECK (base_monthly_rent >= 0),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'full')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pg_id, room_number)
);

-- 5. BEDS
CREATE TABLE public.beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    bed_label VARCHAR(20) NOT NULL, -- e.g. "Bed 1", "Bed A", "Window Side"
    monthly_rent NUMERIC(10, 2) NOT NULL CHECK (monthly_rent >= 0),
    status TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant', 'occupied', 'reserved', 'maintenance')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(room_id, bed_label)
);

-- 6. TENANTS (Tenant Identity & KYC Profile)
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone VARCHAR(15) NOT NULL,
    email TEXT,
    alternate_phone VARCHAR(15),
    id_proof_type TEXT NOT NULL CHECK (id_proof_type IN ('aadhaar', 'pan', 'driving_license', 'passport', 'voter_id', 'college_id', 'other')),
    id_proof_number TEXT,
    id_proof_document_url TEXT,
    photo_url TEXT,
    permanent_address TEXT,
    emergency_contact_name TEXT NOT NULL,
    emergency_contact_phone VARCHAR(15) NOT NULL,
    emergency_contact_relation TEXT NOT NULL,
    work_or_college_details TEXT,
    security_deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (security_deposit_amount >= 0),
    security_deposit_status TEXT NOT NULL DEFAULT 'pending' CHECK (security_deposit_status IN ('pending', 'paid', 'partially_refunded', 'refunded', 'forfeited')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'notice_period', 'vacated', 'blacklisted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. TENANT BED ASSIGNMENTS (History & Active Stays)
CREATE TABLE public.tenant_bed_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    bed_id UUID NOT NULL REFERENCES public.beds(id) ON DELETE RESTRICT,
    agreed_monthly_rent NUMERIC(10, 2) NOT NULL CHECK (agreed_monthly_rent >= 0),
    assigned_from DATE NOT NULL,
    assigned_to DATE,
    notice_given_date DATE,
    vacating_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. RENT RECORDS (Monthly Billing Ledger)
CREATE TABLE public.rent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES public.tenant_bed_assignments(id) ON DELETE SET NULL,
    billing_month DATE NOT NULL, -- Stored as first of month, e.g. 2026-11-01
    due_date DATE NOT NULL,
    base_rent_amount NUMERIC(10, 2) NOT NULL CHECK (base_rent_amount >= 0),
    utility_charges NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (utility_charges >= 0),
    late_fee_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (late_fee_amount >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_due_amount NUMERIC(10, 2) NOT NULL CHECK (total_due_amount >= 0),
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    balance_amount NUMERIC(10, 2) NOT NULL CHECK (balance_amount >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_paid', 'paid', 'overdue', 'waived')),
    generated_by TEXT NOT NULL DEFAULT 'system' CHECK (generated_by IN ('system', 'manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, billing_month)
);

-- 9. PAYMENTS (Transactions: Razorpay, UPI, Cash)
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    rent_record_id UUID REFERENCES public.rent_records(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('razorpay_upi', 'razorpay_card', 'razorpay_netbanking', 'cash', 'direct_upi_qr', 'bank_transfer')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'successful', 'failed', 'refunded')),
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature TEXT,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    receipt_pdf_url TEXT,
    recorded_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. COMPLAINTS (Maintenance & Service Desk)
CREATE TABLE public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('plumbing', 'electrical', 'carpentry', 'cleaning', 'wifi', 'food', 'noise_disturbance', 'security', 'other')),
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    photo_urls TEXT[] NOT NULL DEFAULT '{}',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'rejected')),
    assigned_to_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    tenant_feedback_rating INT CHECK (tenant_feedback_rating BETWEEN 1 AND 5),
    tenant_feedback_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. EXPENSES (Operational Cost Ledger)
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('groceries_food', 'electricity_bill', 'water_bill', 'wifi_internet', 'staff_salary', 'property_rent', 'repairs_maintenance', 'cleaning_supplies', 'marketing', 'taxes', 'other')),
    title VARCHAR(150) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL,
    payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'bank_transfer', 'credit_card', 'cheque')),
    receipt_attachment_url TEXT,
    vendor_name VARCHAR(150),
    recorded_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. GATE LOGS (Entry & Exit Register)
CREATE TABLE public.gate_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('check_out', 'check_in', 'night_out_request', 'late_entry')),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_return_at TIMESTAMPTZ,
    actual_return_at TIMESTAMPTZ,
    reason TEXT,
    is_late_entry BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by_user_id UUID REFERENCES public.user_profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. MESS MENU (Weekly Food Schedule)
CREATE TABLE public.mess_menu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday ... 6 = Saturday
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'evening_snacks', 'dinner')),
    menu_items TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    special_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pg_id, day_of_week, meal_type)
);

-- 14. WHATSAPP MESSAGE LOGS (Notification Audit & Retries)
CREATE TABLE public.whatsapp_message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    recipient_phone VARCHAR(15) NOT NULL,
    recipient_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('rent_reminder', 'payment_receipt', 'complaint_update', 'gate_closing_reminder', 'inquiry_response', 'custom_broadcast')),
    template_name VARCHAR(100) NOT NULL,
    template_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    provider_message_id TEXT,
    delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. AUDIT LOGS (Security & Compliance Ledger)
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID REFERENCES public.pgs(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. SUBSCRIPTIONS (Platform SaaS Billing & Multi-PG Onboarding)
CREATE TABLE public.pg_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pg_id UUID NOT NULL REFERENCES public.pgs(id) ON DELETE CASCADE,
    plan_tier TEXT NOT NULL CHECK (plan_tier IN ('trial', 'starter', 'growth', 'enterprise')),
    max_beds INT NOT NULL DEFAULT 20,
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES FOR OPTIMAL QUERY PERFORMANCE
CREATE INDEX idx_pg_members_user_pg ON public.pg_members(user_id, pg_id);
CREATE INDEX idx_rooms_pg_status ON public.rooms(pg_id, status);
CREATE INDEX idx_beds_room_status ON public.beds(room_id, status);
CREATE INDEX idx_beds_pg_status ON public.beds(pg_id, status);
CREATE INDEX idx_tenants_pg_status ON public.tenants(pg_id, status);
CREATE INDEX idx_tenants_phone ON public.tenants(phone);
CREATE INDEX idx_rent_records_pg_month ON public.rent_records(pg_id, billing_month);
CREATE INDEX idx_rent_records_tenant ON public.rent_records(tenant_id, status);
CREATE INDEX idx_payments_pg_status ON public.payments(pg_id, payment_status);
CREATE INDEX idx_payments_order ON public.payments(razorpay_order_id);
CREATE INDEX idx_complaints_pg_status ON public.complaints(pg_id, status);
CREATE INDEX idx_gate_logs_tenant_date ON public.gate_logs(tenant_id, logged_at);
CREATE INDEX idx_whatsapp_status ON public.whatsapp_message_logs(delivery_status, retry_count);
```

### 4.2 Why Additional Tables Were Introduced
1. `tenant_bed_assignments`: Critical for maintaining an unbroken historical audit trail. Tenants frequently switch rooms (e.g. 3-sharing to 2-sharing) or vacate. Binding the rent calculation directly to a bed assignment prevents data corruption when room rates change or beds get reassigned.
2. `audit_logs`: Essential for legal compliance, tenant disputes, and tracking who collected cash payments or changed rent waivers.
3. `pg_subscriptions`: Enables The Layout Office to monetize the software as a SaaS platform based on bed limits (e.g., up to 25 beds free/trial, 50 beds tier, unlimited enterprise).

---

## 5. Authentication & Authorization Strategy

### 5.1 Phone OTP Authentication (Supabase Auth)
- Indian users overwhelmingly favor mobile numbers over emails. Authentication uses standard E.164 phone format (`+91XXXXXXXXXX`).
- Supabase Auth supports Phone OTP natively (via providers such as Twilio, MSG91, or custom SMS webhooks).
- Once OTP is verified, Supabase issues JWT session cookies managed securely by `@supabase/ssr`.

### 5.2 Next.js Middleware Routing & Role Guards
Routing uses dedicated route groups:
- `/(auth)`: `/login`, `/verify-otp`, `/onboarding`
- `/(dashboard)/owner/*`: Restricted to users with `role = 'owner'` in the active PG.
- `/(dashboard)/warden/*`: Restricted to users with `role = 'warden'`.
- `/(dashboard)/tenant/*`: Restricted to authenticated tenants.

```typescript
// Architectural Flow in middleware.ts
1. Extract session cookie via createServerClient from @supabase/ssr.
2. If no valid session -> Redirect to /login with redirect parameter.
3. If path matches /(dashboard)/:
   a. Retrieve user's active pg_id from a secure cookie (or default to first active PG).
   b. Verify user's role in pg_members for that pg_id.
   c. If attempting to access /owner but role is 'warden' or 'tenant' -> Redirect to unauthorized or role dashboard.
   d. Inject x-pg-id and x-user-role into request headers for downstream server components.
```

---

## 6. Payment Architecture (Razorpay Integration)

### 6.1 Strict Server-Side Verification Pipeline
No payment state transition ever trusts the frontend client. The complete lifecycle is shown below:

```
[Tenant Mobile App]               [Next.js Server Action]              [Razorpay Gateway]
        |                                    |                                  |
        | 1. Click "Pay Rent (Rs 8,000)"     |                                  |
        |----------------------------------->|                                  |
        |                                    | 2. Create Order (order_xxx)      |
        |                                    |--------------------------------->|
        |                                    |<---------------------------------|
        |                                    | 3. Save pending payment record   |
        | 4. Return order_id & key_id        |    with idempotency key          |
        |<-----------------------------------|                                  |
        |                                                                       |
        | 5. Launch Razorpay Checkout Modal (UPI / Cards / NetBanking)          |
        |---------------------------------------------------------------------->|
        |                                                                       |
        | 6. User approves payment on UPI App (GPay/PhonePe)                    |
        |                                                                       |
        |                                    | 7. Webhook: payment.captured     |
        |                                    |<---------------------------------|
        |                                    | 8. Verify HMAC SHA256 Signature  |
        |                                    | 9. Check if already processed    |
        |                                    | 10. BEGIN TRANSACTION:           |
        |                                    |     - Update payment: successful |
        |                                    |     - Update rent_record balance |
        |                                    |     - Generate PDF receipt       |
        |                                    |     - Queue WhatsApp receipt msg |
        |                                    |     COMMIT;                      |
        |                                    | 11. Return HTTP 200 OK           |
        |                                    |--------------------------------->|
        |                                                                       |
        | 12. Frontend redirects to /tenant/receipts/RCP-202611-0001           |
        |<----------------------------------------------------------------------+
```

### 6.2 Partial Payments & Cash Payment Handling
- **Partial Payments:** If rent is ₹9,000 and tenant pays ₹4,000, `rent_records.paid_amount` increments to ₹4,000, `balance_amount` adjusts to ₹5,000, and `status` transitions to `'partially_paid'`.
- **Cash Payments:** The owner or authorized warden records cash received via a protected server action. A verified `payments` row is inserted (`payment_method = 'cash'`, `recorded_by_user_id = auth.uid()`), generating an official receipt number instantly.

### 6.3 PDF Receipt Generation
Receipts are generated server-side using `@react-pdf/renderer` or `pdf-lib`, featuring:
- Official "The Layout Office" & PG branding.
- Unique alphanumeric receipt number (`RCP-YYYYMM-XXXX`).
- Tenant details, room & bed number.
- Itemized breakdown (base rent, electricity, maintenance, adjustments).
- Payment method & transaction timestamp.
- Saved into the private Supabase Storage bucket `receipts` and delivered via signed URLs.

---

## 7. WhatsApp Automation Architecture

### 7.1 Architecture & Provider Strategy
To avoid vendor lock-in and account approval delays, the messaging module uses an Abstract Provider Interface:

```typescript
// src/lib/whatsapp/types.ts
export interface IWhatsAppService {
  sendRentReminder(params: { phone: string; tenantName: string; amount: number; dueDate: string; paymentUrl: string }): Promise<WhatsAppResult>;
  sendPaymentReceipt(params: { phone: string; tenantName: string; receiptNumber: string; amount: number; pdfUrl: string }): Promise<WhatsAppResult>;
  sendGateClosingAlert(params: { phone: string; tenantName: string; closingTime: string }): Promise<WhatsAppResult>;
  sendComplaintNotification(params: { phone: string; ticketId: string; category: string; description: string }): Promise<WhatsAppResult>;
}
```

Implementations:
1. `MetaCloudApiProvider`: Direct Meta Graph API integration.
2. `InteraktOrWatiProvider`: Plug-and-play BSP REST API.
3. `MockDevWhatsAppProvider`: Logs payloads to console and writes to `whatsapp_message_logs` during local development without burning API credits.

### 7.2 Scheduled Cron Triggers
- **1st of Month at 09:00 AM IST:** Automated Rent Generation & 1st Reminder Broadcast via Vercel Cron or Supabase `pg_cron`.
- **5th & 8th of Month:** Follow-up reminders for rent records where `status IN ('pending', 'partially_paid')`.
- **Daily at 10:00 PM IST:** Gate Closing reminder broadcast to active tenants currently marked as "checked out" in `gate_logs`.

---

## 8. Mobile-First UI/UX & PWA Design System

### 8.1 Visual & Ergonomic Foundations
- **Target Audience:** Indian PG owners (often non-technical), wardens, and young college/working tenants.
- **Form Factors:** Mobile-first layout (max-width `md` containers on mobile, responsive split views on desktop/tablets).
- **Navigation:**
  - Mobile: Native bottom navigation bar with 4 primary tabs + action sheet.
  - Desktop: Collapsible sidebar navigation.
- **Design Tokens:**
  - Primary Brand: Professional Indigo & Slate (`#1E293B`, `#4F46E5`).
  - Accent / Actions: Emerald Green for payments (`#059669`), Amber for pending/warnings (`#D97706`), Rose for overdue/complaints (`#E11D48`).
  - Typography: Clean sans-serif (`Inter` or system-ui) optimized for high legibility on small screens.
- **PWA Capabilities:**
  - Manifest file with app icons, standalone display mode, theme colors.
  - Service worker caching static assets, shell UI, and offline read access for emergency warden logs and tenant contact directories.

---

## 9. Proposed Project Folder Structure

```
D:\TECH\PG MANAGEMENT\
├── .agents/                               # Existing AI agent skills
├── .github/
│   └── workflows/
│       └── ci.yml                         # Lint, type-check, test
├── public/
│   ├── icons/                             # PWA icon set (192x192, 512x512)
│   ├── manifest.json                      # PWA web app manifest
│   ├── favicon.ico
│   └── sw.js                              # PWA service worker
├── src/
│   ├── app/
│   │   ├── (auth)/                        # Authentication Route Group
│   │   │   ├── login/page.tsx
│   │   │   ├── verify-otp/page.tsx
│   │   │   └── onboarding/page.tsx
│   │   ├── (dashboard)/                   # Protected Dashboard Route Group
│   │   │   ├── layout.tsx                 # Role-aware navigation & PG context provider
│   │   │   ├── owner/                     # Owner Experience
│   │   │   │   ├── page.tsx               # Analytics & Executive Overview
│   │   │   │   ├── pgs/page.tsx           # Multi-PG Switcher & Property Config
│   │   │   │   ├── rooms/page.tsx         # Room & Bed Visual Matrix
│   │   │   │   ├── tenants/page.tsx       # Tenant Directory & Onboarding
│   │   │   │   ├── rent/page.tsx          # Monthly Rent Collections & Cash Entry
│   │   │   │   ├── expenses/page.tsx      # Expense Tracker & Petty Cash
│   │   │   │   ├── complaints/page.tsx    # Complaint SLA Tracker
│   │   │   │   ├── gate-logs/page.tsx     # Gate Register Overview
│   │   │   │   ├── mess/page.tsx          # Weekly Menu Editor
│   │   │   │   └── reports/page.tsx       # Financial & Occupancy Export
│   │   │   ├── warden/                    # Warden Experience
│   │   │   │   ├── page.tsx               # Warden Daily Operations Summary
│   │   │   │   ├── beds/page.tsx          # Quick Vacancy Check & Room Status
│   │   │   │   ├── gate-entry/page.tsx    # Fast QR/Manual Check-in & Check-out
│   │   │   │   └── complaints/page.tsx    # Ticket Resolution & Photo Upload
│   │   │   └── tenant/                    # Tenant Experience
│   │   │       ├── page.tsx               # Rent Due Card & Quick Actions
│   │   │       ├── pay/page.tsx           # Razorpay Payment Screen
│   │   │       ├── receipts/page.tsx      # PDF Receipts Vault
│   │   │       ├── complaints/page.tsx    # Raise Maintenance Ticket
│   │   │       ├── gate-pass/page.tsx     # Late Entry / Night Out Request
│   │   │       └── mess/page.tsx          # Today's Meal Schedule
│   │   ├── api/
│   │   │   ├── webhooks/
│   │   │   │   ├── razorpay/route.ts      # Razorpay payment.captured webhook
│   │   │   │   └── whatsapp/route.ts      # Inbound WhatsApp message/status webhook
│   │   │   ├── cron/
│   │   │   │   ├── rent-generation/route.ts # 1st of month auto rent billing
│   │   │   │   ├── rent-reminders/route.ts  # Overdue notifications
│   │   │   │   └── gate-reminder/route.ts   # 10 PM gate alert
│   │   │   └── receipts/[paymentId]/route.ts# Dynamic PDF receipt download
│   │   ├── layout.tsx                     # Root Layout
│   │   ├── page.tsx                       # Public Landing Page / Marketing
│   │   └── globals.css                    # Tailwind CSS definitions
│   ├── components/
│   │   ├── ui/                            # Atomic UI: Button, Input, Modal, Badge, Card, Drawer
│   │   ├── shared/                        # TopBar, BottomNav, Sidebar, FileUpload, StatusBadge
│   │   ├── owner/                         # BedMatrixGrid, FinancialCharts, TenantForm
│   │   ├── warden/                        # GateScanner, QuickCheckoutList
│   │   └── tenant/                        # RentPayCard, ComplaintTimeline, MessTodayCard
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                  # Client-side Supabase Browser Client
│   │   │   ├── server.ts                  # Server-side Supabase SSR Client
│   │   │   ├── middleware.ts              # Session & cookie validation
│   │   │   └── admin.ts                   # Service-role admin client (restricted)
│   │   ├── razorpay/
│   │   │   ├── client.ts                  # Razorpay SDK instance
│   │   │   └── verify.ts                  # Webhook signature validation
│   │   ├── whatsapp/
│   │   │   ├── client.ts                  # Provider router
│   │   │   ├── meta-provider.ts           # Meta Cloud API
│   │   │   ├── mock-provider.ts           # Local development logger
│   │   │   └── templates.ts               # Approved template configurations
│   │   ├── pdf/
│   │   │   └── receipt-document.tsx       # PDF receipt React component
│   │   ├── validations/                   # Zod validation schemas for all mutations
│   │   └── utils/
│   ├── types/
│   │   ├── database.types.ts              # Generated Supabase TypeScript types
│   │   └── index.ts                       # Shared application domain models
│   └── middleware.ts                      # Edge auth & role-based routing
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20261120000000_core_schema.sql # Complete DDL
│   │   └── 20261120000001_rls_security.sql# Security Definer functions & RLS
│   └── seed.sql                           # Clean development seed data
├── PROJECT_PLAN.md                        # This document
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 10. Environment Variables Checklist

### 10.1 Public Client-Side (`.env.local`)
```env
# Supabase Public Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

# Application Branding & URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="PG Manager"
NEXT_PUBLIC_BRAND_NAME="The Layout Office"

# Razorpay Client-Side Key ID
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
```

### 10.2 Secret Server-Side (`.env.local` / Vercel Secrets)
```env
# Supabase Admin Access (Never expose to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Razorpay Server Secrets
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_signing_secret

# WhatsApp Provider Configuration
WHATSAPP_PROVIDER=mock # Options: 'mock' | 'meta' | 'wati' | 'interakt'
WHATSAPP_API_TOKEN=your_meta_system_user_token
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_waba_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=custom_random_token_for_verification

# Cron Job Authorization
CRON_SECRET=your_random_32_character_cron_secret
```

---

## 11. Technical Risks, Gaps & Architectural Mitigations

| # | Identified Risk / Challenge | Potential Impact | Architectural Mitigation Strategy |
|---|---|---|---|
| 1 | **WhatsApp Template Approval Delays** | Notifications blocked in production if Meta rejects custom text templates. | Use pre-approved transactional utility templates (payment receipts, account updates) rather than promotional marketing templates. Provide fallback SMS via MSG91/Twilio if WhatsApp delivery fails. Implement `MockDevWhatsAppProvider` so development and testing proceed unimpeded. |
| 2 | **Indian SMS / DLT Regulations** | Indian telecom mandates DLT registration for transactional SMS. Sending OTPs without DLT registration leads to message rejection by carriers. | Supabase Phone Auth integrates directly with Twilio or MSG91. During development and staging, use Supabase's Test Phone Numbers with fixed OTPs to avoid telecom carrier dependencies. Complete DLT registration early in Phase 0. |
| 3 | **Payment Webhook Race Conditions** | Razorpay webhooks and tenant client redirects may arrive simultaneously, causing duplicate payment entries. | Enforce database UNIQUE constraint on `razorpay_payment_id`. Use a PostgreSQL atomic transaction (`SERIALIZABLE` or `FOR UPDATE` lock) inside an RPC or Server Action to ensure idempotent ledger updates. |
| 4 | **Gate Operation in Low-Connectivity Basements** | Wardens unable to submit gate entry logs due to poor cellular reception in entryways/basements. | PWA Service Worker caches the gate log UI. Offline entries are temporarily stored in browser IndexedDB and automatically synchronized as soon as connectivity resumes. |
| 5 | **Split Multi-Tenant Razorpay Payouts** | When multiple PG owners use the platform, funds collected via Razorpay must either be routed to the platform account and paid out, or sent directly to each PG owner's Razorpay account. | Architecture supports two models: **Model A (Direct Merchant Credential):** Each PG owner enters their own Razorpay Key & Secret in settings. **Model B (Platform Route):** The Layout Office collects payments and uses Razorpay Route / Linked Accounts for automated split settlements. We recommend Model A for initial launch to eliminate platform liability, transitioning to Model B for SaaS subscription tiers. |
| 6 | **Concurrent Bed Allocation Race Conditions** | Two wardens/owners allocating the same vacant bed to two different tenants at the same minute. | Database exclusion constraint or a conditional transactional update: `UPDATE beds SET status = 'occupied' WHERE id = target_id AND status = 'vacant' RETURNING id;`. If 0 rows return, raise an error immediately. |

---

## 12. Phased Development Roadmap

```
+----------------------------------------------------------------------------------------------------------+
| PHASE 0: External Accounts & Prerequisite Setup (Parallel Track)                                         |
| - Supabase Project creation & storage bucket setup                                                       |
| - Razorpay Merchant Account & Test API Key generation                                                    |
| - Meta WhatsApp Business Account / BSP registration & template drafts                                    |
+----------------------------------------------------------------------------------------------------------+
                                                    |
                                                    v
+----------------------------------------------------------------------------------------------------------+
| PHASE 1: Project Foundation & Database Architecture                                                      |
| - Initialize Next.js 15+ App Router, TypeScript (Strict Mode), Tailwind CSS, PWA Shell                   |
| - Execute Supabase Migrations: 16 core tables, check constraints, foreign keys, and indexes              |
| - Apply PostgreSQL RLS security definer policies & verify multi-tenant isolation tests                   |
+----------------------------------------------------------------------------------------------------------+
                                                    |
                                                    v
+----------------------------------------------------------------------------------------------------------+
| PHASE 2: Authentication, Onboarding & Role-Based Permissions                                            |
| - Supabase Phone OTP auth integration with Indian phone format validation                                |
| - User profile setup & PG property creation wizard (Owner Onboarding)                                    |
| - Warden & Tenant invitation flows via secure link/code                                                  |
| - Next.js Middleware route guards for /owner, /warden, and /tenant                                       |
+----------------------------------------------------------------------------------------------------------+
                                                    |
                                                    v
+----------------------------------------------------------------------------------------------------------+
| PHASE 3: Core PG Management Modules                                                                      |
| - Rooms & Beds management matrix (visual grid of occupancy)                                              |
| - Tenant KYC onboarding (document upload to private storage, emergency contacts, bed assignment)         |
| - Gate entry/exit digital register with late-entry tagging                                               |
| - Maintenance complaints ticketing system with photo attachments and status workflow                    |
| - Weekly Mess Menu scheduling & daily view                                                               |
| - Operational expense tracker with receipt uploads and category breakdown                                |
+----------------------------------------------------------------------------------------------------------+
                                                    |
                                                    v
+----------------------------------------------------------------------------------------------------------+
| PHASE 4: Razorpay Payments & Dynamic PDF Receipts                                                        |
| - Server-side Razorpay Order creation API                                                                |
| - Mobile-first Razorpay Checkout modal (UPI QR, GPay, PhonePe, Cards)                                    |
| - Verified Webhook receiver (`/api/webhooks/razorpay`) with HMAC signature checking & idempotency        |
| - Manual cash payment recording & reconciliation by Owner/Warden                                         |
| - Automatic GST-compliant PDF receipt generation and storage                                             |
+----------------------------------------------------------------------------------------------------------+
                                                    |
                                                    v
+----------------------------------------------------------------------------------------------------------+
| PHASE 5: WhatsApp Automation & Scheduled Background Jobs                                                 |
| - WhatsApp Provider adapter (Meta Cloud API / WATI / Local Mock logger)                                  |
| - 1st of month rent bill generation & reminder trigger                                                   |
| - Instant payment receipt WhatsApp notification                                                          |
| - Warden complaint alerts & tenant resolution notifications                                              |
| - Daily 10 PM gate-closing broadcast to checked-out tenants                                              |
+----------------------------------------------------------------------------------------------------------+
                                                    |
                                                    v
+----------------------------------------------------------------------------------------------------------+
| PHASE 6: Testing, Security Audits & Pilot Run                                                            |
| - RLS penetration testing: verify cross-tenant data leakage is mathematically impossible                 |
| - Webhook replay attack tests and network drop simulations                                               |
| - Real-device mobile PWA testing across Android & iOS browsers                                           |
| - Pilot deployment with 1-2 actual PG properties for real-world feedback                                 |
+----------------------------------------------------------------------------------------------------------+
                                                    |
                                                    v
+----------------------------------------------------------------------------------------------------------+
| PHASE 7: Production Launch & SaaS Subscription Billing                                                   |
| - Production domain & Vercel edge deployment                                                             |
| - The Layout Office SaaS subscription billing (bed-tier limits)                                          |
| - Comprehensive monitoring (Sentry error tracking, Supabase database metrics)                            |
+----------------------------------------------------------------------------------------------------------+
```

---

## 13. Summary & Recommended Next Steps

### Architect's Assessment
The workspace is currently in an optimal, clean state ready for scaffolding. The technical stack (Next.js App Router, TypeScript, Tailwind CSS, Supabase PostgreSQL with RLS, Razorpay, WhatsApp API) perfectly matches the requirements for a high-performance, mobile-first Indian PG platform.

By completing this comprehensive architectural specification and recording it in `PROJECT_PLAN.md`, we have established:
1. Strict tenant isolation through database-level Row Level Security (RLS).
2. Resilient, tamper-proof payment processing that relies solely on verified server-side webhooks.
3. Decoupled third-party services so development is never stalled by external WhatsApp or SMS approval processes.
4. Clean separation of concerns between Owner, Warden, and Tenant personas.

### Immediate Action Required
Please review this architectural proposal and confirm your approval. Upon receiving your confirmation, we will proceed directly to **Phase 1: Project Foundation & Database Architecture**.
