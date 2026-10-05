# J2 Outreach

J2's own sales outreach platform. Leads come in (Lusha CSV, n8n, APIs), get de-duplicated and scored,
go out through Instantly (email) and Jobix (AI calls), and come back as replies, call outcomes and
booked meetings for the SDR team. Everything about a lead lives on one timeline.

Supabase project: `j2-outreach` (`rxfzecmdsvrejebvxtfe`, London).

## Stack

- React 18 + Vite, same design system as J2 Dev Planner
- Supabase: Postgres (scoring, de-duplication and do-not-contact logic live in the database), Auth, Edge Functions
- Vercel for hosting
- n8n is the automation layer that moves leads between this platform, Lusha, Shodan, Instantly, Jobix and ConnectWise

## Run locally

```bash
npm install
npm run dev        # .env.local is included
```

First person to sign up becomes the admin. Approve others under Settings.

## One-time setup in Supabase

1. **Edge Functions > Secrets**: add `WEBHOOK_SECRET` (any long random string). Every webhook and the n8n API
   require it. Optional: `RESEND_API_KEY` and `NOTIFY_FROM` so booking emails go out automatically.
2. **Authentication > URL Configuration**: set the Site URL to the Vercel address once deployed.

## Deploy

Push to GitHub, import in Vercel (framework: Vite), add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
from `.env.local`.

## How a lead moves

| Status | Means | Who acts next |
| --- | --- | --- |
| New | Imported, not reviewed | A person reviews, then marks Ready or archives |
| Ready | Approved for outreach | n8n picks it up (`GET /n8n/queue?status=ready`) |
| Emailing | In an Instantly sequence | System |
| Calling | AI call in progress or due | System |
| Pending | No answer; next attempt scheduled (`next_action_at`) | System, on the date |
| Replied | Wrote back | A person answers today |
| Interested | Wants info or a later call | A person follows up |
| Meeting booked | Booked, waiting for SDR confirmation | SDR confirms |
| Handed over | Meeting held; with sales in ConnectWise | Sales |
| Not now | Asked for later; re-opens as Ready on the date (`reopen_due_leads()`) | System |
| Deferred | Pointed us to someone else; linked to the referral | Nobody |
| Referral | Created from a referral, linked to the referrer | A person, as a warm lead |
| Wrong person | Not the right contact, no referral given | A person finds the right contact |
| Not interested / Unreachable / Do not contact / Archived | Closed | Nobody |

Referrals: `add_referral(from_lead_id, {full_name, job_title, email, phone, company?, note})` creates the new lead,
links both ways and sets the referrer to Deferred. The Jobix webhook calls it when a call outcome includes a `referral` object.

n8n should call `reopen_due_leads()` once a day (or `POST /n8n/status` per lead) so "Not now" leads come back on time.

## Scoring

Computed in the database on every insert and update (`score_lead`). Points: industry match (30/25/20/15),
company size (25/15/10), exposed systems (up to 25), DMARC missing (10), decision-maker title (10),
has phone (5), has email (5). Tiers: Green 80+, Gold 50+, Red below. Thresholds and target lists are in Settings.

## API for n8n

All calls need the header `x-webhook-secret: <WEBHOOK_SECRET>`. Base: `https://rxfzecmdsvrejebvxtfe.supabase.co/functions/v1`

| Call | Purpose |
| --- | --- |
| `POST /n8n/leads` | Import one lead or an array (same fields as CSV: full_name, email, phone, company, industry, employee_count, country, job_title, linkedin_url, domain, website). Returns counts. |
| `POST /n8n/companies` | Enrich a company by domain: `{"domain":"acme.co.za","exposure":{"open_ports":3,"vulns":1},"dmarc_status":"missing"}`. Leads are re-scored. |
| `GET /n8n/queue?status=ready&tier=gold&region=ZA&limit=50` | Leads to work, highest score first. `due=true` limits to leads whose next action is due. |
| `GET /n8n/lead?email=...` | One lead with its company. |
| `GET /n8n/experiments` | Running A/B experiments with variants, plus the playbook. |
| `GET /n8n/playbook` | Current setting per factor. Each lead in `/n8n/queue` also carries `experiments: {factor: {variant, config}}`: route it through the matching campaign or script, and fall back to the playbook. |
| `POST /n8n/events` | Log anything: `{"email":"...","type":"email_sent","channel":"email","source":"instantly","external_id":"..."}` |
| `POST /n8n/status` | `{"email":"...","status":"in_sequence","reason":"Added to campaign X","external_ids":{"instantly_lead_id":"..."}}` |
| `POST /webhook-jobix` | Jobix callback_url. Pass `lead_id` in the call `context`. Handles outcomes, attempts, bookings, DNC. |
| `POST /webhook-instantly` | Instantly webhook for sent/opened/replied/bounced/unsubscribed. Matches on lead email. |

## A/B testing

- **Playbook** (`playbook` table): what every lead gets right now, one row per factor (subject line, call opening, calling hours, offer, tone, ...).
- **Experiment**: changes one factor. Variants A (control) and B. Leads are assigned when they become Ready, by a stable hash
  (`assign_lead`), filtered by audience (tiers, regions). `start_experiment` assigns everyone already Ready; one running experiment per factor.
- **Results** (`experiment_results`, `experiment_daily` views): counted from lead timelines after assignment. The app runs a two-proportion
  z-test and a sample-size calculator (80% power, 95% confidence).
- **Deciding**: `conclude_experiment(id, winner, conclusion, apply)` writes the winner's config into the playbook.
- n8n: read `experiments` from each queued lead and route accordingly; otherwise use the playbook.

## Project structure

```
src/pages/        Dashboard, Leads (+ LeadDrawer), Import, Meetings, DoNotContact, Settings
src/components/   LeadDrawer, Badges, InlineInput, Modal, TopNav
src/lib/          supabase client, auth, toast, constants, csv parsing
supabase/migrations/   schema, logic, RLS (already applied)
supabase/functions/    webhook-jobix, webhook-instantly, n8n (already deployed)
```
