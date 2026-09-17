const nativeOrigins = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost']);

/** Apply CORS to the final HTTP response, including RPC and error responses. */
export function withNativeCors(request: Request, response: Response): Response {
  const origin = request.headers.get('origin');
  if (!origin || !nativeOrigins.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  const vary = headers.get('vary')?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
  if (!vary.some(value => value.toLowerCase() === 'origin') && !vary.includes('*')) vary.push('Origin');
  headers.set('vary', vary.join(', '));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
