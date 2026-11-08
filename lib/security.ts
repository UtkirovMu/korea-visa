import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/* ------------------------------------------------------------------ */
/*  JSON javob                                                         */
/* ------------------------------------------------------------------ */

export function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      ...extra,
    },
  });
}

export const fail = (status: number, message: string, extra?: Record<string, string>) =>
  json({ ok: false, message }, status, extra);

/* ------------------------------------------------------------------ */
/*  Mijoz IP manzili                                                   */
/* ------------------------------------------------------------------ */

export function clientIp(req: Request): string {
  // Reverse-proxy ortida bo'lmasa, sarlavhalarga ishonib bo'lmaydi (soxtalashtirish mumkin).
  if (process.env.TRUST_PROXY === "false") return "direct";
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim().slice(0, 64);
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return "unknown";
}

/* ------------------------------------------------------------------ */
/*  Origin / CSRF tekshiruvi                                            */
/* ------------------------------------------------------------------ */

function allowedOrigins(req: Request): Set<string> {
  const set = new Set<string>();
  for (const o of (process.env.SITE_URL || "").split(",")) {
    const v = o.trim().replace(/\/+$/, "");
    if (v) set.add(v);
  }
  if (set.size === 0) {
    // SITE_URL berilmagan bo'lsa, so'rov kelgan host'ning o'zi
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "");
    if (host) set.add(`${proto}://${host}`);
  }
  return set;
}

/**
 * Faqat shu saytning o'z sahifasidan kelgan JSON so'rovlarni o'tkazadi.
 * Boshqa saytlar foydalanuvchi brauzeri orqali API'ni chaqira olmaydi (CSRF),
 * oddiy HTML forma yoki <img> orqali ham chaqirib bo'lmaydi.
 */
export function checkRequestShape(req: Request): string | null {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("application/json")) return "Noto'g'ri so'rov turi.";

  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return "Ruxsat etilmagan manba.";

  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins(req).has(origin.replace(/\/+$/, ""))) return "Ruxsat etilmagan manba.";

  return null;
}

/* ------------------------------------------------------------------ */
/*  So'rov tanasini cheklangan hajmda o'qish                            */
/* ------------------------------------------------------------------ */

export async function readJsonBody(req: Request, maxBytes = 2048): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) return null;
  if (!req.body) return null;

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const data = JSON.parse(text);
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Rate limit (xotirada, fixed window)                                 */
/* ------------------------------------------------------------------ */
// Eslatma: bitta server (VPS, Docker, `next start`) uchun to'liq ishlaydi.
// Vercel kabi serverless muhitda har instansiyaning xotirasi alohida bo'ladi:
// u yerda qat'iy limit kerak bo'lsa, shu funksiyani Upstash Redis bilan almashtiring (README'ga qarang).

type Bucket = { count: number; reset: number };
const g = globalThis as unknown as { __turanRL?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g.__turanRL ??= new Map());
const MAX_KEYS = 20_000;

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear(); // xotirani to'ldirish hujumidan himoya
  }
  let b = buckets.get(key);
  if (!b || b.reset <= now) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return { ok: b.count <= limit, retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
}

export const envInt = (name: string, def: number) => {
  const n = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

/* ------------------------------------------------------------------ */
/*  Imzolangan token (HMAC-SHA256)                                      */
/* ------------------------------------------------------------------ */
// Holat so'rovi faqat shu sayt bergan, muddati o'tmagan token bilan ishlaydi.
// Shunda /api/visa/status ni ochiq "proxy" sifatida boshqa ID'lar uchun ishlatib bo'lmaydi.

const gs = globalThis as unknown as { __turanDevSecret?: string };
let warned = false;

function secret(): string {
  const s = process.env.VISA_TOKEN_SECRET || "";
  if (s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("VISA_TOKEN_SECRET o'rnatilmagan yoki 32 belgidan qisqa.");
  }
  if (!warned) {
    console.warn("[turan-visa] VISA_TOKEN_SECRET yo'q — development uchun vaqtinchalik kalit ishlatilmoqda.");
    warned = true;
  }
  return (gs.__turanDevSecret ??= randomBytes(32).toString("hex"));
}

export function tokenConfigured(): boolean {
  try {
    secret();
    return true;
  } catch (e) {
    console.error("[turan-visa]", (e as Error).message);
    return false;
  }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest();

/** Token ichidagi ma'lumot: tashqi API ID'si, ixtiyoriy Telegram chat ID va kim tekshirgani (natija xabari uchun). */
export type TokenData = { id: string; cid?: number; who?: string };

export function issueToken(data: TokenData, ttlSeconds = 15 * 60): string {
  const payload = JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  return `${b64url(payload)}.${b64url(sign(payload))}`;
}

export function verifyToken(token: unknown, idPattern: RegExp): TokenData | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  let payload: string;
  let given: Buffer;
  try {
    payload = Buffer.from(parts[0], "base64url").toString("utf8");
    given = Buffer.from(parts[1], "base64url");
  } catch {
    return null;
  }
  const expected = sign(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let d: Record<string, unknown>;
  try {
    d = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof d.id !== "string" || !idPattern.test(d.id)) return null;
  if (typeof d.exp !== "number" || d.exp < Date.now() / 1000) return null;
  return {
    id: d.id,
    cid: typeof d.cid === "number" && Number.isSafeInteger(d.cid) && d.cid > 0 ? d.cid : undefined,
    who: typeof d.who === "string" ? d.who.slice(0, 160) : undefined,
  };
}
