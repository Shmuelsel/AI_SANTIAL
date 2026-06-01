/**
 * src/config.js  —  single source of truth for the backend base URL.
 *
 * Why this exists
 * ───────────────
 * When VITE_SERVER_URL is intentionally set to "" (empty string) in .env,
 * the old pattern `import.meta.env.VITE_SERVER_URL || 'http://localhost:5000'`
 * incorrectly falls back to localhost because "" is falsy.
 *
 * Using ?? (nullish coalescing) instead keeps the empty string as-is:
 *   ""        → ""              relative paths, Vite proxy handles routing
 *   undefined → ""              same — variable not set at all
 *   "https://…" → "https://…"  direct connection (production / staging)
 *
 * Usage in components:
 *   import { SERVER_URL } from '../config';
 *   fetch(`${SERVER_URL}/api/cameras`)        // → /api/cameras  (proxied)
 *   io(SERVER_URL || undefined, { … })        // → connects to page origin
 */
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';
