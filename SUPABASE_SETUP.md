# Supabase setup

MaintainIQ remains a static HTML/CSS/JavaScript app. The shortest safe migration is to keep the existing UI and route data reads/writes through Supabase, with a `company_id` on every private table and PostgreSQL RLS checks against `company_members`. The Supabase JS CDN version is pinned in `index.html`.

## Configure a project

1. Create a Supabase project and keep its database password and any `service_role` key private.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy the project URL and its **publishable** key into [`supabase-config.js`](./supabase-config.js). The publishable/anon key is designed to be present in browser code; it is not a secret. Never put a `service_role` key in this file.
4. In Supabase Auth, enable email/password sign-in and configure the site URL and allowed redirect URLs for the deployed HTTPS origin. Configure SMTP for reliable confirmation and password-reset delivery.
5. Serve the app over HTTPS (or localhost during development); do not open it as a `file://` URL.

Signup creates a company and owner membership inside a database trigger. Additional companies can be registered while signed in. The UI can switch only among companies in the current user's memberships. The SQL grants no delete access to application users; tenant tables use RLS, and history is append-only.

## Existing browser data

After signing in, an account can import the existing `maintainiq_data_v1` localStorage dataset into a company. Import requires explicit confirmation, is attempted only once a company has no prior import marker, uses conflict-safe inserts, and leaves localStorage unchanged. Retrying after a partial import is safe: deterministic history IDs and conflict-ignoring imports avoid duplicates and never update an existing company row. Do not clear browser storage until the imported data has been verified.

The old “Reset demo data” action is disabled in the hosted workspace so it cannot erase company data.

## Before production launch

- Configure email verification, reset-password redirect URLs, SMTP, and Supabase backups/retention for the project.
- Test with two independent user accounts and companies: verify that neither account can read or modify the other's rows, including by changing `company_id` in browser requests. Confirm denied operations in Supabase logs.
- Verify signup, email confirmation, login, logout, password reset/update, company registration/switching, concurrent edits, legacy import, and QR/public reporting in the deployed origin.
- Public QR links use random asset tokens and narrowly scoped RPC functions. The anonymous report RPC still needs abuse protection (for example, CAPTCHA/rate limiting at an Edge Function) before exposing it broadly.
- The initial schema records owner/admin/member labels, but current write policies allow every company member to edit company data. An invitation/role-management UI and operational monitoring are not included in this migration.
