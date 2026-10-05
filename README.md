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

```
new -> ready -> in_sequence (Instantly) -> calling (Jobix) -> replied / meeting_booked / not_now / not_interested / unreachable
                                                     \-> dnc (opt-out, "do not call", or added by hand)
```

- **New**: imported, waiting for a person to review.
- **Ready**: approved. n8n pulls these from `GET /n8n/queue?status=ready` and pushes them to Instantly / Jobix.
- Everything after that is set by the webhooks, and can be overridden by hand in the app.
- Call attempts are counted; after `max_call_attempts` (Settings) the lead becomes Unreachable.

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
| `POST /n8n/events` | Log anything: `{"email":"...","type":"email_sent","channel":"email","source":"instantly","external_id":"..."}` |
| `POST /n8n/status` | `{"email":"...","status":"in_sequence","reason":"Added to campaign X","external_ids":{"instantly_lead_id":"..."}}` |
| `POST /webhook-jobix` | Jobix callback_url. Pass `lead_id` in the call `context`. Handles outcomes, attempts, bookings, DNC. |
| `POST /webhook-instantly` | Instantly webhook for sent/opened/replied/bounced/unsubscribed. Matches on lead email. |

## Project structure

```
src/pages/        Dashboard, Leads (+ LeadDrawer), Import, Meetings, DoNotContact, Settings
src/components/   LeadDrawer, Badges, InlineInput, Modal, TopNav
src/lib/          supabase client, auth, toast, constants, csv parsing
supabase/migrations/   schema, logic, RLS (already applied)
supabase/functions/    webhook-jobix, webhook-instantly, n8n (already deployed)
```
