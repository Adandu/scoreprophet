# ScoreProphet

ScoreProphet is a private World Cup 2026 prediction app. Players predict match outcomes, exact scores, and knockout advancing teams; admins sync fixtures from football-data.org, enter or override results, and recalculate points.

Players compete inside admin-managed championships. A user can belong to multiple championships, and one prediction set counts in every championship where that user is a member.

## Stack

- Next.js App Router
- React 19
- Prisma 7 with SQLite and `better-sqlite3`
- `iron-session` cookie sessions
- Tailwind CSS
- Vitest

## Environment

Create `.env` from `.env.example` and set:

```bash
DATABASE_URL="file:./dev.db"
FOOTBALL_API_KEY="..."
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="at_least_6_chars"
SESSION_SECRET="at_least_32_characters_random_string"
```

`ADMIN_USERNAME` and `ADMIN_PASSWORD` are used only when registering the initial admin account. A matching username/password pair creates an admin user; later logins do not promote users based on the shared password.

## Local Development

```bash
npm install
DATABASE_URL="file:./dev.db" npx prisma migrate dev
DATABASE_URL="file:./dev.db" npm run sync
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Scoring

- Exact score: 5 points
- Single result: 3 points
- Double chance: 1 point
- Correct knockout advancing team: 1 point

Predictions lock at kickoff. Users may reset predictions for a match until kickoff.

Prediction, Results, and Leaderboard pages are championship-scoped. Users without an active championship membership only see Home, Tournament, and Teams.

## Admin Flow

Admins can:

- Create and manage championships
- Assign users to championships
- Sync fixtures and teams from football-data.org
- Override final scores
- Select the advancing team for knockout matches
- Recalculate all finished-match points
- Remove non-admin users

Sync updates mutable fixture fields such as team names, crests, stage, group, kickoff, status, and scores.

## Deployment

The Docker image runs Prisma migrations, attempts a fixture/team sync, then starts the standalone Next.js server.

```bash
docker compose up -d --build
```

The Compose file stores SQLite data in the `scoreprophet_data` volume at `/data/scoreprophet.db`.
