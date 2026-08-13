# Recime

A friendlier take on [grocy](https://grocy.info)'s stock tracking, built for one
household and one job: knowing what's in the kitchen, what needs eating, and
getting the shopping put away fast.

By default everything lives in a single SQLite file. Set `DATABASE_URL` to use
PostgreSQL instead. No hosted service or sync layer is required.

## Signing in

The first account is created automatically the first time the app runs. Before
starting it, copy `.env.example` to `.env.local` and choose the username and
password there.

Change it under **Settings → People → Password**, and add accounts for everyone
else from the same screen. Everyone has the same powers — there are no admins,
it's a shared kitchen. Passwords are stored as scrypt hashes, sessions live in
the database, and removing someone signs them out everywhere immediately.

Set `RECIME_SEED_USERNAME` and `RECIME_SEED_PASSWORD` **before the first run**.
Once the database exists the seed never runs again, so deleting or renaming that
account sticks.

## What it does

- **Places** — Fridge, Freezer, Pantry, Cupboard, Fruit & veg and Drinks come set
  up out of the box. Add, rename, reorder or delete them in Settings.
- **What's in there** — every place lists what's inside, ordered by what goes off
  first, with filters for "use soon" and "out of date".
- **Eat these first** — the home screen leads with anything near or past its
  date. The threshold is configurable (5 days by default).
- **Scan to put away** — point the phone at a barcode and it's filed. Things
  you've bought before go straight in with their usual place and shelf life
  (**Fast mode**); anything new is looked up in Open Food Facts so the name,
  brand and photo fill themselves in.
- **Shopping list** — add things by hand, or let items with a minimum stock level
  add themselves. Scanning something back in ticks it off the list.
- **Reminders** — one push notification a day listing what needs eating, on
  whichever phones you've turned it on for. It arrives even when the app is
  closed, and nothing is sent on days when there's nothing to say.
- **History** — every add, use and bin is logged under Settings → Recent changes.

## Reminders

Turn them on per device under **Settings → Reminders**. Each phone or computer
has to be switched on separately (that's how the Web Push API works — a
subscription belongs to a browser, not an account). The time of day and the
on/off switch are shared by the household.

**It has to be served over HTTPS.** Notifications, like the camera, are only
available in a secure context. See "Using it on your phone" below.

| Platform | Works? |
| --- | --- |
| Android — Chrome, Edge, Firefox | Yes, straight from the browser |
| Desktop — Chrome, Edge, Firefox, Safari 16+ | Yes |
| **iPhone / iPad — Safari 16.4+** | **Only after "Add to Home Screen"** and opening it from there |

That iOS restriction is Apple's, not something the app can work around; Settings
shows an explainer when it detects it. Once installed, iOS delivers reminders
like any other app notification.

There's a **Test it** button that sends only to the current device, and **Send to
everyone** which sends the real digest to every subscribed device now.

### How sending works

VAPID keys are generated on first run and stored in the database, so there is
nothing to configure — but they must not be deleted, or every existing
subscription stops working. A timer inside the server checks every five minutes
whether today's digest is due and unsent; it catches up if the machine was
asleep at the scheduled time. Subscriptions that the push service reports as
gone (uninstalled app, cleared browser data) are deleted automatically.

Reminders only fire while the server is running, so keep `npm run start:phone`
alive — a `launchd` job or `pm2` is the usual way.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The database is created on first run at
`data/recime.db`.

### Using it on your phone

The barcode scanner and the reminders both need a secure context, and browsers
only grant that over `localhost` or HTTPS — a plain `http://192.168.x.x` address
will not work. Start the server with a self-signed certificate instead:

```bash
npm run dev:phone
```

Next prints an `https://<your-ip>:3000` address. Open that on your phone, accept
the certificate warning once, and the camera will work. Then use **Share → Add to
Home Screen** so it launches full-screen without browser chrome — that's what
makes it feel like an app rather than a website.

For everyday use, build once and run the production server:

```bash
npm run build
npm run start:phone
```

### Backing up

With the default SQLite setup, copy `data/recime.db` somewhere safe. Deleting
it resets the app to a fresh, empty state with the default places. Back up a
PostgreSQL deployment using your provider's or PostgreSQL's normal tools.

To try the app with realistic contents, use **Settings → Add example groceries**.

## How it's put together

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React Server Components) |
| Database | SQLite via `better-sqlite3`, or PostgreSQL via `pg` when `DATABASE_URL` is set |
| Writes | Server Actions in `src/lib/actions.ts`, validated with Zod |
| Reads | Plain SQL in `src/lib/queries.ts`, server-only |
| UI | Tailwind v4 + shadcn/ui, mobile-first |
| Barcodes | Native `BarcodeDetector`, falling back to ZXing on iOS Safari |
| Lookups | Open Food Facts, cached for 30 days, proxied via `/api/lookup` |
| Accounts | Cookie sessions in the selected database, scrypt password hashes (`node:crypto`) |
| Reminders | Web Push (VAPID) via `web-push`, service worker in `public/sw.js` |

### Data model

- `locations` — the places you keep food.
- `products` — a thing you buy, keyed by barcode where there is one. Remembers
  its usual place, typical shelf life and minimum stock.
- `stock_entries` — a dated batch of a product in a place. Buying the same thing
  twice with different dates gives two rows, so "what goes off first" stays
  honest. Using something up consumes the oldest batch first.
- `shopping_items`, `activity`, `settings` — the list, the log, and preferences.
- `users`, `sessions` — accounts and signed-in devices.
- `push_subscriptions` — one row per browser that wants reminders.

Pages read the configured database at request time and every write calls
`revalidatePath("/", "layout")`. For a single household on one machine that is
both correct and fast enough; there is no cache to reason about.

Everything except `/login` lives in the `src/app/(app)` route group, whose layout
calls `requireUser()`. Server actions are reachable over HTTP no matter what the
UI renders, so each one re-checks the session itself rather than trusting the
layout.

### Notable files

- [`src/lib/db.ts`](src/lib/db.ts) — schema, indexes and first-run seeding
- [`src/lib/actions.ts`](src/lib/actions.ts) — every write, including FIFO consumption
- [`src/lib/auth.ts`](src/lib/auth.ts) — sessions, `requireUser`, user lookups
- [`src/lib/push.ts`](src/lib/push.ts) — VAPID keys, digest text, sending and pruning
- [`src/lib/scheduler.ts`](src/lib/scheduler.ts) — the daily timer, started from `instrumentation.ts`
- [`src/hooks/use-barcode-scanner.ts`](src/hooks/use-barcode-scanner.ts) — camera, torch and decoding
- [`src/components/scanner-screen.tsx`](src/components/scanner-screen.tsx) — the scan-and-put-away flow
- [`src/lib/food-emoji.ts`](src/lib/food-emoji.ts) — guesses an emoji from a name so lists stay scannable

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `RECIME_DB_PATH` | `./data/recime.db` | Where the database file lives |
| `DATABASE_URL` | unset | PostgreSQL connection string; when set, takes precedence over SQLite |
| `RECIME_SEED_USERNAME` | required | First account's username (first run only) |
| `RECIME_SEED_PASSWORD` | required | First account's password (first run only) |
| `RECIME_PUSH_CONTACT` | `mailto:nobody@example.com` | Contact address sent to push services |

Everything else — the household name, the expiry warning window, light/dark —
is set in the app under Settings.
