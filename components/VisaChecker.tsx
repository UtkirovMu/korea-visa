"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  Turlar (server lib/visa.ts dagi bilan bir xil)                      */
/* ------------------------------------------------------------------ */

type VisaInfo = {
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
type VisaResult =
  | { state: "pending" }
  | { state: "done"; visa: VisaInfo }
  | { state: "not_found"; message: string }
  | { state: "failed"; message: string };

type Fields = { passport: string; surname: string; name: string; patronymic: string; birthDate: string };
type View =
  | { kind: "form" }
  | { kind: "loading"; step: number }
  | { kind: "result"; visa: VisaInfo; who: string }
  | { kind: "error"; message: string };

const EMPTY: Fields = { passport: "", surname: "", name: "", patronymic: "", birthDate: "" };
const POLL_MS = 2000;
const MAX_POLLS = 45;

/* ------------------------------------------------------------------ */
/*  Yordamchilar                                                        */
/* ------------------------------------------------------------------ */

const clean = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();
const onlyLatin = (s: string) => s.replace(/[^A-Za-z\s'`ʻʼ‘’-]/g, "");
const todayISO = () => new Date().toISOString().slice(0, 10);

const KR: Record<string, string> = {
  "유학.연수": "O'qish / malaka oshirish",
  "유학": "O'qish",
  "연수": "Malaka oshirish",
  "취업": "Ishga kirish",
  "방문": "Tashrif",
  "관광": "Turizm",
  "상용": "Biznes",
  "결혼이민": "Nikoh orqali immigratsiya",
  "접수": "Qabul qilingan",
  "심사중": "Ko'rib chiqilmoqda",
  "심사": "Ko'rib chiqilmoqda",
  "허가": "Ruxsat berilgan",
  "발급": "Viza berilgan",
  "불허": "Rad etilgan",
  "보완": "Qo'shimcha hujjat kerak",
  "반려": "Qaytarilgan",
  "취소": "Bekor qilingan",
};
const tr = (v: string) => (v ? (KR[v] ? `${KR[v]} · ${v}` : v) : "");

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
function formatDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${+m[3]}-${MONTHS[+m[2] - 1]}, ${m[1]}` : iso;
}

const LOADING_MSGS = [
  "So'rov yuborildi",
  "Elchixona bazasidan ma'lumot olinmoqda",
  "Bir necha soniya kuting",
  "Deyarli tayyor",
];

async function post<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Internet aloqasini tekshiring va qaytadan urinib ko'ring.");
  }
  const data = (await res.json().catch(() => null)) as ({ ok?: boolean; message?: string } & T) | null;
  if (!res.ok || !data || data.ok === false) {
    throw new Error(data?.message || `Xatolik yuz berdi (${res.status}).`);
  }
  return data;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });

/* ------------------------------------------------------------------ */
/*  Komponent                                                           */
/* ------------------------------------------------------------------ */

export default function VisaChecker() {
  const [f, setF] = useState<Fields>(EMPTY);
  const [invalid, setInvalid] = useState<Partial<Record<keyof Fields, boolean>>>({});
  const [formError, setFormError] = useState("");
  const [view, setView] = useState<View>({ kind: "form" });
  const [maxDate, setMaxDate] = useState("");
  const startedAt = useRef(0);
  const honeypot = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    setMaxDate(todayISO());
    return () => abort.current?.abort();
  }, []);

  useEffect(() => {
    if (view.kind !== "form") topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view.kind]);

  const fullName = [f.surname, f.name, f.patronymic].map(clean).filter(Boolean).join(" ");

  function set<K extends keyof Fields>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
    setInvalid((p) => ({ ...p, [k]: false }));
    setFormError("");
  }

  function validate(): string[] {
    const errs: string[] = [];
    const bad: Partial<Record<keyof Fields, boolean>> = {};
    if (!/^[A-Z0-9]{6,12}$/.test(f.passport)) { errs.push("Pasport raqamini to'g'ri kiriting (masalan: FB1234567)."); bad.passport = true; }
    if (!clean(f.surname)) { errs.push("Familiyani kiriting."); bad.surname = true; }
    if (!clean(f.name)) { errs.push("Ismni kiriting."); bad.name = true; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.birthDate) || f.birthDate < "1920-01-01" || f.birthDate > todayISO()) {
      errs.push("Tug'ilgan sanani kiriting."); bad.birthDate = true;
    }
    setInvalid(bad);
    return errs;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (errs.length) { setFormError(errs.join(" ")); return; }

    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const who = `${fullName} · ${f.passport}`;
    setView({ kind: "loading", step: 0 });

    try {
      const start = await post<{ token: string; result: VisaResult }>("/api/visa/check", {
        passport: f.passport,
        surname: f.surname,
        name: f.name,
        patronymic: f.patronymic,
        birthDate: f.birthDate,
        startedAt: startedAt.current,
        website: honeypot.current?.value ?? "",
      }, ctrl.signal);

      let result = start.result;
      for (let i = 1; result.state === "pending"; i++) {
        if (i > MAX_POLLS) throw new Error("Javob kutish vaqti tugadi. Birozdan so'ng qaytadan urinib ko'ring.");
        setView({ kind: "loading", step: i });
        await sleep(POLL_MS, ctrl.signal);
        result = (await post<{ result: VisaResult }>("/api/visa/status", { token: start.token }, ctrl.signal)).result;
      }

      if (result.state === "done") setView({ kind: "result", visa: result.visa, who });
      else if (result.state === "not_found")
        throw new Error(result.message || "Bu ma'lumotlar bo'yicha ariza topilmadi. Pasport raqami, ism-familiya (pasportdagidek) va tug'ilgan sanani tekshiring.");
      else throw new Error(result.message || "Tekshiruv amalga oshmadi. Qaytadan urinib ko'ring.");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setView({ kind: "error", message: (err as Error).message || "Noma'lum xatolik." });
    }
  }

  function reset(clear: boolean) {
    abort.current?.abort();
    if (clear) setF(EMPTY);
    startedAt.current = Date.now();
    setView({ kind: "form" });
  }

  return (
    <div ref={topRef} className="checker">
      {view.kind === "form" && (
        <form className="card" onSubmit={onSubmit} noValidate>
          <Field label="Pasport raqami" id="passport" invalid={invalid.passport}>
            <input
              id="passport" value={f.passport} placeholder="FB1234567" maxLength={12}
              autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="next"
              onChange={(e) => set("passport", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
          </Field>

          <div className="row">
            <Field label="Familiya" id="surname" invalid={invalid.surname}>
              <input id="surname" value={f.surname} placeholder="SOBIROVA" maxLength={40}
                autoComplete="family-name" autoCapitalize="characters" spellCheck={false} enterKeyHint="next"
                onChange={(e) => set("surname", onlyLatin(e.target.value))} />
            </Field>
            <Field label="Ism" id="name" invalid={invalid.name}>
              <input id="name" value={f.name} placeholder="MUBINAKHON" maxLength={40}
                autoComplete="given-name" autoCapitalize="characters" spellCheck={false} enterKeyHint="next"
                onChange={(e) => set("name", onlyLatin(e.target.value))} />
            </Field>
          </div>

          <Field label="Otasining ismi" optional="pasportda bo'lsa" id="patronymic"
            hint="Pasportdagi lotin yozuvida: DILMUROD KIZI yoki ALISHER UGLI">
            <input id="patronymic" value={f.patronymic} placeholder="DILMUROD KIZI" maxLength={40}
              autoComplete="additional-name" autoCapitalize="characters" spellCheck={false} enterKeyHint="next"
              onChange={(e) => set("patronymic", onlyLatin(e.target.value))} />
          </Field>

          <Field label="Tug'ilgan sana" id="birthDate" invalid={invalid.birthDate}>
            <input id="birthDate" type="date" value={f.birthDate} min="1920-01-01" max={maxDate || undefined}
              autoComplete="bday" onChange={(e) => set("birthDate", e.target.value)} />
          </Field>

          {/* Honeypot: odamlar ko'rmaydi, botlar to'ldiradi */}
          <div className="hp" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input id="website" ref={honeypot} tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>

          {fullName && (
            <p className="preview">Yuboriladigan ism: <b>{fullName}</b></p>
          )}
          {formError && <p className="alert" role="alert">{formError}</p>}

          <button type="submit" className="btn btn-primary">Tekshirish</button>
          <p className="privacy"><LockIcon /> Ma'lumotlaringiz saytimizda saqlanmaydi — faqat tekshiruv uchun ishlatiladi.</p>
        </form>
      )}

      {view.kind === "loading" && (
        <div className="card loading" aria-live="polite">
          <div className="spinner" />
          <h2>Tekshirilmoqda…</h2>
          <p>{LOADING_MSGS[Math.min(LOADING_MSGS.length - 1, Math.floor(view.step / 4))]}</p>
          <div className="bar"><span style={{ width: `${Math.min(95, 8 + (view.step / MAX_POLLS) * 100)}%` }} /></div>
          <button type="button" className="btn btn-ghost" onClick={() => reset(false)}>Bekor qilish</button>
        </div>
      )}

      {view.kind === "result" && <Result visa={view.visa} who={view.who} onAgain={() => reset(true)} />}

      {view.kind === "error" && (
        <div className="card center" role="alert">
          <div className="err-ico"><WarnIcon /></div>
          <h2>Natija olinmadi</h2>
          <p className="muted">{view.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => reset(false)}>Qaytadan urinish</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Field(props: {
  label: string; id: string; optional?: string; hint?: string; invalid?: boolean; children: ReactNode;
}) {
  return (
    <div className={`field${props.invalid ? " invalid" : ""}`}>
      <label htmlFor={props.id}>
        {props.label} {props.optional && <span className="opt">({props.optional})</span>}
      </label>
      {props.children}
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
}

function Result({ visa, who, onAgain }: { visa: VisaInfo; who: string; onAgain: () => void }) {
  const p = visa.processing;
  const days = p?.message.match(/(\d+)\s*kun/)?.[1] ?? (p?.averageDays ? String(Math.round(p.averageDays)) : null);

  return (
    <div className="card result" aria-live="polite">
      <div className="result-head" style={{ background: visa.color }}>
        <div className="result-ico"><StatusIcon name={visa.icon} /></div>
        <div>
          <small>Ariza holati</small>
          <h2>{visa.status || tr(visa.progressStatus) || "Noma'lum"}</h2>
          {visa.responseText && <p>{visa.responseText}</p>}
        </div>
      </div>

      <div className="result-body">
        {p && (p.message || days) && (
          <div className="eta">
            {days && <div className="eta-num">{days}<small>kun</small></div>}
            <div>
              <b>{p.message || "Taxminiy muddat"}</b>{" "}
              <span className={`badge ${p.isDelayed ? "late" : "ok"}`}>{p.isDelayed ? "Kechikmoqda" : "O'z vaqtida"}</span>
              {p.averageDays && <span className="avg">O'rtacha ko'rib chiqish: ~{Math.round(p.averageDays)} kun</span>}
            </div>
          </div>
        )}

        <dl>
          {visa.applicationDate && (<><dt>Ariza sanasi</dt><dd>{formatDate(visa.applicationDate)}</dd></>)}
          {visa.visaType && (<><dt>Viza turi</dt><dd>{tr(visa.visaType)}</dd></>)}
          {visa.entryPurpose && visa.entryPurpose !== visa.visaType && (<><dt>Kirish maqsadi</dt><dd>{tr(visa.entryPurpose)}</dd></>)}
          {visa.progressStatus && (<><dt>Elchixonada</dt><dd>{tr(visa.progressStatus)}</dd></>)}
        </dl>

        {visa.requiresPdf && (
          <p className="note">Bu holat uchun qo'shimcha hujjat talab qilinadi. Batafsil ma'lumot uchun bizga yozing.</p>
        )}

        <p className="who">{who}</p>
        <button type="button" className="btn btn-dark" onClick={onAgain}>Yangi tekshiruv</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ikonkalar                                                           */
/* ------------------------------------------------------------------ */

const svg = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function StatusIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (/check|done|success|approved/.test(n)) return <svg {...svg}><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></svg>;
  if (/cancel|close|error|block|reject|denied/.test(n)) return <svg {...svg}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>;
  if (/warn|report/.test(n)) return <WarnIcon />;
  if (/time|schedule|hourglass|pending|clock/.test(n)) return <svg {...svg}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
  return <svg {...svg}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>;
}
function WarnIcon() {
  return <svg {...svg}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
}
function LockIcon() {
  return <svg {...svg} width={14} height={14}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}
