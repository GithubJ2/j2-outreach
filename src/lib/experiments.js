// Everything the A/B testing tab knows: factors you can test, the metrics, the maths and the guide.

export const METRICS = {
  reply_rate: { label: 'Reply rate', num: 'replied', den: 'emailed', channel: 'email', baseline: 0.05, explain: 'Of the people emailed, how many wrote back' },
  connect_rate: { label: 'Connect rate', num: 'connected', den: 'called', channel: 'call', baseline: 0.25, explain: 'Of the people called, how many actually picked up and spoke' },
  meeting_rate: { label: 'Meeting rate', num: 'meetings', den: 'assigned', channel: 'both', baseline: 0.03, explain: 'Of everyone in the test, how many booked a meeting' },
  positive_rate: { label: 'Positive rate', num: 'positive', den: 'assigned', channel: 'both', baseline: 0.08, explain: 'Replied, interested or booked: any good sign' },
  show_rate: { label: 'Show rate', num: 'held', den: 'meetings', channel: 'both', baseline: 0.6, explain: 'Of the meetings booked, how many actually happened' },
}

// One factor is changed per experiment. Each has a suggested goal and ideas for variant B.
export const FACTORS = {
  email_subject: { label: 'Email subject line', channel: 'email', goal: 'reply_rate', field: 'subject', fieldLabel: 'Subject line',
    why: 'The subject decides whether the email is opened at all. Cheapest thing to test, fastest to learn from.',
    ideas: ['A question about their company by name', 'A specific risk you can see from outside', 'A plain, short internal-style subject', 'A referral or industry peer angle'] },
  email_angle: { label: 'Email angle', channel: 'email', goal: 'reply_rate', field: 'angle', fieldLabel: 'Angle (what the email leads with)',
    why: 'Risk, value or proof: people respond to different motivations.',
    ideas: ['Lead with the risk they are exposed to', 'Lead with what good looks like and the value', 'Lead with a client result', 'Lead with a free assessment offer'] },
  email_send_window: { label: 'Email send time', channel: 'email', goal: 'reply_rate', field: 'window', fieldLabel: 'Send window',
    why: 'Timing changes open and reply rates without changing a word.',
    ideas: ['Early morning, 07:00 to 08:30', 'Mid-morning, 10:00 to 11:30', 'Early afternoon, 13:30 to 15:00', 'Tuesday to Thursday only'] },
  pre_call_email: { label: 'Email before the call', channel: 'both', goal: 'connect_rate', field: 'approach', fieldLabel: 'Approach',
    why: 'A heads-up email can lift pick-up rates, or waste a touch. Only data will tell.',
    ideas: ['Send a short heads-up email the day before calling', 'Call first, email after', 'Email with a short form; call form-fillers first'] },
  call_trigger: { label: 'When the call happens', channel: 'call', goal: 'connect_rate', field: 'trigger', fieldLabel: 'Trigger',
    why: 'Calling right after an email open catches people at their desk.',
    ideas: ['15 minutes after an email is opened', 'Next business day after the first email', 'After no reply to two emails', 'Immediately, no email first'] },
  call_window: { label: 'Calling hours', channel: 'call', goal: 'connect_rate', field: 'window', fieldLabel: 'Calling window',
    why: 'Pick-up rates vary a lot by hour. Small change, big effect.',
    ideas: ['08:00 to 09:30', '11:00 to 12:30', '14:00 to 16:00', '16:30 to 17:30'] },
  call_opening: { label: 'Call opening line', channel: 'call', goal: 'positive_rate', field: 'opening', fieldLabel: 'Opening (first 10 seconds)',
    why: 'The first sentence decides whether they stay on the line.',
    ideas: ['Permission-based: "Is now a bad time?"', 'Reason-for-calling in one sentence', 'Mention the specific exposure you found', 'Peer-proof: "We work with firms like yours"'] },
  offer: { label: 'The offer', channel: 'both', goal: 'meeting_rate', field: 'offer', fieldLabel: 'What we invite them to',
    why: 'The ask has to feel small and useful. This is where meeting rate is won or lost.',
    ideas: ['Free external exposure scan', 'Free security assessment', '15-minute discovery call', 'Microsoft 365 security review'] },
  tone: { label: 'Tone of voice', channel: 'both', goal: 'positive_rate', field: 'tone', fieldLabel: 'Tone',
    why: 'Formal or direct lands differently by industry and country.',
    ideas: ['Conversational and direct', 'Formal and authoritative', 'Technical, peer to peer'] },
  voicemail: { label: 'Voicemail', channel: 'call', goal: 'positive_rate', field: 'approach', fieldLabel: 'Voicemail approach',
    why: 'Voicemails can prompt a call back, or burn the number. Worth knowing.',
    ideas: ['Leave a short voicemail with a reason to call back', 'No voicemail, retry later', 'Voicemail on the last attempt only'] },
  sequence_length: { label: 'Number of touches', channel: 'both', goal: 'positive_rate', field: 'steps', fieldLabel: 'Sequence (steps and spacing)',
    why: 'More touches lift results up to a point, then annoy people and raise opt-outs.',
    ideas: ['3 emails over 2 weeks', '4 emails over 3 weeks', '2 emails plus 2 calls', '5 touches over 4 weeks'] },
}

export const FACTOR_KEYS = Object.keys(FACTORS)

export function rate(r, metric) {
  const m = METRICS[metric]
  if (!r) return { value: 0, num: 0, den: 0 }
  const den = r[m.den] || 0
  const num = r[m.num] || 0
  return { value: den ? num / den : 0, num, den }
}

// Two-proportion z-test. Returns the probability that B really is different from A.
export function compare(a, b) {
  if (!a.den || !b.den) return { confidence: 0, lift: 0, z: 0, enough: false }
  const p = (a.num + b.num) / (a.den + b.den)
  const se = Math.sqrt(p * (1 - p) * (1 / a.den + 1 / b.den))
  const z = se ? (b.value - a.value) / se : 0
  const confidence = 1 - 2 * (1 - normalCdf(Math.abs(z)))
  const lift = a.value ? (b.value - a.value) / a.value : b.value ? 1 : 0
  return { confidence, lift, z, enough: confidence >= 0.95 }
}

function normalCdf(x) {
  // Abramowitz and Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

// Leads per variant needed to see a relative lift with 80% power at 95% confidence
export function sampleSize(baseline, relativeLift = 0.3) {
  const p = Math.min(0.95, Math.max(0.005, baseline))
  const d = p * relativeLift
  return Math.ceil((2 * Math.pow(1.96 + 0.84, 2) * p * (1 - p)) / (d * d))
}

export function pct(x, digits = 1) {
  return `${(x * 100).toFixed(digits)}%`
}

// The guide: look at the funnel and what has been tested, and say what to try next and why.
export function suggestNext(funnel, experiments) {
  const tested = new Set(experiments.filter((e) => e.status !== 'abandoned').map((e) => e.factor))
  const recent = new Set(experiments.filter((e) => e.status === 'running').map((e) => e.factor))
  const f = funnel || {}
  const replyRate = f.emailed ? f.replied / f.emailed : null
  const connectRate = f.called ? f.connected / f.called : null
  const meetingFromConnect = f.connected ? f.meetings / f.connected : null
  const showRate = f.meetings ? f.held / f.meetings : null
  const out = []
  const push = (factor, reason, priority) => { if (!recent.has(factor)) out.push({ factor, reason, priority, tested: tested.has(factor) }) }

  if (!f.emailed && !f.called) {
    push('email_subject', 'No outreach has gone out yet. Start with the subject line: it is the cheapest test and you learn fast.', 1)
    push('offer', 'Decide the offer early. Everything downstream depends on it.', 2)
  }
  if (replyRate !== null && replyRate < 0.04) push('email_subject', `Reply rate is ${pct(replyRate)}. Below 4% usually means emails are not being opened. Test the subject line.`, 1)
  if (replyRate !== null && replyRate >= 0.04 && replyRate < 0.08) push('email_angle', `Reply rate is ${pct(replyRate)}. Opens are fine; the message is not landing. Test the angle.`, 2)
  if (connectRate !== null && connectRate < 0.2) push('call_window', `Connect rate is ${pct(connectRate)}. Fewer than 1 in 5 pick up. Calling hours is the quickest lever.`, 1)
  if (connectRate !== null && connectRate < 0.25) push('pre_call_email', `Connect rate is ${pct(connectRate)}. A heads-up email may lift pick-ups.`, 2)
  if (meetingFromConnect !== null && meetingFromConnect < 0.1) push('call_opening', `Only ${pct(meetingFromConnect)} of connected calls book a meeting. The opening or the offer is the problem.`, 1)
  if (meetingFromConnect !== null && meetingFromConnect < 0.15) push('offer', `${pct(meetingFromConnect)} of conversations book. A smaller, more useful ask can lift this.`, 2)
  if (showRate !== null && showRate < 0.6) push('offer', `Show rate is ${pct(showRate)}. Meetings are booked but not kept, which points to a weak reason to attend.`, 2)
  if (!out.length) {
    push('tone', 'The funnel is healthy. Tone is a low-risk test that often gives a surprising lift.', 3)
    push('sequence_length', 'Try fewer or more touches to find the point where opt-outs rise faster than replies.', 3)
  }
  out.sort((x, y) => x.priority - y.priority || (x.tested === y.tested ? 0 : x.tested ? 1 : -1))
  return out.slice(0, 3)
}
