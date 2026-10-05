drop trigger if exists companies_rescore on public.companies;

create or replace function public.companies_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.employee_band := coalesce(new.employee_band, public.employee_band(new.employee_count));
  return new;
end; $$;
create trigger companies_before_write before insert or update on public.companies
for each row execute function public.companies_before_write();

create or replace function public.companies_rescore() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.leads set updated_at = now() where company_id = new.id;
  return new;
end; $$;
create trigger companies_rescore after update on public.companies
for each row execute function public.companies_rescore();
