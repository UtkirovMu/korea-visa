// Sayt (brauzer) va server (Telegram xabari) uchun umumiy formatlash.

export const KR: Record<string, string> = {
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

/** "유학.연수" → "O'qish / malaka oshirish · 유학.연수" */
export const tr = (v: string) => (v ? (KR[v] ? `${KR[v]} · ${v}` : v) : "");

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

/** "2026-10-28" → "28-oktabr, 2026" */
export function formatDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${+m[3]}-${MONTHS[+m[2] - 1]}, ${m[1]}` : iso;
}

/** "FB2452648" → "FB24•••48" (xabarlarda to'liq pasport raqami ko'rsatilmaydi) */
export function maskPassport(p: string) {
  return p.length > 6 ? `${p.slice(0, 4)}${"•".repeat(Math.max(3, p.length - 6))}${p.slice(-2)}` : p;
}
