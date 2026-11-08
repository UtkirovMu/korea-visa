// Next.js 16 "proxy" (avvalgi nomi: middleware).
// Har bir sahifa so'roviga yangi nonce bilan qat'iy Content-Security-Policy qo'yadi:
// faqat shu nonce'ga ega skriptlar ishlaydi, boshqa saytga ulanish taqiqlanadi, iframe faqat Telegram Web'ga ruxsat.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Next.js va React ba'zi inline style'lar qo'yadi; stil orqali skript ishga tushirib bo'lmaydi.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Faqat Telegram Web (web.telegram.org) Web App sifatida iframe'da ocha oladi; boshqa saytlar — yo'q.
    // Telegram mobil/desktop ilovalari iframe ishlatmaydi, ularga bu cheklov ta'sir qilmaydi.
    "frame-ancestors 'self' https://web.telegram.org",
    "manifest-src 'self'",
    "worker-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // statik fayllar va API'dan tashqari hamma sahifalar
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
