"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [where, setWhere] = useState("");
  const [oborySug, setOborySug] = useState<{ type: string; value: string; label: string }[]>([]);
  const [obceSug, setObceSug] = useState<{ obec: string; okres: string }[]>([]);
  const [showObory, setShowObory] = useState(false);
  const [showObce, setShowObce] = useState(false);
  const queryBoxRef = useRef<HTMLDivElement>(null);
  const whereBoxRef = useRef<HTMLDivElement>(null);
  const qDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (queryBoxRef.current && !queryBoxRef.current.contains(e.target as Node)) setShowObory(false);
      if (whereBoxRef.current && !whereBoxRef.current.contains(e.target as Node)) setShowObce(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const fetchObory = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setOborySug([]); setShowObory(false); return; }
    try {
      const res = await fetch(`/api/obory?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setOborySug(data.obory ?? []);
      setShowObory((data.obory ?? []).length > 0);
    } catch { setOborySug([]); }
  }, []);

  const fetchObce = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setObceSug([]); setShowObce(false); return; }
    try {
      const res = await fetch(`/api/obce?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setObceSug(data.obce ?? []);
      setShowObce((data.obce ?? []).length > 0);
    } catch { setObceSug([]); }
  }, []);

  const onQueryChange = (v: string) => {
    setQuery(v);
    if (qDebounce.current) clearTimeout(qDebounce.current);
    qDebounce.current = setTimeout(() => fetchObory(v), 180);
  };
  const onWhereChange = (v: string) => {
    setWhere(v);
    if (wDebounce.current) clearTimeout(wDebounce.current);
    wDebounce.current = setTimeout(() => fetchObce(v), 180);
  };

  const handleSearch = (q?: string, city?: string) => {
    const dotaz = (q ?? query).trim();
    const kde = (city ?? where).trim();
    const params = new URLSearchParams();
    if (dotaz) params.set("q", dotaz);
    if (kde) params.set("city", kde);
    router.push(`/marketplace${params.toString() ? `?${params.toString()}` : ""}`);
  };

  // Scroll-reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");

        :root {
          --green:#10b981; --green-dark:#059669; --green-soft:#ecfdf5;
          --blue:#3b82f6; --blue-dark:#2563eb; --blue-soft:#eff6ff;
          --orange:#f59e0b; --orange-dark:#d97706; --orange-soft:#fffbeb;
          --ink:#1a1f2e; --gray-600:#5b6472; --gray-400:#9aa3b2;
          --gray-200:#e8ebef; --gray-100:#f4f6f8; --white:#fff;
        }
        html { scroll-behavior:smooth; }

        .home h1, .home h2, .home .display { font-family:'Poppins',sans-serif; }

        /* HERO */
        .hero { text-align:center; padding:76px 48px 96px; position:relative; overflow:visible;
          background:radial-gradient(ellipse 75% 55% at 50% -5%, var(--green-soft), transparent 72%); }
        .hero-badge { display:inline-flex; align-items:center; gap:8px; background:#fff; border:1px solid var(--gray-200);
          padding:7px 16px; border-radius:100px; font-size:13px; font-weight:600; color:var(--gray-600); margin-bottom:26px;
          box-shadow:0 2px 12px rgba(0,0,0,.04); position:relative; z-index:1; }
        .hero-badge .dot { width:8px; height:8px; background:var(--green); border-radius:50%; animation:pulseDot 2s infinite; }
        @keyframes pulseDot { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.45);} 50%{box-shadow:0 0 0 6px rgba(16,185,129,0);} }

        /* Lítající barevné tečky na pozadí (barevný kód Propojo) */
        .hero-dots { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0; }
        .fdot { position:absolute; border-radius:50%; opacity:.5; filter:blur(.5px); }
        .fdot.g { background:var(--green); }
        .fdot.b { background:var(--blue); }
        .fdot.o { background:var(--orange); }
        .fdot.d1 { width:14px; height:14px; left:8%;  top:24%; animation:float1 9s ease-in-out infinite; }
        .fdot.d2 { width:10px; height:10px; left:88%; top:20%; animation:float2 11s ease-in-out infinite; }
        .fdot.d3 { width:18px; height:18px; left:80%; top:62%; animation:float3 13s ease-in-out infinite; }
        .fdot.d4 { width:8px;  height:8px;  left:16%; top:66%; animation:float2 10s ease-in-out infinite; }
        .fdot.d5 { width:12px; height:12px; left:50%; top:12%; animation:float1 12s ease-in-out infinite; }
        .fdot.d6 { width:9px;  height:9px;  left:30%; top:38%; animation:float3 14s ease-in-out infinite; }
        @keyframes float1 { 0%,100%{transform:translate(0,0);} 50%{transform:translate(18px,-24px);} }
        @keyframes float2 { 0%,100%{transform:translate(0,0);} 50%{transform:translate(-22px,18px);} }
        @keyframes float3 { 0%,100%{transform:translate(0,0);} 50%{transform:translate(16px,20px);} }
        @media (prefers-reduced-motion: reduce) { .fdot { animation:none!important; } }
        .hero h1 { font-size:clamp(38px,5.2vw,62px); font-weight:600; letter-spacing:-1.5px; line-height:1.04; max-width:840px; margin:0 auto 18px; color:var(--ink); position:relative; z-index:1; }
        .hero h1 .accent { color:var(--green); }
        .hero .sub { font-size:18px; color:var(--gray-600); max-width:540px; margin:0 auto 34px; position:relative; z-index:1; }

        .hero-search { display:flex; gap:6px; max-width:640px; margin:0 auto; background:#fff; border:1px solid var(--gray-200);
          border-radius:16px; padding:8px; box-shadow:0 14px 44px rgba(16,24,40,.10); position:relative; z-index:5; text-align:left; }
        .hs-field { display:flex; align-items:center; gap:9px; flex:1; padding:10px 14px; position:relative; }
        .hs-field svg { flex-shrink:0; }
        .hs-field input { border:none; outline:none; font-family:inherit; font-size:15px; width:100%; background:transparent; color:var(--ink); }
        .hs-divider { width:1px; background:var(--gray-200); margin:8px 0; }
        .hs-btn { background:var(--green); color:#fff; border:none; padding:13px 26px; border-radius:11px; font-weight:600; font-size:15px; transition:.15s; cursor:pointer; font-family:inherit; }
        .hs-btn:hover { background:var(--green-dark); }

        .suggest { position:absolute; left:-8px; right:-8px; top:calc(100% + 12px); background:#fff; border:1px solid var(--gray-200);
          border-radius:14px; box-shadow:0 16px 48px rgba(16,24,40,.14); overflow:hidden; z-index:30; }
        .suggest-item { display:flex; align-items:center; gap:10px; padding:12px 16px; font-size:14.5px; border:none; background:transparent;
          width:100%; text-align:left; cursor:pointer; font-family:inherit; color:var(--ink); border-bottom:1px solid var(--gray-100); transition:background .12s; }
        .suggest-item:last-child { border-bottom:none; }
        .suggest-item:hover { background:var(--green-soft); }
        .suggest-item .si-meta { margin-left:auto; font-size:12px; color:var(--gray-400); font-weight:600; }

        .hero-assure { display:inline-flex; align-items:center; gap:8px; margin-top:18px; font-size:13.5px; font-weight:600; color:var(--gray-600); position:relative; z-index:1; }
        .hero-assure svg { flex-shrink:0; }

        /* TRUST */
        .trust { display:flex; justify-content:center; border-top:1px solid var(--gray-100); border-bottom:1px solid var(--gray-100); }
        .trust-stat { flex:1; max-width:300px; text-align:center; padding:30px 24px; }
        .trust-stat + .trust-stat { border-left:1px solid var(--gray-100); }
        .trust-stat .num { font-family:'Poppins',sans-serif; font-size:32px; font-weight:600; color:var(--ink); }
        .trust-stat .label { font-size:13px; color:var(--gray-400); font-weight:600; margin-top:2px; }

        /* SECTIONS */
        .home-section { padding:84px 48px; max-width:1120px; margin:0 auto; }
        .sec-head { text-align:center; margin-bottom:52px; }
        .sec-head .eyebrow { display:inline-block; font-size:12.5px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--green-dark); margin-bottom:10px; }
        .sec-head h2 { font-size:clamp(30px,3.6vw,42px); font-weight:600; letter-spacing:-.8px; margin-bottom:10px; color:var(--ink); }
        .sec-head p { font-size:16.5px; color:var(--gray-600); max-width:500px; margin:0 auto; }

        .reveal { opacity:0; transform:translateY(28px); transition:opacity .6s ease, transform .6s ease; }
        .reveal.visible { opacity:1; transform:translateY(0); }

        /* KATEGORIE — fotkové dlaždice */
        .cats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
        .cat { position:relative; border-radius:16px; overflow:hidden; text-decoration:none; aspect-ratio:4/3;
          display:flex; align-items:flex-end; transition:transform .25s, box-shadow .25s; box-shadow:0 2px 10px rgba(16,24,40,.06); }
        .cat img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transition:transform .4s ease; z-index:0; }
        .cat::after { content:""; position:absolute; inset:0; z-index:1;
          background:linear-gradient(to top, rgba(15,20,30,.78) 0%, rgba(15,20,30,.28) 42%, rgba(15,20,30,0) 72%); }
        .cat .name { position:relative; z-index:2; color:#fff; font-weight:600; font-size:15.5px; padding:16px; letter-spacing:-.2px;
          text-shadow:0 1px 8px rgba(0,0,0,.35); }
        .cat:hover { transform:translateY(-4px); box-shadow:0 16px 34px rgba(16,24,40,.16); }
        .cat:hover img { transform:scale(1.07); }

        /* JAK TO FUNGUJE */
        .how-wrap { background:var(--gray-100); }
        .steps { display:grid; grid-template-columns:repeat(3,1fr); gap:26px; position:relative; }
        .thread { position:absolute; top:31px; left:16%; right:16%; height:2px; z-index:0;
          background:repeating-linear-gradient(90deg, var(--gray-400) 0 6px, transparent 6px 14px); opacity:.5; }
        .step { text-align:center; padding:0 18px; position:relative; z-index:1; }
        .step-dot { width:62px; height:62px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          margin:0 auto 18px; font-size:24px; border:4px solid var(--gray-100); background:#fff; }
        .step.s-green .step-dot { background:var(--green-soft); }
        .step.s-blue .step-dot { background:var(--blue-soft); }
        .step.s-orange .step-dot { background:var(--orange-soft); }
        .step .who { font-size:12px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; margin-bottom:6px; }
        .step.s-green .who { color:var(--green-dark); }
        .step.s-blue .who { color:var(--blue-dark); }
        .step.s-orange .who { color:var(--orange-dark); }
        .step h3 { font-size:19px; font-weight:600; margin-bottom:8px; color:var(--ink); }
        .step p { color:var(--gray-600); font-size:14.5px; line-height:1.6; }

        /* KARTY */
        .pcards { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
        .pcard { border:1px solid var(--gray-200); border-radius:18px; overflow:hidden; background:#fff; transition:.2s; text-decoration:none; display:flex; flex-direction:column; color:var(--ink); }
        .pcard:hover { transform:translateY(-4px); box-shadow:0 14px 36px rgba(16,24,40,.09); border-color:#c9f0e2; }
        .pcard-photo { height:120px; display:flex; align-items:center; justify-content:center; font-size:42px; }
        .pcard.c1 .pcard-photo { background:linear-gradient(135deg,#ecfdf5,#eff6ff); }
        .pcard.c2 .pcard-photo { background:linear-gradient(135deg,#eff6ff,#fffbeb); }
        .pcard.c3 .pcard-photo { background:linear-gradient(135deg,#fffbeb,#ecfdf5); }
        .pcard-body { padding:16px 18px 18px; display:flex; flex-direction:column; gap:8px; flex:1; }
        .pcard-top { display:flex; align-items:center; gap:10px; }
        .p-avatar { width:38px; height:38px; border-radius:50%; background:var(--green-soft); display:flex; align-items:center; justify-content:center; font-weight:600; color:var(--green-dark); font-size:15px; }
        .pcard-name { font-weight:600; font-size:15.5px; }
        .pcard-obor { font-size:12.5px; font-weight:600; color:var(--green-dark); }
        .pcard-meta { display:flex; gap:12px; font-size:12.5px; color:var(--gray-600); flex-wrap:wrap; }
        .pcard-meta .verified { color:var(--green-dark); font-weight:600; }
        .pcard-bottom { display:flex; align-items:flex-end; justify-content:space-between; border-top:1px solid var(--gray-100); padding-top:12px; margin-top:auto; }
        .pcard-price { font-weight:600; font-size:17px; }
        .pcard-price small { display:block; font-size:11.5px; color:var(--gray-400); font-weight:600; }
        .pcard-go { background:var(--green); color:#fff; padding:8px 16px; border-radius:10px; font-size:13px; font-weight:600; }
        .pcards-cta { text-align:center; margin-top:34px; }
        .pcards-cta a { display:inline-block; border:1.5px solid var(--gray-200); border-radius:12px; padding:12px 26px; font-weight:600; font-size:14.5px; text-decoration:none; transition:.15s; color:var(--ink); }
        .pcards-cta a:hover { border-color:var(--green); color:var(--green-dark); }

        /* PROČ */
        .why { display:grid; grid-template-columns:repeat(3,1fr); gap:22px; }
        .why-card { background:#fff; border:1px solid var(--gray-200); border-radius:18px; padding:28px 26px; transition:.25s; }
        .why-card:hover { transform:translateY(-5px); box-shadow:0 16px 40px rgba(16,24,40,.08); }
        .why-card .icon { width:46px; height:46px; border-radius:13px; display:flex; align-items:center; justify-content:center; font-size:21px; margin-bottom:16px; }
        .why-card.c1 .icon { background:var(--green-soft); } .why-card.c2 .icon { background:var(--blue-soft); } .why-card.c3 .icon { background:var(--orange-soft); }
        .why-card h3 { font-size:18px; font-weight:600; margin-bottom:8px; color:var(--ink); }
        .why-card p { color:var(--gray-600); font-size:14.5px; line-height:1.65; }

        /* RECENZE */
        .quotes-wrap { background:var(--gray-100); }
        .quotes { display:grid; grid-template-columns:repeat(2,1fr); gap:22px; max-width:860px; margin:0 auto; }
        .quote { background:#fff; border:1px solid var(--gray-200); border-radius:18px; padding:26px; }
        .quote .stars { color:var(--orange); letter-spacing:2px; margin-bottom:12px; font-size:14px; }
        .quote p { font-size:15px; line-height:1.65; color:var(--ink); margin-bottom:16px; }
        .quote .who { display:flex; align-items:center; gap:10px; font-size:13px; color:var(--gray-600); font-weight:600; }
        .quote .who .p-avatar { width:34px; height:34px; font-size:13px; }

        /* CTA */
        .pro-cta { max-width:920px; margin:0 auto; background:linear-gradient(135deg,#1a1f2e,#2a3142); border-radius:26px;
          padding:58px 48px; text-align:center; color:#fff; position:relative; overflow:hidden; }
        .pro-cta::before { content:""; position:absolute; top:-40%; right:-8%; width:380px; height:380px;
          background:radial-gradient(circle, rgba(245,158,11,.28), transparent 70%); }
        .pro-cta .eyebrow { color:var(--orange); font-size:12.5px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; position:relative; }
        .pro-cta h2 { font-size:clamp(28px,3.4vw,38px); font-weight:600; letter-spacing:-.7px; margin:12px 0 14px; position:relative; color:#fff; }
        .pro-cta p { font-size:16px; opacity:.85; max-width:470px; margin:0 auto 28px; position:relative; }
        .pro-cta .btn { display:inline-block; background:#fff; color:var(--ink); padding:15px 30px; border-radius:12px;
          font-weight:600; font-size:15.5px; text-decoration:none; position:relative; transition:.15s; }
        .pro-cta .btn:hover { transform:scale(1.04); }
        .pro-cta .note { display:block; margin-top:14px; font-size:12.5px; opacity:.6; position:relative; }

        /* FAQ */
        .faq { max-width:680px; margin:0 auto; }
        .faq details { border:1px solid var(--gray-200); border-radius:14px; margin-bottom:12px; background:#fff; overflow:hidden; }
        .faq summary { padding:18px 22px; font-weight:600; font-size:15.5px; cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; color:var(--ink); }
        .faq summary::-webkit-details-marker { display:none; }
        .faq summary::after { content:"+"; font-size:20px; color:var(--gray-400); font-weight:600; }
        .faq details[open] summary::after { content:"–"; }
        .faq details p { padding:0 22px 18px; color:var(--gray-600); font-size:14.5px; line-height:1.65; }

        @media (max-width:880px) {
          .hero { padding:52px 20px 48px; }
          .hero-search { flex-direction:column; }
          .hs-divider { display:none; }
          .hs-btn { width:100%; }
          .trust { flex-direction:column; }
          .trust-stat + .trust-stat { border-left:none; border-top:1px solid var(--gray-100); }
          .home-section { padding:56px 20px; }
          .cats { grid-template-columns:repeat(2,1fr); }
          .steps { grid-template-columns:1fr; gap:36px; }
          .thread { display:none; }
          .pcards { grid-template-columns:1fr; }
          .why { grid-template-columns:1fr; }
          .quotes { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="home">
        {/* HERO */}
        <section className="hero">
          <div className="hero-dots">
            <span className="fdot g d1"></span>
            <span className="fdot b d2"></span>
            <span className="fdot o d3"></span>
            <span className="fdot g d4"></span>
            <span className="fdot b d5"></span>
            <span className="fdot o d6"></span>
          </div>
          <div className="hero-badge"><span className="dot"></span> Ověření živnostníci · Záloha = jistota</div>
          <h1>Snadné propojení zákazníka<br /> <span className="accent">s poskytovateli.</span></h1>
          <p className="sub">Ověření živnostníci z vašeho okolí. Vyberete termín, zaplatíte zálohu — a máte jistotu, že dorazí.</p>

          <div className="hero-search">
            <div className="hs-field" ref={queryBoxRef}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa3b2" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                type="text"
                placeholder="Co potřebujete? (kadeřnice, instalatér…)"
                value={query}
                autoComplete="off"
                onChange={(e) => onQueryChange(e.target.value)}
                onFocus={() => { if (oborySug.length > 0) setShowObory(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              />
              {showObory && oborySug.length > 0 && (
                <div className="suggest">
                  {oborySug.map((item) => (
                    <button key={`${item.type}-${item.value}`} type="button" className="suggest-item"
                      onClick={() => { setQuery(item.label); setShowObory(false); handleSearch(item.label, where); }}>
                      <span>{item.type === "category" ? "🏷️" : "▸"}</span>
                      <span>{item.label}</span>
                      <span className="si-meta">{item.type === "category" ? "obor" : "úkon"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="hs-divider"></div>
            <div className="hs-field" ref={whereBoxRef} style={{ flex: 0.62 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa3b2" strokeWidth="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <input
                type="text"
                placeholder="Kde?"
                value={where}
                autoComplete="off"
                onChange={(e) => onWhereChange(e.target.value)}
                onFocus={() => { if (obceSug.length > 0) setShowObce(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              />
              {showObce && obceSug.length > 0 && (
                <div className="suggest">
                  {obceSug.map((item) => (
                    <button key={`${item.obec}-${item.okres}`} type="button" className="suggest-item"
                      onClick={() => { setWhere(item.obec); setShowObce(false); handleSearch(query, item.obec); }}>
                      <span>📍</span>
                      <span>{item.obec}</span>
                      <span className="si-meta">{item.okres}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="hs-btn" onClick={() => handleSearch()}>Hledat</button>
          </div>

          <div className="hero-assure">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.4"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
            Když řemeslník nedorazí, zálohu vám vrátíme. Celou.
          </div>
        </section>

        {/* TRUST */}
        <div className="trust">
          <div className="trust-stat"><div className="num">100 %</div><div className="label">každé IČO ověřené v ARES</div></div>
          <div className="trust-stat"><div className="num">0 Kč</div><div className="label">přirážky k ceně řemeslníka</div></div>
          <div className="trust-stat"><div className="num">30 s</div><div className="label">rezervace termínu — bez telefonování</div></div>
        </div>

        {/* KATEGORIE */}
        <section className="home-section">
          <div className="sec-head reveal">
            <span className="eyebrow">Kategorie</span>
            <h2>Od střihu po rekonstrukci</h2>
            <p>Vyberte si obor — nebo prostě napište nahoře, co potřebujete.</p>
          </div>
          <div className="cats reveal">
            <Link className="cat" href="/marketplace?q=Kadeřnictví"><img src="/kategorie/kadernictvi.jpg" alt="Kadeřnictví" /><span className="name">Kadeřnictví</span></Link>
            <Link className="cat" href="/marketplace?q=Kosmetika"><img src="/kategorie/kosmetika.jpg" alt="Kosmetika" /><span className="name">Kosmetika</span></Link>
            <Link className="cat" href="/marketplace?q=Masáže"><img src="/kategorie/masaze.jpg" alt="Masáže" /><span className="name">Masáže</span></Link>
            <Link className="cat" href="/marketplace?q=Instalatér"><img src="/kategorie/instalater.jpg" alt="Instalatér" /><span className="name">Instalatér</span></Link>
            <Link className="cat" href="/marketplace?q=Elektrikář"><img src="/kategorie/elektrikar.jpg" alt="Elektrikář" /><span className="name">Elektrikář</span></Link>
            <Link className="cat" href="/marketplace?q=Úklid"><img src="/kategorie/uklid.jpg" alt="Úklid" /><span className="name">Úklid</span></Link>
            <Link className="cat" href="/marketplace?q=Rekonstrukce"><img src="/kategorie/rekonstrukce.jpg" alt="Rekonstrukce" /><span className="name">Rekonstrukce</span></Link>
            <Link className="cat" href="/marketplace?q=Zahrada"><img src="/kategorie/zahrada.jpg" alt="Zahrada" /><span className="name">Zahrada</span></Link>
          </div>
        </section>

        {/* JAK TO FUNGUJE */}
        <div className="how-wrap" id="jak">
          <section className="home-section">
            <div className="sec-head reveal">
              <span className="eyebrow">Jak to funguje</span>
              <h2>Tři kroky. Žádné telefonování.</h2>
              <p>Každý krok má svou barvu — vy, Propojo a řemeslník. Jako v našem logu.</p>
            </div>
            <div className="steps reveal">
              <div className="thread"></div>
              <div className="step s-green">
                <div className="step-dot">🔎</div>
                <div className="who">Vy</div>
                <h3>Najdete a porovnáte</h3>
                <p>Hledáte podle služby a města. Porovnáte ceny, recenze a volné termíny ověřených živnostníků.</p>
              </div>
              <div className="step s-blue">
                <div className="step-dot">📅</div>
                <div className="who">Propojo</div>
                <h3>Rezervujete se zálohou</h3>
                <p>Kliknete na volný termín a zaplatíte zálohu. Držíme ji v bezpečí my — a celá se počítá do ceny.</p>
              </div>
              <div className="step s-orange">
                <div className="step-dot">🤝</div>
                <div className="who">Řemeslník</div>
                <h3>Přijde a hotovo</h3>
                <p>Dorazí podle domluvy. Kdyby ne, vrátíme vám zálohu do poslední koruny. Bez dohadování.</p>
              </div>
            </div>
          </section>
        </div>

        {/* ŽIVNOSTNÍCI */}
        <section className="home-section">
          <div className="sec-head reveal">
            <span className="eyebrow">Startujeme na Valašsku</span>
            <h2>Ověření živnostníci z vašeho okolí</h2>
            <p>Vsetínsko a Zlínsko jako první. Každý profil má IČO ověřené v ARES.</p>
          </div>
          <div className="pcards reveal">
            <Link className="pcard c1" href="/marketplace">
              <div className="pcard-photo">✂️</div>
              <div className="pcard-body">
                <div className="pcard-top"><div className="p-avatar">L</div><div><div className="pcard-name">Lucie Kovářová</div><div className="pcard-obor">💇 Kadeřnictví</div></div></div>
                <div className="pcard-meta"><span>★ 4,9 (27)</span><span>📍 Vsetín</span><span className="verified">✓ Ověřeno</span></div>
                <div className="pcard-bottom"><div className="pcard-price">od 350 Kč<small>dámský střih</small></div><span className="pcard-go">Zobrazit</span></div>
              </div>
            </Link>
            <Link className="pcard c2" href="/marketplace">
              <div className="pcard-photo">🔧</div>
              <div className="pcard-body">
                <div className="pcard-top"><div className="p-avatar" style={{ background: "var(--blue-soft)", color: "var(--blue-dark)" }}>P</div><div><div className="pcard-name">Petr Hruška</div><div className="pcard-obor" style={{ color: "var(--blue-dark)" }}>🔧 Instalatér</div></div></div>
                <div className="pcard-meta"><span>★ 5,0 (14)</span><span>📍 Rožnov p. R.</span><span className="verified">✓ Ověřeno</span></div>
                <div className="pcard-bottom"><div className="pcard-price">Nacenění zdarma<small>výjezd do 20 km</small></div><span className="pcard-go">Zobrazit</span></div>
              </div>
            </Link>
            <Link className="pcard c3" href="/marketplace">
              <div className="pcard-photo">⚡</div>
              <div className="pcard-body">
                <div className="pcard-top"><div className="p-avatar" style={{ background: "var(--orange-soft)", color: "var(--orange-dark)" }}>M</div><div><div className="pcard-name">Marek Tichý</div><div className="pcard-obor" style={{ color: "var(--orange-dark)" }}>⚡ Elektrikář</div></div></div>
                <div className="pcard-meta"><span>★ 4,8 (31)</span><span>📍 Valašské Meziříčí</span><span className="verified">✓ Ověřeno</span></div>
                <div className="pcard-bottom"><div className="pcard-price">od 550 Kč<small>za hodinu</small></div><span className="pcard-go">Zobrazit</span></div>
              </div>
            </Link>
          </div>
          <div className="pcards-cta"><Link href="/marketplace">Prohlédnout všechny nabídky →</Link></div>
        </section>

        {/* PROČ */}
        <section className="home-section" style={{ paddingTop: 0 }}>
          <div className="sec-head reveal">
            <span className="eyebrow">Proč Propojo?</span>
            <h2>Postavené na jistotě</h2>
            <p>Tři věci, které jinde nenajdete pohromadě.</p>
          </div>
          <div className="why reveal">
            <div className="why-card c1"><div className="icon">🛡️</div><h3>Ověřené IČO přes ARES</h3><p>Žádné falešné profily. Každého živnostníka ověřujeme v oficiálním rejstříku, než se u nás objeví.</p></div>
            <div className="why-card c2"><div className="icon">💳</div><h3>Záloha jako jistota</h3><p>Zaplatíte zálohu kterou drží Propojo, ne řemeslník. Když nedorazí, vrátí se vám celá. Když dorazí, počítá se do celkové ceny.</p></div>
            <div className="why-card c3"><div className="icon">📅</div><h3>Termín bez telefonování</h3><p>Vidíte volné termíny v kalendáři. Kliknete — a termín je váš. Žádné „zavolám vám zpátky".</p></div>
          </div>
        </section>

        {/* RECENZE */}
        <div className="quotes-wrap">
          <section className="home-section">
            <div className="sec-head reveal"><span className="eyebrow">Recenze</span><h2>Co říkají sousedi</h2></div>
            <div className="quotes reveal">
              <div className="quote">
                <div className="stars">★★★★★</div>
                <p>„Konečně jsem nemusela nikam volat. Vybrala jsem termín, zaplatila zálohu a kadeřnice dorazila přesně na čas."</p>
                <div className="who"><div className="p-avatar">J</div> Jana N. · Vsetín</div>
              </div>
              <div className="quote">
                <div className="stars">★★★★★</div>
                <p>„Instalatér přijel druhý den, nacenil na místě a hned se domluvil zbytek. Žádné čekání na pět nabídek."</p>
                <div className="who"><div className="p-avatar" style={{ background: "var(--blue-soft)", color: "var(--blue-dark)" }}>T</div> Tomáš K. · Zubří</div>
              </div>
            </div>
          </section>
        </div>

        {/* CTA ŽIVNOSTNÍK */}
        <section className="home-section">
          <div className="pro-cta reveal">
            <span className="eyebrow">Pro živnostníky</span>
            <h2>Zákázky bez provizí pro Propojo</h2>
            <p>Z vaší práce vám nebereme ani korunu. Platíte jen předplatné — a kalendář vám plníme my.</p>
            <Link className="btn" href="/registrace">Začít zdarma →</Link>
            <span className="note">První měsíc zdarma · zrušíte kdykoli · 299 Kč/měsíc</span>
          </div>
        </section>

        {/* FAQ */}
        <section className="home-section" style={{ paddingTop: 0 }}>
          <div className="sec-head reveal"><span className="eyebrow">Časté otázky</span><h2>Ještě váháte?</h2></div>
          <div className="faq reveal">
            <details open>
              <summary>Co když řemeslník nedorazí?</summary>
              <p>Vrátíme vám celou zálohu. Bez dohadování a bez formulářů — záloha je u nás, ne u řemeslníka, takže ji máte zpátky hned.</p>
            </details>
            <details>
              <summary>Kolik mě to stojí?</summary>
              <p>Nic navíc. Platíte cenu řemeslníka — žádné přirážky, žádné poplatky. Propojo vydělává na předplatném živnostníků, ne na vás.</p>
            </details>
            <details>
              <summary>Jak funguje záloha?</summary>
              <p>Při rezervaci zaplatíte zálohu (třeba 200 Kč), kterou bezpečně držíme my. Po dokončení práce se záloha započítá do konečné ceny — nic neplatíte dvakrát.</p>
            </details>
            <details>
              <summary>Musím se registrovat?</summary>
              <p>Prohlížet můžete bez registrace. Účet potřebujete až na rezervaci termínu — zabere půl minuty.</p>
            </details>
          </div>
        </section>
      </div>
    </>
  );
}