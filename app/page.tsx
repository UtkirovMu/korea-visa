import Image from "next/image";
import VisaChecker from "@/components/VisaChecker";
import logo from "@/assets/logo.png";
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
            <Image src={logo} alt="Turan Int. School" priority className="brand-logo" />
          </a>
          <a href={TELEGRAM} className="icon-btn" target="_blank" rel="noopener noreferrer" aria-label="Telegram kanal">
            <TelegramIcon />
          </a>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <span className="eyebrow"><span className="dot" />Koreya vizasi</span>
          <h1>Viza holatini <span className="accent">tekshiring</span></h1>
          <p>Pasport ma'lumotlarini kiriting — arizangiz holati bir necha soniyada chiqadi.</p>
        </section>

        <VisaChecker />

        <section className="steps" aria-label="Qanday ishlaydi">
          <div className="step"><span>1</span><p>Ma'lumotlarni pasportdagidek lotin harflarida kiriting</p></div>
          <div className="step"><span>2</span><p>Tizim elchixona bazasidan holatni tekshiradi</p></div>
          <div className="step"><span>3</span><p>Natija va taxminiy muddat shu yerda ko'rinadi</p></div>
        </section>

        <section className="cta">
          <div>
            <h2>Koreyada o'qishni rejalashtiryapsizmi?</h2>
            <p>Bakalavr, magistratura va til kurslari bo'yicha maslahat oling.</p>
          </div>
          <a href={`${MAIN_SITE}/bakalavr`} className="btn btn-dark" rel="noopener">Ro'yxatdan o'tish</a>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <Image src={mark} alt="" width={32} height={32} />
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
