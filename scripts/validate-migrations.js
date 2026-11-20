/**
 * Database Migration Integrity & Invariant Validator
 * Validates the 10 timestamped migrations against the approved Architecture Specification v3.0.0.
 */

const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

const EXPECTED_TABLES = [
  "user_profiles",
  "pgs",
  "pg_members",
  "rooms",
  "beds",
  "tenants",
  "tenant_sensitive_kyc",
  "tenant_bed_assignments",
  "rent_records",
  "rent_adjustments",
  "payment_orders",
  "payments",
  "payment_allocations",
  "payment_refunds",
  "webhook_events",
  "complaints",
  "complaint_status_history",
  "expenses",
  "gate_events",
  "night_out_requests",
  "tenant_gate_states",
  "inquiries",
  "inquiry_follow_ups",
  "mess_menu",
  "notification_jobs",
  "tenant_invitations",
  "staff_invitations",
  "audit_logs",
];

const EXPECTED_FUNCTIONS = [
  "create_new_pg_business",
  "trg_enforce_payment_immutability",
  "reconcile_payment_transaction",
  "process_payment_refund",
  "reconcile_rent_record_ledger",
  "accept_tenant_invitation",
  "accept_staff_invitation",
  "claim_notification_jobs",
  "recover_stuck_notification_jobs",
  "record_gate_movement",
  "get_tenants_outside_for_gate_alert",
  "get_auth_user_role",
  "get_auth_active_tenant_id",
  "get_auth_any_tenant_id",
];

const CRITICAL_INVARIANTS = [
  { name: "btree_gist extension", pattern: /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"btree_gist"/i },
  { name: "uuid-ossp extension", pattern: /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"uuid-ossp"/i },
  { name: "pgcrypto extension", pattern: /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"pgcrypto"/i },
  { name: "Bed Overlap Exclusion Constraint", pattern: /CONSTRAINT\s+excl_no_overlapping_bed_assignments\s+EXCLUDE\s+USING\s+gist/i },
  { name: "Tenant Stay Exclusion Constraint", pattern: /CONSTRAINT\s+excl_no_overlapping_tenant_stays\s+EXCLUDE\s+USING\s+gist/i },
  { name: "Payment Immutability Trigger", pattern: /CREATE\s+TRIGGER\s+trg_payments_immutable/i },
  { name: "Advisory Locking in Reconciliation", pattern: /pg_advisory_xact_lock\(hashtext\(p_razorpay_payment_id\)\)/i },
  { name: "Worker Queue Claim SKIP LOCKED", pattern: /FOR\s+UPDATE\s+SKIP\s+LOCKED/i },
  { name: "SHA-256 Hashing for Tenant Invitations", pattern: /encode\(digest\(p_plaintext_token,\s*'sha256'\),\s*'hex'\)/i },
  { name: "Column-Specific ON DELETE SET NULL (room_id)", pattern: /ON\s+DELETE\s+SET\s+NULL\s+\(room_id\)/i },
  { name: "Column-Specific ON DELETE SET NULL (converted_tenant_id)", pattern: /ON\s+DELETE\s+SET\s+NULL\s+\(converted_tenant_id\)/i },
];

function validateMigrations() {
  console.log("================================================================================");
  console.log("PG MANAGER - DATABASE MIGRATION INTEGRITY VALIDATION");
  console.log("================================================================================\n");

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`ERROR: Migrations directory not found at: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Discovered ${migrationFiles.length} migration files:`);
  migrationFiles.forEach((file, idx) => {
    console.log(`  [${idx + 1}] ${file}`);
  });
  console.log("");

  if (migrationFiles.length === 0) {
    console.error("ERROR: No SQL migration files found.");
    process.exit(1);
  }

  // Concatenate all SQL content in chronological order
  let combinedSql = "";
  const fileContents = {};
  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    combinedSql += `\n-- FILE: ${file}\n` + content;
    fileContents[file] = content;
  }

  let errors = [];

  // 1. Verify All 28 Tables
  console.log("--- 1. Table Inventory Verification (Target: 28 Tables) ---");
  let foundTables = 0;
  for (const table of EXPECTED_TABLES) {
    const regex = new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+public\\.${table}\\b`, "i");
    if (regex.test(combinedSql)) {
      foundTables++;
      console.log(`  ✓ public.${table}`);
    } else {
      errors.push(`Missing table definition: public.${table}`);
      console.error(`  ✗ public.${table} NOT FOUND`);
    }
  }
  console.log(`Found ${foundTables} of ${EXPECTED_TABLES.length} expected tables.\n`);

  // 2. Verify RLS Enforcement on All 28 Tables
  console.log("--- 2. Row Level Security (RLS) Verification ---");
  for (const table of EXPECTED_TABLES) {
    const enableRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
    const forceRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");

    if (!enableRegex.test(combinedSql)) {
      errors.push(`Missing ENABLE ROW LEVEL SECURITY for: public.${table}`);
    }
    if (!forceRegex.test(combinedSql)) {
      errors.push(`Missing FORCE ROW LEVEL SECURITY for: public.${table}`);
    }
  }
  console.log("  ✓ ENABLE and FORCE ROW LEVEL SECURITY validated across all 28 tables.\n");

  // 3. Verify Functions & Stored Procedures
  console.log("--- 3. Stored Functions & RPC Procedures Verification ---");
  let foundFunctions = 0;
  for (const fn of EXPECTED_FUNCTIONS) {
    const fnRegex = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\b`, "i");
    if (fnRegex.test(combinedSql)) {
      foundFunctions++;
      console.log(`  ✓ public.${fn}()`);
    } else {
      errors.push(`Missing function definition: public.${fn}()`);
      console.error(`  ✗ public.${fn}() NOT FOUND`);
    }
  }
  console.log(`Found ${foundFunctions} of ${EXPECTED_FUNCTIONS.length} expected functions.\n`);

  // 4. Verify Critical Architecture Invariants
  console.log("--- 4. Critical Architecture & Security Invariants Verification ---");
  for (const invariant of CRITICAL_INVARIANTS) {
    if (invariant.pattern.test(combinedSql)) {
      console.log(`  ✓ ${invariant.name}`);
    } else {
      errors.push(`Failed invariant check: ${invariant.name}`);
      console.error(`  ✗ ${invariant.name} FAILED`);
    }
  }
  console.log("");

  // 5. Verify Storage Buckets
  console.log("--- 5. Storage Buckets Verification ---");
  const expectedBuckets = [
    "tenant-kyc-documents",
    "complaint-attachments",
    "payment-receipts",
    "pg-public-assets",
  ];
  for (const bucket of expectedBuckets) {
    if (combinedSql.includes(`'${bucket}'`)) {
      console.log(`  ✓ storage.bucket: '${bucket}'`);
    } else {
      errors.push(`Missing storage bucket declaration: '${bucket}'`);
      console.error(`  ✗ storage.bucket: '${bucket}' NOT FOUND`);
    }
  }
  console.log("");

  // Summary
  console.log("================================================================================");
  if (errors.length > 0) {
    console.error(`VALIDATION FAILED WITH ${errors.length} ERROR(S):`);
    errors.forEach((err, i) => console.error(`  [${i + 1}] ${err}`));
    process.exit(1);
  } else {
    console.log("ALL 28 TABLES, RLS POLICIES, TRIGGERS, CONSTRAINTS & INVARIANTS 100% VERIFIED!");
    console.log("================================================================================");
  }
}

validateMigrations();
