# GBS Website

A modular static website for **GBS / Growers Breeders Smokers**.

It is built to be easy to expand with:

- Breeding and project boards
- Discord bot pages and command lists
- Games and experiments
- Painting Room collaborative mural
- Smoke report form and local archive
- Resource library
- Custom expansion sections
- Age gate
- Discord call-to-action
- Local content manager with JSON export/import

## Files

```text
index.html                 Main website
painting-room/index.html   Persistent mural / drawing room
admin.html                 Local content manager
assets/css/styles.css      All styling
assets/js/content.js       Main editable website content
assets/js/app.js           Public website behavior
assets/js/painting-room.js Painting Room canvas tools, persistence, snapshots
assets/js/vendor/fabric.min.js Vendored Fabric.js canvas editor runtime
assets/js/admin.js         Content manager behavior
assets/img/favicon.svg     Site icon
api/painting/*.js          Vercel serverless Painting Room save/admin/moderation routes
api/_painting.js           Shared Supabase service-role helpers for server routes
src/lib/supabaseClient.js  Supabase browser client for Vite builds
supabase/painting-room.sql Supabase tables, RLS policies, and Storage policies
vite.config.js             Vite multi-page build config
package.json               Vercel/Vite build scripts and dependencies
```

## How to run locally

Install dependencies:

```bash
npm install
```

Run the Vite dev server:

```bash
npm run dev
```

Build the Vercel output:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

```text
http://localhost:5173/
http://localhost:5173/painting-room/
```

## Painting Room

The Painting Room is a static-site collaborative art wall at:

```text
painting-room/
```

It uses Fabric.js for canvas editing and Supabase for deployed shared persistence.

Supabase stores:

- `painting_walls.canvas_json` for the shared Fabric object state
- `painting_walls.version` for conflict checks
- `painting_walls.preview_image_url` for the latest wall preview
- `painting_snapshots` for named wall moments
- `painting_assets` plus Supabase Storage for imported images
- `painting_reports` for visitor reports
- `moderation_logs` for admin reset, restore, asset, object, and report actions
- `admin_users` for admin role checks by authenticated `auth.users.id`
- `rate_limits` for database-backed server-side throttling

Public visitors can draw anonymously. Image uploads require Supabase Auth login. Imported images are compressed/resized in the browser, uploaded to the public `painting-room-assets` bucket by authenticated users, and stored in canvas JSON as public URLs. The app rejects embedded base64 images on shared saves unless the user logs in and the image can be moved to Supabase Storage.

Privileged actions run through Vercel serverless API routes:

- `POST /api/painting/save` public, rate-limited shared wall save with version checks and destructive-save protection
- `POST /api/painting/upload-asset` authenticated, rate-limited image upload to Supabase Storage
- `POST /api/painting/snapshot` public, rate-limited snapshot creation
- `POST /api/painting/report` public, rate-limited report creation with evidence snapshot
- `POST /api/painting/reset` admin-only reset with backup snapshot and moderation log
- `POST /api/painting/restore` admin-only restore with backup snapshot and moderation log
- `POST /api/painting/moderate-object` admin-only hide, lock, unlock, unhide, or delete object
- `POST /api/painting/review-report` admin-only report review
- `POST /api/painting/delete-snapshot` admin-only snapshot deletion
- `POST /api/painting/delete-asset` admin-only asset moderation/storage deletion
- `GET /api/painting/admin-data` admin-only moderation dashboard data

The Supabase service role key is only read by these serverless routes and must never be exposed to frontend code.

If Supabase env vars are missing or Supabase fails, the page stays usable and shows:

```text
Shared persistence is not connected. This wall is currently saving only in this browser.
```

Fallback mode stores the wall locally under:

```text
gbs_painting_wall_v1
```

## Supabase Setup

1. Create a Supabase project.
2. Enable Supabase Auth. Magic-link login works with the built-in Painting Room login form.
3. Run the full SQL in:

```text
supabase/painting-room.sql
```

4. Confirm the `painting-room-assets` Storage bucket exists and is public.
5. Confirm Storage policies allow public reads and authenticated uploads for `painting-room-assets`.
6. If Realtime does not emit updates, enable Realtime for `public.painting_walls` in Supabase. Polling still checks for updates every few seconds.
7. Copy your Project URL, anon public key, and service role key from Supabase Project Settings.

Do not put the service role key in frontend code.

## How to make yourself admin

1. Deploy or run the site with Supabase connected.
2. Open `/painting-room/`.
3. Use the Account panel to send yourself a login link and sign in once.
4. In Supabase, open Authentication -> Users and copy your user ID.
5. Run this in Supabase SQL Editor:

```sql
insert into public.admin_users (user_id, role)
values ('YOUR-USER-ID-HERE', 'admin')
on conflict (user_id) do update set role = 'admin';
```

Refresh the Painting Room. You should see the Admin badge and Admin panel.

## Vercel Setup

In Vercel Project Settings -> Environment Variables, add public frontend variables:

```text
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_public_key
```

Add server-only variables:

```text
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Optional future Redis rate-limit variables are listed in `.env.example`, but the current implementation uses the Supabase `rate_limits` table so Upstash is not required.

Use:

```text
Build Command: npm run build
Output Directory: dist
```

Then redeploy.

## Painting Room acceptance test

1. Open `/painting-room/` in Browser A while logged out.
2. Draw several strokes and wait for autosave to show Saved.
3. Refresh Browser A. The artwork should remain.
4. Open `/painting-room/` in Browser B. The same wall should load from Supabase.
5. While logged out, click image upload. It should ask you to log in.
6. Log in with Supabase Auth and upload a PNG/JPG/WebP/GIF. It should upload to Supabase Storage and save as a public URL in canvas JSON.
7. Submit a report from the Share panel.
8. Log in as an admin user. Confirm the Admin panel appears.
9. Create a snapshot, restore it, and verify a backup snapshot is created first.
10. Reset the wall as admin and verify a backup snapshot and moderation log are created.
11. Try calling admin routes without an admin token. They should return 401 or 403.
12. Confirm normal pages still load.

GitHub stores the code. Vercel runs the website. Supabase stores the Painting Room wall forever.

## How to add things permanently

Edit this file:

```text
assets/js/content.js
```

You will see arrays like:

```js
projects: [ ... ]
bots: [ ... ]
games: [ ... ]
resources: [ ... ]
customSections: [ ... ]
```

Copy one existing item, paste it below, and change the text.

## How the Content Manager works

Go to:

```text
admin.html
```

You can add projects, bots, games, and resources. These edits are saved in your browser using `localStorage`. That means they are good for drafting, testing, and organizing.

For permanent publishing:

1. Click **Download JSON** or **Copy JSON** in the Content Manager.
2. Paste the exported data back into `assets/js/content.js` as your main `window.GBS_SITE_DATA` object.
3. Commit/upload the site again.

## Smoke reports

Smoke reports entered on the site save in the browser. Export them from the Content Manager when you want to publish or archive them.

A future upgrade could connect smoke reports to:

- Supabase
- Firebase
- Airtable
- Google Sheets
- A custom Node/Express backend
- Vercel serverless functions

## Deployment options

This site is static, so it can be hosted on:

- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages
- Your own server
- Raspberry Pi / local network

For Vercel: connect the GitHub repo, set the Supabase environment variables, use `npm run build`, and deploy the generated `dist` folder.

## Design intent

The look is intentionally closer to a clean 2015 professional community site than a trendy AI landing page: dark header, strong cards, readable sections, subtle texture, simple animations, and lots of practical expansion room.

## Built-in GBS Discord link

The Discord invite used throughout the site is:

```text
https://discord.gg/YxJYnnKWHf
```

Change it inside `assets/js/content.js` and the hard-coded buttons in `index.html` if needed.
