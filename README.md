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
npm run seed           # optional: seed sample data and the admin account
npm run dev
```

The API runs on [http://localhost:5000](http://localhost:5000) by default.

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

Never commit `.env`; it is git-ignored.

## Scripts

| Command             | Description |
| ------------------- | ----------- |
| `npm run dev`       | Start with hot reload (tsx watch) |
| `npm run build`     | Compile TypeScript to `dist/` |
| `npm run start`     | Run the compiled server |
| `npm run typecheck` | Type-check without emitting |
| `npm run seed`      | Seed the database |
