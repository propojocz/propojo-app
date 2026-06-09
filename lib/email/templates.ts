// lib/email/templates.ts
// HTML šablony emailů – BEZ 'use server'

export function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Propojo</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#312e81,#4f46e5);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:white;font-size:28px;font-weight:900;letter-spacing:-0.5px;">Propojo</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Marketplace pro živnostníky</p>
        </td></tr>

        <!-- Content -->
        <tr><td style="background:white;padding:40px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:none;">
          ${content}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">
            © ${new Date().getFullYear()} Propojo · 
            <a href="https://propojo.cz" style="color:#6366f1;text-decoration:none;">propojo.cz</a>
          </p>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:11px;">Tento email byl odeslán automaticky, prosím neodpovídejte na něj.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Nová objednávka – pro živnostníka ────────────────────────
export function newOrderEmail(data: {
  providerName: string
  clientName: string
  serviceTitle: string
  message?: string
  price: number
  priceUnit: string
  city: string
  orderUrl: string
}): { subject: string; html: string } {
  return {
    subject: `📬 Nová poptávka: ${data.serviceTitle}`,
    html: emailWrapper(`
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:900;">Máte novou poptávku!</h2>
      <p style="margin:0 0 24px;color:#64748b;font-size:15px;">Zákazník <strong>${data.clientName}</strong> má zájem o vaši službu.</p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;">Služba</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">${data.serviceTitle}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;">Zákazník</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${data.clientName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;">Cena</td>
            <td style="padding:6px 0;color:#4f46e5;font-size:14px;font-weight:700;text-align:right;">${data.price.toLocaleString('cs-CZ')} Kč/${data.priceUnit}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;">Město</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;text-align:right;">${data.city}</td>
          </tr>
        </table>
      </div>

      ${data.message ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 4px;color:#1e40af;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Zpráva od zákazníka</p>
        <p style="margin:0;color:#1e3a8a;font-size:14px;">${data.message}</p>
      </div>` : ''}

      <div style="text-align:center;margin-top:32px;">
        <a href="${data.orderUrl}" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;">
          Zobrazit objednávku →
        </a>
      </div>

      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;text-align:center;">
        Odpovězte zákazníkovi do 24 hodin, jinak se snižuje vaše hodnocení.
      </p>
    `),
  }
}

// ── Změna statusu – pro zákazníka ────────────────────────────
export function orderStatusEmail(data: {
  clientName: string
  serviceTitle: string
  providerName: string
  status: string
  orderUrl: string
}): { subject: string; html: string } {
  const statusInfo: Record<string, { emoji: string; title: string; desc: string; color: string }> = {
    prijato: { emoji: '✅', title: 'Objednávka přijata', desc: 'Živnostník přijal vaši poptávku a brzy vás zkontaktuje.', color: '#059669' },
    v_procesu: { emoji: '🔧', title: 'Práce zahájena', desc: 'Živnostník zahájil práci na vaší objednávce.', color: '#2563eb' },
    dokonceno: { emoji: '🎉', title: 'Hotovo!', desc: 'Vaše objednávka byla úspěšně dokončena. Nezapomeňte ohodnotit živnostníka.', color: '#7c3aed' },
    zruseno: { emoji: '❌', title: 'Objednávka zrušena', desc: 'Vaše objednávka byla zrušena.', color: '#dc2626' },
  }

  const info = statusInfo[data.status] ?? { emoji: '📋', title: 'Aktualizace objednávky', desc: 'Stav vaší objednávky byl aktualizován.', color: '#4f46e5' }

  return {
    subject: `${info.emoji} ${info.title}: ${data.serviceTitle}`,
    html: emailWrapper(`
      <div style="text-align:center;margin-bottom:28px;">
        <div style="font-size:48px;margin-bottom:12px;">${info.emoji}</div>
        <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:900;">${info.title}</h2>
        <p style="margin:0;color:#64748b;font-size:15px;">${info.desc}</p>
      </div>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;">Služba</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">${data.serviceTitle}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;">Živnostník</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;text-align:right;">${data.providerName}</td>
          </tr>
        </table>
      </div>

      <div style="text-align:center;">
        <a href="${data.orderUrl}" style="display:inline-block;background:${info.color};color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;">
          Zobrazit objednávku →
        </a>
      </div>
    `),
  }
}

// ── Vítací email po registraci ───────────────────────────────
export function welcomeEmail(data: {
  name: string
  isProvider: boolean
  loginUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Vítejte na Propojo, ${data.name.split(' ')[0]}! 🎉`,
    html: emailWrapper(`
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:900;">Vítejte na Propojo!</h2>
      <p style="margin:0 0 24px;color:#64748b;font-size:15px;">
        Ahoj <strong>${data.name.split(' ')[0]}</strong>, váš účet byl úspěšně vytvořen.
        ${data.isProvider ? 'Jste zaregistrováni jako živnostník a můžete začít nabízet své služby.' : 'Můžete začít hledat živnostníky ve vašem okolí.'}
      </p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin-bottom:24px;">
        ${data.isProvider ? `
        <p style="margin:0 0 12px;color:#1e40af;font-size:14px;font-weight:700;">Jako živnostník můžete:</p>
        <ul style="margin:0;padding-left:20px;color:#1e3a8a;font-size:14px;">
          <li style="margin-bottom:6px;">Přidávat neomezený počet nabídek</li>
          <li style="margin-bottom:6px;">Přijímat objednávky od zákazníků</li>
          <li style="margin-bottom:6px;">Budovat si hodnocení a recenze</li>
          <li>Vše zdarma, bez skrytých poplatků</li>
        </ul>
        ` : `
        <p style="margin:0 0 12px;color:#1e40af;font-size:14px;font-weight:700;">Jako zákazník můžete:</p>
        <ul style="margin:0;padding-left:20px;color:#1e3a8a;font-size:14px;">
          <li style="margin-bottom:6px;">Hledat živnostníky ve vašem okolí</li>
          <li style="margin-bottom:6px;">Porovnávat ceny a hodnocení</li>
          <li>Objednávat služby přímo online</li>
        </ul>
        `}
      </div>

      <div style="text-align:center;">
        <a href="${data.loginUrl}" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;">
          ${data.isProvider ? 'Přidat první nabídku →' : 'Prohlédnout nabídky →'}
        </a>
      </div>
    `),
  }
}
