import "server-only";

/* ------------------------------------------------------------------ */
/*  Turlar (brauzerga faqat shu tozalangan ma'lumot yuboriladi)         */
/* ------------------------------------------------------------------ */

export type VisaInfo = {
  status: string;
  responseText: string;
  color: string;
  icon: string;
  visaType: string;
  entryPurpose: string;
  progressStatus: string;
  applicationDate: string;
  requiresPdf: boolean;
  processing: { averageDays: number | null; isDelayed: boolean; message: string } | null;
};

export type VisaResult =
  | { state: "pending" }
  | { state: "done"; visa: VisaInfo }
  | { state: "not_found"; message: string }
  | { state: "failed"; message: string };

export type VisaQuery = {
  passport_number: string;
  english_name: string;
  birth_date: string;
};

/* ------------------------------------------------------------------ */
/*  Kiruvchi ma'lumotni tekshirish (allowlist)                          */
/* ------------------------------------------------------------------ */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASSPORT_RE = /^[A-Z0-9]{6,12}$/;
const NAME_PART_RE = /^[A-Z][A-Z' -]{0,39}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const normName = (v: unknown) =>
  typeof v === "string"
    ? v
        .normalize("NFKC")
        .replace(/[`ʻʼ‘’]/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase()
    : "";

export function parseQuery(body: Record<string, unknown>): { ok: true; query: VisaQuery } | { ok: false; message: string } {
  const passport = typeof body.passport === "string" ? body.passport.replace(/\s+/g, "").toUpperCase() : "";
  if (!PASSPORT_RE.test(passport)) return { ok: false, message: "Pasport raqami noto'g'ri." };

  const surname = normName(body.surname);
  const name = normName(body.name);
  const patronymic = normName(body.patronymic);
  if (!NAME_PART_RE.test(surname)) return { ok: false, message: "Familiyani lotin harflarida kiriting." };
  if (!NAME_PART_RE.test(name)) return { ok: false, message: "Ismni lotin harflarida kiriting." };
  if (patronymic && !NAME_PART_RE.test(patronymic)) return { ok: false, message: "Otasining ismini lotin harflarida kiriting." };

  const birth = typeof body.birthDate === "string" ? body.birthDate : "";
  const m = DATE_RE.exec(birth);
  if (!m) return { ok: false, message: "Tug'ilgan sana noto'g'ri." };
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const valid =
    d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] &&
    +m[1] >= 1920 && d.getTime() <= Date.now();
  if (!valid) return { ok: false, message: "Tug'ilgan sana noto'g'ri." };

  return {
    ok: true,
    query: {
      passport_number: passport,
      english_name: [surname, name, patronymic].filter(Boolean).join(" "),
      birth_date: birth,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Tashqi API (manzil qat'iy belgilangan — SSRF yo'q)                  */
/* ------------------------------------------------------------------ */

const UPSTREAM = "https://visadoctors.uz/api/en/visas/v2/check-status/";
// Faqat test uchun: production'da hech qachon o'zgartirilmaydi.
const BASE = process.env.NODE_ENV !== "production" && process.env.VISA_UPSTREAM_DEV ? process.env.VISA_UPSTREAM_DEV : UPSTREAM;

const UPSTREAM_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "Accept-Language": "en",
  Origin: "https://visadoctors.uz",
  Referer: "https://visadoctors.uz/en/visa-status",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

export class UpstreamError extends Error {}

async function upstream(path: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { ...UPSTREAM_HEADERS, ...(init.headers as Record<string, string>) },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new UpstreamError("unreachable");
  }
  // Javob hajmini cheklash (64 KB)
  const buf = await res.arrayBuffer().catch(() => null);
  if (!buf || buf.byteLength > 64 * 1024) throw new UpstreamError("bad_body");
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new UpstreamError(`bad_json_${res.status}`);
  }
  if (res.status === 404) return { __notFound: true };
  if (!res.ok) throw new UpstreamError(`status_${res.status}`);
  return data;
}

export async function startCheck(q: VisaQuery, formStartTime: number): Promise<{ id: string; result: VisaResult }> {
  const data = (await upstream("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...q, _form_start_time: formStartTime, website: "" }),
  })) as Record<string, unknown>;

  const id = typeof data?.id === "string" ? data.id : "";
  if (!UUID_RE.test(id)) throw new UpstreamError("no_id");
  return { id, result: toResult(data) };
}

export async function getStatus(id: string): Promise<VisaResult> {
  if (!UUID_RE.test(id)) throw new UpstreamError("bad_id");
  const data = await upstream(`${id}/`, { method: "GET" });
  return toResult(data as Record<string, unknown>);
}

/* ------------------------------------------------------------------ */
/*  Javobni tozalash: faqat kerakli maydonlar, tur va uzunlik tekshiruvi */
/* ------------------------------------------------------------------ */

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function toResult(data: Record<string, unknown> | null): VisaResult {
  if (!data || data.__notFound) return { state: "failed", message: "" };
  const status = str(data.status, 20).toUpperCase();

  if (status === "PENDING" || status === "PROCESSING" || status === "QUEUED" || status === "STARTED") return { state: "pending" };
  if (status === "FAILED" || status === "ERROR") {
    const rd = obj(data.response_data);
    return { state: "failed", message: str(rd?.message ?? rd?.error, 300) };
  }
  if (status !== "COMPLETED") return { state: "pending" };

  const rd = obj(data.response_data);
  const vd = obj(rd?.visa_data);
  if (!rd || str(rd.status, 20) !== "success" || !vd) {
    return { state: "not_found", message: str(rd?.message ?? rd?.error ?? rd?.detail, 300) };
  }

  const pi = obj(vd.processing_info);
  const avg = typeof pi?.average_days === "number" && Number.isFinite(pi.average_days) ? Math.round(pi.average_days * 10) / 10 : null;
  const color = str(vd.color_background, 7);
  const date = str(vd.application_date, 10);

  return {
    state: "done",
    visa: {
      status: str(vd.status, 80),
      responseText: str(vd.response_text, 600),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#2196F3",
      icon: str(vd.icon_name, 30).replace(/[^a-z_]/gi, ""),
      visaType: str(vd.visa_type, 60),
      entryPurpose: str(vd.entry_purpose, 60),
      progressStatus: str(vd.progress_status, 60),
      applicationDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      requiresPdf: vd.requires_pdf === true,
      processing: pi
        ? { averageDays: avg, isDelayed: pi.is_delayed === true, message: str(pi.status_message, 200) }
        : null,
    },
  };
}
