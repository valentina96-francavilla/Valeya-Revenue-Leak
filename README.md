# Valeya Intelligence

Website audit and operational workflow prototype by Valeya Studio. The repository contains Audit, Revenue Leak, a persistent-workspace API and an operational dashboard.

## Pages

- `index.html`: Valeya Audit (PageSpeed Insights / Lighthouse)
- `revenue-leak.html`: operational workflow (problem → decision → intervention → measurement)
- `dashboard.html`: “Cosa fare adesso” operational priorities
- `audit.js` / `audit.css`: Audit UI and report rendering
- `app.js` / `styles.css`: Revenue Leak UI
- `api/audit.js`: validated PageSpeed Insights proxy
- `api/intelligence.js`: authenticated persistence API
- `intelligence-client.js`: shared account/session client
- `supabase/migrations/20261021150000_valeya_intelligence_persistence.sql`: database schema and RLS policies

## Run locally

The static pages can be served locally:

```bash
python3 -m http.server 8000
```

The API routes require a Vercel-compatible runtime and configured environment variables.

## Supabase setup required before persistent data can work

**Do not use the existing Lookera database for Valeya Intelligence.** No dedicated Valeya Intelligence Supabase project was identified when this branch was prepared. Create or explicitly select a dedicated project before applying the migration. The migration has not been applied to any remote database.

Configure these Vercel environment variables for the API deployment:

- `SUPABASE_URL`: URL of the dedicated Supabase project.
- `SUPABASE_PUBLISHABLE_KEY` (preferred) or `SUPABASE_ANON_KEY`: public key used for Supabase Auth.
- `SUPABASE_SERVICE_ROLE_KEY`: secret server-side key used only by `api/intelligence.js`. Never expose this key in browser code or a `NEXT_PUBLIC_*` variable.
- `PAGESPEED_API_KEY`: Google PageSpeed Insights key used by `api/audit.js`.

Then:

1. Apply the migration in `supabase/migrations/` to the dedicated project.
2. Configure Supabase Auth site URL and allowed redirects for `https://audit.valeyastudio.it`.
3. Configure email confirmation according to the intended sign-up flow.
4. Ensure the Vercel deployment serves the new `api/intelligence.js` route.
5. Test sign-up/sign-in, scan persistence, RLS isolation, issue handoff, measurements and dashboard counts with two separate test accounts.

The frontend keeps only the authentication session in `sessionStorage`; scan reports, findings, operational issues and measurements are sent to the backend. No scan or Revenue Leak plan is stored in `localStorage` or `sessionStorage`.

## Current functionality

- PageSpeed Insights scans for one public URL per run.
- Mobile/desktop strategy and four Lighthouse category scores.
- Findings sorted by heuristic priority, with structured evidence and recommended verification steps.
- Persistent scans and findings through the authenticated API, once Supabase is configured.
- One-click creation of an operational issue from a critical finding.
- Revenue Leak's four phases, issue state, owner, dates, KPI, baseline/target and measurement history.
- Operational dashboard for overdue KPI reviews, unassigned critical issues and completed work awaiting measurement.

## Important limitations

- This is an MVP, not a full-site crawler, accessibility certification or revenue attribution system.
- Lighthouse scores do not prove conversion, ranking or revenue impact.
- Priorities and recommended actions are heuristics and require validation.
- The persistence schema and API code are prepared in this branch but have **not** been deployed against a dedicated Supabase project or tested end-to-end.
- Browser interaction tests, production deployment verification and two-account RLS tests remain required.
