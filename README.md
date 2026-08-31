# Dungeon Crawl

Multi-tenant OSRS challenge board site (working name `bingo-bot`, domain `dungeoncrawl.lol`). Hosts create their own boards/challenges; players complete tiles ("rooms") tracked via a Dink webhook intake, similar in spirit to the Bingo feature in the `rs` (Twenty Six) repo but built multi-tenant from day one.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- Supabase (Postgres + Auth, per-host RLS)
- Deployed on Vercel

## Setup

```bash
npm install
cp .env.example .env.local # fill in Supabase project URL/anon key
npm run dev
```
