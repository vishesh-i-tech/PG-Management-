# Architecture Gatekeeper Review: Phase 1: Project Foundation & Database Architecture

**Date:** 21/11/2026, 12:22:25 am

[2m[Project "PG MANAGEMENT"] Using bound chat: "TCP UDP Comparison"[22m
[1m[35m
[ChatGPT]
[39m[22mPhase 1: Project Foundation & Database Architecture
Principal Software Architect — Production Readiness Review
CHANGES REQUIRED
Phase 1 Review
Production gate not cleared

Review scope: Migration validation report, Git working-tree status, stated architectural standards, and reported code changes.

Review standard: Strict production-readiness assessment. Passing structural checks does not automatically establish security, transactional correctness, or production safety.

1. Executive Summary

AGY has established a reasonably comprehensive foundation for the PG Management application.

The reported implementation includes:

28 expected database tables.

10 ordered SQL migration files.

RLS enabled and forced across all 28 tables.

14 expected database functions.

Bed and tenant-stay exclusion constraints.

Payment immutability trigger.

Advisory locking in payment reconciliation.

Background worker concurrency using SKIP LOCKED.

Four storage buckets.

Initial Next.js, Supabase, authentication, and PWA infrastructure.

These are positive architectural indicators.

However, the supplied migration validator output demonstrates the presence of selected database objects. It does not demonstrate that their definitions, permissions, execution paths, or interactions are correct.

In particular, several mandatory architectural requirements have not been independently verified.

Assessment by architectural area

Database foundation

RLS enforcement

Multi-tenant isolation

Concurrency protection

Financial integrity

RPC authorization

Git change hygienesolation

Insufficient evidence

Unverified

Concurrency protection

Partially verified

Partial

Financial integrity

Insufficient evidence

Unverified

RPC authorization

Insufficient evidence

Unverified

Git change hygiene

Requires clarification

Partial

Executive conclusion: The implementation demonstrates good structural progress, but the evidence is insufficient to certify Phase 1 as production-ready.

2. Architecture & Invariant Conformance
2.1 Database foundation
Structurally verified

The migration validator confirms:

28/28 expected tables.

10 migration files discovered.

btree_gist, `uuid-ossp and pgcrypto extensions.

Expected database functions.

Expected storage buckets.

The migration organization is sensible, separating inventory, tenants, finance, operations, communications, performance, functions, security, and storage.

Architectural assessment: Positive.

However, table existence does not establish schema correctness.

The following still require inspection:

Primary-key definitions.

Unique constraints.

Column nullability.

Data types and precision.

Composite foreign-key relationships.

Cascade behavior.

Check constraints.

Migration rollback and repeatability behavior.

2.2 Multi-tenant database isolation
Critical verification gap

The required architectural standard is:

Every tenant-owned relationship must enforce tenant ownership at the database level.

For example, a room relationship should use a composite foreign key:

SQL
FOREIGN KEY (pg_id, room_id)
REFERENCES public.rooms (pg_id, id)

This is important because a conventional foreign key:

SQL
FOREIGN KEY (room_id)
REFERENCES public.rooms (id)

only verifies that the referenced room exists. It does not independently establish that the room belongs to the same PG.

The validator reports only two column-specific ON DELETE SET NULL checks:

room_id

`converted_tenantid

This is insufficient to establish that every required relationship follows the multi-tenant isolation standard.

Required verification:

Every tenant-owned table must have an appropriate tenant identifier.

Every tenant-owned foreign-key relationship must enforce matching (pg_id, id) ownership.

Composite referenced columns must have the necessary unique or primary-key constraint.

Nullable composite relationships must use explicit column-specific deletion behavior where required.

For PostgreSQL 15+, the intended pattern is:

SQL
FOREIGN KEY (pg_id, room_id)
REFERENCES public.rooms (pg_id, id)
ON DELETE SET NULL (room_id)

This preserves `pgid while clearing the optional relationship.

The exact columns requiring this behavior must be determined from the business schema.

Finding: Composite foreign-key coverage has not been demonstrated by the supplied validator.

2.3 Concurrency and integrity constraints
Partially verified

The validator confirms:

btree_gist extension.

Bed overlap exclusion constraint.

Tenant stay exclusion constraint.

Advisory locking in reconciliation.

Worker queue SKIP LOCKED.

These are good architectural decisions.

However, the actual exclusion constraint expressions must be examined.

For example, a bed allocation constraint should conceptually prevent overlapping active assignments:

SQL
EXCLUDE USING gist (
    pg_id WITH =,
    bed_id WITH =,
    stay_period WITH &&
)
WHERE (status = 'active');

The exact implementation may differ, but it must guarantee that two tenants cannot occupy the same bed during overlapping periods.

Likewise, tenant-stay constraints must prevent overlapping stays where the business rules prohibit them.

Additional concern:

The validator confirms advisory locking in reconciliation but does not confirm advisory transaction locks in allocation operations.

These are separate concurrency-sensitive workflows.

Required verification:

Bed allocation acquires an appropriate transaction-scoped lock.

Payment reconciliation acquires an appropriate transaction-scoped lock.

Lock keys are deterministic and scoped correctly.

Transactions maintain the lock until commit or rollback.

Concurrent operations cannot bypass the intended invariant.

SKIP LOCKED is appropriate for queue workers, but it does not solve general payment or allocation races.

2.4 Row-Level Security
Presence verified; security unverified

The validator confirms:

SQL
ENABLE ROW LEVEL SECURITY
FORCE ROW LEVEL SECURITY

across all 28 tables.

This is an important baseline.

However, enabling and forcing RLS does not automatically establish secure tenant isolation.

The policies must also be reviewed.

Required checks:

Security requirement

	

Assessment




RLS enabled on all tables

	

Verified




FORCE RLS on all tables

	

Verified




Tenant-scoped SELECT policies

	

Unverified




Tenant-scoped UPDATE policies

	

Unverified




Tenant-scoped DELETE policies

	

Unverified




INSERT WITH CHECK enforcement

	

Unverified




Sensitive KYC isolation

	

Unverified




Financial record isolation

	

Unverified




Cross-tenant access prevention

	

Unverified




Service-role access boundaries

	

Unverified

Special attention must be given to:

tenant_sensitive_kyc

payments

payment_orders

payment_allocations

payment_refunds

webhook_events

audit_logs

Important: PostgreSQL superusers and roles with BYPASSRLS can bypass row-level security. FORCE RLS does not override those privileges.

Therefore, production credentials and database role assignments must also be audited.

3. Security & Financial Integrity

This is the most important section of the review.

3.1 Financial ledger architecture
Not production-certified

The validator confirms:

Payment immutability trigger.

Payment reconciliation function.

Refund processing function.

Rent reconciliation function.

Advisory locking in reconciliation.

These are positive indicators.

However, the existence of a payment immutability trigger does not prove that the financial ledger implements double-entry accounting correctly.

The following must be established:

A. Double-entry accounting

Every financial transaction must produce balanced debit and credit entries.

∑
𝐷
𝑒
𝑏
𝑖
𝑡
𝑠
=
∑
𝐶
𝑟
𝑒
𝑑
𝑖
𝑡
𝑠
∑Debits=∑Credits

The database must prevent incomplete or unbalanced postings.

B. Ledger immutability

Posted financial entries must not be editable or deletable through ordinary application roles.

Corrections should use compensating transactions rather than rewriting historical entries.

The immutability mechanism must also account for:

Direct SQL updates.

Direct SQL deletes.

RPC execution.

Trigger interactions.

Privileged application roles.

C. Payment reconciliation

The reconciliation process must verify:

Payment order ownership.

PG ownership.

Expected amount.

Currency.

Payment status.

Provider transaction identity.

Duplicate transaction detection.

Correct rent allocation.

The validator does not establish these conditions.

3.2 Payment order verification
Unverified mandatory invariant

A payment callback must never be treated as proof that money was successfully received.

The backend must independently validate the payment against the original payment order.

At minimum:

Payment order exists.

Payment order belongs to the expected PG and tenant.

Amount matches.

Currency matches.

Provider transaction reference is valid.

Payment has not already been reconciled.

The order has not already been fulfilled or cancelled in a way that prohibits reconciliation.

Critical risk: If the backend accepts a client-submitted successful payment status without verifying the provider transaction, a malicious client could potentially fabricate payment success.

The validator does not demonstrate payment order verification.

3.3 Webhook idempotency
Unverified mandatory invariant

The presence of webhook_events does not prove idempotent webhook processing.

The implementation should enforce a unique provider event identifier, scoped appropriately to the payment provider.

Conceptually:

SQL
UNIQUE (provider, provider_event_id)

Webhook processing should:

Verify the provider signature.

Persist the incoming event.

Reject or safely acknowledge duplicate events.

Process financial changes atomically.

Avoid applying the same payment twice.

Handle concurrent delivery of the same event.

Preserve the original event for auditing.

The database transaction must prevent duplicate ledger postings even if the provider delivers the same event multiple times.

Finding: Webhook idempotency has not been established by the supplied evidence.

3.4 SECURITY DEFINER RPC authorization
Unverified mandatory invariant

The validator identifies several RPC functions, but function existence is not sufficient.

Every SECURITY DEFINER function requires careful review.

Required checks:

Explicit SECURITY DEFINER declaration only where necessary.

Fixed and safe search_path.

Schema-qualified object references.

Authorization checks inside the function.

No reliance on client-supplied tenant IDs without verification.

EXECUTE privileges restricted to intended roles.

Atomic transactional execution.

Safe handling of exceptions.

No privilege escalation through untrusted parameters.

A dangerous implementation would allow an authenticated user to invoke a privileged RPC with another PG's identifier.

The function must independently establish the caller's membership and authorization.

3.5 Sensitive table write restrictions

The architecture explicitly requires no raw client INSERT into sensitive tables.

This must be verified using actual PostgreSQL privileges.

The following tables deserve particular attention:

Table

	

Required security treatment




tenant_sensitive_kyc

	

Controlled writes through authorized server-side operations




payments

	

Server-verified payment ingestion




payment_allocations

	

Atomic financial allocation




`payment_refnds

	

Authorized refund RPC




webhook_events

	

Verified webhook ingestion




audit_logs

	

Controlled append-only audit operations

RLS policies alone are not a replacement for privilege restrictions.

The application should grant only the minimum required privileges and route sensitive operations through appropriate server-side operations.

4. Deficiencies / Issues Required to Fix

The following issues are required to be addressed or independently verified before approval.

Critical priority — P0

1. Composite foreign-key coverage is unverified.

The validator must inspect every tenant-owned foreign-key relationship and confirm the appropriate composite (pg_id, id) relationship.

2. Financial double-entry integrity is unverified.

Demonstrate balanced ledger postings and protection against incomplete or unbalanced transactions.

3. Payment order verification is unverified.

Demonstrate backend verification of payment amount, currency, ownership, and provider transaction identity.

4. Webhook idempotency is unverified.

Demonstrate database-enforced event uniqueness and atomic duplicate-safe processing.

5. SECURITY DEFINER authorization is unverified.

Audit privileged RPCs for authorization checks, safe execution context, and restricted EXECUTE privileges.

6. Sensitive table INSERT restrictions are unverified.

Demonstrate that ordinary authenticated clients cannot directly insert into sensitive financial, KYC, webhook, or audit tables.

High priority — P1

7. Allocation advisory locking is unverified.

The validator reports advisory locking in reconciliation but does not demonstrate locking in allocation operations.

8. RLS policy correctness is unverified.

Test actual SELECT, INSERT, UPDATE, and DELETE operations across multiple PG tenants.

9. Ledger immutability requires deeper verification.

Test direct SQL mutation attempts, privileged RPC paths, and compensating transaction behavior.

10. Exclusion constraint definitions require inspection.

Verify the exact range expressions, tenant scoping, partial predicates, and boundary semantics.

11. Storage authorization policies require inspection.

Confirm that users cannot read, overwrite, or delete another PG's tenant KYC documents, payment receipts, or complaint attachments.

Repository and delivery concerns

12. Git working-tree hygiene needs clarification.

The working tree contains:

A large number of newly added .agents/skills files.

Several modified tracked files (AM).

Numerous untracked application directories.

Newly added migration files.

No active Git diff detected.

This does not necessarily indicate a defect. However, it makes the actual Phase 1 delivery boundary unclear.

The team should establish:

Which changes belong to Phase 1.

Which files are unrelated tooling or agent infrastructure.

Whether the migration files are the exact versions tested by the validator.

Whether all intended changes are staged and committed.

Whether the reported validation was executed against a clean database initialized from these exact migrations.

A successful validator run against a different working-tree state is not sufficient evidence.

5. Next Phase Recommendations

Before proceeding into substantial application feature development, I recommend completing the following architectural hardening tasks.

5.1 Database security verification

Create automated tests covering:

Owner accessing their own PG.

Owner attempting to access another PG.

Staff accessing authorized PG resources.

Tenant accessing only their permitted records.

Unauthenticated access attempts.

Direct sensitive-table INSERT attempts.

Cross-tenant foreign-key manipulation.

Use two or more independently created PG tenants in integration tests.

5.2 Financial integrity test suite

Implement the following scenarios:

Test scenario

	

Expected result




Duplicate payment webhook

	

No duplicate ledger entry




Incorrect payment amount

	

Rejected




Incorrect currency

	

Rejected




Payment for another PG

	

Rejected




Duplicate payment allocation

	

Prevented




Unbalanced ledger posting

	

Rejected




Modification of posted ledger entry

	

Rejected




Unauthorized refund

	

Rejected




Concurrent reconciliation

	

Exactly one successful posting

These should be database integration tests, not merely mocked application tests.

5.3 Concurrency testing

Simulate simultaneous requests.

Examples:

Two tenants attempting to book the same bed.

Two staff members allocating the same bed.

Two webhook deliveries for the same event.

Two payment reconciliation requests.

Two refund requests against the same payment.

The database must remain consistent regardless of execution order.

5.4 Migration quality assurance

Add CI checks for:

Fresh database migration.

Migration application in sequence.

PostgreSQL 15+ compatibility.

Constraint inspection.

RLS and privilege inspection.

RPC security inspection.

Database integration tests.

TypeScript database type consistency.

The migration validator should inspect definitions and behavior, not just object names.

5.5 Phase 2 architectural priorities

Once Phase 1 is cleared, the next phase should prioritize:

Authentication and authorization boundaries.

PG owner onboarding.

Staff membership and role management.

Tenant invitation acceptance.

Room and bed allocation workflows.

Tenant onboarding and KYC handling.

Financial transaction APIs.

Audit logging.

All application features must consume the database's security guarantees rather than attempting to recreate tenant isolation exclusively in frontend code.

6. Final Gatekeeper Verdict

Production readiness: Not established

The reported migration validator results are encouraging, and the foundational database structure appears substantially implemented.

However, the current evidence does not establish compliance with several mandatory security and financial invariants.

Conditions for approval:

Verify composite tenant foreign keys and deletion semantics.

Verify every RLS policy and database privilege.

Verify allocation and payment concurrency controls.

Demonstrate double-entry ledger integrity and immutability.

Demonstrate payment order verification and webhook idempotency.

Audit SECURITY DEFINER functions and sensitive-table write restrictions.

Run adversarial multi-tenant and concurrent transaction tests.

Approval should be reconsidered after these checks pass against the exact committed migration set.

Final architectural judgment: AGY has delivered a promising Phase 1 foundation, but a 100% migration-object validation score must not be interpreted as 100% architectural or security compliance. The outstanding items concern fundamental tenant isolation and financial correctness, not cosmetic improvements.

VERDICT: [CHANGES_REQUESTED]


