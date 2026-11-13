# After buying the domain

A checklist for when Daily League gets its own address (planned: `dailyleague.app`, $9.99/year on
Vercel, available as of 13 Nov 2026). Until then everything works on `daily-league-alpha.vercel.app`,
except that password reset emails aren't sent (recovery codes still work).

Claude can do steps 1, 2, 4 (records), 5 and 7 through the Vercel connection; steps 3 and 6 need you.

## 1. Buy and connect the domain
- Vercel → project `daily-league` → Settings → Domains → buy `dailyleague.app`.
  Vercel needs the registrant's name, email, phone and postal address. Auto-renew is on by default.
- Add `dailyleague.app` (and `www.dailyleague.app` redirecting to it) to the project.
- Nothing in the code needs changing: links in emails and push notifications use Vercel's
  production domain automatically.

## 2. Tell friends
- The old `daily-league-alpha.vercel.app` address keeps working, but logins are per address,
  so people will need to log in once on the new one. Installed home-screen apps should be
  removed and re-added from the new address.
- Push notifications have to be switched on again on each device (Settings → Notifications).

## 3. Create a Resend account (you)
- Sign up at resend.com (free tier: about 3,000 emails a month).
- Domains → Add domain → `dailyleague.app`. Resend shows 3–4 DNS records (TXT/MX/CNAME).

## 4. Add Resend's DNS records
- Vercel → Domains → `dailyleague.app` → DNS records: add each record Resend lists, then press
  Verify in Resend. (Record values aren't secret; Claude can add them if you paste them.)

## 5. Environment variables (Vercel → project → Settings → Environment Variables, Production)
| Name | Value | Who |
|---|---|---|
| `RESEND_API_KEY` | API key from Resend → API Keys | **You** (it's a secret: don't paste it into chat) |
| `EMAIL_FROM` | `Daily League <hello@dailyleague.app>` | Claude or you |
| `CONTACT_EMAIL` | an address of yours for the privacy page (optional) | Claude or you |
| `APP_URL` | `https://dailyleague.app` (optional; Vercel's production domain is used if unset) | Claude or you |

Already set: `DATABASE_URL`, `ADMIN_USERNAMES=moppy11`.

## 6. Check it works (you)
- Redeploy (Deployments → latest → Redeploy) so the new variables are picked up.
- Log out, press "Forgot your password?", and confirm the email arrives (check spam the first time).

## 7. Nice to have afterwards
- One-tap sign-in (suggested in an outside review): "Sign in with Google" needs a free Google Cloud
  OAuth app with the domain as its redirect address; "magic link" sign-in by email needs Resend set up
  (steps 3–6). Either cuts sign-up friction for friends opening an invite on their phone. If the app ever
  goes to the App Store with Google sign-in, Apple also requires "Sign in with Apple".
- Link previews already work and switch to the new address automatically; after the move, re-share an
  invite link in a chat to check the preview.
- Privacy page: add `CONTACT_EMAIL` so people can reach you.
- If you later go for the App Store: Apple needs a support URL and privacy policy URL on the
  domain (`/privacy` already exists).
