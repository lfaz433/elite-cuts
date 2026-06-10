#!/usr/bin/env node
/**
 * Static Rule Analysis — validates that the rules file contains the required patterns
 * for each bug fix. Runs without the Firebase emulator or Java.
 *
 * Run with: node rules-tests/static-analysis.js
 */

const fs = require('fs');
const path = require('path');

const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');
const rules = fs.readFileSync(RULES_PATH, 'utf8');

const PASS = '\x1b[32m✓ PASS\x1b[0m';
const FAIL = '\x1b[31m✗ FAIL\x1b[0m';

const tests = [
  {
    id: 'SA-1',
    description: 'Tenants: create rule allows ownerUid == request.auth.uid (Fix for new signups)',
    check: () => {
      // Must contain the ownerUid check in the tenants block
      const tenantsBlock = rules.match(/match \/tenants\/\{tenantId\}[^}]+(?:\{[^}]*\}[^}]*)*?\}/s)?.[0] || '';
      return (
        tenantsBlock.includes('request.resource.data.ownerUid == request.auth.uid') ||
        rules.includes('request.resource.data.ownerUid == request.auth.uid')
      );
    },
  },
  {
    id: 'SA-2',
    description: 'Subdomains: create rule allows ownerUid == request.auth.uid',
    check: () => rules.includes("request.resource.data.ownerUid == request.auth.uid"),
  },
  {
    id: 'SA-3',
    description: 'Users: own user can read/write their document',
    check: () => rules.includes('request.auth.uid == userId'),
  },
  {
    id: 'SA-4',
    description: 'isMemberOfTenant helper exists and checks getUserData().tenantId',
    check: () =>
      rules.includes('function isMemberOfTenant') &&
      rules.includes('getUserData().tenantId == tenantId'),
  },
  {
    id: 'SA-5',
    description: 'getUserData() safely returns {} if doc does not exist',
    check: () =>
      rules.includes('exists(/databases') &&
      rules.includes(': {}'),
  },
  {
    id: 'SA-6',
    description: 'Barbers: create requires isMemberOfTenant on the incoming tenantId',
    check: () => rules.includes('isMemberOfTenant(request.resource.data.tenantId)'),
  },
  {
    id: 'SA-7',
    description: 'SuperAdmin: isSuperAdmin helper exists',
    check: () => rules.includes('function isSuperAdmin'),
  },
  {
    id: 'SA-8',
    description: 'Legacy collections (attendance, settlements, business) are locked',
    check: () =>
      rules.includes('match /attendance/{document=**}') &&
      rules.includes('match /settlements/{document=**}') &&
      rules.includes('match /business/{document=**}'),
  },
  {
    id: 'SA-9',
    description: 'Tenants: update/delete still requires membership (not just ownerUid)',
    check: () => {
      const lines = rules.split('\n');
      const updateLine = lines.find(l => l.includes('allow update, delete') && l.includes('isMemberOfTenant'));
      return !!updateLine;
    },
  },
  {
    id: 'SA-10',
    description: 'Tenants: create rule includes all 3 conditions (superadmin OR member OR ownerUid)',
    check: () => {
      const createSection = rules.split('allow create')[1]?.split(';')[0] || '';
      return (
        createSection.includes('isSuperAdmin') &&
        createSection.includes('isMemberOfTenant') &&
        createSection.includes('ownerUid')
      );
    },
  },
];

console.log('\n══════════════════════════════════════════════════');
console.log('  Firestore Security Rules — Static Analysis');
console.log('══════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

for (const test of tests) {
  let result;
  try {
    result = test.check();
  } catch (e) {
    result = false;
  }

  if (result) {
    console.log(`  ${PASS}  [${test.id}] ${test.description}`);
    passed++;
  } else {
    console.log(`  ${FAIL}  [${test.id}] ${test.description}`);
    failed++;
  }
}

console.log('\n──────────────────────────────────────────────────');
console.log(`  Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
console.log('──────────────────────────────────────────────────\n');

process.exit(failed > 0 ? 1 : 0);
