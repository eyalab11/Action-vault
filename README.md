# ActionVault — MVP

Turn saved links into summaries and action plans.

## What this is

Paste any link (YouTube, TikTok, Instagram, web). Get back:
- A clean title and 2-3 sentence summary
- Category and tags
- Concrete action steps (if the content is actionable)

## Stack

| Layer | Choice |
|---|---|
| Mobile | Expo managed workflow (React Native) |
| Backend | Node.js + Express |
| Database | Supabase (Postgres + Auth) |
| AI | OpenAI GPT-4o |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run `db/migrations/001_mvp_schema.sql`
3. Copy your project URL and keys from Settings → API

### 2. Backend

```bash
cd services/api
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
npm install
npm run dev
# Runs on http://localhost:3001
```

Test it:
```bash
curl http://localhost:3001/health
# {"ok":true,"ts":"..."}
```

### 3. Mobile app

```bash
cd apps/mobile
cp .env.example .env
# Fill in EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npx expo start
# Press i for iOS simulator, a for Android
```

## Project structure

```
services/api/
  src/
    index.ts              — Express server entry point
    routes/
      analyze.ts          — POST /analyze (core endpoint)
      items.ts            — GET/PATCH/DELETE /items
    lib/
      auth.ts             — JWT middleware
      supabase.ts         — DB client
      metadata.ts         — oEmbed + OG scraper
      ai-pipeline.ts      — GPT-4o analysis + action extraction
    prompts/
      analyze.ts          — Prompt templates and output contracts

apps/mobile/
  app/
    _layout.tsx           — Root layout (QueryClient + auth listener)
    auth.tsx              — Sign in / sign up screen
    (tabs)/
      _layout.tsx         — Tab navigator
      add.tsx             — Add Link screen (primary input)
      library.tsx         — All saved items
    items/[id].tsx        — Item detail + action steps

db/
  migrations/
    001_mvp_schema.sql    — users, items, action_tasks tables + RLS
```

## API

```
POST /analyze           { url, manual_note? }  →  { item }
GET  /items             ?status&category        →  { items, total }
GET  /items/:id                                 →  { item }
PATCH /items/:id        { status, manual_note, title }
DELETE /items/:id
PATCH /items/:id/tasks/:taskId  { status }
```

## V2 (not in MVP)

- Share extension (iOS Swift + Android intent filter)
- Embeddings + clustering (pgvector, similar item grouping)
- Background job queue (BullMQ + Redis)
- Push notifications
- Semantic search
