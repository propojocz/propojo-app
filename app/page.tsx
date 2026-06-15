"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Scroll reveal
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("visible");
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

    // Floating connection dots in hero
    const heroDots = document.getElementById("heroDots");
    const colors = ["#10b981", "#3b82f6", "#f59e0b"];
    const positions: number[][] = [
      [8, 30, 16], [18, 65, 11], [30, 20, 9], [72, 25, 13],
      [85, 60, 10], [62, 70, 8], [44, 78, 12], [92, 35, 9],
      [5, 80, 10], [50, 15, 8],
    ];
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    if (heroDots) {
      positions.forEach((p, i) => {
        const d = document.createElement("div");
        d.className = "float-dot";
        d.style.left = p[0] + "%";
        d.style.top = p[1] + "%";
        d.style.width = p[2] + "px";
        d.style.height = p[2] + "px";
        d.style.background = colors[i % 3];
        d.style.animationDelay = i * 0.12 + "s";
        heroDots.appendChild(d);
        const t = setTimeout(() => {
          d.style.animation = `floatIn 1s ease forwards, drift ${
            3 + (i % 3)
          }s ease-in-out ${1 + i * 0.1}s infinite`;
        }, 50);
        timeouts.push(t);
      });
    }

    return () => {
      observer.disconnect();
      timeouts.forEach(clearTimeout);
      if (heroDots) heroDots.innerHTML = "";
    };
  }, []);

  // Hledání → marketplace s dotazem
  const handleSearch = () => {
    const dotaz = (document.getElementById("heroQuery") as HTMLInputElement)?.value?.trim() ?? "";
    const kde = (document.getElementById("heroWhere") as HTMLInputElement)?.value?.trim() ?? "";
    const params = new URLSearchParams();
    if (dotaz) params.set("q", dotaz);
    if (kde) params.set("kde", kde);
    router.push(`/marketplace${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <>
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");

        :root {
          --green: #10b981; --green-dark: #059669; --green-soft: #ecfdf5;
          --blue: #3b82f6; --blue-soft: #eff6ff;
          --orange: #f59e0b; --orange-soft: #fffbeb;
          --ink: #1a1f2e; --gray-600: #5b6472; --gray-400: #9aa3b2;
          --gray-200: #e8ebef; --gray-100: #f4f6f8; --white: #ffffff;
        }
        html { scroll-behavior: smooth; }

        /* HERO */
        .hero {
          padding: 90px 48px 90px; text-align: center; position: relative;
          background: radial-gradient(ellipse 80% 50% at 50% 0%, var(--green-soft), transparent 70%);
          overflow: hidden;
        }
        .hero-dots { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
        .float-dot { position: absolute; border-radius: 50%; opacity: 0; animation: floatIn 1s ease forwards; }
        @keyframes floatIn { to { opacity: 0.5; } }
        @keyframes drift { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }

        .hero-badge {
          display: inline-flex; align-items: center; gap: 7px; background: var(--white);
          border: 1px solid var(--gray-200); padding: 7px 15px; border-radius: 100px;
          font-size: 13px; font-weight: 700; color: var(--gray-600); margin-bottom: 28px;
          position: relative; z-index: 2; box-shadow: 0 2px 12px rgba(0,0,0,0.04);
          opacity: 0; transform: translateY(20px); animation: revealUp .7s ease forwards;
        }
        .hero-badge .pulse { width: 8px; height: 8px; background: var(--green); border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); } 50% { box-shadow: 0 0 0 6px rgba(16,185,129,0); } }

        .hero h1 {
          font-size: 58px; font-weight: 800; letter-spacing: -2px; line-height: 1.05;
          max-width: 800px; margin: 0 auto 22px; position: relative; z-index: 2;
        }
        .hero h1 .word { display: inline-block; opacity: 0; transform: translateY(28px); animation: revealUp .7s ease forwards; }
        .hero h1 .accent { color: var(--green); position: relative; }
        @keyframes revealUp { to { opacity: 1; transform: translateY(0); } }

        .hero p {
          font-size: 19px; color: var(--gray-600); max-width: 560px; margin: 0 auto 38px;
          position: relative; z-index: 2; opacity: 0; transform: translateY(20px);
          animation: revealUp .7s ease .5s forwards;
        }

        .hero-search {
          display: flex; gap: 8px; max-width: 620px; margin: 0 auto; background: #fff;
          border: 1px solid var(--gray-200); border-radius: 16px; padding: 8px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.08); position: relative; z-index: 2;
          opacity: 0; transform: translateY(20px); animation: revealUp .7s ease .65s forwards;
        }
        .hero-search .field { display: flex; align-items: center; gap: 9px; flex: 1; padding: 8px 14px; }
        .hero-search .field svg { flex-shrink: 0; }
        .hero-search input { border: none; outline: none; font-family: inherit; font-size: 15px; width: 100%; background: transparent; }
        .hero-search .divider { width: 1px; background: var(--gray-200); margin: 6px 0; }
        .hero-search button { background: var(--green); color: #fff; border: none; padding: 13px 28px; border-radius: 11px; font-weight: 700; font-size: 15px; cursor: pointer; font-family: inherit; }
        .hero-search button:hover { background: var(--green-dark); }

        .hero-tags { display: flex; gap: 10px; justify-content: center; margin-top: 24px; flex-wrap: wrap; position: relative; z-index: 2; opacity: 0; animation: revealUp .7s ease .8s forwards; }
        .hero-tag { background: var(--white); border: 1px solid var(--gray-200); padding: 7px 14px; border-radius: 100px; font-size: 13px; font-weight: 600; color: var(--gray-600); cursor: pointer; transition: .2s; text-decoration: none; display: inline-block; }
        .hero-tag:hover { border-color: var(--green); color: var(--green-dark); transform: translateY(-2px); }

        /* TRUST BAR */
        .trust-bar { display: flex; justify-content: center; gap: 50px; padding: 40px 48px; flex-wrap: wrap; border-top: 1px solid var(--gray-100); border-bottom: 1px solid var(--gray-100); }
        .trust-stat { text-align: center; }
        .trust-stat .num { font-size: 30px; font-weight: 800; color: var(--ink); }
        .trust-stat .label { font-size: 13px; color: var(--gray-400); font-weight: 600; }

        /* SECTIONS */
        .section { padding: 90px 48px; max-width: 1140px; margin: 0 auto; }
        .section-title { text-align: center; margin-bottom: 56px; }
        .section-title h2 { font-size: 40px; font-weight: 800; letter-spacing: -1px; margin-bottom: 12px; }
        .section-title p { font-size: 17px; color: var(--gray-600); max-width: 480px; margin: 0 auto; }

        .reveal { opacity: 0; transform: translateY(36px); transition: opacity .7s ease, transform .7s ease; }
        .reveal.visible { opacity: 1; transform: translateY(0); }

        /* HOW IT WORKS */
        .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
        .step { text-align: center; padding: 32px 24px; }
        .step-icon { width: 64px; height: 64px; border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        .step:nth-child(1) .step-icon { background: var(--green-soft); }
        .step:nth-child(2) .step-icon { background: var(--blue-soft); }
        .step:nth-child(3) .step-icon { background: var(--orange-soft); }
        .step h3 { font-size: 19px; font-weight: 800; margin-bottom: 10px; }
        .step p { color: var(--gray-600); font-size: 15px; line-height: 1.6; }
        .step-num { font-size: 13px; font-weight: 800; color: var(--gray-400); margin-bottom: 8px; }

        /* BENEFITS */
        .benefits { background: var(--gray-100); }
        .benefit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1140px; margin: 0 auto; }
        .benefit { background: #fff; border-radius: 18px; padding: 32px 28px; border: 1px solid var(--gray-200); transition: transform .3s, box-shadow .3s; }
        .benefit:hover { transform: translateY(-6px); box-shadow: 0 16px 40px rgba(0,0,0,0.08); }
        .benefit .b-icon { font-size: 28px; margin-bottom: 16px; }
        .benefit h3 { font-size: 19px; font-weight: 800; margin-bottom: 10px; }
        .benefit p { color: var(--gray-600); font-size: 15px; line-height: 1.6; }

        /* CATEGORIES */
        .cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .cat { border: 1px solid var(--gray-200); border-radius: 14px; padding: 22px; cursor: pointer; transition: .25s; display: flex; align-items: center; gap: 13px; text-decoration: none; color: inherit; }
        .cat:hover { border-color: var(--green); background: var(--green-soft); transform: translateY(-3px); }
        .cat .cat-emoji { font-size: 24px; }
        .cat .cat-name { font-weight: 700; font-size: 15px; }

        /* CTA */
        .cta-section { padding: 90px 48px; }
        .cta-box {
          max-width: 920px; margin: 0 auto; background: linear-gradient(135deg, var(--ink), #2a3142);
          border-radius: 28px; padding: 64px 48px; text-align: center; color: #fff; position: relative; overflow: hidden;
        }
        .cta-box::before { content: ""; position: absolute; top: -50%; right: -10%; width: 400px; height: 400px; background: radial-gradient(circle, rgba(16,185,129,0.3), transparent 70%); }
        .cta-box h2 { font-size: 38px; font-weight: 800; letter-spacing: -1px; margin-bottom: 14px; position: relative; z-index: 2; }
        .cta-box p { font-size: 17px; opacity: 0.85; max-width: 460px; margin: 0 auto 32px; position: relative; z-index: 2; }
        .cta-box .btn-white { background: #fff; color: var(--ink); border: none; padding: 15px 32px; border-radius: 12px; font-weight: 800; font-size: 16px; cursor: pointer; font-family: inherit; position: relative; z-index: 2; text-decoration: none; display: inline-block; }
        .cta-box .btn-white:hover { transform: scale(1.04); }

        @media (max-width: 880px) {
          .hero h1 { font-size: 38px; }
          .hero { padding: 60px 24px 60px; }
          .section { padding: 60px 24px; }
          .steps, .benefit-grid { grid-template-columns: 1fr; }
          .cat-grid { grid-template-columns: repeat(2, 1fr); }
          .hero-search { flex-direction: column; }
          .hero-search .divider { display: none; }
          .trust-bar { gap: 28px; }
        }
      `}</style>

      {/* HERO */}
      <section className="hero">
        <div className="hero-dots" id="heroDots"></div>

        <div className="hero-badge">
          <span className="pulse"></span>
          Ověření poskytovatelé · Záloha = jistota
        </div>

        <h1>
          <span className="word" style={{ animationDelay: ".1s" }}>Najděte</span>{" "}
          <span className="word" style={{ animationDelay: ".18s" }}>řemeslníka,</span>
          <br />
          <span className="word" style={{ animationDelay: ".26s" }}>který</span>{" "}
          <span className="word accent" style={{ animationDelay: ".34s" }}>opravdu přijde.</span>
        </h1>

        <p>
          Rezervujte ověřené řemeslníky a salóny online. Zaplatíte zálohu přes
          Propojo – a máte jistotu, že dorazí.
        </p>

        <div className="hero-search">
          <div className="field">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa3b2" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input id="heroQuery" type="text" placeholder="Jakou službu hledáte?"
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }} />
          </div>
          <div className="divider"></div>
          <div className="field" style={{ flex: 0.6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa3b2" strokeWidth="2">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <input id="heroWhere" type="text" placeholder="Kde?"
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }} />
          </div>
          <button onClick={handleSearch}>Hledat</button>
        </div>

        <div className="hero-tags">
          <Link href="/marketplace?q=Kadeřnictví" className="hero-tag">💇 Kadeřnictví</Link>
          <Link href="/marketplace?q=Instalatér" className="hero-tag">🔧 Instalatér</Link>
          <Link href="/marketplace?q=Úklid" className="hero-tag">🧹 Úklid</Link>
          <Link href="/marketplace?q=Elektrikář" className="hero-tag">⚡ Elektrikář</Link>
          <Link href="/marketplace?q=Rekonstrukce" className="hero-tag">🏗️ Rekonstrukce</Link>
        </div>
      </section>

      {/* TRUST BAR */}
      <div className="trust-bar">
        <div className="trust-stat"><div className="num">100 %</div><div className="label">ověřená IČO přes ARES</div></div>
        <div className="trust-stat"><div className="num">0 Kč</div><div className="label">provize z vaší zakázky</div></div>
        <div className="trust-stat"><div className="num">★ 4,9</div><div className="label">průměrné hodnocení</div></div>
      </div>

      {/* HOW IT WORKS */}
      <section className="section" id="jak">
        <div className="section-title reveal">
          <h2>Jak to funguje</h2>
          <p>Od hledání po hotovou práci ve třech krocích.</p>
        </div>
        <div className="steps">
          <div className="step reveal">
            <div className="step-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            </div>
            <div className="step-num">KROK 1</div>
            <h3>Najděte a porovnejte</h3>
            <p>Vyhledejte ověřené poskytovatele ve svém okolí, porovnejte ceny a recenze od skutečných zákazníků.</p>
          </div>
          <div className="step reveal" style={{ transitionDelay: ".12s" }}>
            <div className="step-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
            </div>
            <div className="step-num">KROK 2</div>
            <h3>Rezervujte termín</h3>
            <p>Vyberte si volný termín v kalendáři a zaplaťte rezervační zálohu. Záloha se započítá do konečné ceny.</p>
          </div>
          <div className="step reveal" style={{ transitionDelay: ".24s" }}>
            <div className="step-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
            </div>
            <div className="step-num">KROK 3</div>
            <h3>Hotovo a v klidu</h3>
            <p>Poskytovatel dorazí podle domluvy. Pokud ne, vrátíme vám zálohu zpět. Žádné starosti.</p>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="benefits">
        <div className="section" style={{ paddingTop: "80px", paddingBottom: "80px" }}>
          <div className="section-title reveal">
            <h2>Proč Propojo</h2>
            <p>Postaveno na důvěře mezi vámi a poskytovateli.</p>
          </div>
          <div className="benefit-grid">
            <div className="benefit reveal">
              <div className="b-icon">🛡️</div>
              <h3>Ověření poskytovatelé</h3>
              <p>Každý poskytovatel má ověřené IČO přes ARES a recenze od skutečných zákazníků – žádné falešné hodnocení.</p>
            </div>
            <div className="benefit reveal" style={{ transitionDelay: ".12s" }}>
              <div className="b-icon">💳</div>
              <h3>Rezervační záloha</h3>
              <p>Platíte zálohu přes Propojo. Pokud poskytovatel nepřijde, dostanete peníze zpět. Jistota pro obě strany.</p>
            </div>
            <div className="benefit reveal" style={{ transitionDelay: ".24s" }}>
              <div className="b-icon">📅</div>
              <h3>Rezervace i čekací listina</h3>
              <p>Vyberte si termín kliknutím. Obsazeno? Přihlaste se na waitlist a dáme vám vědět, jakmile se uvolní.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="section" id="kategorie">
        <div className="section-title reveal">
          <h2>Oblíbené kategorie</h2>
          <p>Od drobných oprav po velké rekonstrukce.</p>
        </div>
        <div className="cat-grid">
          <Link href="/marketplace?q=Kadeřnictví" className="cat reveal"><span className="cat-emoji">💇</span><span className="cat-name">Kadeřnictví</span></Link>
          <Link href="/marketplace?q=Kosmetika" className="cat reveal" style={{ transitionDelay: ".05s" }}><span className="cat-emoji">💅</span><span className="cat-name">Kosmetika</span></Link>
          <Link href="/marketplace?q=Masáže" className="cat reveal" style={{ transitionDelay: ".1s" }}><span className="cat-emoji">💆</span><span className="cat-name">Masáže</span></Link>
          <Link href="/marketplace?q=Instalatér" className="cat reveal" style={{ transitionDelay: ".15s" }}><span className="cat-emoji">🔧</span><span className="cat-name">Instalatér</span></Link>
          <Link href="/marketplace?q=Elektrikář" className="cat reveal"><span className="cat-emoji">⚡</span><span className="cat-name">Elektrikář</span></Link>
          <Link href="/marketplace?q=Úklid" className="cat reveal" style={{ transitionDelay: ".05s" }}><span className="cat-emoji">🧹</span><span className="cat-name">Úklid</span></Link>
          <Link href="/marketplace?q=Rekonstrukce" className="cat reveal" style={{ transitionDelay: ".1s" }}><span className="cat-emoji">🏗️</span><span className="cat-name">Rekonstrukce</span></Link>
          <Link href="/marketplace?q=Zahrada" className="cat reveal" style={{ transitionDelay: ".15s" }}><span className="cat-emoji">🌳</span><span className="cat-name">Zahrada</span></Link>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-box reveal">
          <h2>Jste poskytovatel?</h2>
          <p>Získejte nové zákazníky bez provizí z vašich zakázek. První měsíc zdarma.</p>
          <Link href="/registrace" className="btn-white">Začít zdarma →</Link>
        </div>
      </section>
    </>
  );
}