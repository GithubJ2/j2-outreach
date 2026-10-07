export const STATUSES = {
  new: { label: 'New', hint: 'Imported, not yet reviewed', next: 'Review it, then mark Ready or archive it', who: 'you' },
  ready: { label: 'Ready', hint: 'Approved for outreach', next: 'Nothing. n8n picks these up for email and calls', who: 'system' },
  in_sequence: { label: 'Emailing', hint: 'In an email sequence', next: 'Nothing. Watch for a reply', who: 'system' },
  calling: { label: 'Calling', hint: 'A call is due: by the sales team for top leads, or by Zoe on warm leads', next: 'Sales team: if the reason says personal contact, call them', who: 'you' },
  pending: { label: 'Pending', hint: 'Waiting on a scheduled attempt, or held back for review (see Reason)', next: 'Read the reason. If held back, fix the data and mark Ready', who: 'you' },
  replied: { label: 'Replied', hint: 'Wrote back to an email', next: 'Read the reply and answer it today', who: 'you' },
  interested: { label: 'Interested', hint: 'Showed interest, wants info or a later call', next: 'Follow up personally', who: 'you' },
  meeting_booked: { label: 'Meeting booked', hint: 'Meeting booked, waiting for SDR confirmation', next: 'The sales team confirms the time with them', who: 'sdr' },
  handed_over: { label: 'Handed over', hint: 'Meeting held; now with sales in ConnectWise', next: 'Nothing here. Sales owns it', who: 'sales' },
  not_now: { label: 'Not now', hint: 'Asked to be contacted later', next: 'Nothing. Re-opens as Ready on the date shown', who: 'system' },
  deferred: { label: 'Deferred', hint: 'Pointed us to someone else', next: 'Nothing. Work the referral instead', who: 'nobody' },
  referral: { label: 'Referral', hint: 'Created from a referral, with details given', next: 'Treat as a warm lead: reach out and mention who referred them', who: 'you' },
  wrong_person: { label: 'Wrong person', hint: 'Not the right contact, no referral given', next: 'Find the right person at the company, then add them as a referral', who: 'you' },
  not_interested: { label: 'Not interested', hint: 'Said no', next: 'Nothing', who: 'nobody' },
  unreachable: { label: 'Unreachable', hint: 'Bounced, dead number, or no answer after the maximum attempts', next: 'Nothing, unless you find a better number', who: 'nobody' },
  dnc: { label: 'Do not contact', hint: 'On the do-not-contact list', next: 'Nothing, ever', who: 'nobody' },
  archived: { label: 'Archived', hint: 'Removed from view', next: 'Nothing', who: 'nobody' },
}

// Statuses a person can set by hand (the rest are set by the system or by actions)
export const MANUAL_STATUSES = ['new', 'ready', 'replied', 'interested', 'meeting_booked', 'handed_over', 'not_now', 'wrong_person', 'not_interested', 'unreachable', 'archived']

// Statuses that need a person
export const NEEDS_PERSON = ['replied', 'interested', 'meeting_booked', 'calling', 'referral', 'wrong_person']

export const TIERS = {
  green: { label: 'Green', hint: 'Best leads: personal outreach by the top SDRs' },
  gold: { label: 'Gold', hint: 'Automated outreach' },
  red: { label: 'Red', hint: 'Lower fit: use for testing' },
}

export const REGIONS = { ZA: 'South Africa', GB: 'United Kingdom' }

export const EVENT_LABELS = {
  imported: 'Imported', note: 'Note', status_changed: 'Status changed', score_changed: 'Score changed',
  referral_made: 'Referred us to someone', referral_received: 'Received as a referral',
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
