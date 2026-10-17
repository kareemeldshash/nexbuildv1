# NexBuild: launch guide (all free to start)

Stack: Cloudflare Pages (site + API) + Supabase (accounts, database, files) + Lemon Squeezy (payments).

## What changed in this build

- **Auth fixed**: `config.js` now uses the correct base Supabase URL (no `/rest/v1/`). File is named `config.js` (not `.txt`). Google + email sign-up/sign-in have clearer errors and PKCE flow.
- **Ads on the sides**: left and right sticky rails (hidden on mobile). No more mid-page ad block.
- **Homepage**: founder (admin) projects first, then community.
- **Verification**: still admin-only via `admin_verify_creator`.
- **Extras**: save-for-later (heart), recently viewed, category filters, share link, dark mode.

---

## 1. Put the code on GitHub

Create a GitHub repo and upload this whole folder.

## 2. Supabase (accounts, database, file storage)

1. supabase.com → New project. Save the database password.
2. SQL Editor → New query → paste `supabase/schema.sql` → Run.
3. Project Settings → API: copy the **Project URL** (e.g. `https://xxxxx.supabase.co`), the `anon` key and the `service_role` key (secret!).
4. Authentication → URL Configuration:
   - **Site URL** = your live site (e.g. `https://nexbuildv1.pages.dev`)
   - **Redirect URLs** add: `https://nexbuildv1.pages.dev/**` and `http://localhost:8788/**` if testing locally
   - Keep **Confirm email** ON (recommended).
5. Sign up on your site, then in SQL Editor run (use your email):

```sql
update public.profiles
set is_admin = true, verified = true
where id = (select id from auth.users where email = 'YOUR@EMAIL');
```

6. Storage: create two buckets if needed:
   - `covers` (public)
   - `files` (private — only service role / signed URLs)

## 3. Lemon Squeezy (payments)

1. Create a store. Create ONE product with ONE variant (any price, e.g. $5). Note the Store ID and Variant ID.
2. Settings → API: create an API key.
3. Settings → Webhooks: URL `https://YOUR-SITE/api/webhook`, events `order_created` and `order_refunded`, choose a signing secret.
4. Test with Test Mode first.

## 4. Edit `public/config.js`

```js
window.CFG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',   // NO /rest/v1/
  key: 'YOUR_ANON_KEY',
  owner: 'Kareem'
};
```

Never put the service-role key here.

### 4a. Enable Google sign-in

1. Supabase → Authentication → Providers → Google: enable it and copy the **Callback URL** shown there.
2. Google Cloud Console → APIs & Services → Credentials:
   - Create OAuth Client ID (Web application)
   - Authorized JavaScript origins: your site URL
   - Authorized redirect URIs: the exact Supabase callback URL from step 1
   - Copy Client ID + Client Secret into Supabase Google provider settings and Save.
3. Deploy. Google OAuth will not work until Client ID/Secret are saved in Supabase and the redirect URI matches exactly.

### 4b. Admin-only creator verification

For an existing database, run `supabase/migration_admin_verification.sql` once. Only admins can grant the verified badge from the Admin page.

## 5. Cloudflare Pages

1. Workers & Pages → Create → Pages → connect the GitHub repo.
2. Build command: none. Build output directory: `public`.
3. Settings → Variables and secrets:

| Variable | Value |
|----------|--------|
| SUPABASE_URL | https://xxxxx.supabase.co |
| SUPABASE_ANON_KEY | anon key |
| SUPABASE_SERVICE_KEY | service_role key |
| LS_API_KEY | Lemon Squeezy API key |
| LS_STORE_ID | store id |
| LS_VARIANT_ID | variant id |
| LS_WEBHOOK_SECRET | webhook signing secret |
| SITE_URL | https://your-site.pages.dev |

## 6. Test before launch

1. Register two accounts (email or Google). Confirm email if required.
2. Submit a project from one, approve it from your admin account (Admin page).
3. Buy it with a Lemon Squeezy test card from the second account.
4. To test withdrawals quickly: `update purchases set available_at = now() where true;` then request a payout and mark it paid in Admin.

## 7. Ads

Side slots are already in the left and right rails (`#ad-left`, `#ad-right`). After AdSense approval:

1. Allow their domains in `public/_headers` CSP.
2. Paste the ad unit HTML into those two divs (or call `injectAds(...)` in `app.js`).

On screens under ~1100px the side rails hide automatically.

## 8. Before you go live

- Replace `[your email]` and `[your country]` in the policies (`public/app.js`).
- Add your own projects through the Sell page with your admin account.
- Turn on Lemon Squeezy live mode and re-check the webhook.

## How the money works

Seller gets 70%, NexBuild 30%. Each sale is held 7 days, then the seller can withdraw it. You pay sellers by hand (PayPal, bank, Vodafone Cash, InstaPay) and press "Mark paid". Refunded orders are removed from a seller's balance automatically if not yet paid out.
