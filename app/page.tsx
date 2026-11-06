import Image from "next/image";
import VisaChecker from "@/components/VisaChecker";
import logoText from "@/assets/logo-text.png";
import mark from "@/assets/mark.png";

const MAIN_SITE = "https://turan-korea.lovable.app";
const TELEGRAM = "https://t.me/turanschoolnews";

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <a href={`${MAIN_SITE}/bakalavr`} className="brand" aria-label="Turan Int. School — bosh sahifa" rel="noopener">
            <Image src={mark} alt="" priority className="brand-mark" />
            <Image src={logoText} alt="Turan Int. School" priority className="brand-text" />
          </a>
          <a href={TELEGRAM} className="icon-btn" target="_blank" rel="noopener noreferrer" aria-label="Telegram kanal">
            <TelegramIcon />
          </a>
        </div>
      </header>

      <main className="page">
        <div className="hero-bg" aria-hidden="true">
          <Image src={mark} alt="" className="hero-ornament" />
        </div>

        <div className="container">
          <section className="hero">
            <span className="eyebrow anim-up" style={{ animationDelay: "60ms" }}>
              <span className="dot" />Koreya vizasi
            </span>
            <h1 className="anim-up" style={{ animationDelay: "140ms" }}>
              Viza holatini <span className="accent">tekshiring</span>
            </h1>
            <div className="hero-note anim-up" style={{ animationDelay: "220ms" }}>
              <p>
                Ushbu sayt talabalar uchun qulaylik yaratish maqsadida ishlab chiqilgan.
                Bu yerda faqat viza holatingizni tekshirishingiz mumkin. Ma'lumotlar rasmiy{" "}
                <a href="https://www.visa.go.kr" target="_blank" rel="noopener noreferrer">visa.go.kr</a>{" "}
                saytidan olinadi.
              </p>
            </div>
          </section>

          <div className="anim-up" style={{ animationDelay: "300ms" }}>
            <VisaChecker />
          </div>

          <section className="steps" aria-label="Qanday ishlaydi">
            {[
              "Ma'lumotlarni pasportdagidek lotin harflarida kiriting",
              "Tizim elchixona bazasidan holatni tekshiradi",
              "Natija va taxminiy muddat shu yerda ko'rinadi",
            ].map((t, i) => (
              <div className="step reveal" key={i}>
                <span>{i + 1}</span>
                <p>{t}</p>
              </div>
            ))}
          </section>

          <section className="cta reveal">
            <div className="cta-ornament" aria-hidden="true">
              <Image src={mark} alt="" />
            </div>
            <div className="cta-text">
              <h2>Koreyada o'qishni rejalashtiryapsizmi?</h2>
              <p>Bakalavr, magistratura va til kurslari bo'yicha maslahat oling.</p>
            </div>
            <a href={`${MAIN_SITE}/bakalavr`} className="btn btn-dark btn-arrow" rel="noopener">
              Ro'yxatdan o'tish <ArrowIcon />
            </a>
          </section>
        </div>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <Image src={mark} alt="" width={34} height={34} className="footer-mark" />
          <p>© 2022–{year} Turan Int. School</p>
          <a href={TELEGRAM} target="_blank" rel="noopener noreferrer">Telegram: @turanschoolnews</a>
        </div>
      </footer>
    </>
  );
}

function TelegramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.94 4.3a1 1 0 0 0-1.36-1.07L2.66 10.2a1 1 0 0 0 .06 1.88l4.4 1.4 1.7 5.36a1 1 0 0 0 1.66.4l2.45-2.4 4.3 3.17a1 1 0 0 0 1.57-.6L21.94 4.3ZM9.7 14.2l-.6 3.13-1.12-3.55 9.27-6.1-7.55 6.52Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
