import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

let viteServer;
process.env.VITE_MAIN_DOMAIN = 'example.com';

test.before(async () => {
  viteServer = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { middlewareMode: true },
    appType: 'custom',
  });
});

test.after(async () => {
  await viteServer.close();
});

test('uses the in-memory platform tenant for localhost in development without a tenant query', async () => {
  const { loadTenantForHost, PLATFORM_TENANT } = await viteServer.ssrLoadModule(
    '/src/app/components/context/tenantResolution.ts',
  );
  let queried = false;

  const tenant = await loadTenantForHost('localhost', async () => {
    queried = true;
    return null;
  });

  assert.deepEqual(tenant, PLATFORM_TENANT);
  assert.equal(queried, false);
});

test('uses the in-memory platform tenant for 127.0.0.1 in development without a tenant query', async () => {
  const { loadTenantForHost, PLATFORM_TENANT } = await viteServer.ssrLoadModule(
    '/src/app/components/context/tenantResolution.ts',
  );
  let queried = false;

  const tenant = await loadTenantForHost('127.0.0.1', async () => {
    queried = true;
    return null;
  });

  assert.deepEqual(tenant, PLATFORM_TENANT);
  assert.equal(queried, false);
});

test('continues querying custom subdomains outside development', async () => {
  const { loadTenantForHost } = await viteServer.ssrLoadModule(
    '/src/app/components/context/tenantResolution.ts',
  );
  const expectedTenant = { tenantId: 'custom-location' };
  let receivedSubdomain;

  const tenant = await loadTenantForHost(
    'studio.example.com',
    async (subdomain) => {
      receivedSubdomain = subdomain;
      return expectedTenant;
    },
    false,
  );

  assert.equal(receivedSubdomain, 'studio');
  assert.equal(tenant, expectedTenant);
});
