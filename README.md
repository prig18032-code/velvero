Velvero SaaS — Supabase-enabled MVP
==================================

This package runs a small Node.js app that accepts CSV uploads, calculates KPIs,
shows charts, and can save reports to Supabase (if you configure env vars).

Quick local run (PowerShell):

1. Unzip this project to a folder, e.g. F:\velvero-saas-supabase
2. Open PowerShell and cd to that folder
3. Copy the example .env.example to .env and fill your Supabase values (optional)
   copy .env.example .env
   (edit .env with your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
4. Install dependencies:
   npm install
5. Start server:
   npm start
6. Open browser: http://localhost:3000
7. Upload sample_retail.csv to see the demo.
8. If you configured Supabase and created the reports table (SQL provided),
   you can Save report from the page (enter an email).

Supabase setup (brief):
- Create free project at https://app.supabase.com
- From SQL Editor, run the SQL in supabase/create_reports_table.sql
- Get Service role key from Project Settings -> API -> Service Role Key
- Put SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY into .env file

Security note:
- For production, do NOT expose service-role key to client. This app uses it on server-side only.
- Later we will implement proper auth and row-level security.

