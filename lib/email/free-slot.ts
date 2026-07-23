// lib/email/free-slot.ts
// Šablona e-mailu „uvolnil se termín" — BEZ 'use server'
//
// Drží se stejných pravidel jako templates.ts: střízlivé, jednosloupcové,
// vše inline, žádné gradienty. Obal (hlavička + patička) bereme z templates.ts,
// ať se branding nerozejde.
//
// POZOR NA TÓN: tohle je jediný e-mail na Propojo, který zákazník NEVYŽÁDAL
// konkrétní akcí — chodí proto, že u poskytovatele byl nebo si ho oblíbil.
// Musí tedy být krátký, věcný a s viditelným odhlášením. Jinak si lidé
// zvyknou Propojo ignorovat a přijdeme o kanál, který nám nikdo nevrátí.

import { emailWrapper } from './templates'

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
}

export type FreeSlotItem = {
  name: string
  priceText: string
  durationText?: string | null
}

export function freeSlotEmail(data: {
  /** Marketingový název poskytovatele („Salon Bella") */
  providerName: string
  /** „pátek 24. července" */
  dayText: string
  /** „16:00–18:00" */
  timeText: string
  city?: string | null
  /** Úkony, které se do okna vejdou — max pár, ať e-mail nebobtná. */
  items: FreeSlotItem[]
  /** Odkaz na veřejnou stránku termínu */
  slotUrl: string
  /** Kde si upozornění vypnout */
  unsubscribeUrl: string
  /** Proč zprávu dostal — ovlivňuje jednu větu v úvodu. */
  reason: 'stali' | 'oblibene' | 'waitlist'
}): { subject: string; html: string } {

  const reasonLine = {
    waitlist: 'Čekali jste na volný termín — a právě se jeden uvolnil.',
    stali: `U ${data.providerName} jste už byli, tak dáváme vědět, že se uvolnil termín.`,
    oblibene: `${data.providerName} máte v oblíbených — uvolnil se u nich termín.`,
  }[data.reason]

  const itemsRows = data.items.slice(0, 5).map((it) => `
      <tr>
        <td style="padding:7px 0;border-top:1px solid ${C.border};color:${C.ink};font-size:14px;">
          ${it.name}${it.durationText ? `<span style="color:${C.light};font-size:12px;"> · ${it.durationText}</span>` : ''}
        </td>
        <td style="padding:7px 0;border-top:1px solid ${C.border};color:${C.ink};font-size:14px;font-weight:600;text-align:right;white-space:nowrap;">
          ${it.priceText}
        </td>
      </tr>`).join('')

  return {
    subject: `Volný termín ${data.dayText} ${data.timeText} — ${data.providerName}`,
    html: emailWrapper(`
      <h2 style="margin:0 0 6px;color:${C.ink};font-size:21px;font-weight:700;line-height:1.3;">
        Uvolnil se termín
      </h2>
      <p style="margin:0 0 22px;color:${C.muted};font-size:15px;line-height:1.6;">
        ${reasonLine}
      </p>

      <!-- Termín: hlavní sdělení, ať je vidět i v náhledu na mobilu -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.emeraldSoft};border:1px solid ${C.emeraldBorder};border-radius:10px;padding:18px;margin:0 0 20px;">
        <tr><td>
          <p style="margin:0;color:${C.emeraldDeep};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Volný termín</p>
          <p style="margin:6px 0 0;color:${C.ink};font-size:20px;font-weight:700;line-height:1.3;">${data.dayText}</p>
          <p style="margin:2px 0 0;color:${C.slate};font-size:16px;font-weight:600;">${data.timeText}</p>
          <p style="margin:8px 0 0;color:${C.slate};font-size:13px;">
            ${data.providerName}${data.city ? ` · ${data.city}` : ''}
          </p>
        </td></tr>
      </table>

      ${data.items.length > 0 ? `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:10px;padding:14px 18px;margin:0 0 20px;">
        <tr><td colspan="2" style="padding:0 0 4px;color:${C.muted};font-size:12px;font-weight:600;">Co se do termínu vejde</td></tr>
        ${itemsRows}
      </table>` : ''}

      <table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0;">
        <tr><td style="background:${C.emerald};border-radius:10px;">
          <a href="${data.slotUrl}" style="display:inline-block;padding:13px 30px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Rezervovat termín</a>
        </td></tr>
      </table>

      <p style="margin:16px 0 0;color:${C.light};font-size:12px;text-align:center;line-height:1.6;">
        Termín patří tomu, kdo si ho vezme první — tuhle zprávu dostalo víc lidí.
      </p>

      <p style="margin:20px 0 0;padding:14px 0 0;border-top:1px solid ${C.border};color:${C.light};font-size:12px;line-height:1.65;text-align:center;">
        Tuhle zprávu vám poslal ${data.providerName} přes Propojo.<br>
        <a href="${data.unsubscribeUrl}" style="color:${C.emeraldDark};text-decoration:underline;">Nechci upozornění na volné termíny</a>
      </p>
    `),
  }
}