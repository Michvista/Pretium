const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Supabase ships ESM (`exports` -> .mjs) which Metro's web resolver mishandles.
// Fall back to the `main` field (index.cjs) so web bundles resolve cleanly.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;