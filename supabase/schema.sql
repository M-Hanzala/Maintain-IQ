create extension if not exists pgcrypto;

create table if not exists public.companies (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 1 and 120),
    issue_seq bigint not null default 1001,
    created_at timestamptz not null default now()
);

create table if not exists public.company_members (
    company_id uuid not null references public.companies(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
    created_at timestamptz not null default now(),
    primary key (company_id, user_id)
);

create table if not exists public.assets (
    company_id uuid not null references public.companies(id) on delete cascade,
    code text not null,
    name text not null,
    category text not null,
    location text not null,
    condition text not null,
    status text not null,
    last_service date,
    next_service date,
    created_at date not null,
    public_token uuid not null default gen_random_uuid(),
    version integer not null default 1 check (version > 0),
    primary key (company_id, code),
    unique (public_token)
);

create table if not exists public.issues (
    company_id uuid not null references public.companies(id) on delete cascade,
    id text not null,
    asset_code text not null,
    title text not null,
    category text not null,
    priority text not null,
    status text not null,
    reporter text not null,
    assignee text not null default '',
    description text not null,
    causes text not null default '',
    checks text not null default '',
    reported_at date not null,
    maintenance jsonb,
    version integer not null default 1 check (version > 0),
    primary key (company_id, id),
    foreign key (company_id, asset_code)
        references public.assets(company_id, code) on delete restrict
);

create table if not exists public.history (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    asset_code text not null,
    actor text not null,
    action text not null,
    issue_id text,
    at date not null,
    foreign key (company_id, asset_code)
        references public.assets(company_id, code) on delete restrict
);

create index if not exists company_members_user_id_idx on public.company_members(user_id);
create index if not exists assets_company_id_idx on public.assets(company_id);
create index if not exists issues_company_id_idx on public.issues(company_id);
create index if not exists history_company_id_at_idx on public.history(company_id, at desc);

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select exists (
        select 1
        from public.company_members
        where company_id = target_company_id
          and user_id = auth.uid()
    );
$$;

revoke all on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;

create or replace function public.register_company(company_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    new_company_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;
    if company_name is null or length(trim(company_name)) not between 1 and 120 then
        raise exception 'Company name must be between 1 and 120 characters';
    end if;

    insert into public.companies(name) values (trim(company_name))
    returning id into new_company_id;

    insert into public.company_members(company_id, user_id, role)
    values (new_company_id, auth.uid(), 'owner');

    return new_company_id;
end;
$$;

revoke all on function public.register_company(text) from public, anon;
grant execute on function public.register_company(text) to authenticated;

create or replace function public.next_company_issue_id(target_company_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    next_number bigint;
begin
    if auth.uid() is null or not public.is_company_member(target_company_id) then
        raise exception 'Company membership required';
    end if;

    update public.companies
    set issue_seq = issue_seq + 1
    where id = target_company_id
    returning issue_seq - 1 into next_number;

    if next_number is null then
        raise exception 'Company not found';
    end if;
    return 'ISS-' || next_number::text;
end;
$$;

revoke all on function public.next_company_issue_id(uuid) from public, anon;
grant execute on function public.next_company_issue_id(uuid) to authenticated;

create or replace function public.advance_company_issue_sequence(target_company_id uuid, minimum_next bigint)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null or not public.is_company_member(target_company_id) then
        raise exception 'Company membership required';
    end if;
    if minimum_next < 1001 then
        raise exception 'Invalid issue sequence';
    end if;
    update public.companies
    set issue_seq = greatest(issue_seq, minimum_next)
    where id = target_company_id;
end;
$$;

revoke all on function public.advance_company_issue_sequence(uuid, bigint) from public, anon;
grant execute on function public.advance_company_issue_sequence(uuid, bigint) to authenticated;

create or replace function public.handle_new_user_company()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    new_company_id uuid;
    company_name text;
begin
    company_name := trim(coalesce(new.raw_user_meta_data ->> 'company_name', ''));
    if length(company_name) not between 1 and 120 then
        raise exception 'A valid company name is required';
    end if;

    insert into public.companies(name) values (company_name)
    returning id into new_company_id;

    insert into public.company_members(company_id, user_id, role)
    values (new_company_id, new.id, 'owner');

    return new;
end;
$$;

drop trigger if exists on_auth_user_company_created on auth.users;
create trigger on_auth_user_company_created
after insert on auth.users
for each row execute function public.handle_new_user_company();

create or replace function public.get_public_asset(public_identifier text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select jsonb_build_object(
        'code', a.code,
        'name', a.name,
        'category', a.category,
        'location', a.location,
        'condition', a.condition,
        'status', a.status,
        'lastService', a.last_service,
        'nextService', a.next_service,
        'publicToken', a.public_token,
        'history', coalesce((
            select jsonb_agg(jsonb_build_object('action', recent.action, 'at', recent.at) order by recent.at desc)
            from (
                select h.action, h.at
                from public.history h
                where h.company_id = a.company_id
                  and h.asset_code = a.code
                  and (h.action like 'Asset registered%' or h.action like 'Issue reported%' or h.action like 'Status updated%')
                order by h.at desc
                limit 5
            ) recent
        ), '[]'::jsonb)
    )
    from public.assets a
    where a.public_token::text = public_identifier
       or (
            a.code = public_identifier
            and (select count(*) from public.assets duplicate where duplicate.code = public_identifier) = 1
       )
    limit 1;
$$;

revoke all on function public.get_public_asset(text) from public;
grant execute on function public.get_public_asset(text) to anon, authenticated;

create or replace function public.submit_public_issue(
    public_identifier text,
    issue_title text,
    issue_category text,
    reporter_name text,
    issue_description text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    target public.assets%rowtype;
    new_issue_id text;
begin
    if length(trim(coalesce(issue_title, ''))) not between 1 and 160
       or length(trim(coalesce(issue_category, ''))) not between 1 and 80
       or length(trim(coalesce(reporter_name, ''))) not between 1 and 120
       or length(trim(coalesce(issue_description, ''))) not between 1 and 4000 then
        raise exception 'Please provide a valid title, category, reporter, and description';
    end if;

    select * into target
    from public.assets a
    where a.public_token::text = public_identifier
       or (
            a.code = public_identifier
            and (select count(*) from public.assets duplicate where duplicate.code = public_identifier) = 1
       )
    limit 1;

    if not found then
        raise exception 'Asset not found';
    end if;
    if target.status = 'Retired' then
        raise exception 'This asset is retired and cannot receive reports';
    end if;

    update public.companies
    set issue_seq = issue_seq + 1
    where id = target.company_id
    returning 'ISS-' || (issue_seq - 1)::text into new_issue_id;
    insert into public.issues(
        company_id, id, asset_code, title, category, priority, status, reporter,
        assignee, description, causes, checks, reported_at, maintenance
    ) values (
        target.company_id, new_issue_id, target.code, trim(issue_title), trim(issue_category),
        'Medium', 'Reported', trim(reporter_name), '', trim(issue_description), '', '', current_date, null
    );
    update public.assets
    set status = 'Issue Reported', version = version + 1
    where company_id = target.company_id and code = target.code;
    insert into public.history(company_id, asset_code, actor, action, issue_id, at)
    values (target.company_id, target.code, trim(reporter_name), 'Issue reported: ' || trim(issue_title), new_issue_id, current_date);

    return new_issue_id;
end;
$$;

revoke all on function public.submit_public_issue(text, text, text, text, text) from public;
grant execute on function public.submit_public_issue(text, text, text, text, text) to anon, authenticated;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.assets enable row level security;
alter table public.issues enable row level security;
alter table public.history enable row level security;

drop policy if exists companies_read_member on public.companies;
create policy companies_read_member on public.companies
for select to authenticated
using (public.is_company_member(id));

drop policy if exists members_read_self on public.company_members;
create policy members_read_self on public.company_members
for select to authenticated
using (user_id = auth.uid());

drop policy if exists assets_read_member on public.assets;
create policy assets_read_member on public.assets
for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists assets_create_member on public.assets;
create policy assets_create_member on public.assets
for insert to authenticated
with check (public.is_company_member(company_id));
drop policy if exists assets_update_member on public.assets;
create policy assets_update_member on public.assets
for update to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists issues_read_member on public.issues;
create policy issues_read_member on public.issues
for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists issues_create_member on public.issues;
create policy issues_create_member on public.issues
for insert to authenticated
with check (public.is_company_member(company_id));
drop policy if exists issues_update_member on public.issues;
create policy issues_update_member on public.issues
for update to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists history_read_member on public.history;
create policy history_read_member on public.history
for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists history_create_member on public.history;
create policy history_create_member on public.history
for insert to authenticated
with check (public.is_company_member(company_id));

revoke all on public.companies, public.company_members, public.assets, public.issues, public.history from public, anon, authenticated;
grant select on public.companies, public.company_members to authenticated;
grant select, insert, update on public.assets, public.issues to authenticated;
grant select, insert on public.history to authenticated;
grant usage on schema public to anon, authenticated;
