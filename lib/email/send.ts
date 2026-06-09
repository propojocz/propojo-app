// lib/email/send.ts
// Email odesílání přes Resend – BEZ 'use server'

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'Propojo <info@propojo.cz>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://propojo.cz'

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html })
    if (error) { console.error('[sendEmail]', error); return false }
    return true
  } catch (err) {
    console.error('[sendEmail] unexpected:', err)
    return false
  }
}

export { APP_URL }
