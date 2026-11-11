// Verifies a Firebase Authentication ID token (RS256 JWT) using Google's
// published public keys — no Firebase Admin SDK needed in a Worker.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let cache = { keys: null, until: 0 };

async function publicKeys() {
  if (cache.keys && Date.now() < cache.until) return cache.keys;
  const res = await fetch(JWKS_URL);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '')?.[1] || 3600);
  const { keys } = await res.json();
  cache = { keys, until: Date.now() + maxAge * 1000 };
  return keys;
}

const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

/** @returns {Promise<{uid:string, email?:string}>} throws if invalid */
export async function verifyFirebaseToken(token, projectId) {
  if (!token || !projectId) throw new Error('missing');
  const [h, p, sig] = token.split('.');
  if (!sig) throw new Error('malformed');
  const header = b64urlJson(h);
  const payload = b64urlJson(p);
  if (header.alg !== 'RS256') throw new Error('alg');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('aud');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('iss');
  if (!(payload.exp > now - 60) || !(payload.iat < now + 300)) throw new Error('time');
  if (!payload.sub) throw new Error('sub');

  const jwk = (await publicKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('signature');
  return { uid: payload.sub, email: payload.email };
}
