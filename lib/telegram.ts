import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { formatDate, tr } from "@/lib/format";
import type { VisaResult } from "@/lib/visa";

/* ------------------------------------------------------------------ */
/*  Sozlama                                                            */
/* ------------------------------------------------------------------ */
// TELEGRAM_BOT_TOKEN — bot bilan bir xil token. Berilmasa, Telegram'ga yuborish o'chiq bo'ladi.

const token = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TG_API = process.env.NODE_ENV !== "production" && process.env.TELEGRAM_API_DEV ? process.env.TELEGRAM_API_DEV : "https://api.telegram.org";

export const telegramEnabled = () => /^\d{5,15}:[A-Za-z0-9_-]{30,}$/.test(token());

/* ------------------------------------------------------------------ */
/*  Imzolangan chat havolasi                                            */
/* ------------------------------------------------------------------ */
// Bot Web App URL'iga ?cid=<chat_id>&sig=<imzo> qo'yadi.
// imzo = base64url(HMAC_SHA256(key, chat_id)), key = HMAC_SHA256("turan-visa-link", BOT_TOKEN).
// Imzo bo'lmasa yoki noto'g'ri bo'lsa, chat ID qabul qilinmaydi — begona chatlarga xabar yuborib bo'lmaydi.

function linkSig(cid: string): Buffer {
  const key = createHmac("sha256", "turan-visa-link").update(token()).digest();
  return createHmac("sha256", key).update(cid).digest();
}

export function verifyChatLink(raw: unknown): number | null {
  if (!telegramEnabled() || !raw || typeof raw !== "object") return null;
  const { cid, sig } = raw as Record<string, unknown>;
  if (typeof cid !== "string" || !/^[1-9]\d{0,15}$/.test(cid)) return null; // faqat shaxsiy chat (musbat ID)
  if (typeof sig !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
  const n = Number(cid);
  if (!Number.isSafeInteger(n)) return null;
  const expected = linkSig(cid);
  const given = Buffer.from(sig, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected) ? n : null;
}

/* ------------------------------------------------------------------ */
/*  Natijani yuborish (bitta tekshiruv — bitta xabar)                   */
/* ------------------------------------------------------------------ */

const g = globalThis as unknown as { __turanSent?: Map<string, number> };
const sent: Map<string, number> = (g.__turanSent ??= new Map());

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ------------------------------------------------------------------ */
/*  Premium (custom) emoji                                              */
/* ------------------------------------------------------------------ */
// Bot API 9.4+: bot egasida Telegram Premium bo'lsa, bot xabarlarida custom emoji ishlatish mumkin.
// Sozlash (Railway): TELEGRAM_CUSTOM_EMOJI="bell=5368324170671202286,user=...,status=..."
// ID'larni bilish uchun botga premium emoji yuboring — bot ID'larini qaytaradi.
// Berilmagan kalitlar uchun oddiy emoji ishlatiladi.

const EMOJI = {
  bell: "🔔", user: "👤", status: "📌", date: "📅", type: "🗂",
  embassy: "🏛", time: "⏳", warn: "⚠️", notfound: "❌",
} as const;
type EmojiKey = keyof typeof EMOJI;

function customEmojiIds(): Partial<Record<EmojiKey, string>> {
  const out: Partial<Record<EmojiKey, string>> = {};
  for (const part of (process.env.TELEGRAM_CUSTOM_EMOJI || "").split(",")) {
    const [k, v] = part.split("=").map((x) => x.trim());
    if (k in EMOJI && /^\d{5,25}$/.test(v || "")) out[k as EmojiKey] = v;
  }
  return out;
}

function makeEmoji(premium: boolean) {
  const ids = premium ? customEmojiIds() : {};
  return (k: EmojiKey) => (ids[k] ? `<tg-emoji emoji-id="${ids[k]}">${EMOJI[k]}</tg-emoji>` : EMOJI[k]);
}

function buildMessage(who: string, result: VisaResult, premium: boolean): string | null {
  const e = makeEmoji(premium);
  const head = `${e("bell")} <b>Viza holati — natija</b>\n\n${e("user")} ${esc(who)}\n`;
  if (result.state === "not_found") {
    return `${head}\n${e("notfound")} <b>Ariza topilmadi.</b>\n${esc(result.message || "Pasport raqami, ism-familiya va tug'ilgan sanani tekshirib, qaytadan urinib ko'ring.")}`;
  }
  if (result.state !== "done") return null;
  const v = result.visa;
  const lines = [head, `${e("status")} Holat: <b>${esc(v.status || tr(v.progressStatus) || "Noma'lum")}</b>`];
  if (v.responseText) lines.push(`<i>${esc(v.responseText)}</i>`);
  lines.push("");
  if (v.applicationDate) lines.push(`${e("date")} Ariza sanasi: ${esc(formatDate(v.applicationDate))}`);
  if (v.visaType) lines.push(`${e("type")} Viza turi: ${esc(tr(v.visaType))}`);
  if (v.progressStatus) lines.push(`${e("embassy")} Elchixonada: ${esc(tr(v.progressStatus))}`);
  if (v.processing?.message) lines.push(`${e("time")} ${esc(v.processing.message)}${v.processing.isDelayed ? " (kechikmoqda)" : ""}`);
  if (v.requiresPdf) lines.push(`\n${e("warn")} Qo'shimcha hujjat talab qilinadi.`);
  return lines.join("\n");
}

async function sendMessage(chatId: number, text: string): Promise<{ ok: boolean; status: number; description: string }> {
  const res = await fetch(`${TG_API}/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { description?: string } | null;
  return { ok: res.ok, status: res.status, description: body?.description ?? "" };
}

/** Tekshiruv natijasini Telegram chatiga yuboradi. Bir xil tekshiruv uchun faqat bir marta. */
export async function notifyOnce(visaId: string, chatId: number, who: string, result: VisaResult): Promise<void> {
  if (!telegramEnabled()) return;
  const premium = Object.keys(customEmojiIds()).length > 0;
  const text = buildMessage(who, result, premium);
  if (!text) return;

  const now = Date.now();
  for (const [k, t] of sent) if (now - t > 30 * 60_000) sent.delete(k);
  const key = `${visaId}:${chatId}`;
  if (sent.has(key) || sent.size > 50_000) return;
  sent.set(key, now);

  try {
    let r = await sendMessage(chatId, text);
    // Premium emoji rad etilsa (masalan, bot egasida Premium yo'q) — oddiy emoji bilan qayta yuboriladi
    if (!r.ok && premium && r.status === 400) {
      console.warn("[telegram] premium emoji rad etildi, oddiy emoji bilan yuborilmoqda:", r.description);
      r = await sendMessage(chatId, buildMessage(who, result, false)!);
    }
    if (!r.ok) console.warn("[telegram] sendMessage:", r.status, r.description); // token log qilinmaydi
  } catch (e) {
    console.warn("[telegram] sendMessage xatosi:", e instanceof Error ? e.name : "unknown");
  }
}
