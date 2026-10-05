-- Richer status model, referrals, and re-opening "not now" leads when their date arrives.
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'new','ready','in_sequence','calling','pending','replied','interested','meeting_booked','handed_over',
  'not_now','deferred','referral','wrong_person','not_interested','unreachable','dnc','archived'));
alter table public.leads add column if not exists referred_by_lead_id uuid references public.leads(id) on delete set null;
create index if not exists leads_referred_by_idx on public.leads (referred_by_lead_id);
alter table public.lead_events drop constraint if exists lead_events_type_check;
alter table public.lead_events add constraint lead_events_type_check check (type in (
  'imported','note','status_changed','score_changed','referral_made','referral_received',
  'email_sent','email_opened','email_clicked','email_replied','email_bounced','unsubscribed',
  'call_attempted','call_connected','call_voicemail','call_outcome','call_transferred',
  'meeting_booked','meeting_confirmed','meeting_held','meeting_no_show','meeting_cancelled',
  'dnc_added','crm_synced'));
-- add_referral(p_from, p_lead), lead_referrals view and reopen_due_leads() as applied on 5 Oct 2026
-- (see the Supabase migration history for the full function bodies).
