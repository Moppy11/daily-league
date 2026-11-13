# Daily League

Compete with friends across daily games (Krillion, Wordle, Connections and more).

- **Paste to score**: paste a game's share text; the score is parsed and locked for the day.
- **Leagues**: invite by link, overall table plus one per game, monthly seasons and all-time.
- **Stats**: average, best, streaks and history per game, plus head-to-head against friends.

## Run locally

Needs Node 20+ and a Postgres database.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Put your Postgres connection string in `.env.local`, then:

```bash
npm run dev
```

Tables are created automatically on first use. Run the logic tests with `npm test`.

## Put it online (free tiers)

1. Create a Postgres database at neon.tech or supabase.com and copy its connection string.
2. Push this folder to a GitHub repository.
3. Import the repository at vercel.com and add one environment variable: `DATABASE_URL`.
4. Deploy. Share the site address with friends.

## How scoring works

Each day, for each game in a league, members who posted are ranked:
1st 10, 2nd 7, 3rd 5, 4th 4, 5th 3, 6th 2, anyone else who played 1. Ties share the better place.
Change the values in `lib/points.js`.

## Adding or fixing a game parser

Games live in `lib/games.js`. Each has a `parse(text)` that returns `{ puzzleNo, score }` or `null`.
Add a case to `test/logic.test.js` with a real share text when you change one.

## Email (password reset links)

Sign-up asks for an email address, used only for password reset links. Sending is switched on by
adding these environment variables in the Vercel project (Settings → Environment Variables):

- `RESEND_API_KEY`: an API key from resend.com
- `EMAIL_FROM`: the sender, e.g. `Daily League <hello@yourdomain.com>`, on a domain verified in Resend
- `CONTACT_EMAIL` (optional): shown on the privacy page
- `ADMIN_USERNAMES`: your username (comma-separate several) to open the `/admin` dashboard; nobody can open it until this is set
- `APP_URL` (optional): the site's address for links in emails; defaults to the Vercel production domain

Until the first two are set, the "Forgot your password?" page offers recovery codes only.
