#!/usr/bin/env node

/**
 * PG Management - GPT Architecture & Phase Gatekeeper
 * 
 * Automates review of AGY (Antigravity) code changes using the ChatGPT CLI.
 * Acts as an automated gatekeeper before advancing to the next implementation phase.
 * 
 * Usage:
 *   node scripts/gpt-gatekeeper.mjs [phase-name]
 *   npm run review:phase -- "Phase 1: Database Architecture"
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const phaseArg = args.find((a) => !a.startsWith('--')) || 'Phase 1: Project Foundation & Database Architecture';

console.log('\n' + '='.repeat(70));
console.log('🤖 PG MANAGEMENT - GPT PHASE GATEKEEPER & REVIEW SYSTEM');
console.log('='.repeat(70));
console.log(`Phase Target: ${phaseArg}\n`);

// 1. Run database migration validator if present
let migrationOutput = 'No validator run';
try {
  const validatorScript = path.join(ROOT_DIR, 'scripts', 'validate-migrations.js');
  if (fs.existsSync(validatorScript)) {
    console.log('🔍 Running Database Invariant & Migration Validator...');
    migrationOutput = execSync(`node "${validatorScript}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    console.log('✓ Database validator completed successfully.\n');
  }
} catch (err) {
  migrationOutput = `Validator failed with error:\n${err.stdout || err.message}`;
  console.warn('⚠️ Migration validator reported warnings/errors.\n');
}

// 2. Collect Git Status & Diffs
console.log('📦 Collecting Git Status & Implementation Changes...');
let gitStatus = '';
let gitDiff = '';

try {
  gitStatus = execSync('git status --short', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
  
  // Try staged diff first, fallback to unstaged diff or HEAD diff
  gitDiff = execSync('git diff --cached', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
  if (!gitDiff) {
    gitDiff = execSync('git diff HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
  }
  if (!gitDiff) {
    // If working tree is clean or new commit, check last commit diff
    gitDiff = execSync('git diff HEAD~1 HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
  }
} catch {
  // If git diff fails (e.g. initial repo), fallback gracefully
  gitDiff = 'No active git diff detected.';
}

// Truncate git diff if extremely long (limit to ~20,000 chars to avoid prompt token blowout)
if (gitDiff.length > 25000) {
  gitDiff = gitDiff.slice(0, 25000) + '\n\n... [Diff truncated for review length] ...';
}

// 3. Compose Structured Gatekeeper Prompt
const reviewPrompt = `
You are the Lead Principal Software Architect and Quality Gatekeeper for the PG Management application.

You are performing a strict, production-readiness architectural review of the work completed by Antigravity (AGY) for the following phase:

### Phase Under Review:
"${phaseArg}"

### Key Architectural Standards to Enforce:
1. Multi-tenant database isolation: composite foreign keys matching (pg_id, id), explicit column-specific ON DELETE SET NULL (PostgreSQL 15+).
2. Concurrency & Integrity: btree_gist exclusion constraints for beds/stays, advisory transaction locks on payments/allocations.
3. Row-Level Security: FORCE ROW LEVEL SECURITY on every table, no raw client INSERT into sensitive tables, atomic SECURITY DEFINER RPCs.
4. Financial Ledger: Double-entry immutability, payment order verification, idempotent webhook ingestion.

### Migration Validator Output:
\`\`\`
${migrationOutput.trim()}
\`\`\`

### Git Working Tree Status:
\`\`\`
${gitStatus || 'Working tree clean'}
\`\`\`

### Git Code Changes / Diff:
\`\`\`diff
${gitDiff || 'No active diff'}
\`\`\`

---
### Your Review Requirements:
Please provide a thorough, professional assessment in the following format:

1. **Executive Summary**: High-level verdict on whether the implementation satisfies Phase requirements.
2. **Architecture & Invariant Conformance**: Verification of PostgreSQL 15+ constraints, RLS policies, and multi-tenant isolation.
3. **Security & Financial Integrity**: Review of race conditions, immutability, and authorization safety.
4. **Deficiencies / Issues Required to Fix**: Bullet points of any issues found. (If none, explicitly write "None").
5. **Next Phase Recommendations**: Key considerations for the subsequent phase.
6. **Final Gatekeeper Verdict**:
You MUST include EXACTLY one of the following verdicts as the last line of your response:
VERDICT: [APPROVED]
or
VERDICT: [CHANGES_REQUESTED]
`.trim();

if (dryRun) {
  console.log('\n--- DRY RUN: PROMPT PREVIEW ---');
  console.log(reviewPrompt);
  console.log('\n--- END DRY RUN ---');
  process.exit(0);
}

// 4. Send to ChatGPT via chatgpt-cli
console.log('🚀 Submitting implementation to ChatGPT for Senior Architect Review...');
console.log('----------------------------------------------------------------------\n');

const reviewsDir = path.join(ROOT_DIR, 'docs', 'reviews');
if (!fs.existsSync(reviewsDir)) {
  fs.mkdirSync(reviewsDir, { recursive: true });
}

// Write prompt to a temp review file
const tempPromptFile = path.join(reviewsDir, 'CURRENT_REVIEW_PROMPT.txt');
fs.writeFileSync(tempPromptFile, reviewPrompt, 'utf-8');

try {
  const chatgptCli = path.join(ROOT_DIR, 'chatgpt-cli', 'bin', 'chatgpt.js');
  
  // Directly spawn node with the chatgpt-cli entrypoint to bypass Windows shell escaping/length issues
  const child = spawn(process.execPath, [chatgptCli, 'ask'], {
    cwd: ROOT_DIR,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Pipe prompt via stdin
  child.stdin.write(reviewPrompt);
  child.stdin.end();

  let fullResponse = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    fullResponse += text;
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk.toString());
  });

  child.on('close', (code) => {
    console.log('\n' + '-'.repeat(70));
    
    // Save review log
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safePhase = phaseArg.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const reviewLogFile = path.join(reviewsDir, `review_${safePhase}_${timestamp}.md`);
    
    const markdownContent = `# Architecture Gatekeeper Review: ${phaseArg}\n\n**Date:** ${new Date().toLocaleString()}\n\n${fullResponse}\n`;
    fs.writeFileSync(reviewLogFile, markdownContent, 'utf-8');
    console.log(`📄 Review logged to: ${path.relative(ROOT_DIR, reviewLogFile)}\n`);

    // Clean up temp prompt
    if (fs.existsSync(tempPromptFile)) {
      fs.unlinkSync(tempPromptFile);
    }

    // Evaluate verdict
    const isApproved = fullResponse.includes('VERDICT: [APPROVED]');
    const isChangesRequested = fullResponse.includes('VERDICT: [CHANGES_REQUESTED]');

    if (isApproved) {
      console.log('✅ GATE STATUS: [PASSED]');
      console.log('🎉 ChatGPT has APPROVED this phase. Antigravity is authorized to advance to the next phase!\n');
      process.exit(0);
    } else if (isChangesRequested) {
      console.log('❌ GATE STATUS: [BLOCKED]');
      console.log('⚠️ ChatGPT requested changes before advancing. Review the deficiencies above and fix them before re-running.\n');
      process.exit(1);
    } else {
      console.log('ℹ️ Review completed without an explicit VERDICT tag.');
      process.exit(code);
    }
  });

} catch (err) {
  console.error('❌ Failed to run ChatGPT review:', err.message);
  process.exit(1);
}
