// Only public client configuration belongs in the iOS bundle.
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_REVENUECAT_IOS_API_KEY'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing iOS configuration: ${missing.join(', ')}`);
for (const name of ['VITE_SUPABASE_URL', 'VITE_API_ORIGIN']) {
  if (process.env[name] && new URL(process.env[name]).protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
}
console.log('Public iOS configuration is present. Values are not logged.');
