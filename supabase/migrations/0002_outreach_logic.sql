-- J2 Outreach: helpers, scoring, import, do-not-contact, status logging, RLS

-- Webhooks and n8n run as the service role (no signed-in user); approved users run as themselves.
create or replace function public.is_service() returns boolean
language sql stable set search_path = '' as $$ select current_user = 'service_role'; $$;
create or replace function public.can_write() returns boolean
language sql stable set search_path = '' as $$ select public.is_service() or public.is_approved(); $$;

create or replace function public.normalize_phone(p text, default_country text default 'ZA')
returns text language plpgsql immutable set search_path = '' as $$
declare d text;
begin
  if p is null or btrim(p) = '' then return null; end if;
  d := regexp_replace(p, '[^0-9+]', '', 'g');
  if d like '00%' then d := '+' || substr(d, 3); end if;
  if d like '+%' then return d; end if;
  if d like '0%' then
    if default_country = 'GB' then return '+44' || substr(d, 2); end if;
    return '+27' || substr(d, 2);
  end if;
  if length(d) >= 9 then
    if default_country = 'GB' then return '+44' || d; end if;
    return '+27' || d;
  end if;
  return null;
end; $$;

create or replace function public.email_domain(e text)
returns text language sql immutable set search_path = '' as $$
  select case when e is null or position('@' in e) = 0 then null else lower(split_part(e, '@', 2)) end;
$$;

create or replace function public.employee_band(n int)
returns text language sql immutable set search_path = '' as $$
  select case when n is null then null when n < 50 then '1-50' when n < 200 then '50-200'
              when n < 1000 then '200-1000' else '1000+' end;
$$;

create or replace function public.is_dnc(p_email text, p_phone text, p_domain text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.do_not_contact d
    where (p_email is not null and d.email = p_email::extensions.citext)
       or (p_phone is not null and d.phone = p_phone)
       or (p_domain is not null and d.domain = p_domain::extensions.citext)
  );
$$;

-- Scoring: industry match, company size, exposure, DMARC, seniority, reachability
create or replace function public.score_lead(l public.leads)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  c public.companies;
  industries jsonb; bands jsonb; titles jsonb;
  idx int; pts int := 0; parts jsonb := '{}'::jsonb;
  open_ports int := 0; vulns int := 0; t text; p int;
begin
  select * into c from public.companies where id = l.company_id;

  select value into industries from public.settings where key = 'target_industries_' || coalesce(l.region, c.country, 'ZA');
  if c.industry is not null and industries is not null then
    select position - 1 into idx from jsonb_array_elements_text(industries) with ordinality as e(val, position)
     where lower(e.val) = lower(c.industry) limit 1;
    if idx is not null then
      p := case when idx = 0 then 30 when idx = 1 then 25 when idx = 2 then 20 else 15 end;
      pts := pts + p; parts := parts || jsonb_build_object('industry', p);
    end if;
  end if;

  select value into bands from public.settings where key = 'ideal_employee_bands';
  if c.employee_band is not null and bands is not null then
    idx := null;
    select position - 1 into idx from jsonb_array_elements_text(bands) with ordinality as e(val, position)
     where e.val = c.employee_band limit 1;
    if idx is not null then
      p := case when idx = 0 then 25 when idx = 1 then 15 else 10 end;
      pts := pts + p; parts := parts || jsonb_build_object('company_size', p);
    end if;
  end if;

  open_ports := coalesce((c.exposure->>'open_ports')::int, 0);
  vulns := coalesce((c.exposure->>'vulns')::int, 0);
  if open_ports > 0 or vulns > 0 then
    p := least(25, (case when open_ports > 0 then 15 else 0 end) + (case when vulns > 0 then 15 else 0 end));
    pts := pts + p; parts := parts || jsonb_build_object('exposure', p);
  end if;
  if c.dmarc_status = 'missing' then
    pts := pts + 10; parts := parts || '{"dmarc_missing": 10}'::jsonb;
  end if;

  select value into titles from public.settings where key = 'target_titles';
  if l.job_title is not null and titles is not null then
    for t in select jsonb_array_elements_text(titles) loop
      if lower(l.job_title) like '%' || lower(t) || '%' then
        pts := pts + 10; parts := parts || '{"title": 10}'::jsonb; exit;
      end if;
    end loop;
  end if;

  if l.phone is not null then pts := pts + 5; parts := parts || '{"has_phone": 5}'::jsonb; end if;
  if l.email is not null then pts := pts + 5; parts := parts || '{"has_email": 5}'::jsonb; end if;

  return jsonb_build_object('score', least(pts, 100), 'parts', parts);
end; $$;

create or replace function public.tier_for(score int)
returns text language sql stable set search_path = '' as $$
  select case
    when score >= coalesce((select (value->>'green')::int from public.settings where key = 'tier_thresholds'), 80) then 'green'
    when score >= coalesce((select (value->>'gold')::int from public.settings where key = 'tier_thresholds'), 50) then 'gold'
    else 'red' end;
$$;

create or replace function public.leads_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare s jsonb;
begin
  new.email := nullif(lower(btrim(new.email::text)), '')::extensions.citext;
  new.phone := public.normalize_phone(new.phone, coalesce(new.region, 'ZA'));
  if new.first_name is null and new.full_name is not null then
    new.first_name := split_part(new.full_name, ' ', 1);
    new.last_name := nullif(btrim(substr(new.full_name, length(split_part(new.full_name, ' ', 1)) + 1)), '');
  end if;
  s := public.score_lead(new);
  new.score := (s->>'score')::int;
  new.score_breakdown := s->'parts';
  new.tier := public.tier_for(new.score);
  return new;
end; $$;
drop trigger if exists leads_before_write on public.leads;
create trigger leads_before_write before insert or update on public.leads
for each row execute function public.leads_before_write();

create or replace function public.companies_rescore() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.employee_band := coalesce(new.employee_band, public.employee_band(new.employee_count));
  update public.leads set updated_at = now() where company_id = new.id;
  return new;
end; $$;
drop trigger if exists companies_rescore on public.companies;
create trigger companies_rescore before update on public.companies
for each row execute function public.companies_rescore();

create or replace function public.rescore_all_leads() returns int
language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if not public.can_write() then raise exception 'Not authorised'; end if;
  update public.leads set updated_at = now();
  get diagnostics n = row_count;
  return n;
end; $$;

-- Every status or tier change is logged on the lead's timeline
create or replace function public.leads_log_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_events (lead_id, type, channel, source, payload, created_by)
    values (new.id, 'status_changed', 'system', 'app',
            jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.status_reason), auth.uid());
  end if;
  if new.tier is distinct from old.tier then
    insert into public.lead_events (lead_id, type, channel, source, payload)
    values (new.id, 'score_changed', 'system', 'app',
            jsonb_build_object('from_score', old.score, 'to_score', new.score, 'from_tier', old.tier, 'to_tier', new.tier));
  end if;
  return new;
end; $$;
drop trigger if exists leads_log_status on public.leads;
create trigger leads_log_status after update on public.leads
for each row execute function public.leads_log_status();

-- Adding someone to do-not-contact closes their lead
create or replace function public.dnc_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lead_events (lead_id, type, channel, source, payload, created_by)
  select l.id, 'dnc_added', 'system', 'app', jsonb_build_object('reason', new.reason, 'via', new.source), new.added_by
  from public.leads l
  where (new.email is not null and l.email = new.email)
     or (new.phone is not null and l.phone = new.phone)
     or (new.domain is not null and public.email_domain(l.email::text) = new.domain::text);
  update public.leads l set status = 'dnc', status_reason = coalesce(new.reason, 'Added to do-not-contact list'), next_action_at = null
  where l.status <> 'dnc'
    and ((new.email is not null and l.email = new.email)
      or (new.phone is not null and l.phone = new.phone)
      or (new.domain is not null and public.email_domain(l.email::text) = new.domain::text));
  return new;
end; $$;
drop trigger if exists dnc_after_insert on public.do_not_contact;
create trigger dnc_after_insert after insert on public.do_not_contact
for each row execute function public.dnc_after_insert();

-- Import leads from CSV rows (as JSON)
create or replace function public.import_leads(rows jsonb, p_filename text default null, p_source text default 'csv')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb; imp_id uuid;
  n_inserted int := 0; n_updated int := 0; n_dnc int := 0; n_invalid int := 0;
  errs jsonb := '[]'::jsonb;
  v_email text; v_phone text; v_domain text; v_region text; v_company_id uuid; v_lead_id uuid;
  v_name text; v_company text; v_emp int;
begin
  if not public.can_write() then raise exception 'Not authorised'; end if;

  insert into public.lead_imports (filename, source, row_count, created_by)
  values (p_filename, p_source, jsonb_array_length(rows), auth.uid()) returning id into imp_id;

  for r in select * from jsonb_array_elements(rows) loop
    begin
      v_name := nullif(btrim(coalesce(r->>'full_name', btrim(coalesce(r->>'first_name','') || ' ' || coalesce(r->>'last_name','')))), '');
      v_email := nullif(lower(btrim(r->>'email')), '');
      v_region := case upper(coalesce(r->>'region', r->>'country', ''))
                    when 'GB' then 'GB' when 'UK' then 'GB' when 'UNITED KINGDOM' then 'GB'
                    when 'ZA' then 'ZA' when 'SOUTH AFRICA' then 'ZA' else null end;
      v_phone := public.normalize_phone(r->>'phone', coalesce(v_region, 'ZA'));
      v_domain := coalesce(nullif(lower(btrim(r->>'domain')), ''), public.email_domain(v_email),
                           nullif(lower(regexp_replace(coalesce(r->>'website',''), '^https?://(www\.)?|/.*$', '', 'g')), ''));
      v_company := nullif(btrim(r->>'company'), '');
      v_emp := nullif(regexp_replace(coalesce(r->>'employee_count',''), '[^0-9]', '', 'g'), '')::int;

      if v_name is null or (v_email is null and v_phone is null) then
        n_invalid := n_invalid + 1;
        errs := errs || jsonb_build_object('row', r, 'error', 'Needs a name and an email or phone');
        continue;
      end if;

      if public.is_dnc(v_email, v_phone, v_domain) then
        n_dnc := n_dnc + 1; continue;
      end if;

      v_company_id := null;
      if v_domain is not null then select id into v_company_id from public.companies where domain = v_domain::extensions.citext; end if;
      if v_company_id is null and v_company is not null then
        select id into v_company_id from public.companies where lower(name) = lower(v_company) limit 1;
      end if;
      if v_company_id is null and (v_company is not null or v_domain is not null) then
        insert into public.companies (name, domain, website, industry, country, employee_count, employee_band)
        values (coalesce(v_company, v_domain), v_domain::extensions.citext, nullif(r->>'website',''), nullif(r->>'industry',''), v_region, v_emp, public.employee_band(v_emp))
        returning id into v_company_id;
      elsif v_company_id is not null then
        update public.companies set
          industry = coalesce(industry, nullif(r->>'industry','')),
          employee_count = coalesce(employee_count, v_emp),
          employee_band = coalesce(employee_band, public.employee_band(v_emp)),
          website = coalesce(website, nullif(r->>'website','')),
          country = coalesce(country, v_region)
        where id = v_company_id;
      end if;

      v_lead_id := null;
      if v_email is not null then select id into v_lead_id from public.leads where email = v_email::extensions.citext; end if;
      if v_lead_id is null and v_phone is not null then select id into v_lead_id from public.leads where phone = v_phone limit 1; end if;

      if v_lead_id is null then
        insert into public.leads (company_id, full_name, first_name, last_name, job_title, email, phone, linkedin_url, region, source, import_id)
        values (v_company_id, v_name, nullif(r->>'first_name',''), nullif(r->>'last_name',''), nullif(r->>'job_title',''),
                v_email::extensions.citext, v_phone, nullif(r->>'linkedin_url',''), v_region, p_source, imp_id)
        returning id into v_lead_id;
        insert into public.lead_events (lead_id, type, source, payload, created_by)
        values (v_lead_id, 'imported', 'app', jsonb_build_object('import_id', imp_id, 'source', p_source), auth.uid());
        n_inserted := n_inserted + 1;
      else
        update public.leads set
          company_id = coalesce(company_id, v_company_id),
          job_title = coalesce(job_title, nullif(r->>'job_title','')),
          phone = coalesce(phone, v_phone),
          email = coalesce(email, v_email::extensions.citext),
          linkedin_url = coalesce(linkedin_url, nullif(r->>'linkedin_url','')),
          region = coalesce(region, v_region)
        where id = v_lead_id;
        n_updated := n_updated + 1;
      end if;
    exception when others then
      n_invalid := n_invalid + 1;
      errs := errs || jsonb_build_object('row', r, 'error', sqlerrm);
    end;
  end loop;

  update public.lead_imports set inserted = n_inserted, updated = n_updated, skipped_dnc = n_dnc,
         skipped_invalid = n_invalid, errors = errs where id = imp_id;

  return jsonb_build_object('import_id', imp_id, 'inserted', n_inserted, 'updated', n_updated,
                            'skipped_dnc', n_dnc, 'skipped_invalid', n_invalid, 'errors', errs);
end; $$;

create or replace function public.set_lead_status(p_lead uuid, p_status text, p_reason text default null, p_next_action timestamptz default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.can_write() then raise exception 'Not authorised'; end if;
  update public.leads set status = p_status, status_reason = p_reason, next_action_at = p_next_action where id = p_lead;
end; $$;

create or replace function public.bulk_set_status(p_leads uuid[], p_status text, p_reason text default null)
returns int language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if not public.can_write() then raise exception 'Not authorised'; end if;
  update public.leads set status = p_status, status_reason = p_reason where id = any(p_leads) and status <> 'dnc';
  get diagnostics n = row_count;
  return n;
end; $$;

-- Dashboard views
create or replace view public.lead_counts with (security_invoker = true) as
select status, tier, region, count(*)::int as n from public.leads group by status, tier, region;

create or replace view public.activity_7d with (security_invoker = true) as
select type, channel, count(*)::int as n from public.lead_events
where occurred_at > now() - interval '7 days' group by type, channel;

create or replace view public.upcoming_meetings with (security_invoker = true) as
select m.*, l.full_name, l.job_title, l.email, l.phone, c.name as company_name
from public.meetings m join public.leads l on l.id = m.lead_id left join public.companies c on c.id = l.company_id
where m.outcome in ('scheduled','confirmed') and m.scheduled_at > now() - interval '1 day'
order by m.scheduled_at;

-- Row level security
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.companies enable row level security;
alter table public.leads enable row level security;
alter table public.do_not_contact enable row level security;
alter table public.lead_imports enable row level security;
alter table public.lead_events enable row level security;
alter table public.meetings enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_approved()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy settings_select on public.settings for select to authenticated using ((select public.is_approved()));
create policy settings_admin_write on public.settings for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy companies_all on public.companies for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
create policy leads_all on public.leads for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
create policy dnc_select on public.do_not_contact for select to authenticated using ((select public.is_approved()));
create policy dnc_insert on public.do_not_contact for insert to authenticated with check ((select public.is_approved()));
create policy dnc_admin_delete on public.do_not_contact for delete to authenticated using ((select public.is_admin()));
create policy imports_all on public.lead_imports for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
create policy events_select on public.lead_events for select to authenticated using ((select public.is_approved()));
create policy events_insert on public.lead_events for insert to authenticated with check ((select public.is_approved()));
create policy meetings_all on public.meetings for all to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, delete on public.do_not_contact to authenticated;
grant select, insert, update on public.lead_imports to authenticated;
grant select, insert on public.lead_events to authenticated;
grant select, insert, update, delete on public.meetings to authenticated;
grant select on public.lead_counts, public.activity_7d, public.upcoming_meetings to authenticated;

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.import_leads(jsonb, text, text), public.set_lead_status(uuid, text, text, timestamptz),
  public.bulk_set_status(uuid[], text, text), public.rescore_all_leads(), public.set_user_access(uuid, boolean, text),
  public.is_approved(), public.is_admin(), public.is_dnc(text, text, text), public.normalize_phone(text, text),
  public.email_domain(text), public.employee_band(int), public.tier_for(int) to authenticated;

alter publication supabase_realtime add table public.leads, public.lead_events, public.meetings;
