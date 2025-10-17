
# Velvero Analytics - Starter MVP

This is a starter scaffold for Velvero Analytics (CSV -> Dashboard -> AI insights).
It contains a minimal Next.js + TypeScript + Tailwind structure with API endpoints for CSV upload and LLM insights adapter.

## What is included
- Minimal Next.js app structure (pages, components)
- API routes: /api/upload (CSV), /api/insights (LLM adapter), /api/stripe-webhook (scaffold)
- LLM adapter (supports env var driven provider selection)
- .env.example
- Basic package.json for local development (install deps and run `npm run dev`)
- Simple demo dashboard component using Recharts (static sample)

## Local setup
1. Copy `.env.example` to `.env.local` and fill any keys you have (OPENAI_API_KEY etc.).
2. `npm install`
3. `npm run dev`
4. Open http://localhost:3000

Notes:
- The project expects Node 18+.
- Payments are scaffolded but disabled unless STRIPE_SECRET_KEY is set.
