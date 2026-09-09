/**
 * RevenueCat REST API v2 configuration checker.
 *
 * Verifies that the RevenueCat project has everything the Pretium app expects:
 *   - "premium" entitlement
 *   - a monthly subscription product
 *   - an offering containing that product
 *
 * Usage:
 *   $env:REVENUECAT_SECRET_API_KEY="<v2 secret key>"; node scripts/revenuecat-setup.mjs
 *   # or pass the project id explicitly:
 *   node scripts/revenuecat-setup.mjs --project <project_id>
 *
 * Docs: https://www.revenuecat.com/docs/api-v2
 * Base URL: https://api.revenuecat.com/v2
 * The v2 API requires a Bearer token with the "Project Configuration" permission.
 */

const BASE = 'https://api.revenuecat.com/v2';
const SECRET_KEY = process.env.REVENUECAT_SECRET_API_KEY;
const EXPECTED_ENTITLEMENT = 'premium';

async function api(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function listItems(payload) {
  // List endpoints return { object: "list", items: [...] }.
  return Array.isArray(payload) ? payload : payload?.items ?? [];
}

async function resolveProjectId(arg) {
  if (arg) return arg;
  if (process.env.REVENUECAT_PROJECT_ID) return process.env.REVENUECAT_PROJECT_ID;
  const projects = listItems(await api('/projects'));
  if (projects.length === 0) {
    throw new Error('No RevenueCat project found for this API key.');
  }
  return projects[0].id;
}

async function main() {
  if (!SECRET_KEY) {
    console.error('Missing REVENUECAT_SECRET_API_KEY env var (create a V2 key in RevenueCat dashboard).');
    process.exit(1);
  }

  const projectIdArg = process.argv.indexOf('--project') >= 0
    ? process.argv[process.argv.indexOf('--project') + 1]
    : undefined;
  const projectId = await resolveProjectId(projectIdArg);
  console.log(`RevenueCat project: ${projectId}\n`);

  const entitlements = listItems(await api(`/projects/${projectId}/entitlements`));
  const premium = entitlements.find((e) => e.lookup_key === EXPECTED_ENTITLEMENT);
  console.log(`Entitlements (${entitlements.length}):`);
  console.log(premium
    ? `  [OK] "premium" entitlement exists (id=${premium.id})`
    : `  [MISSING] "${EXPECTED_ENTITLEMENT}" entitlement not found — create it in the dashboard.`);
  console.log(entitlements.map((e) => `    - ${e.lookup_key}`).join('\n') || '    (none)');

  const products = listItems(await api(`/projects/${projectId}/products`));
  console.log(`\nProducts (${products.length}):`);
  products.forEach((p) => console.log(`    - ${p.store_identifier} (${p.type})`));
  if (products.length === 0) {
    console.log('  [MISSING] No products configured — add the monthly subscription product.');
  }

  const offerings = listItems(await api(`/projects/${projectId}/offerings`));
  console.log(`\nOfferings (${offerings.length}):`);
  for (const offering of offerings) {
    console.log(`    - ${offering.lookup_key} (id=${offering.id})`);
    const packages = listItems(await api(`/projects/${projectId}/offerings/${offering.id}/packages`));
    packages.forEach((pkg) => console.log(`        * package ${pkg.package_type} -> ${pkg.store_identifier ?? ''}`));
  }
  if (offerings.length === 0) {
    console.log('  [MISSING] No offerings configured — add one and attach the product.');
  }

  console.log('\nDone. Fix any [MISSING] items, then the PaywallScreen can fetch the offering.');
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});