import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, LifeBuoy, Paperclip, X, CheckCircle2 } from 'lucide-react'
import { PrimaryButton, GhostButton, Card } from '../components/UI.jsx'
import {
  raiseTicket, validateTicket, getTickets,
  TICKET_TITLE_MAX, TICKET_BODY_MAX, TICKET_ATTACHMENT_HINT,
} from '@connect/core'
import { useToast } from '../components/Toast.jsx'
import { vibrate, cn } from '../lib/utils.js'

// ============================================================
// RAISE A TICKET — the store manager's support channel.
//
// PM feedback 3: "In the profile section, raise a ticket flow exactly the same as nova."
// The Nova form is in the brief's screenshot and is followed field for field: Title with
// a 0/100 counter, Description with 0/500, one optional attachment naming its accepted
// formats, and a Cancel / Raise Ticket footer.
//
// MOBILE FIRST, as asked. The Nova screenshot is a desktop dialog — a centred modal with
// a right-aligned button pair. This is a bottom sheet with full-width stacked controls,
// because that dialog at 375px puts "Raise Ticket" half off the screen. Same fields, same
// limits, same order; a layout that fits a phone.
//
// THE LIMITS AND THE VALIDATION COME FROM CORE (validateTicket), so the phone and the
// browser cannot disagree about whether a draft is submittable.
// ============================================================
export default function RaiseTicketSheet({ onClose, storeId }) {
  const { t } = useTranslation()
  const toast = useToast()
  const fileRef = useRef(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState(null)
  // Errors only after an attempt — both fields marked red before anything is typed reads
  // as a broken form.
  const [tried, setTried] = useState(false)

  const result = validateTicket({ title, body })
  const past = getTickets(storeId)

  function submit() {
    if (!result.ok) { setTried(true); vibrate(20); return }
    const ticket = raiseTicket({ title, body, attachment, storeId })
    if (!ticket) { setTried(true); return }
    vibrate(15)
    // Translator TODO: the catalogs carry no ticketing strings at all.
    toast.push({
      kind: 'success',
      title: 'Ticket raised',
      body: 'Our team will get back to you on this.',
    })
    onClose?.()
  }

  const titleErr = tried && (result.missing.includes('title') || result.tooLong.includes('title'))
  const bodyErr = tried && (result.missing.includes('body') || result.tooLong.includes('body'))
  const inputBase = 'w-full rounded-xl px-3 bg-transparent text-white m-callout outline-none placeholder:text-white/35'

  return (
    <div className="px-4 pb-6">
      <div className="flex items-center gap-2.5">
        <div
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
          style={{ background: 'rgba(0,112,252,.10)', border: '1px solid rgba(0,112,252,.30)' }}
        >
          <LifeBuoy size={18} style={{ color: '#0070FC' }} />
        </div>
        <div className="min-w-0">
          <div className="m-title3 text-white">Create New Ticket</div>
          <div className="m-caption text-white/55">Raise a concern with our team.</div>
        </div>
      </div>

      {/* TITLE */}
      <div className="mt-4">
        <div className="flex items-end justify-between gap-2 mb-1">
          <span className="m-caption text-white/70">Title<span style={{ color: '#FF6B7E' }}> *</span></span>
          <span className={cn('m-caption m-tabular', title.length > TICKET_TITLE_MAX ? 'text-[#FF6B7E]' : 'text-white/40')}>
            {title.length}/{TICKET_TITLE_MAX}
          </span>
        </div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Brief summary of your issue"
          aria-label="Title"
          className={`${inputBase} h-11`}
          style={{ background: 'var(--bg-subtle)', border: `1px solid ${titleErr ? 'rgba(220,38,38,.6)' : 'var(--border-subtle)'}` }}
        />
      </div>

      {/* DESCRIPTION */}
      <div className="mt-3.5">
        <div className="flex items-end justify-between gap-2 mb-1">
          <span className="m-caption text-white/70">Description<span style={{ color: '#FF6B7E' }}> *</span></span>
          <span className={cn('m-caption m-tabular', body.length > TICKET_BODY_MAX ? 'text-[#FF6B7E]' : 'text-white/40')}>
            {body.length}/{TICKET_BODY_MAX} characters
          </span>
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Please describe your issue, request, or requirement in detail"
          aria-label="Description"
          className={`${inputBase} py-2.5 resize-none min-h-[112px]`}
          style={{ background: 'var(--bg-subtle)', border: `1px solid ${bodyErr ? 'rgba(220,38,38,.6)' : 'var(--border-subtle)'}` }}
        />
      </div>

      {/* ATTACHMENT — optional, and NAME ONLY: this build has no upload service, so what
          is recorded is that a file was chosen. Saying so beats storing a local file URI
          that will not resolve for anyone who receives the ticket. */}
      <div className="mt-3.5">
        <span className="m-caption text-white/70">Attachment (optional)</span>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={e => setAttachment(e.target.files?.[0]?.name || null)}
        />
        {attachment ? (
          <div
            className="mt-1 rounded-xl px-3 h-11 flex items-center gap-2"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            <Paperclip size={14} className="text-white/55 shrink-0" />
            <span className="m-callout text-white/85 flex-1 min-w-0 truncate">{attachment}</span>
            <button
              type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment"
              className="-m-2 p-2 press text-white/45 hover:text-white/80"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { vibrate(6); fileRef.current?.click() }}
            className="mt-1 w-full rounded-xl grid place-items-center py-6 px-3 text-center press"
            style={{ border: '1px dashed var(--border-glass-strong)' }}
          >
            <Upload size={18} className="text-white/40" />
            <span className="m-caption text-white/55 mt-1.5">Click to upload or drag and drop</span>
          </button>
        )}
        <div className="m-caption text-white/40 mt-1">{TICKET_ATTACHMENT_HINT}</div>
      </div>

      {tried && !result.ok && (
        <div className="m-caption text-[#FF6B7E] mt-3">
          Add a title and a description before raising this ticket.
        </div>
      )}

      {/* FULL-WIDTH AND STACKED, not the desktop dialog's right-aligned pair. */}
      <div className="grid grid-cols-2 gap-2 mt-5">
        <GhostButton onClick={onClose}>{t('common.cancel')}</GhostButton>
        <PrimaryButton onClick={submit}>Raise Ticket</PrimaryButton>
      </div>

      {/* WHAT HAS ALREADY BEEN RAISED. A support channel with no record of what you sent
          is a channel you cannot tell you used — and every ticket here persists, so this
          costs nothing to show. */}
      {past.length > 0 && (
        <>
          <div className="m-subhead text-white/55 mt-5 mb-2">Your tickets</div>
          {past.map(tk => (
            <Card key={tk.id} className="!p-3 mb-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" style={{ color: '#22D38B' }} />
                <div className="flex-1 min-w-0">
                  <div className="m-callout text-white truncate">{tk.title}</div>
                  <div className="m-caption text-white/55 mt-0.5 line-clamp-2">{tk.body}</div>
                  {tk.attachment && (
                    <div className="m-caption text-white/40 mt-1 flex items-center gap-1">
                      <Paperclip size={11} /> {tk.attachment}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}
