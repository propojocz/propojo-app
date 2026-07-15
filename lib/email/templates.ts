// lib/email/templates.ts
// HTML šablony e-mailů – BEZ 'use server'
//
// PRAVIDLA (proč to vypadá „nudně"):
//  • Transakční e-mail není leták. Střízlivý, čitelný, bez marketingu.
//  • Žádné CSS gradienty — Outlook je nezobrazí a zůstane bílé prázdno.
//  • Jednosloupcová tabulka, max 600 px, VŠE inline (Gmail zahazuje <style>).
//  • Nic netvrdit, co není pravda. E-mail je důkaz.
//
// PRÁVNÍ MINIMUM u objednávek:
//  • Plná identita živnostníka (ověřené jméno + IČO), ne jen marketingový název.
//  • Věta, že smlouva vzniká mezi zákazníkem a živnostníkem, ne s Propojem.
//  • Kam se obrátit: reklamace práce → živnostník, spor o zálohu → Propojo.

const C = {
  emerald: '#10b981',
  emeraldDark: '#059669',
  emeraldDeep: '#047857',
  emeraldSoft: '#ecfdf5',
  emeraldBorder: '#a7f3d0',
  ink: '#0f172a',
  slate: '#475569',
  muted: '#64748b',
  light: '#94a3b8',
  border: '#e2e8f0',
  bg: '#f8fafc',
  amber: '#b45309',
  amberSoft: '#fffbeb',
  amberBorder: '#fde68a',
  red: '#b91c1c',
  redSoft: '#fef2f2',
  redBorder: '#fecaca',
  blue: '#1d4ed8',
  blueSoft: '#eff6ff',
  blueBorder: '#bfdbfe',
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

// ── Obal ────────────────────────────────────────────────────
export function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Propojo</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- Hlavička: plná barva, ne gradient (Outlook gradienty neumí) -->
        <tr><td style="background:${C.emeraldDeep};border-radius:14px 14px 0 0;padding:22px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Propojo</span>
        </td></tr>

        <!-- Obsah -->
        <tr><td style="background:#ffffff;padding:32px;border:1px solid ${C.border};border-top:none;border-radius:0 0 14px 14px;">
          ${content}
        </td></tr>

        <!-- Patička -->
        <tr><td style="padding:20px 32px;text-align:center;">
          <p style="margin:0;color:${C.light};font-size:12px;line-height:1.6;">
            © ${new Date().getFullYear()} Propojo ·
            <a href="${APP_URL}" style="color:${C.emeraldDark};text-decoration:none;">propojo.cz</a><br>
            Propojo je online tržiště, které zprostředkovává kontakt mezi zákazníky a živnostníky.
          </p>
          <p style="margin:8px 0 0;color:${C.light};font-size:11px;">
            Automatická zpráva — na tento e-mail prosím neodpovídejte.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Stavební kameny ─────────────────────────────────────────

function heading(title: string, sub?: string): string {
  return `
    <h2 style="margin:0 0 ${sub ? '6px' : '20px'};color:${C.ink};font-size:21px;font-weight:700;line-height:1.3;">${title}</h2>
    ${sub ? `<p style="margin:0 0 22px;color:${C.muted};font-size:15px;line-height:1.6;">${sub}</p>` : ''}`
}

/** Šedý box s řádky „popisek → hodnota". Prázdné hodnoty se vynechají. */
function detailBox(rows: Array<[string, string | null | undefined]>): string {
  const visible = rows.filter(([, v]) => v != null && v !== '')
  if (visible.length === 0) return ''
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:10px;padding:16px 18px;margin:0 0 20px;">
      ${visible.map(([k, v]) => `
      <tr>
        <td style="padding:5px 0;color:${C.muted};font-size:13px;">${k}</td>
        <td style="padding:5px 0;color:${C.ink};font-size:14px;font-weight:600;text-align:right;">${v}</td>
      </tr>`).join('')}
    </table>`
}

function button(label: string, url: string, color: string = C.emerald): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0;">
      <tr><td style="background:${color};border-radius:10px;">
        <a href="${url}" style="display:inline-block;padding:13px 30px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${label}</a>
      </td></tr>
    </table>`
}

function noteBox(text: string, tone: 'info' | 'warn' | 'danger' = 'info'): string {
  const map = {
    info: { bg: C.blueSoft, border: C.blueBorder, color: C.blue },
    warn: { bg: C.amberSoft, border: C.amberBorder, color: C.amber },
    danger: { bg: C.redSoft, border: C.redBorder, color: C.red },
  }[tone]
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${map.bg};border:1px solid ${map.border};border-radius:10px;padding:14px 16px;margin:0 0 20px;">
      <tr><td style="color:${map.color};font-size:13px;line-height:1.6;">${text}</td></tr>
    </table>`
}

/**
 * IDENTITA ŽIVNOSTNÍKA — jádro celé věci.
 * Na kartě smí být „Salon Bella", protože zákazník jen kouká.
 * V e-mailu drží v ruce závazek, takže musí vědět, S KÝM ho má.
 */
export function providerIdentityBlock(p: {
  displayName: string
  legalName?: string | null
  ico?: string | null
  phone?: string | null
  email?: string | null
}): string {
  const showLegal = p.legalName && p.legalName !== p.displayName
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.emeraldSoft};border:1px solid ${C.emeraldBorder};border-radius:10px;padding:16px 18px;margin:0 0 20px;">
      <tr><td>
        <p style="margin:0 0 8px;color:${C.emeraldDeep};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Živnostník</p>
        <p style="margin:0;color:${C.ink};font-size:16px;font-weight:700;">${p.displayName}</p>
        ${showLegal ? `<p style="margin:2px 0 0;color:${C.slate};font-size:13px;">${p.legalName}</p>` : ''}
        ${p.ico ? `<p style="margin:2px 0 0;color:${C.slate};font-size:13px;">IČO ${p.ico}</p>` : ''}
        ${p.phone ? `<p style="margin:6px 0 0;color:${C.slate};font-size:13px;">tel. ${p.phone}</p>` : ''}
        ${p.email ? `<p style="margin:2px 0 0;color:${C.slate};font-size:13px;">${p.email}</p>` : ''}
      </td></tr>
    </table>`
}

/** Věta o roli Propojo. Patří do každého e-mailu, kde vzniká nebo běží závazek. */
export function intermediaryNote(): string {
  return `
    <p style="margin:20px 0 0;padding:14px 0 0;border-top:1px solid ${C.border};color:${C.light};font-size:12px;line-height:1.65;">
      Smlouva o provedení práce vzniká přímo mezi vámi a živnostníkem.
      Propojo pouze zprostředkovává kontakt a spravuje rezervační zálohu —
      za provedení ani kvalitu práce neodpovídá.<br>
      Reklamaci práce řešte přímo s živnostníkem. Spor o zálohu můžete nahlásit na
      <a href="mailto:admin@propojo.cz" style="color:${C.emeraldDark};">admin@propojo.cz</a>.
    </p>`
}

// ════════════════════════════════════════════════════════════
//  OBJEDNÁVKY
// ════════════════════════════════════════════════════════════

// ── 1) Nová objednávka → ŽIVNOSTNÍKOVI ──────────────────────
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
    subject: `Nová objednávka: ${data.serviceTitle}`,
    html: emailWrapper(`
      ${heading('Máte novou objednávku', `Zákazník <strong>${data.clientName}</strong> si u vás objednal službu. Potvrďte ji, nebo odmítněte.`)}

      ${detailBox([
        ['Služba', data.serviceTitle],
        ['Zákazník', data.clientName],
        ['Cena', data.price > 0 ? `${data.price.toLocaleString('cs-CZ')} Kč/${data.priceUnit}` : 'Dohodou'],
        ['Místo', data.city],
      ])}

      ${data.message ? noteBox(
        `<strong style="display:block;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;">Zpráva od zákazníka</strong>${data.message}`,
        'info'
      ) : ''}

      ${button('Zobrazit objednávku', data.orderUrl)}

      <p style="margin:20px 0 0;color:${C.light};font-size:12px;text-align:center;line-height:1.6;">
        Zákazníci oceňují rychlou odpověď — čím dřív objednávku potvrdíte, tím spíš u vás zůstanou.
      </p>
    `),
  }
}

// ── 2) Objednávka odeslána → ZÁKAZNÍKOVI (potvrzení odeslání) ──
export function orderPlacedEmail(data: {
  clientName: string
  serviceTitle: string
  providerDisplayName: string
  providerLegalName?: string | null
  providerIco?: string | null
  priceText?: string
  city?: string
  orderUrl: string
  isModelB?: boolean
}): { subject: string; html: string } {
  return {
    subject: `Objednávka odeslána: ${data.serviceTitle}`,
    html: emailWrapper(`
      ${heading(
        'Objednávka je odeslaná',
        data.isModelB
          ? 'Živnostník se vám ozve a domluvíte se na termínu prohlídky. Zatím nic neplatíte.'
          : 'Živnostník ji teď potvrdí a ozve se vám. Zatím nic neplatíte.'
      )}

      ${detailBox([
        ['Služba', data.serviceTitle],
        ['Cena', data.priceText],
        ['Místo', data.city],
      ])}

      ${providerIdentityBlock({
        displayName: data.providerDisplayName,
        legalName: data.providerLegalName,
        ico: data.providerIco,
      })}

      ${button('Sledovat objednávku', data.orderUrl)}
      ${intermediaryNote()}
    `),
  }
}

// ── 3) Změna stavu objednávky → ZÁKAZNÍKOVI ─────────────────
//
// Stav 'prijato' je z celé aplikace PRÁVNĚ NEJDŮLEŽITĚJŠÍ e-mail — je to doklad
// o tom, že závazek vznikl, a s kým. Proto tam patří plná identita živnostníka.
// Parametry navíc jsou volitelné, aby nespadly stávající volání; u 'prijato' je
// ale doplňte, jinak zákazník nemá jak zjistit, s kým smlouvu uzavřel.
export function orderStatusEmail(data: {
  clientName: string
  serviceTitle: string
  providerName: string
  status: string
  orderUrl: string
  // ── volitelné, ale u 'prijato' prosím doplnit ──
  providerLegalName?: string | null
  providerIco?: string | null
  providerPhone?: string | null
  priceText?: string
  depositText?: string
  scheduledAt?: string
  city?: string
  cancellationText?: string
  cancelReason?: string
}): { subject: string; html: string } {
  const info: Record<string, { title: string; desc: string; color: string }> = {
    prijato: {
      title: 'Objednávka potvrzena',
      desc: 'Živnostník vaši objednávku přijal. Níže najdete, s kým jste ji uzavřeli.',
      color: C.emerald,
    },
    v_procesu: {
      title: 'Práce byla zahájena',
      desc: 'Živnostník začal pracovat na vaší objednávce.',
      color: C.emerald,
    },
    ceka_potvrzeni: {
      title: 'Potvrďte dokončení práce',
      desc: 'Živnostník označil práci za hotovou. Potvrďte prosím, že je vše v pořádku.',
      color: C.emerald,
    },
    dokonceno: {
      title: 'Objednávka je dokončená',
      desc: 'Práce byla dokončena. Budeme rádi, když živnostníka ohodnotíte — pomůžete tím ostatním.',
      color: C.emerald,
    },
    zruseno: {
      title: 'Objednávka byla zrušena',
      desc: 'Tato objednávka byla zrušena.',
      color: C.red,
    },
    spor: {
      title: 'Objednávka je ve sporu',
      desc: 'U této objednávky evidujeme spor. Ozveme se vám a pomůžeme ho vyřešit.',
      color: C.amber,
    },
  }

  const i = info[data.status] ?? {
    title: 'Aktualizace objednávky',
    desc: 'Stav vaší objednávky se změnil.',
    color: C.emerald,
  }

  const showIdentity = data.status === 'prijato'
  const showLegal = data.status === 'prijato' || data.status === 'v_procesu' || data.status === 'ceka_potvrzeni'

  return {
    subject: `${i.title}: ${data.serviceTitle}`,
    html: emailWrapper(`
      ${heading(i.title, i.desc)}

      ${detailBox([
        ['Služba', data.serviceTitle],
        ['Termín', data.scheduledAt],
        ['Místo', data.city],
        ['Cena', data.priceText],
        ['Záloha', data.depositText],
        ...(showIdentity ? [] : [['Živnostník', data.providerName] as [string, string]]),
      ])}

      ${showIdentity ? providerIdentityBlock({
        displayName: data.providerName,
        legalName: data.providerLegalName,
        ico: data.providerIco,
        phone: data.providerPhone,
      }) : ''}

      ${data.status === 'zruseno' && data.cancelReason
        ? noteBox(`<strong>Důvod zrušení:</strong> ${data.cancelReason}`, 'danger')
        : ''}

      ${data.status === 'prijato' && data.cancellationText
        ? noteBox(`<strong>Storno podmínky:</strong> ${data.cancellationText}`, 'warn')
        : ''}

      ${button(
        data.status === 'dokonceno' ? 'Ohodnotit živnostníka' : 'Zobrazit objednávku',
        data.orderUrl,
        i.color
      )}

      ${showLegal ? intermediaryNote() : ''}
    `),
  }
}

// ════════════════════════════════════════════════════════════
//  PLATBY
// ════════════════════════════════════════════════════════════

// ── 4) Záloha zaplacena ─────────────────────────────────────
export function depositPaidEmail(data: {
  recipient: 'customer' | 'provider'
  serviceTitle: string
  amountText: string
  counterpartName: string
  orderUrl: string
  scheduledAt?: string
}): { subject: string; html: string } {
  const isCustomer = data.recipient === 'customer'
  return {
    subject: isCustomer
      ? `Záloha zaplacena: ${data.serviceTitle}`
      : `Zákazník zaplatil zálohu: ${data.serviceTitle}`,
    html: emailWrapper(`
      ${heading(
        isCustomer ? 'Záloha je zaplacená' : 'Zákazník zaplatil zálohu',
        isCustomer
          ? 'Záloha prošla zabezpečenou platební bránou. Živnostníkovi se uvolní až po provedení práce — a když nedorazí, vrátíme vám ji celou.'
          : 'Termín je tím potvrzený. Záloha se vám uvolní po provedení práce.'
      )}

      ${detailBox([
        ['Služba', data.serviceTitle],
        [isCustomer ? 'Živnostník' : 'Zákazník', data.counterpartName],
        ['Záloha', data.amountText],
        ['Termín', data.scheduledAt],
      ])}

      ${isCustomer ? noteBox('Záloha se započítá do konečné ceny — nic neplatíte dvakrát.', 'info') : ''}

      ${button('Zobrazit objednávku', data.orderUrl)}
      ${isCustomer ? intermediaryNote() : ''}
    `),
  }
}

// ── 5) Záloha vrácena → ZÁKAZNÍKOVI ─────────────────────────
export function depositRefundedEmail(data: {
  serviceTitle: string
  amountText: string
  reason?: string
  orderUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Záloha vrácena: ${data.serviceTitle}`,
    html: emailWrapper(`
      ${heading('Záloha se vám vrací', 'Vrácení jsme zadali do platební brány. Na účtu se obvykle objeví do několika pracovních dnů — podle vaší banky.')}

      ${detailBox([
        ['Služba', data.serviceTitle],
        ['Vrácená částka', data.amountText],
        ['Důvod', data.reason],
      ])}

      ${button('Zobrazit objednávku', data.orderUrl)}
    `),
  }
}

// ════════════════════════════════════════════════════════════
//  RECENZE
// ════════════════════════════════════════════════════════════

// ── 6) Výzva k hodnocení → ZÁKAZNÍKOVI ──────────────────────
//
// Omnibus: recenze musí pocházet od zákazníků, kteří službu SKUTEČNĚ objednali.
// Proto tenhle e-mail chodí až po dokončené objednávce a míří na konkrétní zakázku.
export function reviewRequestEmail(data: {
  clientName: string
  serviceTitle: string
  providerDisplayName: string
  reviewUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Jak to dopadlo? ${data.serviceTitle}`,
    html: emailWrapper(`
      ${heading(
        'Jak jste byli spokojení?',
        `Práce od <strong>${data.providerDisplayName}</strong> je hotová. Krátké hodnocení zabere minutu a hodně pomůže lidem, kteří vybírají po vás.`
      )}

      ${detailBox([
        ['Služba', data.serviceTitle],
        ['Živnostník', data.providerDisplayName],
      ])}

      ${button('Ohodnotit', data.reviewUrl)}

      <p style="margin:20px 0 0;color:${C.light};font-size:12px;text-align:center;line-height:1.6;">
        Hodnotit může jen zákazník s dokončenou objednávkou — proto jsou recenze na Propojo důvěryhodné.
      </p>
    `),
  }
}

// ── 7) Nová recenze → ŽIVNOSTNÍKOVI ─────────────────────────
export function newReviewEmail(data: {
  providerName: string
  clientName: string
  serviceTitle: string
  rating: number
  comment?: string
  reviewUrl: string
}): { subject: string; html: string } {
  const stars = '★'.repeat(Math.round(data.rating)) + '☆'.repeat(5 - Math.round(data.rating))
  const isLow = data.rating <= 3
  return {
    subject: `Nová recenze (${data.rating}/5): ${data.serviceTitle}`,
    html: emailWrapper(`
      ${heading(
        'Máte novou recenzi',
        `Zákazník <strong>${data.clientName}</strong> ohodnotil vaši práci.`
      )}

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:10px;padding:18px;margin:0 0 20px;">
        <tr><td>
          <p style="margin:0;color:#f59e0b;font-size:20px;letter-spacing:2px;">${stars}</p>
          <p style="margin:4px 0 0;color:${C.muted};font-size:13px;">${data.rating} z 5 · ${data.serviceTitle}</p>
          ${data.comment ? `<p style="margin:12px 0 0;padding-top:12px;border-top:1px solid ${C.border};color:${C.ink};font-size:14px;line-height:1.6;">„${data.comment}"</p>` : ''}
        </td></tr>
      </table>

      ${isLow ? noteBox(
        'Na recenzi můžete veřejně odpovědět. Věcná, klidná odpověď působí na další zákazníky často líp než recenze samotná.',
        'warn'
      ) : ''}

      ${button('Odpovědět na recenzi', data.reviewUrl)}
    `),
  }
}

// ════════════════════════════════════════════════════════════
//  POPTÁVKY (veřejná nástěnka)
// ════════════════════════════════════════════════════════════

// ── 8) Nová poptávka → PŘEDPLATITELŮM ───────────────────────
//
// POZOR NA GDPR: v e-mailu NEPOSÍLÁME kontakt na zákazníka. Jen upozorníme,
// že poptávka existuje. Kontakt se odemyká až na webu, přihlášenému
// předplatiteli. Kdyby chodil e-mailem, dal by se přeposlat komukoli.
export function newLeadEmail(data: {
  providerName: string
  category?: string | null
  city: string
  description: string
  leadsUrl: string
}): { subject: string; html: string } {
  const short = data.description.length > 180
    ? data.description.slice(0, 180) + '…'
    : data.description

  return {
    subject: `Nová poptávka ve vašem okolí: ${data.city}`,
    html: emailWrapper(`
      ${heading('Někdo shání řemeslníka', 'Na nástěnce poptávek přibyla nová. Kontakt na zákazníka najdete po přihlášení.')}

      ${detailBox([
        ['Obor', data.category],
        ['Místo', data.city],
      ])}

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:10px;padding:16px 18px;margin:0 0 20px;">
        <tr><td style="color:${C.ink};font-size:14px;line-height:1.65;">${short}</td></tr>
      </table>

      ${button('Zobrazit poptávku', data.leadsUrl)}

      <p style="margin:20px 0 0;color:${C.light};font-size:12px;text-align:center;line-height:1.6;">
        Kontakt na zákazníka z bezpečnostních důvodů neposíláme e-mailem — najdete ho po přihlášení na Propojo.
      </p>
    `),
  }
}

// ════════════════════════════════════════════════════════════
//  PŘEDPLATNÉ
// ════════════════════════════════════════════════════════════

// ── 9) Předplatné aktivováno ────────────────────────────────
export function subscriptionStartedEmail(data: {
  providerName: string
  isTrial: boolean
  trialEndsAt?: string
  priceText: string
  dashboardUrl: string
}): { subject: string; html: string } {
  return {
    subject: data.isTrial ? 'První měsíc na Propojo máte zdarma' : 'Předplatné Propojo je aktivní',
    html: emailWrapper(`
      ${heading(
        data.isTrial ? 'První měsíc máte zdarma' : 'Předplatné je aktivní',
        data.isTrial
          ? `Vaše nabídky jsou vidět zákazníkům. Zdarma to máte do <strong>${data.trialEndsAt}</strong>, pak se strhne ${data.priceText}. Zrušit můžete kdykoli.`
          : 'Vaše nabídky jsou vidět zákazníkům.'
      )}

      ${detailBox([
        ['Předplatné', data.priceText],
        ['Provize ze zakázek', '0 Kč'],
        [data.isTrial ? 'Zdarma do' : 'Další platba', data.trialEndsAt],
      ])}

      ${noteBox('Předplatné zrušíte kdykoli jedním kliknutím v sekci Předplatné. Žádná výpovědní lhůta.', 'info')}

      ${button('Přejít do přehledu', data.dashboardUrl)}
    `),
  }
}

// ── 10) Končí měsíc zdarma ──────────────────────────────────
export function trialEndingEmail(data: {
  providerName: string
  endsAt: string
  priceText: string
  subscriptionUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Měsíc zdarma končí ${data.endsAt}`,
    html: emailWrapper(`
      ${heading(
        'Za pár dní končí měsíc zdarma',
        `Od <strong>${data.endsAt}</strong> se začne strhávat ${data.priceText}. Nemusíte nic dělat — pokud pokračovat nechcete, stačí předplatné zrušit.`
      )}

      ${detailBox([
        ['Zdarma do', data.endsAt],
        ['Poté', data.priceText],
        ['Provize ze zakázek', '0 Kč'],
      ])}

      ${noteBox('Když předplatné zrušíte, vaše nabídky se přestanou zobrazovat zákazníkům. Účet i data vám zůstanou.', 'warn')}

      ${button('Spravovat předplatné', data.subscriptionUrl)}
    `),
  }
}

// ── 11) Platba selhala ──────────────────────────────────────
export function paymentFailedEmail(data: {
  providerName: string
  priceText: string
  retryDate?: string
  subscriptionUrl: string
}): { subject: string; html: string } {
  return {
    subject: 'Platbu předplatného se nepodařilo strhnout',
    html: emailWrapper(`
      ${heading(
        'Platba neprošla',
        `Nepodařilo se nám strhnout ${data.priceText}. Bývá to kartou — expirací nebo limitem.`
      )}

      ${noteBox(
        `<strong>Co se stane, když to nespravíte:</strong> vaše nabídky se přestanou zobrazovat zákazníkům.${data.retryDate ? ` Platbu zkusíme znovu <strong>${data.retryDate}</strong>.` : ''}`,
        'danger'
      )}

      ${button('Aktualizovat platební kartu', data.subscriptionUrl, C.red)}
    `),
  }
}

// ── 12) Předplatné zrušeno ──────────────────────────────────
export function subscriptionCanceledEmail(data: {
  providerName: string
  activeUntil: string
  subscriptionUrl: string
}): { subject: string; html: string } {
  return {
    subject: 'Předplatné Propojo bylo zrušeno',
    html: emailWrapper(`
      ${heading(
        'Předplatné je zrušené',
        `Zbytek zaplaceného období vám zůstává — nabídky se zobrazují do <strong>${data.activeUntil}</strong>. Pak se skryjí.`
      )}

      ${detailBox([
        ['Nabídky viditelné do', data.activeUntil],
        ['Účet a data', 'Zůstávají zachovány'],
      ])}

      ${noteBox('Kdykoli se můžete vrátit — stačí předplatné znovu zapnout a vaše nabídky se objeví tam, kde byly.', 'info')}

      ${button('Obnovit předplatné', data.subscriptionUrl)}
    `),
  }
}

// ════════════════════════════════════════════════════════════
//  ÚČET
// ════════════════════════════════════════════════════════════

// ── 13) Vítací e-mail ───────────────────────────────────────
//
// POZOR: dřív tu stálo „Vše zdarma, bez skrytých poplatků." To byla nepravda —
// po prvním měsíci se platí 299 Kč. Nepravdivé tvrzení v e-mailu je nekalá
// obchodní praktika a hlavně naštve řemeslníka, který tomu uvěřil.
export function welcomeEmail(data: {
  name: string
  isProvider: boolean
  loginUrl: string
}): { subject: string; html: string } {
  const first = data.name.split(' ')[0]

  return {
    subject: `Vítejte na Propojo, ${first}`,
    html: emailWrapper(
      data.isProvider
        ? `
      ${heading('Vítejte na Propojo', `Dobrý den, ${first}. Váš účet je připravený a IČO ověřené v registru ARES.`)}

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:10px;padding:18px;margin:0 0 20px;">
        <tr><td>
          <p style="margin:0 0 10px;color:${C.ink};font-size:14px;font-weight:700;">Co vás čeká</p>
          <p style="margin:0 0 6px;color:${C.slate};font-size:14px;line-height:1.6;">1. Přidejte nabídku — konkrétní služby se hledají líp než obecné.</p>
          <p style="margin:0 0 6px;color:${C.slate};font-size:14px;line-height:1.6;">2. Napojte výplaty přes Stripe — bez toho se vaše nabídky nezveřejní.</p>
          <p style="margin:0;color:${C.slate};font-size:14px;line-height:1.6;">3. Zákazníci vás najdou a objednají si termín sami.</p>
        </td></tr>
      </table>

      ${detailBox([
        ['První měsíc', 'Zdarma'],
        ['Poté', '299 Kč / měsíc'],
        ['Provize ze zakázek', '0 Kč'],
        ['Zrušení', 'Kdykoli, bez výpovědní lhůty'],
      ])}

      ${button('Přidat první nabídku', data.loginUrl)}
      `
        : `
      ${heading('Vítejte na Propojo', `Dobrý den, ${first}. Váš účet je připravený.`)}

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:10px;padding:18px;margin:0 0 20px;">
        <tr><td>
          <p style="margin:0 0 10px;color:${C.ink};font-size:14px;font-weight:700;">Jak to funguje</p>
          <p style="margin:0 0 6px;color:${C.slate};font-size:14px;line-height:1.6;">1. Najdete živnostníka podle oboru a města — každý má ověřené IČO.</p>
          <p style="margin:0 0 6px;color:${C.slate};font-size:14px;line-height:1.6;">2. Objednáte si termín. Žádné obvolávání.</p>
          <p style="margin:0;color:${C.slate};font-size:14px;line-height:1.6;">3. Zaplatíte zálohu — když živnostník nedorazí, vrátí se vám celá.</p>
        </td></tr>
      </table>

      ${noteBox('Za používání Propojo neplatíte nic navíc. Platíte cenu živnostníka, žádné přirážky.', 'info')}

      ${button('Prohlédnout nabídky', data.loginUrl)}
      `
    ),
  }
}