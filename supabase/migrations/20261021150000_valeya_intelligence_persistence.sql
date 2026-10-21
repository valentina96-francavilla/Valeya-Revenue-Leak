-- Valeya Intelligence: persistent audit history and operational workflow
create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My workspace',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);

create table if not exists public.audit_scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  url text not null,
  final_url text,
  strategy text not null check (strategy in ('mobile','desktop')),
  scores jsonb not null default '[]'::jsonb,
  raw_report jsonb not null,
  lighthouse_version text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists audit_scans_workspace_created_idx on public.audit_scans(workspace_id, created_at desc);

create table if not exists public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scan_id uuid not null references public.audit_scans(id) on delete cascade,
  finding_key text not null,
  title text not null,
  description text,
  category text not null default 'other',
  priority text not null default 'low' check (priority in ('high','medium','low')),
  score numeric,
  affected_url text,
  evidence jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  raw_finding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(scan_id, finding_key)
);
create index if not exists audit_findings_workspace_priority_idx on public.audit_findings(workspace_id, priority);

create table if not exists public.revenue_leak_issues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  source_scan_id uuid references public.audit_scans(id) on delete set null,
  source_finding_id uuid references public.audit_findings(id) on delete set null,
  source_finding_key text,
  title text not null,
  description text,
  url text,
  category text not null default 'other',
  severity text not null default 'medium' check (severity in ('high','medium','low')),
  evidence jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('audit','manual')),
  state text not null default 'open' check (state in ('open','planned','in_progress','completed','awaiting_measurement','verified','archived')),
  decision jsonb not null default '{}'::jsonb,
  intervention jsonb not null default '{}'::jsonb,
  kpi_key text,
  kpi_unit text,
  kpi_direction text check (kpi_direction in ('increase','decrease','range') or kpi_direction is null),
  baseline numeric,
  target numeric,
  review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists revenue_leak_issues_workspace_state_idx on public.revenue_leak_issues(workspace_id, state, severity);
create unique index if not exists revenue_leak_issues_audit_source_unique
  on public.revenue_leak_issues(workspace_id, source_scan_id, source_finding_key)
  where source_scan_id is not null and source_finding_key is not null;

create table if not exists public.revenue_leak_measurements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  issue_id uuid not null references public.revenue_leak_issues(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  kpi_key text,
  observed_value numeric not null,
  unit text,
  measured_at timestamptz not null default now(),
  period_start date,
  period_end date,
  notes text,
  created_at timestamptz not null default now(),
  check (period_start is null or period_end is null or period_start <= period_end)
);
create index if not exists revenue_leak_measurements_issue_idx on public.revenue_leak_measurements(issue_id, measured_at desc);

-- Membership-based isolation. Every exposed table has RLS enabled.
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.audit_scans enable row level security;
alter table public.audit_findings enable row level security;
alter table public.revenue_leak_issues enable row level security;
alter table public.revenue_leak_measurements enable row level security;

create policy "members can read their workspaces" on public.workspaces
  for select to authenticated using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = public.workspaces.id and wm.user_id = (select auth.uid())
  ));
create policy "owners can create workspaces" on public.workspaces
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners can update workspaces" on public.workspaces
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "members can read workspace membership" on public.workspace_members
  for select to authenticated using (user_id = (select auth.uid()));
-- Membership writes are intentionally server-side only; do not grant client inserts.

create policy "members can read audit scans" on public.audit_scans
  for select to authenticated using (exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.audit_scans.workspace_id and wm.user_id = (select auth.uid())
  ));
create policy "members can insert audit scans" on public.audit_scans
  for insert to authenticated with check (created_by = (select auth.uid()) and exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.audit_scans.workspace_id and wm.user_id = (select auth.uid())
  ));
-- Audit scans and findings are append-only: no UPDATE or DELETE policies.

create policy "members can read audit findings" on public.audit_findings
  for select to authenticated using (exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.audit_findings.workspace_id and wm.user_id = (select auth.uid())
  ));
create policy "members can insert audit findings" on public.audit_findings
  for insert to authenticated with check (exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.audit_findings.workspace_id and wm.user_id = (select auth.uid())
  ));

create policy "members can read issues" on public.revenue_leak_issues
  for select to authenticated using (exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.revenue_leak_issues.workspace_id and wm.user_id = (select auth.uid())
  ));
create policy "members can create issues" on public.revenue_leak_issues
  for insert to authenticated with check (created_by = (select auth.uid()) and exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.revenue_leak_issues.workspace_id and wm.user_id = (select auth.uid())
  ));
create policy "members can update issues" on public.revenue_leak_issues
  for update to authenticated using (exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.revenue_leak_issues.workspace_id and wm.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.revenue_leak_issues.workspace_id and wm.user_id = (select auth.uid())
  ));

create policy "members can read measurements" on public.revenue_leak_measurements
  for select to authenticated using (exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.revenue_leak_measurements.workspace_id and wm.user_id = (select auth.uid())
  ));
create policy "members can create measurements" on public.revenue_leak_measurements
  for insert to authenticated with check (created_by = (select auth.uid()) and exists (
    select 1 from public.workspace_members wm where wm.workspace_id = public.revenue_leak_measurements.workspace_id and wm.user_id = (select auth.uid())
  ));

-- Keep the API service-role-only RPC narrow and non-public; inserts happen atomically.
create or replace function public.save_audit_scan(p_scan jsonb, p_findings jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_scan_id uuid;
  v_finding jsonb;
begin
  insert into public.audit_scans
    (workspace_id, created_by, url, final_url, strategy, scores, raw_report, lighthouse_version, generated_at)
  values
    ((p_scan->>'workspace_id')::uuid, (p_scan->>'created_by')::uuid,
     p_scan->>'url', p_scan->>'final_url', p_scan->>'strategy',
     coalesce(p_scan->'scores','[]'::jsonb), p_scan->'raw_report',
     p_scan->>'lighthouse_version', coalesce((p_scan->>'generated_at')::timestamptz, now()))
  returning id into v_scan_id;

  for v_finding in select value from jsonb_array_elements(coalesce(p_findings,'[]'::jsonb))
  loop
    insert into public.audit_findings
      (workspace_id, scan_id, finding_key, title, description, category, priority, score,
       affected_url, evidence, recommendation, raw_finding)
    values
      ((p_scan->>'workspace_id')::uuid, v_scan_id, coalesce(v_finding->>'id','unknown'),
       coalesce(v_finding->>'title','Untitled finding'), v_finding->>'description',
       coalesce(v_finding->>'category','other'), coalesce(v_finding->>'priority','low'),
       nullif(v_finding->>'score','')::numeric, v_finding->>'url',
       coalesce(v_finding->'evidence','{}'::jsonb),
       coalesce(v_finding->'recommendation','{}'::jsonb), v_finding);
  end loop;
  return v_scan_id;
end;
$$;

revoke all on function public.save_audit_scan(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_audit_scan(jsonb, jsonb) to service_role;

grant select on public.workspaces, public.workspace_members, public.audit_scans, public.audit_findings,
  public.revenue_leak_issues, public.revenue_leak_measurements to authenticated;
grant insert on public.workspaces, public.audit_scans, public.audit_findings,
  public.revenue_leak_issues, public.revenue_leak_measurements to authenticated;
grant update on public.workspaces, public.revenue_leak_issues to authenticated;
grant all on public.workspaces, public.workspace_members, public.audit_scans, public.audit_findings, public.revenue_leak_issues, public.revenue_leak_measurements to service_role;
