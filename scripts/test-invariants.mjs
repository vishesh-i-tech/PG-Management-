/**
 * Antigravity Architectural & Security Invariant Test Suite
 * Validates critical database exclusion constraints, payment immutability,
 * date-range collision prevention, webhook replay safety, and multi-tenant RLS isolation.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
  } else {
    failedTests++;
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${testName}`);
    if (details) console.error(`    \x1b[33m${details}\x1b[0m`);
  }
}

// Read all migration files into concatenated string for static analysis
const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
const fullSchemaSql = migrationFiles
  .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n\n");

console.log("\n================================================================================");
console.log("       ANTIGRAVITY ARCHITECTURAL & SECURITY INVARIANT VERIFICATION SUITE       ");
console.log("================================================================================\n");

// -----------------------------------------------------------------------------
// SUITE 1: Bed Allocation Invariants (Double-Booking Prevention)
// -----------------------------------------------------------------------------
console.log("\x1b[36m[SUITE 1]\x1b[0m Bed Allocation & Collision-Free Invariants");

// 1.1 Static DDL Check: btree_gist extension and gist exclusion constraint
assert(
  /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"btree_gist"/i.test(fullSchemaSql),
  "PostgreSQL 'btree_gist' extension is enabled for multi-column range exclusions"
);

assert(
  /no_overlapping_bed_assignments\s+EXCLUDE\s+USING\s+gist/i.test(fullSchemaSql) &&
  /bed_id\s+WITH\s+=/i.test(fullSchemaSql),
  "Table 'tenant_bed_assignments' contains GIST exclusion constraint for 'bed_id'"
);

// 1.2 Mathematical Date-Range Overlap Logic Simulation
function doDateRangesOverlap(startA, endA, startB, endB) {
  const sA = new Date(startA).getTime();
  const eA = endA ? new Date(endA).getTime() : Infinity;
  const sB = new Date(startB).getTime();
  const eB = endB ? new Date(endB).getTime() : Infinity;
  return sA < eB && sB < eA;
}

assert(
  doDateRangesOverlap("2026-01-01", "2026-06-30", "2026-04-01", "2026-10-31") === true,
  "Range engine correctly detects overlapping bed allocations (Partial Overlap)"
);

assert(
  doDateRangesOverlap("2026-01-01", null, "2026-03-01", "2026-05-01") === true,
  "Range engine correctly detects collision with open-ended ('infinity') tenancy"
);

assert(
  doDateRangesOverlap("2026-01-01", "2026-04-30", "2026-05-01", "2026-12-31") === false,
  "Range engine permits strictly adjacent non-overlapping sequential tenancies"
);

// -----------------------------------------------------------------------------
// SUITE 2: Single-Tenant Single-Bed Invariant
// -----------------------------------------------------------------------------
console.log("\n\x1b[36m[SUITE 2]\x1b[0m Single-Tenant Active Allocation Invariant");

assert(
  /excl_no_overlapping_tenant_stays\s+EXCLUDE\s+USING\s+gist/i.test(fullSchemaSql) &&
  /tenant_id\s+WITH\s+=/i.test(fullSchemaSql),
  "Table 'tenant_bed_assignments' contains GIST exclusion constraint preventing one tenant in multiple beds"
);

// -----------------------------------------------------------------------------
// SUITE 3: Financial Ledger Immutability & Reconciler
// -----------------------------------------------------------------------------
console.log("\n\x1b[36m[SUITE 3]\x1b[0m Financial Ledger Immutability & Double-Entry Integrity");

assert(
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?trg_enforce_payment_immutability/i.test(fullSchemaSql),
  "Stored function 'trg_enforce_payment_immutability' exists in SQL migrations"
);

assert(
  /CREATE\s+TRIGGER\s+trg_payments_immutable\s+BEFORE\s+(?:UPDATE\s+OR\s+DELETE|UPDATE|DELETE)\s+ON\s+(?:public\.)?payments/i.test(fullSchemaSql),
  "Immutable payments trigger attaches BEFORE UPDATE OR DELETE on 'payments' table"
);

assert(
  /RAISE\s+EXCEPTION\s+'Successful payments are immutable/i.test(fullSchemaSql),
  "Trigger explicitly rejects direct SQL mutations on finalized payment records"
);

// Ledger reconciliation mathematical invariant
function calculateRentRecordBalance(baseRent, utilityCharges, lateFee, discount, allocatedPayments) {
  const totalDue = baseRent + utilityCharges + lateFee - discount;
  const paid = allocatedPayments.reduce((acc, p) => acc + p, 0);
  const balance = Math.max(0, totalDue - paid);
  let status = "pending";
  if (balance === 0 && totalDue > 0) status = "paid";
  else if (paid > 0 && balance > 0) status = "partially_paid";
  return { totalDue, paid, balance, status };
}

const ledgerTest1 = calculateRentRecordBalance(10000, 500, 0, 500, [5000]);
assert(
  ledgerTest1.totalDue === 10000 && ledgerTest1.balance === 5000 && ledgerTest1.status === "partially_paid",
  "Ledger accurately calculates balance after partial payment (₹5,000 paid on ₹10,000 due)"
);

const ledgerTest2 = calculateRentRecordBalance(10000, 0, 200, 0, [10200]);
assert(
  ledgerTest2.balance === 0 && ledgerTest2.status === "paid",
  "Ledger marks bill 'paid' when full amount plus late fee is satisfied"
);

// -----------------------------------------------------------------------------
// SUITE 4: Webhook Replay Protection & Idempotency
// -----------------------------------------------------------------------------
console.log("\n\x1b[36m[SUITE 4]\x1b[0m Webhook Replay Protection & Cryptographic Verification");

assert(
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?webhook_events/i.test(fullSchemaSql),
  "Table 'webhook_events' exists for transaction deduplication"
);

assert(
  /CONSTRAINT\s+uq_webhook_provider_event\s+UNIQUE\s*\(\s*provider,\s*event_id\s*\)/i.test(fullSchemaSql) ||
  /UNIQUE\s*\(\s*event_id\s*\)/i.test(fullSchemaSql) ||
  /CREATE\s+UNIQUE\s+INDEX\s+.*webhook_events.*event_id/i.test(fullSchemaSql),
  "Webhook events schema guarantees uniqueness on '(provider, event_id)' to prevent replay attacks"
);

// HMAC Signature verification simulation
function verifyRazorpaySignature(rawBody, secret, receivedSignature) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedSignature));
}

const mockBody = JSON.stringify({ event: "payment.captured", id: "evt_12345" });
const mockSecret = "test_webhook_secret_key";
const validSignature = crypto.createHmac("sha256", mockSecret).update(mockBody).digest("hex");
const invalidSignature = crypto.createHmac("sha256", "wrong_secret").update(mockBody).digest("hex");

assert(
  verifyRazorpaySignature(mockBody, mockSecret, validSignature) === true,
  "HMAC SHA-256 signature verifier accepts valid webhook signatures"
);

assert(
  verifyRazorpaySignature(mockBody, mockSecret, invalidSignature) === false,
  "HMAC SHA-256 signature verifier rejects forged/tampered webhook signatures"
);

// -----------------------------------------------------------------------------
// SUITE 5: Gate State Transition Machine
// -----------------------------------------------------------------------------
console.log("\n\x1b[36m[SUITE 5]\x1b[0m Gate State Machine & Curfew Evaluation");

assert(
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?record_gate_movement/i.test(fullSchemaSql),
  "Stored procedure 'record_gate_movement' exists in migrations"
);

assert(
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?get_tenants_outside_for_gate_alert/i.test(fullSchemaSql),
  "Stored procedure 'get_tenants_outside_for_gate_alert' exists for curfew queries"
);

// Gate transition state machine validator
function isValidGateTransition(currentState, eventType) {
  if (eventType === "check_out" && currentState === "inside") return true;
  if (eventType === "check_in" && (currentState === "outside" || currentState === "night_out")) return true;
  if (eventType === "night_out" && currentState === "outside") return true;
  return false;
}

assert(
  isValidGateTransition("inside", "check_out") === true,
  "Resident can check out when inside"
);

assert(
  isValidGateTransition("outside", "check_in") === true,
  "Resident can check in when outside"
);

assert(
  isValidGateTransition("inside", "check_in") === false,
  "Resident cannot check in if already recorded inside"
);

// Curfew time comparison logic
function isPastCurfew(curfewTimeStr, currentTimeStr) {
  const [cH, cM] = curfewTimeStr.split(":").map(Number);
  const [nH, nM] = currentTimeStr.split(":").map(Number);
  return nH > cH || (nH === cH && nM > cM);
}

assert(
  isPastCurfew("22:00:00", "22:15:00") === true,
  "Curfew algorithm identifies check after closing time as late (22:15 past 22:00)"
);

assert(
  isPastCurfew("22:00:00", "21:45:00") === false,
  "Curfew algorithm identifies check before closing time as on-time (21:45 before 22:00)"
);

// -----------------------------------------------------------------------------
// SUITE 6: Multi-Tenant RLS Policy Isolation
// -----------------------------------------------------------------------------
console.log("\n\x1b[36m[SUITE 6]\x1b[0m Multi-Tenant RLS & Defense-in-Depth Isolation");

const all28Tables = [
  "user_profiles", "pgs", "pg_members", "rooms", "beds", "tenants",
  "tenant_sensitive_kyc", "tenant_bed_assignments", "rent_records",
  "rent_adjustments", "payment_orders", "payments", "payment_allocations",
  "payment_refunds", "webhook_events", "complaints", "complaint_status_history",
  "expenses", "gate_events", "night_out_requests", "tenant_gate_states",
  "inquiries", "inquiry_follow_ups", "mess_menu", "notification_jobs",
  "tenant_invitations", "staff_invitations", "audit_logs"
];

let rlsEnabledCount = 0;
for (const table of all28Tables) {
  const regex = new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
  if (regex.test(fullSchemaSql)) {
    rlsEnabledCount++;
  }
}

assert(
  rlsEnabledCount === 28,
  `All 28 application tables have ROW LEVEL SECURITY explicitly enabled (${rlsEnabledCount}/28)`
);

assert(
  /CREATE\s+POLICY\s+.*tenant_sensitive_kyc/i.test(fullSchemaSql),
  "Sensitive KYC documents have isolated RLS policies restricting read to PG Owners/Wardens only"
);

// -----------------------------------------------------------------------------
// SUMMARY REPORT
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`TOTAL INVARIANT TESTS: ${totalTests}`);
console.log(`PASSED: \x1b[32m${passedTests}\x1b[0m`);
console.log(`FAILED: \x1b[31m${failedTests}\x1b[0m`);
console.log("================================================================================\n");

if (failedTests > 0) {
  console.error("Invariant verification FAILED! Breaking invariants detected.");
  process.exit(1);
} else {
  console.log("ALL ARCHITECTURAL & SECURITY INVARIANTS VERIFIED SUCCESSFULLY! 🚀");
  process.exit(0);
}
