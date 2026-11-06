# Turan Int. School — Viza holatini tekshirish (Next.js)

Koreya vizasi arizasi holatini pasport ma'lumotlari orqali tekshiradigan bir sahifali sayt. Telefon uchun moslashtirilgan, logo ranglarida (#FBB03B, qora, oq).

## Ishga tushirish

Node.js 20.9 yoki undan yangi versiya kerak.

```bash
npm install
cp .env.example .env.local        # keyin VISA_TOKEN_SECRET va SITE_URL ni to'ldiring
npm run dev                       # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

`VISA_TOKEN_SECRET` yaratish:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Vercel'ga joylash

1. Loyihani GitHub'ga yuklang va Vercel'da import qiling.
2. Settings → Environment Variables bo'limiga `VISA_TOKEN_SECRET`, `SITE_URL` (masalan `https://visa.turanschool.uz`) va `TRUST_PROXY=true` qo'shing.
3. Deploy qiling.

### VPS (Nginx + `npm start`)

`TRUST_PROXY=true` qiling va Nginx'da `proxy_set_header X-Real-IP $remote_addr;` qatori bo'lsin. Node portini (3000) tashqariga ochmang, faqat Nginx orqali kirilsin.

## Tuzilma

```
app/page.tsx                  Sahifa (header, forma, qadamlar, CTA, footer)
app/layout.tsx                Metadata, shrift
app/globals.css               Dizayn (mobile-first)
app/api/visa/check/route.ts   POST: tekshiruvni boshlash
app/api/visa/status/route.ts  POST: natijani so'rash (imzolangan token bilan)
components/VisaChecker.tsx    Forma, kutish, natija (client)
lib/security.ts               Origin tekshiruvi, rate limit, HMAC token, hajm cheklovi
lib/visa.ts                   Validatsiya, visadoctors API chaqiruvi, javobni tozalash
proxy.ts                      Har so'rovda nonce bilan Content-Security-Policy
next.config.ts                Xavfsizlik sarlavhalari
assets/, app/icon.png         Logo va favicon
```

## Xavfsizlik choralari

**API**
- Brauzer visadoctors.uz ga to'g'ridan-to'g'ri murojaat qilmaydi. Hamma so'rov serverdagi route handler orqali o'tadi, tashqi API manzili kodda qat'iy yozilgan (SSRF yo'q, redirect taqiqlangan, 15 soniya timeout, javob 64 KB bilan cheklangan).
- Faqat shu saytdan kelgan so'rovlar qabul qilinadi: `Origin` va `Sec-Fetch-Site` tekshiruvi, `Content-Type: application/json` majburiy. Boshqa sayt foydalanuvchi brauzeri orqali API'ni chaqira olmaydi (CSRF).
- Barcha maydonlar allowlist bilan tekshiriladi: pasport `A-Z0-9`, ism faqat lotin harflari, sana haqiqiy va kelajakda emas. So'rov tanasi 2 KB dan oshmaydi.
- Bot himoyasi: yashirin honeypot maydon va minimal to'ldirish vaqti (2 soniya).
- Rate limit: bitta IP'dan 10 daqiqada 5 ta tekshiruv, daqiqasiga 40 ta holat so'rovi, butun saytga soatiga 600 ta tekshiruv.
- Holat so'rovi faqat server bergan HMAC-SHA256 imzoli, 15 daqiqalik token bilan ishlaydi. Shunday qilib `/api/visa/status` ni boshqa ID'lar uchun ochiq proxy sifatida ishlatib bo'lmaydi.
- Brauzerga visadoctors javobining o'zi emas, faqat kerakli maydonlar tur va uzunligi tekshirilib yuboriladi. Rang faqat `#RRGGBB` formatida qabul qilinadi.
- Xato xabarlari umumiy. Loglarda pasport yoki ism yozilmaydi. Hech qanday shaxsiy ma'lumot saqlanmaydi (bazasi ham, cookie ham yo'q).

**Sahifa**
- Har so'rovda yangi nonce bilan qat'iy CSP: begona skript ishlamaydi, boshqa domenlarga ulanib bo'lmaydi, sayt iframe ichiga joylanmaydi.
- HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP sarlavhalari qo'yilgan.
- `X-Powered-By` o'chirilgan. `/_next/image` endpointi o'chirilgan (rasm optimizatsiyasi orqali DoS xavfi).
- React tufayli barcha ma'lumot avtomatik escape qilinadi, `dangerouslySetInnerHTML` ishlatilmagan.

**Versiyalar:** Next.js 16.4.1 va React 19.2.9 (2026-yil 14-oktabrdagi xavfsizlik advisory'sidagi patched versiyalar). Versiyalar aniq qotirilgan. Yangi advisory chiqqanda yangilang va `npm audit` ni muntazam ishga tushiring.

### Muhim eslatmalar

- **Serverless (Vercel) va rate limit.** Rate limit server xotirasida saqlanadi. Bitta server (VPS, Docker) uchun to'liq ishlaydi. Vercel'da har bir instansiyaning xotirasi alohida, shuning uchun limit taxminiy bo'ladi. Qat'iy limit kerak bo'lsa, `lib/security.ts` dagi `rateLimit` funksiyasini Upstash Redis (`@upstash/ratelimit`) bilan almashtiring.
- **Kuchliroq bot himoyasi** kerak bo'lsa, Cloudflare Turnstile qo'shish mumkin.
- Bu visadoctors.uz ning hujjatlanmagan API'si. U ogohlantirishsiz o'zgarishi yoki bloklanishi mumkin. Ommaga ochishdan oldin ular bilan kelishib olish tavsiya etiladi.
