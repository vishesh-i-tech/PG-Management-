# 📋 Morning Setup & Deployment Checklist for User
> **Project:** PG Manager by The Layout Office  
> **Prepared for:** Vishesh  
> **Date:** November 21, 2026  
> **Note:** The entire code architecture, migrations, database functions, and Phase 1-3 modules have been built and verified. You only need to provide external API keys and cloud services as outlined below.

---

## 1. 🗄️ Supabase Cloud Setup (10 Minutes)

1. **Create / Open Supabase Project:**
   * Go to [database.new](https://database.new) and create a project in the closest region (e.g., `Mumbai / ap-south-1`).
   * Copy the **Database Password**.

2. **Retrieve API Keys:**
   * Go to **Project Settings** > **API**.
   * Copy:
     - `Project URL` ➔ `NEXT_PUBLIC_SUPABASE_URL`
     - `anon public key` ➔ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role secret` ➔ `SUPABASE_SERVICE_ROLE_KEY`

3. **Push SQL Migrations:**
   Run from your local terminal:
   ```bash
   npx supabase link --project-ref your-project-ref
   npx supabase db push
   ```
   *(Or open `supabase/migrations/` files in the Supabase SQL Editor and run them in numerical order 001 to 010).*

4. **Verify Storage Buckets:**
   * Go to **Storage** tab in Supabase.
   * Ensure 4 buckets are created (created automatically by migration 010):
     - `tenant-kyc-documents` (Private)
     - `payment-receipts` (Private)
     - `complaint-attachments` (Private)
     - `pg-public-assets` (Public)

5. **Auth Configuration:**
   * Go to **Authentication** > **Providers** > **Phone**.
   * Enable Phone Authentication and choose your SMS Provider (Twilio / MSG91 / MessageBird) for Indian standard (+91) OTP verification.

---

## 2. 💳 Razorpay Payment Gateway (5 Minutes)

1. **Get API Keys:**
   * Log into [Razorpay Dashboard](https://dashboard.razorpay.com).
   * Navigate to **Settings** > **API Keys**.
   * Generate Test / Live keys:
     - Key ID ➔ `RAZORPAY_KEY_ID`
     - Key Secret ➔ `RAZORPAY_KEY_SECRET`

2. **Configure Webhook:**
   * Navigate to **Settings** > **Webhooks** > **Add New Webhook**.
   * **Webhook URL:** `https://your-domain.com/api/webhooks/razorpay` (or your local ngrok URL for testing).
   * **Secret:** Choose a strong secret ➔ `RAZORPAY_WEBHOOK_SECRET`.
   * **Active Events to Select:**
     - `payment.captured`
     - `payment.failed`
     - `refund.processed`

---

## 3. ⚙️ Local `.env.local` File Configuration

Create a file named `.env.local` in `D:\TECH\PG MANAGEMENT\` and fill in the values:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL="https://xxxxxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOi..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."

# Razorpay Credentials
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."

# Internal Cron Security Secret (generate any secure 32+ character string)
CRON_SECRET="pg_cron_super_secure_token_2026"
```

---

## 4. 🚀 Production Deployment to Vercel (5 Minutes)

1. **Push Changes to GitHub:**
   ```bash
   git add .
   git commit -m "feat: complete PG Management core platform"
   git push origin main
   ```

2. **Deploy on Vercel:**
   * Go to [vercel.com/new](https://vercel.com/new) and import `PG MANAGEMENT`.
   * Under **Environment Variables**, paste all keys from your `.env.local`.
   * Click **Deploy**.

3. **Verify Cron Automation:**
   * `vercel.json` automatically triggers daily rent generation and night-out curfew alerts at 10 PM IST using `Bearer ${CRON_SECRET}`.

---

## 5. 🤖 Run Final Architecture Review

Whenever you want ChatGPT to review the full implementation in the morning:
```bash
npm run review:phase -- "Phase 3 & Full Platform Review"
```
Or view the past review logs in `docs/reviews/`.
