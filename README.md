<div align="center">

# 🛡️ SentinelAuth

### AI-Powered, Multi-Tenant Authentication-as-a-Service

_Every login is scored in real time. MFA adapts to actual risk, not a checkbox._

[![CI](https://img.shields.io/badge/CI-passing-brightgreen?style=flat-square)](.github/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#license)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.14-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)

[Overview](#-overview) • [Why SentinelAuth](#-why-sentinelauth) • [Architecture](#-architecture) • [Tech Stack](#-tech-stack) • [Project Structure](#-project-structure) • [Contributing](#-contributing) • [Roadmap](#-roadmap)

</div>

---

## 📖 Overview

**SentinelAuth** is a multi-tenant Authentication-as-a-Service platform that goes beyond password hashing and JWTs. Every login attempt is passed through a real-time **XGBoost risk engine**, evaluated against behavioral signals — device fingerprint, geolocation, login velocity, time-of-day patterns — and the system decides, adaptively, whether that login needs a second factor at all.

No forced MFA on every sign-in. No static rule tables. A model that learns what _normal_ looks like for each user, and only interrupts when something doesn't.

Built from the ground up as a real product — not a proof of concept — with the intent to outlive its origins as a final year project.

---

## ✨ Why SentinelAuth

|                                          |                                                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🧠 **Adaptive MFA**                      | Risk-scored per login. MFA triggers only when the AI model's confidence crosses a tenant-configured threshold — not on every sign-in.                                                                 |
| 🌍 **Impossible Travel Detection**       | Haversine-distance geo-velocity calculation flags logins that would require faster-than-a-jet travel between sessions.                                                                                |
| 🔒 **Database-Level Tenant Isolation**   | PostgreSQL Row-Level Security enforces tenant boundaries at the database engine — not just application code. A bug in a query can't leak data across tenants.                                         |
| 🔑 **Per-Tenant Cryptography**           | Every tenant gets an independent RSA key pair for JWT signing. Private keys are AES-256-OCB encrypted at rest and never leave the platform.                                                           |
| 🕵️ **Active Threat Detection**           | Redis-backed credential stuffing detection (sliding window, IP-level) and login velocity anomaly detection (distributed account-targeting, account-level) — two independent, complementary detectors. |
| 🧩 **Drop-in, Themeable UI**             | Framework-agnostic Web Components (Shadow DOM + CSS custom properties) for login, registration, OTP, and MFA — restyle to match any brand without fighting encapsulation.                             |
| ⚛️ **First-Class React/Next.js Support** | A dedicated `@sentinelauth/react` wrapper — not just "technically works in React," but idiomatic hooks and components with SSR handled correctly out of the box.                                      |
| 🛡️ **Compromised Password Prevention**   | Have I Been Pwned integration via k-anonymity — checked at registration and every password change, without ever transmitting the real password or full hash.                                          |

---

## 🏗️ Architecture

```
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────┐
│   Client Apps    │        │    Core API       │        │   AI Risk Engine │
│  (Web/Mobile)     │───────▶│  Hono · TypeScript │───────▶│  FastAPI · XGBoost│
│  via SDK/React     │  HTTPS │                    │  HTTP   │                   │
└─────────────────┘        └─────────┬─────────┘        └─────────────────┘
                                       │
                     ┌─────────────────┼─────────────────┐
                     ▼                                     ▼
             ┌──────────────┐                     ┌──────────────┐
             │  PostgreSQL 15 │                     │    Redis 7    │
             │  Drizzle ORM +  │                     │  Rate limiting,│
             │  Row-Level Sec. │                     │  threat signals │
             └──────────────┘                     └──────────────┘
```

**Design principles that shaped every decision:**

- **Security by default** — Argon2id password hashing, hashed-not-raw token storage, RLS always active, no configuration required to be secure.
- **Fail-open, deliberately** — Every optional risk signal (HIBP, AI engine, GeoIP, device fingerprint) degrades to its most permissive value on failure. A third-party outage never locks a legitimate user out.
- **Defence in depth** — Tenant isolation enforced at both the application layer (explicit query filters) _and_ the database layer (RLS policies) — redundant by design, not by accident.
- **Append-only audit trail** — Every security-relevant event (logins, MFA triggers, key rotations, threat detections) is logged immutably, with GDPR-compliant deletion that nullifies personal identifiers while preserving the audit record.

---

## 🧰 Tech Stack

<table>
<tr>
<td valign="top" width="33%">

**Core API**

- TypeScript · Hono
- Node.js 22
- Drizzle ORM
- PostgreSQL 15 (RLS)
- Redis 7 (ioredis)
- Argon2id · RS256 JWT
- Zod validation

</td>
<td valign="top" width="33%">

**AI Engine**

- Python 3.14 · FastAPI
- XGBoost
- scikit-learn · pandas
- Synthetic threat modeling
- Cyclical feature encoding

</td>
<td valign="top" width="33%">

**SDK & Frontend**

- Web Components (Shadow DOM)
- `@sentinelauth/react`
- FingerprintJS
- tsup (dual ESM/CJS)
- Next.js dashboard

</td>
</tr>
</table>

**Infrastructure:** Docker Compose · GitHub Actions CI · pnpm workspaces (Turborepo monorepo)

---

## 📁 Project Structure

```
SentinelAuth/
├── api/                  # Core authentication API (Hono, TypeScript)
│   └── src/
│       ├── routes/         # HTTP layer — parses requests, calls services
│       ├── services/        # Business logic — no HTTP context
│       ├── middleware/        # Auth, rate limiting, tenant context
│       ├── db/                  # Drizzle schema, RLS policies
│       └── tests/                 # Full test suite
├── ai/                    # AI risk-scoring microservice (FastAPI, XGBoost)
│   └── model/              # Training pipeline, synthetic dataset, evaluation
├── sdk/                    # Framework-agnostic client SDK + Web Components
│   └── src/components/       # Themeable, Shadow DOM login/OTP/MFA/register UI
├── packages/
│   ├── types/                # Shared TypeScript types across all packages
│   └── react/                  # React/Next.js wrapper (hooks + components)
├── dashboard/               # Tenant management dashboard (Next.js)
└── sample-app/                # Reference integration app
```

---

## 🤝 Contributing

SentinelAuth is a hosted platform — this repo isn't intended to be self-deployed by end users. If you'd like to contribute code, here's how to get a local development environment running.

### Prerequisites

- Node.js 22+, pnpm, Python 3.14+, Docker Desktop

### Environment

```bash
git clone https://github.com/ar106000a/SentinelAuth.git
cd SentinelAuth
pnpm install
cp .env.example .env   # fill in local secrets — see .env.example for what's required
```

### Spin up the stack

```bash
# Postgres + Redis
pnpm db:up

# Apply migrations
pnpm --filter @sentinelauth/api db:migrate

# Core API
pnpm --filter @sentinelauth/api dev

# AI Engine
cd ai && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python model/train.py          # trains a model on synthetic data — required before first run
uvicorn main:app --reload --port 8000
```

### Run the test suite before opening a PR

```bash
pnpm --filter @sentinelauth/api test     # Core API
pnpm --filter @sentinelauth/sdk test     # SDK
cd ai && pytest tests/ -v                # AI Engine
```

### Workflow

1. Fork the repo and branch off `main`
2. Keep changes scoped — one concern per PR
3. Every new endpoint/service/component should ship with tests; CI must be green
4. Open a PR with a clear description of what changed and why

---

## 🗺️ Roadmap

- [x] Multi-tenant core auth (registration, login, MFA, password reset)
- [x] PostgreSQL Row-Level Security tenant isolation
- [x] AI risk engine — adaptive MFA via XGBoost
- [x] GeoIP + impossible travel detection
- [x] Credential stuffing & login velocity anomaly detection
- [x] SDK — themeable Web Components for every end-user auth flow
- [ ] `@sentinelauth/react` — full hook + component coverage
- [ ] Tenant management dashboard (Next.js)
- [ ] Production deployment hardening
- [ ] OAuth social login providers
- [ ] SAML/SSO for enterprise tenants

---

## 📄 License

MIT

---

<div align="center">

_Built with an unreasonable amount of care for a final year project — and intended to outlive it._

</div>
