// ============================================================
//  OPTIONAL CLOUDFLARE WORKER  ←  paste your worker URL here
// ------------------------------------------------------------
//  The worker (folder /worker) adds two optional features:
//   • Cloud listening: speech scoring that works in the Home
//     Screen app, plus "hear yourself" playback on iPad (free tier).
//   • AI tutor: Free Talk and Ask the coach (needs an Anthropic key).
//  Leave empty and those features hide themselves.
//  Requires Firebase accounts (the worker checks who is signed in).
// ============================================================

export const WORKER_URL = '';
