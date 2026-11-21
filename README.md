# FixMate Server

Express 5 REST API for FixMate, a platform for booking home and device repair services. It handles authentication, users, services, bookings and admin operations.

The frontend lives in a separate repository: **fixmate-client** (Next.js).

## Tech stack

- Node.js 22.12+, Express 5, TypeScript
- MongoDB with Mongoose
- Better Auth (sessions + JWT), Zod validation, Helmet, CORS
- ImgBB (image hosting, called server-side)

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
| `IMGBB_API_KEY`      | uploads  | ImgBB key for service images and profile photos (kept server-side) |
| `JWT_ISSUER`         | no       | Defaults to `BETTER_AUTH_URL` |
| `JWT_AUDIENCE`       | no       | Default `fixmate-api` |
| `ADMIN_EMAIL`        | seed     | Admin account created by `npm run seed` |
| `ADMIN_PASSWORD`     | seed     | Admin password (12+ characters) |
| `SEED_USER_PASSWORD` | seed     | Shared password of the demo technician and customer accounts |

Never commit `.env`; it is git-ignored.

## API

Private routes need `Authorization: Bearer <JWT>` (issued by Better Auth). Missing or invalid token → **401**; wrong role → **403**. Users only ever reach their own data: the email is taken from the token, never from the URL.

| Method & path | Middlewares | Purpose |
| --- | --- | --- |
| `GET /api/services` | public | Approved, available services. `?search=&category=&serviceMode=&sort=newest|price-asc|price-desc&page=&limit=` |
| `GET /api/services/featured` | public | 6 latest approved services |
| `GET /api/services/:id` | public | Service details with technician summary |
| `POST /api/bookings` | verifyToken, verifyCustomer | Send a repair request |
| `GET /api/bookings/my` | verifyToken, verifyCustomer | My bookings (`?status=`) |
| `GET /api/bookings/my/stats` | verifyToken, verifyCustomer | Customer overview stats |
| `PATCH /api/bookings/:id/cancel` | verifyToken, verifyCustomer | Cancel a `requested` booking |
| `POST /api/bookings/:id/review` | verifyToken, verifyCustomer | Rate a paid job |
| `GET /api/payments/my` | verifyToken, verifyCustomer | My payment history |
| `POST /api/services` | verifyToken, verifyTechnician | Add a service (starts `pending`) |
| `GET /api/services/my` | verifyToken, verifyTechnician | My services |
| `PATCH /api/services/:id` | verifyToken, verifyTechnician | Edit (back to `pending`) or toggle `isAvailable` |
| `DELETE /api/services/:id` | verifyToken, verifyTechnician | Delete a service |
| `GET /api/bookings/technician` | verifyToken, verifyTechnician | Jobs for my services (`?status=`) |
| `GET /api/bookings/technician/stats` | verifyToken, verifyTechnician | Technician overview stats |
| `PATCH /api/bookings/:id/status` | verifyToken, verifyTechnician | Move a job along the pipeline (`finalAmount` required for `completed`) |
| `GET /api/admin/stats` | verifyToken, verifyAdmin | Admin overview stats and chart data |
| `GET /api/admin/users` | verifyToken, verifyAdmin | All users |
| `PATCH /api/admin/users/:id/role` | verifyToken, verifyAdmin | Change a user's role (not your own) |
| `PATCH /api/admin/users/:id/status` | verifyToken, verifyAdmin | Suspend / reactivate a user |
| `GET /api/admin/services` | verifyToken, verifyAdmin | All services, pending first (`?approvalStatus=`) |
| `PATCH /api/admin/services/:id/approval` | verifyToken, verifyAdmin | Approve or reject a service |
| `GET /api/admin/bookings` | verifyToken, verifyAdmin | All bookings (`?status=`) |
| `GET /api/admin/payments` | verifyToken, verifyAdmin | All payments with total revenue |
| `GET /api/users/profile` / `PATCH /api/users/profile` | verifyToken | Read / update my profile |
| `POST /api/uploads/image` | verifyToken | Upload an image (raw JPG/PNG/WebP/GIF body, max 5 MB) to ImgBB; returns its URL |
| `GET /api/bookings/:id` | verifyToken | One booking (own bookings only; admins see all) |

## Scripts

| Command             | Description |
| ------------------- | ----------- |
| `npm run dev`       | Start with hot reload (tsx watch) |
| `npm run build`     | Compile TypeScript to `dist/` |
| `npm run start`     | Run the compiled server |
| `npm run typecheck` | Type-check without emitting |
| `npm run seed`      | Seed the database |
