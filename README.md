# FixMate Server

Express 5 REST API for FixMate, a platform for booking home and device repair services. It handles authentication, users, services, bookings and admin operations.

The frontend lives in a separate repository: **fixmate-client** (Next.js).

## Tech stack

- Node.js 22.12+, Express 5, TypeScript
- MongoDB with Mongoose
- Better Auth (sessions + JWT), Zod validation, Helmet, CORS

## Getting started

```bash
npm install
cp .env.example .env   # then edit the values
npm run seed           # admin, demo accounts, services and bookings (run this before the first `npm run dev`)
npm run dev
```

The API runs on [http://localhost:5000](http://localhost:5000) by default.

## Seed data

`npm run seed` is idempotent and creates:

- the admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- 3 technicians and 2 customers (password: `SEED_USER_PASSWORD`): `rafiq.technician@example.com`, `nusrat.technician@example.com`, `tanvir.technician@example.com`, `sadia.customer@example.com`, `arif.customer@example.com`
- 17 services across all 7 categories (15 approved, 1 pending, 1 rejected)
- 10 bookings covering every status, 2 of them paid (with payment records)

To seed a production database, run `npm run seed -- --allow-production` with the production `.env`.

## Environment variables

See [`.env.example`](.env.example) for the full, documented list.

| Variable             | Required | Description |
| -------------------- | -------- | ----------- |
| `NODE_ENV`           | no       | `development`, `test` or `production` (default `development`) |
| `PORT`               | no       | Port to listen on (default `5000`) |
| `CLIENT_ORIGINS`     | yes      | Comma-separated origins allowed by CORS, e.g. `http://localhost:3000` |
| `MONGODB_URI`        | yes      | MongoDB connection string |
| `MONGODB_DB_NAME`    | no       | Database name (default `fixmate`) |
| `BETTER_AUTH_SECRET` | yes      | At least 32 random characters (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL`    | yes      | Public origin the browser uses (the frontend URL, since it proxies `/api/*`) |
| `JWT_ISSUER`         | no       | Defaults to `BETTER_AUTH_URL` |
| `JWT_AUDIENCE`       | no       | Default `fixmate-api` |
| `ADMIN_EMAIL`        | seed     | Admin account created by `npm run seed` |
| `ADMIN_PASSWORD`     | seed     | Admin password (12+ characters) |
| `SEED_USER_PASSWORD` | seed     | Shared password of the demo technician and customer accounts |

Never commit `.env`; it is git-ignored.

## Scripts

| Command             | Description |
| ------------------- | ----------- |
| `npm run dev`       | Start with hot reload (tsx watch) |
| `npm run build`     | Compile TypeScript to `dist/` |
| `npm run start`     | Run the compiled server |
| `npm run typecheck` | Type-check without emitting |
| `npm run seed`      | Seed the database |
