# FixMate Server: Repair Service Platform API

REST API for **FixMate**, a role-based platform where verified technicians list device and home-appliance repair services, customers request repairs and track each job, and pay with Stripe **only after the job is completed**. Admins approve services, manage users and monitor jobs and revenue.

| | |
| --- | --- |
| **API (live)** | `https://<your-server>.onrender.com` _(add after deploying; health check: `/api/health`)_ |
| **Live site** | `https://<your-client>.vercel.app` _(add after deploying)_ |
| **Client repo** | https://github.com/hasnat-sumit/fix-mate |
| **Server repo** | https://github.com/hasnat-sumit/fix-mate-server |

**Admin:** `<ADMIN_EMAIL>` / `<ADMIN_PASSWORD>`. Technician and customer test accounts are listed under [Seed data](#seed-data).

## Key features

- **Better Auth** (MongoDB adapter) email/password auth; its `users` collection carries `role`, `phone`, `area`, `bio` as additional fields. Sign-up accepts only customer/technician (anything else is saved as customer); admins come from the seed.
- **JWT** issued by Better Auth, verified by custom middlewares `verifyToken` (401) and `verifyCustomer` / `verifyTechnician` / `verifyAdmin` (403). Data access is scoped by the token's email, never by the URL.
- Exactly **4 collections**: `users`, `services`, `bookings`, `payments`, with the fields from the assignment's data design.
- **Server-side search, filter, sort and pagination** for the public catalog (MongoDB queries, not client-side filtering).
- **Job status pipeline** enforced on the server (requested → accepted / rejected / cancelled, accepted → in-progress → completed with `finalAmount`), with ownership checks and race-safe conditional updates; one active request per customer and service (unique index).
- **Stripe Checkout + signed webhook**: amounts come from the database; each payment is saved exactly once.
- **ImgBB** uploads proxied through the API, so the key stays server-side.
- Zod validation, Helmet, strict CORS, consistent JSON errors, and an idempotent seed with connected demo data.

### npm packages

| Package | Used for |
| --- | --- |
| `express` | HTTP server and routing |
| `mongoose` | MongoDB models, validation and indexes |
| `better-auth` | Authentication, sessions and JWT issuing (MongoDB adapter, JWT plugin) |
| `jose` | Verifying the API JWTs (EdDSA, JWKS) |
| `stripe` | Checkout Sessions and webhook signature verification |
| `zod` | Request and environment validation |
| `helmet`, `cors` | Security headers and allowed origins |
| `typescript`, `tsx`, `@types/*` | Tooling (build, dev server, seed script) |

## Tech stack

- Node.js 22.12+, Express 5, TypeScript
- MongoDB with Mongoose
- Better Auth (sessions + JWT), Zod validation, Helmet, CORS
- Stripe Checkout + webhook (test mode)
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

Changing `SEED_USER_PASSWORD` and re-running the seed updates the demo accounts. An existing admin keeps its password unless you run `npm run seed -- --reset-admin-password`. Re-running also resets the demo customers' bookings and payments to the seeded set.

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
| `STRIPE_SECRET_KEY`  | payments | Stripe test secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | webhook | Signing secret of the webhook endpoint (`whsec_...`) |
| `CLIENT_URL`         | no       | Where Stripe returns customers; defaults to `BETTER_AUTH_URL` |
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
| `POST /api/payments/create-checkout-session` | verifyToken, verifyCustomer | Stripe Checkout for a completed, unpaid booking I own |
| `GET /api/payments/verify?session_id=` | verifyToken, verifyCustomer | Confirm a paid session and save the payment (success page) |
| `POST /api/payments/webhook` | Stripe signature | `checkout.session.completed` → save the payment |
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

## Stripe payments

Customers pay per job, only after the technician marks it completed.

1. `POST /api/payments/create-checkout-session` loads the booking (never trusting a client amount) and creates a Checkout Session with `unit_amount = finalAmount × 100` and `bookingId` / `customerEmail` in the metadata.
2. After paying, Stripe redirects to `/payment/success?session_id=…`, which calls `GET /api/payments/verify`.
3. Stripe also calls `POST /api/payments/webhook` (`checkout.session.completed`).

Both 2 and 3 go through one function that inserts the payment and marks the booking paid. Unique indexes on `payments.bookingId` and `payments.stripeSessionId` guarantee a payment is saved **once**, even when both arrive together or Stripe retries the webhook.

**Webhook setup (test mode):** in the Stripe Dashboard add an endpoint `https://<server>/api/payments/webhook` for `checkout.session.completed`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Locally: `stripe listen --forward-to localhost:5000/api/payments/webhook`.

Test card: `4242 4242 4242 4242`, any future date, any CVC.

## Deployment (Render)

1. **MongoDB Atlas:** create a cluster and a database user; under Network Access allow `0.0.0.0/0` (Render has no fixed IP). Copy the connection string into `MONGODB_URI`.
2. **Render → New Web Service** from this repo. Runtime: Node. Build command: `npm ci && npm run build`. Start command: `npm start`. Health check path: `/api/health`.
3. **Environment:** `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_SECRET` (32+ random characters), `BETTER_AUTH_URL=https://<your-client>.vercel.app`, `CLIENT_ORIGINS=https://<your-client>.vercel.app` (comma-separate extra origins, e.g. a custom domain), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `IMGBB_API_KEY`. Render sets `PORT` itself.
4. **Stripe webhook:** Dashboard (test mode) → Developers → Webhooks → add `https://<your-server>.onrender.com/api/payments/webhook` for `checkout.session.completed`; copy its signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.
5. **Seed the production database** from your machine, with the production values in `.env` (plus `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SEED_USER_PASSWORD`): `npm run seed`. If `NODE_ENV=production` is set locally, use `npm run seed -- --allow-production`.

Render's free plan sleeps after 15 minutes idle and takes up to a minute to wake. Before a review, open `/api/health` once (or keep it warm with an uptime pinger) so the first request isn't slow.

## Scripts

| Command             | Description |
| ------------------- | ----------- |
| `npm run dev`       | Start with hot reload (tsx watch) |
| `npm run build`     | Compile TypeScript to `dist/` |
| `npm run start`     | Run the compiled server |
| `npm run typecheck` | Type-check without emitting |
| `npm run seed`      | Seed the database |
