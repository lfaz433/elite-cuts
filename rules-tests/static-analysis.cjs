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
    description: 'Tenants: browser creation is denied in favor of server bootstrap',
    check: () => {
      // Must contain the ownerUid check in the tenants block
      const tenantsBlock = rules.match(/match \/tenants\/\{tenantId\}[^}]+(?:\{[^}]*\}[^}]*)*?\}/s)?.[0] || '';
      return tenantsBlock.includes('allow create: if isSuperAdmin()');
    },
  },
  {
    id: 'SA-2',
    description: 'Subdomains: browser creation is denied',
    check: () => /match \/subdomains\/\{subdomainName\}[\s\S]*?allow create: if false;/.test(rules),
  },
  {
    id: 'SA-3',
    description: 'Users: own user can read/write their document',
    check: () => rules.includes('request.auth.uid == userId'),
  },
  {
    id: 'SA-4',
    description: 'Tenant authority requires a permission or owner record, never bare membership',
    check: () =>
      rules.includes('function hasTenantPermission') &&
      rules.includes('isTenantOwner(tId)') &&
      !rules.includes('function isMemberOfTenant') &&
      !rules.includes('request.auth.token.tenantId == tId'),
  },
  {
    id: 'SA-5',
    description: 'Client profile fields are not used as authorization inputs',
    check: () =>
      !rules.includes('getUserData()') &&
      rules.includes("match /memberships/{membershipId}"),
  },
  {
    id: 'SA-6',
    description: 'Barbers: create requires manageStaff on the incoming tenantId',
    check: () => rules.includes("hasTenantPermission(request.resource.data.tenantId, 'manageStaff')"),
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
    description: 'Tenants: update requires scoped authority and immutable server fields',
    check: () => {
      const lines = rules.split('\n');
      return rules.includes('isTenantAuthority(tenantId)') && rules.includes('hasOnly(safeTenantUpdateFields())');
    },
  },
  {
    id: 'SA-10',
    description: 'Bookings: clients can read records addressed to their uid',
    check: () => {
      return rules.includes('request.auth.uid == resource.data.clientId');
    },
  },
  {
    id: 'SA-11',
    description: 'Marketplace: membership permission calls use valid CEL argument syntax',
    check: () => !/hasActiveLocationPermission\(\s*resource\.data\.brandId,\s*resource\.data\.locationId,\s*'manageStaff',\s*\)/s.test(rules),
  },
  {
    id: 'SA-12',
    description: 'Permission checks recognize deterministic legacy and marketplace location memberships',
    check: () =>
      rules.includes('function hasActiveLegacyMembership(tId)') &&
      rules.includes('function marketplaceTenantMembershipPath(tId)') &&
      rules.includes('function hasActiveMarketplaceTenantMembership(tId)') &&
      rules.includes('function hasTenantPermission(tId, permission)'),
  },
  {
    id: 'SA-13',
    description: 'Public barber timestamps cannot carry nested maps',
    check: () =>
      rules.includes("!('createdAt' in data) || data.createdAt is timestamp || data.createdAt is number") &&
      rules.includes("!('updatedAt' in data) || data.updatedAt is timestamp || data.updatedAt is number"),
  },
  {
    id: 'SA-14',
    description: 'Operational collections never authorize from membership presence alone',
    check: () => {
      const start = rules.indexOf('// 2. Scoped Business Operations Collections');
      const end = rules.indexOf('match /business/{document=**}');
      const operationalRules = rules.slice(start, end);
      return start >= 0 && end > start && !operationalRules.includes('isMemberOfTenant(');
    },
  },
  {
    id: 'SA-15',
    description: 'Operational rules use granular permissions and assigned-barber scope',
    check: () =>
      rules.includes('function hasTenantPermission(tId, permission)') &&
      rules.includes('function isAssignedBarber(tId, barberId)') &&
      ['manageBookings', 'manageStaff', 'removeWorkers', 'manageServices', 'manageInventory']
        .every(permission => rules.includes(`hasTenantPermission(`) && rules.includes(`'${permission}'`)),
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
