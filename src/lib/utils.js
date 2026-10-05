import { COLUMN_ALIASES } from './constants'

export function timeAgo(ts) {
  if (!ts) return ''
  const s = (Date.now() - new Date(ts).getTime()) / 1000
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)} min ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)} h ago`
  const d = h / 24
  if (d < 7) return `${Math.floor(d)} d ago`
  return new Date(ts).toLocaleDateString()
}

export function fmtDateTime(ts, tz) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz })
  } catch {
    return new Date(ts).toLocaleString()
  }
}

export function personName(people, id) {
  const p = people?.[id]
  return p ? p.full_name || p.email : 'System'
}

// Small CSV parser: handles quotes, escaped quotes, commas and newlines inside quotes, CRLF.
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

// Guess which of our fields each CSV column is
export function guessMapping(headers) {
  const mapping = {}
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase()
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(key) && !Object.values(mapping).includes(field)) { mapping[i] = field; break }
    }
  })
  return mapping
}

export function rowsToLeads(rows, mapping) {
  return rows.map((r) => {
    const o = {}
    for (const [i, field] of Object.entries(mapping)) {
      const v = (r[Number(i)] ?? '').trim()
      if (v) o[field] = v
    }
    return o
  }).filter((o) => Object.keys(o).length > 0)
}

export function upsertById(list, row) {
  const i = list.findIndex((x) => x.id === row.id)
  if (i === -1) return [row, ...list]
  const copy = list.slice(); copy[i] = { ...copy[i], ...row }; return copy
}
