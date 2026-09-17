import assert from 'node:assert/strict';
import { withNativeCors } from '../src/lib/native-cors.ts';

for (const status of [200, 401, 500]) {
  const response = withNativeCors(new Request('https://example.com/_serverFn/test', { headers: { origin: 'capacitor://localhost' } }),
    new Response('streamed result', { status, headers: { vary: 'Accept-Encoding', 'content-type': 'text/plain' } }));
  assert.equal(response.status, status);
  assert.equal(response.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.equal(response.headers.get('vary'), 'Accept-Encoding, Origin');
  assert.equal(await response.text(), 'streamed result');
}
const original = new Response('private');
assert.equal(withNativeCors(new Request('https://example.com', { headers: { origin: 'https://untrusted.example' } }), original), original);
assert.equal(original.headers.get('access-control-allow-origin'), null);
console.log('Native CORS: success/error bodies preserved; untrusted origins excluded.');
