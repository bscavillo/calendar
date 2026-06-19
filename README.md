# 💜 Our Calendar

A private shared calendar for two people. See each other's appointments and plans at a glance,
add events, mark some as shared, and get reminders before they start.

Built with **React + Vite** on the frontend and **Supabase** (free tier) for auth, database, and
realtime sync.

## Features

- 🔐 Simple email/password login for the two of you
- 🗓️ Month view with everyone's events, color-coded:
  - **Purple** = your events
  - **Blue** = your partner's events
  - **Purple→blue gradient** = shared events (date night, trips…)
- ✏️ Add / edit / delete your own events (you can't edit each other's — only view)
- 💞 Mark events as **shared**
- ⚡ Live sync — when one of you changes something, the other sees it instantly
- 🔔 Browser reminders before an event

> **Reminder caveat:** reminders fire as browser notifications **while the app tab is open**.
> Notifications when the app is fully closed would need a paid backend / push service, which the
> free tier can't run reliably.

---

## Setup (about 10 minutes, one time)

### 1. Create a free Supabase project
1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Click **New project**. Give it a name and a database password, pick a region near you, create it.

### 2. Run the database schema
1. In your project, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase_schema.sql`](./supabase_schema.sql) and click **Run**.

### 3. Connect the app
1. In Supabase: **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
2. In this folder, copy `.env.example` to `.env` and paste those two values in:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

### 4. (Optional but recommended) Turn off email confirmation for just the two of you
In Supabase: **Authentication → Providers → Email**, you can disable "Confirm email" so you can sign
in immediately after signing up. Then under **Authentication → Sign in / Providers**, you may also
turn off new public sign-ups after both of you have created accounts, to keep it private.

### 5. Run it
```bash
npm install
npm run dev
```
Open the printed URL (default http://localhost:5173). Each of you signs up once, then signs in.

---

## Deploying so you can both reach it from anywhere

The app is a static site, so it deploys free on **Vercel**, **Netlify**, or **Cloudflare Pages**:
- Build command: `npm run build`
- Output directory: `dist`
- Add the two `VITE_SUPABASE_*` environment variables in the host's dashboard.

(Vercel: `vercel` → follow prompts, or import the GitHub repo.)

---

## Project structure

```
src/
  lib/supabaseClient.js   – Supabase connection
  hooks/useEvents.js      – fetch + realtime subscription for events
  hooks/useReminders.js   – browser notification scheduling
  components/
    Login.jsx             – sign in / sign up
    CalendarView.jsx      – month grid + navigation
    EventModal.jsx        – view / create / edit / delete an event
    SetupNotice.jsx       – shown until .env is configured
supabase_schema.sql       – run this in Supabase once
```
