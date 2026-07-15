'use client'
// components/ui/OrderButton.tsx
// Objednání služby. Adresu (město) řešíme JEN když se služba koná u zákazníka.
// location_type služby: 'u_poskytovatele' | 'u_zakaznika' | 'oboji'
//
// POJMY (držet je oddělené, jinak se to plete):
//   Objednávka = konkrétní zakázka u konkrétního živnostníka (tohle tlačítko)
//   Poptávka   = veřejný inzerát na nástěnce /poptavky, když zákazník nikoho nenašel
//
// Tlačítko musí říkat, co se po kliknutí stane. Dřív tu bylo „domluvit cenu",
// přestože se ve skutečnosti zakládá objednávka, kterou živnostník potvrzuje.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Loader2, LogIn, MapPin, Home, Store, CalendarCheck, FileSearch } from 'lucide-react'
import Link from 'next/link'
import { createOrder } from '@/lib/actions/orders'

interface OrderButtonProps {
  serviceId: string
  providerId: string
  isLoggedIn: boolean
  priceAgreed?: number
  paymentModel?: string | null
  locationType?: string | null // 'u_poskytovatele' | 'u_zakaznika' | 'oboji'
}

export default function OrderButton({ serviceId, providerId, isLoggedIn, priceAgreed, paymentModel, locationType = 'u_zakaznika' }: OrderButtonProps) {
  const [state, setState] = useState<'idle' | 'form' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [city, setCity] = useState('')
  // U 'oboji' si zákazník volí, kde chce službu. U pevných typů je to dané.
  const [place, setPlace] = useState<'u_zakaznika' | 'u_poskytovatele'>(
    locationType === 'u_poskytovatele' ? 'u_poskytovatele' : 'u_zakaznika'
  )
  const [errorMsg, setErrorMsg] = useState('')

  const isModelB = paymentModel === 'B'

  // Text tlačítka podle toho, co se REÁLNĚ stane
  const ctaLabel = isModelB ? 'Objednat nacenění' : 'Objednat službu'
  const CtaIcon = isModelB ? FileSearch : CalendarCheck

  // Ptáme se na město jen když se služba koná u zákazníka
  const isChoice = locationType === 'oboji'
  const atCustomer = isChoice ? place === 'u_zakaznika' : locationType === 'u_zakaznika'
  const needsCity = atCustomer

  if (!isLoggedIn) {
    return (
      <Link href={`/prihlasit?next=/sluzby/${serviceId}`} className="btn-primary w-full">
        <LogIn className="h-4 w-4" />
        Přihlásit se a objednat
      </Link>
    )
  }

  const handleOrder = async () => {
    if (needsCity && !city.trim()) {
      setState('error')
      setErrorMsg('Zadejte prosím město nebo obec, kde se má služba provést.')
      return
    }
    setState('loading')
    const result = await createOrder({
      service_id: serviceId,
      provider_id: providerId,
      message: message || undefined,
      price_agreed: priceAgreed,
      location_city: needsCity ? city.trim() : undefined,
      service_location: atCustomer ? 'u_zakaznika' : 'u_poskytovatele',
    })

    if (result.success) {
      setState('success')
    } else {
      setState('error')
      setErrorMsg(result.error)
    }
  }

  if (state === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 p-4 text-center"
      >
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="font-bold text-emerald-800">Objednávka odeslána</p>
        <p className="text-xs leading-relaxed text-emerald-700">
          {isModelB
            ? 'Živnostník se vám ozve a domluvíte se na termínu prohlídky.'
            : 'Živnostník ji potvrdí a ozve se vám.'}
        </p>
        <Link href="/dashboard/objednavky" className="mt-1 text-xs font-bold text-emerald-700 underline">
          Sledovat v Objednávkách
        </Link>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {state === 'form' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            {/* U 'oboji': zákazník zvolí, kde chce službu */}
            {isChoice && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Kde chcete službu využít?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPlace('u_poskytovatele')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${place === 'u_poskytovatele' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Store className="h-4 w-4" /> U živnostníka
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlace('u_zakaznika')}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${place === 'u_zakaznika' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Home className="h-4 w-4" /> U mě
                  </button>
                </div>
              </div>
            )}

            {/* Město – jen když se koná u zákazníka */}
            {needsCity && (
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" /> Město nebo obec *
                </label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Např. Zubří"
                  className="form-input text-sm"
                  maxLength={100}
                />
                <p className="mt-1 text-[11px] text-slate-400">Přesnou adresu doplníte až po přijetí objednávky.</p>
              </div>
            )}

            {/* Info když se jde za živnostníkem */}
            {!needsCity && (
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                <Store className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>Služba probíhá na adrese živnostníka. Adresu uvidíte po přijetí objednávky.</span>
              </div>
            )}

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isModelB ? 'Popište práci, kterou potřebujete nacenit…' : 'Zpráva pro živnostníka (volitelné)…'}
              rows={3}
              className="form-input resize-none text-sm"
              maxLength={500}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {state === 'error' && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}

      {state === 'idle' && (
        <button
          onClick={() => setState('form')}
          className="btn-primary w-full py-3 text-base"
        >
          <CtaIcon className="h-4 w-4" />
          {ctaLabel}
        </button>
      )}

      {(state === 'form' || state === 'error') && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setState('idle')}
              className="btn-secondary flex-1"
            >
              Zrušit
            </button>
            <button
              onClick={handleOrder}
              className="btn-primary flex-1"
            >
              Odeslat objednávku
            </button>
          </div>

          {/* Právě tady vzniká závazek — proto tu musí být jasné, s kým.
              Propojo je zprostředkovatel, ne strana smlouvy. */}
          <p className="text-center text-[11px] leading-relaxed text-slate-400">
            Objednávkou vzniká smlouva přímo mezi vámi a živnostníkem.
            Propojo je pouze zprostředkovatel.
          </p>
        </>
      )}

      {state === 'loading' && (
        <button disabled className="btn-primary w-full py-3 text-base opacity-75">
          <Loader2 className="h-4 w-4 animate-spin" />
          Odesílám…
        </button>
      )}
    </div>
  )
}