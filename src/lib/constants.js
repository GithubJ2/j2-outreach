export const STATUSES = {
  new: { label: 'New', hint: 'Imported, not yet reviewed' },
  ready: { label: 'Ready', hint: 'Approved for outreach; n8n picks these up' },
  in_sequence: { label: 'Emailing', hint: 'In an email sequence' },
  calling: { label: 'Calling', hint: 'Being called by the AI' },
  replied: { label: 'Replied', hint: 'Replied to an email; needs a person' },
  meeting_booked: { label: 'Meeting booked', hint: 'Meeting booked, SDR to confirm' },
  not_now: { label: 'Not now', hint: 'Asked to be contacted later' },
  not_interested: { label: 'Not interested', hint: 'Said no' },
  unreachable: { label: 'Unreachable', hint: 'Bounced, wrong number or never answered' },
  dnc: { label: 'Do not contact', hint: 'On the do-not-contact list' },
  archived: { label: 'Archived', hint: 'Removed from view' },
}

// Statuses a person can set by hand (the rest are set by the system)
export const MANUAL_STATUSES = ['new', 'ready', 'replied', 'meeting_booked', 'not_now', 'not_interested', 'unreachable', 'archived']

export const TIERS = {
  green: { label: 'Green', hint: 'Best leads: personal outreach by the top SDRs' },
  gold: { label: 'Gold', hint: 'Automated outreach' },
  red: { label: 'Red', hint: 'Lower fit: use for testing' },
}

export const REGIONS = { ZA: 'South Africa', GB: 'United Kingdom' }

export const EVENT_LABELS = {
  imported: 'Imported', note: 'Note', status_changed: 'Status changed', score_changed: 'Score changed',
  email_sent: 'Email sent', email_opened: 'Email opened', email_clicked: 'Link clicked', email_replied: 'Replied to email',
  email_bounced: 'Email bounced', unsubscribed: 'Unsubscribed',
  call_attempted: 'Call attempted, no answer', call_connected: 'Call connected', call_voicemail: 'Voicemail left',
  call_outcome: 'Call outcome', call_transferred: 'Transferred to a person',
  meeting_booked: 'Meeting booked', meeting_confirmed: 'Meeting confirmed', meeting_held: 'Meeting held',
  meeting_no_show: 'No show', meeting_cancelled: 'Meeting cancelled', dnc_added: 'Added to do-not-contact', crm_synced: 'Synced to ConnectWise',
}

export const SCORE_LABELS = {
  industry: 'Target industry', company_size: 'Company size', exposure: 'Exposed systems', dmarc_missing: 'DMARC missing',
  title: 'Decision-maker title', has_phone: 'Has a phone number', has_email: 'Has an email address',
}

// CSV header names we recognise (lower-cased), including Lusha export names
export const COLUMN_ALIASES = {
  full_name: ['full name', 'name', 'contact name', 'fullname'],
  first_name: ['first name', 'firstname', 'first'],
  last_name: ['last name', 'lastname', 'surname', 'last'],
  job_title: ['job title', 'title', 'position', 'role'],
  email: ['email', 'work email', 'email address', 'business email', 'e-mail'],
  phone: ['phone', 'direct phone', 'phone number', 'mobile', 'work phone', 'direct dial', 'telephone'],
  company: ['company', 'company name', 'organisation', 'organization', 'account'],
  domain: ['domain', 'company domain', 'website domain'],
  website: ['website', 'company website', 'url'],
  industry: ['industry', 'company industry', 'sector'],
  employee_count: ['employees', 'employee count', 'company size', 'number of employees', 'headcount', 'size'],
  country: ['country', 'region', 'company country', 'location country'],
  linkedin_url: ['linkedin', 'linkedin url', 'linkedin profile', 'profile url'],
}
