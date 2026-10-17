# NexBuild: launch guide (all free to start)

Stack: Cloudflare Pages (site + API) + Supabase (accounts, database, files) + Lemon Squeezy (payments).

## 1. Put the code on GitHub
Create a GitHub repo and upload this whole folder.

## 2. Supabase (accounts, database, file storage)
1. supabase.com > New project. Save the database password.
2. SQL Editor > New query > paste `supabase/schema.sql` > Run.
3. Project Settings > API: copy the Project URL, the `anon` key and the `service_role` key (secret!).
4. Authentication > URL Configuration: set Site URL to your site address (step 5). Keep "Confirm email" ON.
5. Sign up on your site, then in SQL Editor run (use your email):
   `update public.profiles set is_admin = true, verified = true where id = (select id from auth.users where email = 'YOUR@EMAIL');`

## 3. Lemon Squeezy (payments)
1. Create a store. Create ONE product with ONE variant (any price, e.g. $5). Note the Store ID and Variant ID.
2. Settings > API: create an API key.
3. Settings > Webhooks: URL `https://YOUR-SITE/api/webhook`, events `order_created` and `order_refunded`, choose a signing secret.
4. Test with Test Mode first. Check that checkout accepts the per-project price (`custom_price`). If it does not, tell me and I will switch to one product per project.

## 4. Edit `public/config.js`
Put your Supabase URL and anon key. Never put the service key here.

## 5. Cloudflare Pages
1. Workers & Pages > Create > Pages > connect the GitHub repo.
2. Build command: none. Build output directory: `public`.
3. Settings > Variables and secrets (mark the keys as secret):
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `LS_API_KEY`, `LS_STORE_ID`, `LS_VARIANT_ID`, `LS_WEBHOOK_SECRET`, `SITE_URL` (e.g. https://nexbuild.pages.dev)

## 6. Test before launch
1. Register two accounts. Submit a project from one, approve it from your admin account (Admin page).
2. Buy it with a Lemon Squeezy test card from the second account. The sale should show as Pending for 7 days.
3. To test withdrawals quickly, in the SQL editor: `update purchases set available_at = now() where true;`, then request a payout and mark it paid in Admin.

## 7. Before you go live
- Fill `[your email]` and `[your country]` in the policies (`public/app.js`) and have a lawyer check them.
- Add your own projects through the Sell page with your admin account. They show on the home page.
- Ads: apply to Google AdSense after launch (needs a real domain and content). Then allow its domains in `public/_headers` and paste its code into the `ad()` function in `public/app.js`.
- Turn on Lemon Squeezy live mode and re-check the webhook.

## How the money works
Seller gets 70%, NexBuild 30%. Each sale is held 7 days, then the seller can withdraw it. You pay sellers by hand (PayPal, bank, Vodafone Cash, InstaPay) and press "Mark paid". Refunded orders are removed from a seller's balance automatically if not yet paid out.
