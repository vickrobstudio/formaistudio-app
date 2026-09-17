// Only public client configuration belongs in the iOS bundle.
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_REVENUECAT_IOS_API_KEY', 'VITE_API_ORIGIN'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing iOS configuration: ${missing.join(', ')}`);
for (const name of ['VITE_SUPABASE_URL', 'VITE_API_ORIGIN']) {
  const url = new URL(process.env[name]);
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${name} must be an HTTPS origin without credentials, path or query`);
  }
}
if (!/^appl_[A-Za-z0-9]+$/.test(process.env.VITE_REVENUECAT_IOS_API_KEY)) {
  throw new Error('The iOS build requires the RevenueCat public Apple SDK key. Never use a secret API key.');
}
if (process.env.FORMAI_RELEASE_CHANNEL === 'production' && process.env.VITE_API_ORIGIN !== 'https://www.formaistudio.app') {
  throw new Error('App Store production builds must use the production API origin.');
}
console.log('Public iOS configuration is present. Values are not logged.');
