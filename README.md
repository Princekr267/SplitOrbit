# SplitOrbit 💸 — Shared Expense & Repayment Tracker for Friends

SplitOrbit is a production-grade **PERN-stack** (PostgreSQL, Express, React, Node.js) web application designed to solve shared expense tracking and part-repayments for friend outings and road trips. When one person (the host) pays for group activities, SplitOrbit acts as the single source of truth for who owes how much, who paid what, and whether it was cash or online.

---

## 🌟 Key Features

### 1. Integer Paise Precision (INR ₹)
- **Zero Floating-Point Errors**: All money values are strictly stored and computed as integer paise (`₹1.00 = 100 paise`).
- **Mathematical Invariant**: Every group balance calculation enforces $\sum \text{net} \equiv 0$ with remainders distributed to avoid lost paise.
- **Split Modes**: Equal split with remainder rounding, Exact manual paise split with sum validation, and Percentage basis-points split ($\sum \text{basis points} = 10,000$).

### 2. WhatsApp-Ready Copy & Share Passbooks
- **1-Click WhatsApp Statements**: Formatted short statements or itemized passbook breakdowns ready to paste into WhatsApp chats.
- **Direct `wa.me` Deep Link**: Auto-populates itemized statements directly to the friend's phone number.
- **Level 1 Public Passbook Link (`/s/:token`)**: Read-only, unguessable 32-byte token link. Privacy middleware guarantees friends only see their own splits and repayments—never leaking other members' names, totals, or balances.

### 3. Account Claim Flow & Multi-Group Friend Passbook
- **Level 2 Claim Invite (`/invite/:code`)**: Single-use 7-day invite codes for friends to claim their person profile and link it to their SplitOrbit account.
- **Atomic Race Protection**: Database transaction enforces `WHERE linked_user_id IS NULL`, preventing concurrent claims.
- **Friend Passbook (`/friend`)**: Friends log in to see all groups where they are members, view itemized activity, and submit repayments directly to the host.
- **Repayment Lifecycle**: Repayments submitted by friends start as `pending`. Group hosts review and **Accept** (crediting to the ledger) or **Reject** with a mandatory reason. Friends can edit and resubmit rejected payments.

### 4. Built-in Floating Safe Calculator
- **Zero `eval` / Function constructors**: Built on a pure **Shunting-Yard algorithm** and Reverse Polish Notation (RPN) evaluator with AST token validation.
- **Mobile Bottom-Sheet & Desktop Widget**: Persistent floating calculator accessible on every page.
- **Session History & Split Remainder Calculator**: Computes equal splits and remainder breakdown in paise in real time.

### 5. Group Lifecycle & Settlement Governance
- **Host Person Atomicity**: Every group automatically and atomically creates the host person within the same database transaction. Enforces a PostgreSQL partial unique index (`is_host = true`).
- **Zero-Balance Settle Verification**: Groups can only be locked and settled when all member balances are ₹0.00.
- **Reopen Group**: Host can reopen settled groups if additional shared costs occur.

### 6. Admin Control Center & Immutable Audit Trail
- **System Overview**: Live aggregate metrics of total recorded expenses volume, settled repayments, pending approvals, and active accounts.
- **User Governance**: Searchable user directory with one-click account activation / deactivation switches (preventing self-deactivation).
- **Immutable Audit Trail**: Append-only audit table with database trigger prohibiting UPDATE and DELETE mutations. Captures actor, role, action, entity, IP address, and before/after JSON snapshots.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, React Router 6, Tailwind CSS, Axios (`withCredentials: true`), Lucide Icons |
| **Backend** | Node.js (ES Modules), Express, Helmet, CORS, Rate Limiting, Cookie Parser |
| **Database & ORM** | PostgreSQL (v16), Drizzle ORM (`drizzle-orm/node-postgres`), Drizzle Kit migrations |
| **Authentication** | JWT stored in `httpOnly`, `sameSite: strict` secure cookies, bcrypt password hashing |
| **Validation** | Zod validation schemas for all request bodies, params, and queries |
| **Testing** | Vitest & Supertest running against a live PostgreSQL test database |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v14 or higher (or Docker)

### 2. Database Setup via Docker (Optional)
A `docker-compose.yml` is included to spin up isolated development and test PostgreSQL instances:
```bash
docker compose up -d
```
- **Dev Database**: `postgresql://splittrack:splittrack@localhost:5432/splittrack`
- **Test Database**: `postgresql://splittrack:splittrack@localhost:5433/splittrack_test`

### 3. Backend Setup & Seeding
```bash
cd backend
npm install
npm run db:migrate    # Applies Drizzle migrations in backend/drizzle/
npm run seed          # Seeds demo users, groups, expenses, payments & tokens
```

### 4. Frontend Setup
```bash
cd ../frontend
npm install
```

### 5. Run Development Servers
From the root directory:
```bash
npm run dev           # Concurrently launches backend (:5000) and frontend (:5173)
```

Visit **http://localhost:5173** in your browser.

---

## 🔑 Demo Accounts

The database seed provides pre-configured accounts with realistic group expenses and repayments:

| Role | Email | Password | Access & Features |
|---|---|---|---|
| **Admin** | `admin@splitorbit.com` | `adminpassword123` | Admin Control Center (`/admin`), user toggling, audit trail |
| **Host** | `host@splitorbit.com` | `hostpassword123` | "Manali Road Trip" group, pending approvals inbox, settle modal |
| **Friend** | `friend@splitorbit.com` | `friendpassword123` | Friend Passbook (`/friend`), linked profile for Karan Patel |

### Demo Share, Invite & Password Reset Credentials

The seed script provides ready-to-test links and recovery credentials:

| Type | Target / User | Link / Code | Expected Outcome |
|---|---|---|---|
| **Level 1 Public View (Valid)** | Aarav Sharma | `/s/demo-share-token-aarav` | Renders passbook ledger, net totals, and charts without login |
| **Level 1 Public View (Revoked)** | Dev Revoked | `/s/demo-revoked-share-token` | Renders friendly "Statement Revoked / Invalid" state |
| **Level 2 Claim Invite (Valid)** | Neha Verma | `/invite/DEMO-VALID-INVITE` | Welcome card with 1-click Join or Register & Claim |
| **Level 2 Claim Invite (Expired)** | Pooja Expired | `/invite/DEMO-EXPIRED-INVITE` | Renders friendly "Invite Expired" message |
| **Level 2 Claim Invite (Used)** | Karan Patel | Profile claimed by `@karan` | Prevents duplicate claiming; redirects to member passbook |
| **Admin Password Reset (Link)** | Karan Patel | `/reset-password?token=demo-admin-reset-token-karan` | Validates token and resets password directly |
| **Admin Password Reset (Code)** | Karan Patel | Code: `K7M2-9QXP` (User: `karan`) | Accepts 8-char code with/without hyphen on `/reset-password` |

---

## 🌐 Topology, Cookies & API Proxy Architecture

SplitOrbit is designed for first-party cookie resilience across modern mobile browsers (iOS Safari ITP, Android Chrome third-party cookie restrictions):

1. **Same-Origin API Proxy**:
   - In production on Vercel, `frontend/vercel.json` rewrites `/api/:path*` to the backend service.
   - The browser communicates strictly with the primary site domain (`our-split-track.vercel.app`), completely eliminating cross-origin cookie drops.
2. **First-Party HTTP-Only Session Cookies**:
   - Authentication tokens are set as HTTP-only cookies (`SameSite=Lax`, `Path=/`, `Secure` in production).
   - Because all requests flow through the first-party proxy, Safari's Intelligent Tracking Prevention (ITP) never suppresses or purges the session.
3. **Link Generation (`FRONTEND_URL`)**:
   - The backend validates `FRONTEND_URL` on startup.
   - All generated view links (`/s/:token`), invite links (`/invite/:code`), and reset links (`/reset-password?token=...`) are built from this validated base URL, ensuring links never point to internal API hosts.

---

## 🧪 Automated Test Suite

SplitOrbit includes comprehensive backend and frontend test coverage:

```bash
# Run backend integration tests against real PostgreSQL test DB
cd backend
npm test

# Run frontend tests
cd ../frontend
npm test
```

### Test Coverage Highlights:
- **Backend (93 Tests across 15 Test Files)**:
  1. `phase1-auth-session.test.js`: First-party cookie emission, strict CORS allow-list enforcement, link generation.
  2. `phase2-invite-claim.test.js`: Public invite preview privacy, row-locked atomic claim, duplicate prevention, host claim rejection.
  3. `phase3-view-reset.test.js`: Share link passbook calculation, 404 on revoked links, 8-character admin code reset, token reset validation.
  4. `split.test.js`, `balance.test.js`, `group.test.js`, `privacy.test.js`, `claim.test.js`, `payment-flow.test.js`, `admin.test.js`, `mathParser.test.js`.
- **Frontend (78 Tests across 24 Test Suites)**:
  1. `guestRouteComponent.test.js`: Flash-free guest route redirection and auth loading skeleton.
  2. `inviteFlow.test.js`: Preview rendering, safe URL redirect validation, public route classification.
  3. `viewAndReset.test.js`: Error boundary fallbacks, integer paise currency formatting, safe date formatting.
  4. `stabilityAndOverlays.test.js`: Overlay manager scroll locking, deploy chunk reload loop guard, 15s timeout and cold start tracking.

---

## 📡 API Reference Overview

### Auth (`/api/auth`)
- `POST /register`: Create a new user account
- `POST /login`: Authenticate and issue httpOnly JWT cookie
- `POST /logout`: Clear authentication cookie
- `GET /me`: Get current authenticated user profile

### Groups (`/api/groups`)
- `POST /`: Create group (atomically creates host person)
- `GET /`: List groups created by current user
- `GET /:groupId`: Get group details, people, balances, and summary
- `PATCH /:groupId`: Update group name and description
- `POST /:groupId/settle`: Settle and lock group (requires all balances to be ₹0)
- `POST /:groupId/reopen`: Reopen a settled group

### Expenses (`/api/groups/:groupId/expenses`)
- `POST /`: Add new expense with equal, exact, or percentage splits
- `GET /`: List all group expenses with itemized splits
- `GET /:expenseId`: Get specific expense details
- `PATCH /:expenseId`: Edit expense amount, title, and recalculate splits
- `DELETE /:expenseId`: Soft-delete expense

### Payments (`/api/groups/:groupId/payments`)
- `POST /`: Host records a payment (status: `accepted`)
- `GET /`: List all group payments
- `GET /pending`: List pending payments submitted by friends
- `POST /:paymentId/accept`: Host accepts pending payment
- `POST /:paymentId/reject`: Host rejects pending payment with required reason

### Share & Invite (`/api/s`, `/api/invite`)
- `GET /api/s/:token`: Public read-only passbook statement (strictly scoped to viewing person)
- `GET /api/invite/:code`: Inspect single-use claim invite
- `POST /api/invite/:code/accept`: Claim person profile and link to logged-in user account

### Friend Passbook (`/api/friend`)
- `GET /profiles`: List all claimed profiles across groups with balance summaries
- `POST /payments`: Friend submits repayment to host (status: `pending`)
- `PATCH /payments/:paymentId`: Friend edits and resubmits rejected payment

### Admin (`/api/admin`)
- `GET /stats`: Global system volume and account health metrics
- `GET /users`: Paginated user list with name/email search and role filter
- `PATCH /users/:userId/status`: Activate or deactivate a user account
- `GET /groups`: Platform-wide group registry
- `GET /audit-logs`: Query immutable audit trail logs with before/after diffs

### Server Administration CLI Commands (Backend)
Run these commands inside the `backend/` directory to manage administrative access:
- **Create Admin Account**:
  ```bash
  npm run create-admin
  ```
  Interactively prompts for username, display name, optional email/phone, and password. Creates an administrator with **no recovery codes** (admin accounts cannot be reset via web self-service).
- **Reset Admin Password**:
  ```bash
  npm run reset-admin-password
  ```
  Interactively prompts for admin username and new password. Enforces password security policy, hashes with bcrypt, updates DB, increments `token_version` by 1 to immediately terminate all active sessions, and logs an audit trail row (`actor: CLI`, reason: `server command`). Does not set a user-facing notice banner.

---

## 📄 License
MIT License. Built with ❤️ for friends who go out together.
