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

function buildMessage(who: string, result: VisaResult): string | null {
  const head = `🔔 <b>Viza holati — natija</b>\n\n👤 ${esc(who)}\n`;
  if (result.state === "not_found") {
    return `${head}\n❌ <b>Ariza topilmadi.</b>\n${esc(result.message || "Pasport raqami, ism-familiya va tug'ilgan sanani tekshirib, qaytadan urinib ko'ring.")}`;
  }
  if (result.state !== "done") return null;
  const v = result.visa;
  const lines = [head, `📌 Holat: <b>${esc(v.status || tr(v.progressStatus) || "Noma'lum")}</b>`];
  if (v.responseText) lines.push(`<i>${esc(v.responseText)}</i>`);
  lines.push("");
  if (v.applicationDate) lines.push(`📅 Ariza sanasi: ${esc(formatDate(v.applicationDate))}`);
  if (v.visaType) lines.push(`🗂 Viza turi: ${esc(tr(v.visaType))}`);
  if (v.progressStatus) lines.push(`🏛 Elchixonada: ${esc(tr(v.progressStatus))}`);
  if (v.processing?.message) lines.push(`⏳ ${esc(v.processing.message)}${v.processing.isDelayed ? " (kechikmoqda)" : ""}`);
  if (v.requiresPdf) lines.push("\n⚠️ Qo'shimcha hujjat talab qilinadi.");
  return lines.join("\n");
}

/** Tekshiruv natijasini Telegram chatiga yuboradi. Bir xil tekshiruv uchun faqat bir marta. */
export async function notifyOnce(visaId: string, chatId: number, who: string, result: VisaResult): Promise<void> {
  if (!telegramEnabled()) return;
  const text = buildMessage(who, result);
  if (!text) return;

  const now = Date.now();
  for (const [k, t] of sent) if (now - t > 30 * 60_000) sent.delete(k);
  const key = `${visaId}:${chatId}`;
  if (sent.has(key) || sent.size > 50_000) return;
  sent.set(key, now);

  try {
    const res = await fetch(`${TG_API}/bot${token()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { description?: string } | null;
      console.warn("[telegram] sendMessage:", res.status, body?.description ?? ""); // token log qilinmaydi
    }
  } catch (e) {
    console.warn("[telegram] sendMessage xatosi:", e instanceof Error ? e.name : "unknown");
  }
}
