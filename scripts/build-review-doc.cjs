/* Build a Word review doc: every app screen (in journey order) with a comment box. */
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, ImageRun, AlignmentType, Footer, PageNumber,
} = require('docx')

const DIR = path.resolve('screenshots')
const OUT = path.resolve('SingleInterface-Screen-Review.docx')

// journey order: file (in screenshots/), title, description, section
const S = [
  ['01-login', 'Login — mobile number', 'OTP sign-in with the store’s registered number. No passwords.', 'Auth & entry'],
  ['02-otp', 'OTP verification', '6-digit one-time code; auto-verifies on completion.', 'Auth & entry'],
  ['03-request-access', 'Request access sheet', 'New/changed number → request routed to the Nova brand admin for approval.', 'Auth & entry'],
  ['04-store-selector', 'Store selector', 'One dealer number → multiple mapped stores; flagged stores show “Verify now”.', 'Auth & entry'],
  ['05-home-welcome', 'First-run welcome', 'AI-generated welcome shown on the very first login.', 'Home'],
  ['06-home', 'Home — what you missed', 'Since-last-login digest: missed calls, negative reviews, health score, AI nudge, nearby rank.', 'Home'],
  ['07-vmn-incoming', 'VMN · Incoming', 'Live call sync, AI Daily Briefing (Gemini), ranked missed-call queue.', 'VMN (call recovery)'],
  ['08-vmn-outbound', 'VMN · Outbound', 'Call-back queue ranked by chance-to-buy; one-tap “Call back now”.', 'VMN (call recovery)'],
  ['09-vmn-missed-ops', 'VMN · Missed opportunities', 'Combined missed calls + IVR drops — total win-back value at risk.', 'VMN (call recovery)'],
  ['10-vmn-callcoach', 'AI Call-Back Coach', 'Per-lead AI script + refine chips + AI Voice Outbound Agent upsell.', 'VMN (call recovery)'],
  ['11-customers', 'Customers — CRM list', 'Store contact book with hot / review-pending / value stats and filters.', 'Customers'],
  ['12-customer-detail', 'Customer detail', 'AI audience summary + full interaction timeline; send review link / call back.', 'Customers'],
  ['13-reviews-inbox', 'Reviews · Inbox', 'NPS + rating health; review list with AI reply drafts (token-metered).', 'Reviews'],
  ['14-review-reply', 'Review reply (AI)', 'AI-drafted reply with refine chips; costs 15 tokens to reply with AI.', 'Reviews'],
  ['15-reviews-generate', 'Reviews · Generate', 'First-party review-request builder → share to WhatsApp.', 'Reviews'],
  ['16-reviews-leaderboard', 'Reviews · Leaderboard', 'Team ranking — visible only for brand/cluster roles (not single store).', 'Reviews'],
  ['17-profile', 'Profile hub', 'Store / settings / brand: business profile, media, team, role, theme, alerts.', 'Profile'],
  ['18-business-profile', 'Business Profile editor', 'Google-Business-Profile-style editor — add/edit/remove every field.', 'Profile'],
  ['19-manage-media', 'Manage Media', 'Cover, posts and store photos.', 'Profile'],
  ['20-team', 'Team', 'Team members and roles.', 'Profile'],
  ['21-switch-role', 'Switch role', 'Demo the 6-level hierarchy: Single Store → Distribution Head.', 'Profile'],
  ['22-ai-tokens', 'AI Tokens ledger', 'Monthly AI-token wallet + full spend / allotment ledger.', 'Profile'],
  ['23-verify-presence', 'Verify · Presence gate', 'Explains why (≈225 m GPS drift); gates on physical on-site presence.', 'Location verification'],
  ['24-verify-address', 'Verify · Step 1 — Address', 'Correct the stated address (name, pincode, city, state, landmark).', 'Location verification'],
  ['25-verify-pin', 'Verify · Step 2 — Pin', 'Move / snap the map pin to the device’s real GPS position.', 'Location verification'],
  ['26-verify-pluscode', 'Verify · Step 3 — Plus Code', 'Real Google Plus Code auto-generated from the adjusted pin.', 'Location verification'],
  ['27-verify-photo', 'Verify · Step 4 — Photo', 'Real storefront photo: Take photo (camera) or Upload from library.', 'Location verification'],
  ['28-ai-copilot', 'AI Copilot', 'Always-available assistant grounded in live store data; can draft + act.', 'AI & roles'],
  ['29-role-cluster', 'Cluster Owner roll-up', '3-store Bangalore cluster aggregate view.', 'AI & roles'],
  ['30-role-city', 'City Manager roll-up', '5-store city view + AI Executive Insight + store ranking.', 'AI & roles'],
  ['31-role-regional', 'Regional Manager roll-up', 'Multi-city regional aggregate.', 'AI & roles'],
  ['32-role-head', 'Distribution Head roll-up', 'PAN-India top-level view.', 'AI & roles'],
  ['33-home-dark', 'Dark theme — Home', 'App retinted to the brand in dark mode.', 'Theme'],
  ['34-vmn-dark', 'Dark theme — VMN', 'Dark mode across the call-recovery core.', 'Theme'],
]

const IMG_W = 205, IMG_H = 429
const COL_IMG = 3120, COL_CMT = 7680, TABLE_W = COL_IMG + COL_CMT
const GREY = 'E4E7EC', INDIGO = '0E0071', BLUE = '0070FC', SUB = '667085', INK = '344054', MUTE = '98A2B3'
const border = (color = GREY, size = 4) => ({ style: BorderStyle.SINGLE, size, color, space: 0 })

function screenCard(num, [file, title, desc]) {
  const buf = fs.readFileSync(path.join(DIR, `${file}.png`))
  const blank = () => new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun('')] })
  const imgCell = new TableCell({
    width: { size: COL_IMG, type: WidthType.DXA },
    verticalAlign: 'center',
    margins: { top: 80, bottom: 80, left: 60, right: 120 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: buf, transformation: { width: IMG_W, height: IMG_H } })] })],
  })
  const cmtCell = new TableCell({
    width: { size: COL_CMT, type: WidthType.DXA },
    margins: { top: 120, bottom: 120, left: 180, right: 140 },
    children: [
      new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: `${String(num).padStart(2, '0')} · ${title}`, bold: true, size: 26, color: INDIGO })] }),
      new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: desc, italics: true, size: 19, color: SUB })] }),
      new Paragraph({ spacing: { after: 160 }, children: [
        new TextRun({ text: 'Status:   ', bold: true, size: 18, color: INK }),
        new TextRun({ text: '☐ Approved      ☐ Needs change      ☐ Question', size: 18, color: INK }),
      ] }),
      new Paragraph({ spacing: { after: 60 }, border: { bottom: border('D0D5DD', 6) }, children: [new TextRun({ text: 'PM comments', bold: true, size: 18, color: INK })] }),
      new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: 'Click to add your comments…', italics: true, size: 19, color: MUTE })] }),
      blank(), blank(), blank(),
    ],
  })
  return new Table({
    columnWidths: [COL_IMG, COL_CMT],
    width: { size: TABLE_W, type: WidthType.DXA },
    borders: { top: border(), bottom: border(), left: border(), right: border(), insideVertical: border(), insideHorizontal: border() },
    rows: [new TableRow({ cantSplit: true, children: [imgCell, cmtCell] })],
  })
}

const children = []
// cover
children.push(
  new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'SingleInterface — Zero Business Loss', bold: true, size: 40, color: INDIGO })] }),
  new Paragraph({ spacing: { after: 30 }, border: { bottom: border(BLUE, 12) }, children: [new TextRun({ text: 'App Screen Review · Product-Manager feedback', size: 24, color: INK })] }),
  new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: `${S.length} screens in journey order. Add feedback in the “PM comments” box beside each screen and tick a status.`, size: 20, color: SUB })] }),
  new Paragraph({ spacing: { after: 260 }, children: [new TextRun({ text: 'Tip: you can also use Word’s Review → New Comment on any element. Sections: Auth · Home · VMN · Customers · Reviews · Profile · Location verification · AI & roles · Theme.', size: 18, italics: true, color: MUTE })] }),
)

let n = 0, lastGroup = null
for (const row of S) {
  const group = row[3]
  if (group !== lastGroup) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 120 }, children: [new TextRun({ text: group, bold: true, size: 26, color: BLUE })] }))
    lastGroup = group
  }
  n += 1
  children.push(screenCard(n, row))
  children.push(new Paragraph({ spacing: { after: 140 }, children: [new TextRun('')] }))
}

const doc = new Document({
  creator: 'SingleInterface',
  title: 'App Screen Review',
  styles: { default: { document: { run: { font: 'Calibri' } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['SingleInterface · App Screen Review — Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: MUTE })] })] }) },
    children,
  }],
})

Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log('wrote', OUT, '(' + (b.length / 1e6).toFixed(1) + ' MB, ' + S.length + ' screens)') })
