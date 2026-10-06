# AI Front Office

An AI receptionist and front-office employee for appointment-based businesses — clinics, dentists, salons, barbers, spas and wellness studios. It answers customers, captures leads, books / reschedules / cancels real appointments, follows up, requests reviews and hands conversations to a human whenever needed. The business owner controls exactly what the AI is allowed to do, and every action is logged.

This is a standalone Next.js app inside the Illume repository (`front-office/`). It does not touch the Illume website.

---

## How the AI works

```
customer message (website chat, SMS, WhatsApp … one orchestrator for all channels)
  └─▶ safety pre-check ─────────── human request · opt-out · emergency · clinical question · refund/legal → handoff
  └─▶ agent (provider)  ────────── Claude via the Anthropic SDK, or the built-in rules engine when no key is set
        ├─ system prompt: rules, boundaries, personality (stable, cached) + current context (time, customer, memory)
        └─ requests tools ───▶ tool layer
                                ├─ permission check (owner's toggles) — denied → refused + logged
                                ├─ input validation (zod)
                                ├─ real service-layer action (book, reschedule, search knowledge…)
                                └─ ai_actions row (success / error / denied)
  └─▶ claim guard ───────────────── reply may not say "booked/cancelled/sent" unless that tool succeeded
  └─▶ reply saved · lead kept up to date · follow-up queued if they went quiet
everything important → audit_logs (same transaction as the change)
```

| Layer | Where | Responsibility |
|---|---|---|
| Agent | `src/server/ai/agent.ts`, `providers/` | Reasoning and conversation. `ModelProvider` interface: `anthropic.ts` (Claude, manual tool-use loop, refusal fallback) and `rules.ts` (deterministic, offline). |
| Tools | `src/server/ai/tools/` | 18 tools (`get_business_information`, `search_knowledge_base`, `get_services`, `get_service_details`, `get_available_appointments`, `book_appointment`, `get_customer_appointments`, `reschedule_appointment`, `cancel_appointment`, `create_customer`, `update_customer`, `remember_customer_preference`, `create_lead`, `update_lead`, `send_message`, `escalate_to_human`, `create_follow_up`, `request_review`). They act only on the current conversation's customer. |
| Knowledge | `src/server/services/knowledge.ts` | Text, FAQs, documents, website URLs → chunks → hybrid retrieval (Postgres full-text + trigram, plus pgvector when `VOYAGE_API_KEY` is set). |
| Permissions | `src/server/ai/permissions.ts` | Owner-controlled toggles. Disabled tools are never offered to the model *and* refused at execution. Refunds and price changes are never available. Handoff can never be disabled. |
| Memory | `customers.memory`, `conversations.agent_state` | Durable non-medical customer facts; short-lived per-conversation working memory. |
| Safety | `src/server/ai/safety.ts` | Deterministic pre-check and claim guard around any model. |
| Audit | `src/server/audit.ts` | Every booking, cancellation, reschedule, message, handoff, customer change and AI action. |
| Channels | `src/server/channels/` | `ChannelAdapter` abstraction. Web chat is live; SMS/WhatsApp (Twilio) and email (Resend) deliver when configured; Instagram and voice are architected (`voice.ts`) but not available yet. |

## Multi-tenancy

`organization` (the paying account) → `business` (a location/brand) → everything else. Every tenant table carries `business_id`; parent tables expose `UNIQUE (business_id, id)` and children reference them with **composite foreign keys**, so the database itself rejects a row that points at another tenant's customer, service, staff member or conversation. Application code scopes every query by the business id resolved from the server-side session (dashboard), the widget public key (website chat), or the job row (background work) — never from request bodies. `tests/tenant-isolation.test.ts` covers reads, writes, DB-level references, knowledge search and AI tool calls across tenants.

**Double booking** is prevented by a Postgres exclusion constraint on `(staff_id, [starts_at, blocked_until))` for active appointments (`drizzle/0001_integrity_constraints.sql`), so concurrent bookings can't both succeed. The availability engine (`services/availability.ts`) combines business hours, staff hours and breaks, blackout dates, buffers, minimum notice and max advance, in the business timezone.

## Roles

| Role | Access |
|---|---|
| Owner | Everything, including billing and team management |
| Manager | Operations, customers, conversations, leads, analytics, settings |
| Staff | Conversations assigned to them (plus unclaimed handoffs), their customers and their own appointments |
| AI | Only the tools the business has switched on |

## Stack

Next.js 16 (App Router, server actions) · React 19 · TypeScript · Tailwind CSS v4 with shadcn-style components on Radix · PostgreSQL 16 + pgvector + pg_trgm + btree_gist · Drizzle ORM · custom session auth (bcrypt, hashed session tokens) · Anthropic SDK · Stripe · Vitest.

## Getting started

```bash
cd front-office
cp .env.example .env            # set DATABASE_URL at minimum
npm install
npm run db:migrate              # applies migrations, seeds default pricing plans
npm run db:seed-demo            # optional: "Dubai Smile Clinic" demo (sign in as demo@frontoffice.dev / demo-front-office)
npm run dev                     # http://localhost:3000
```

The database needs the `vector`, `pg_trgm` and `btree_gist` extensions (the first migration creates them; on Ubuntu install `postgresql-16-pgvector`).

### Configuration

| Variable | Needed for | Without it |
|---|---|---|
| `DATABASE_URL` | Everything | App won't start |
| `APP_URL` | Widget snippet, review links, Stripe redirects | Derived from the request where possible |
| `CRON_SECRET` | `/api/cron/tick` (follow-ups, reminders, review requests) | Endpoint returns 401; use **Automations → Run due automations now** manually |
| `ANTHROPIC_API_KEY` (+ `AI_MODEL`, default `claude-opus-5-5`; `AI_EFFORT`) | Claude as the receptionist | Built-in rules engine answers (clearly labelled in the dashboard) |
| `VOYAGE_API_KEY` | Semantic knowledge search | Full-text + trigram search only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `plans.stripe_price_id` | Subscriptions | Billing shows "not configured"; no paywall |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email reminders / follow-ups | Proactive messages go to the customer's chat thread, or are marked undeliverable |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` | SMS / WhatsApp in and out | Those channels show "configuration required" |

Inbound SMS/WhatsApp: point the Twilio number's messaging webhook at `https://<APP_URL>/api/channels/twilio/<business public key>` (signatures are verified).

### Website chat

**AI Receptionist → Website chat** shows the snippet:

```html
<script src="https://<APP_URL>/widget.js" data-key="pk_…" async></script>
```

It adds a launcher and an iframe (`/widget/<key>`) styled with the business's title, accent colour, logo, greeting and position.

### Pricing

Plans live in the `plans` table (`DEFAULT_PLANS` in `services/billing.ts` seeds Starter $49, Growth $149, Pro $399 once). Edit rows to change prices, features or entitlements without a deploy; the landing page and billing page read from the table.

## Testing

```bash
npm test            # Vitest against TEST_DATABASE_URL (schema is rebuilt from migrations each run)
npm run simulate    # the end-to-end Dubai Smile Clinic conversation, printed with tool calls + audit log
npm run typecheck
```

Covered: tenant isolation, authentication, booking, double-booking (including a concurrent race), buffers/breaks/blackouts/notice, rescheduling, cancellation, staff-role restrictions, AI tool permissions (denied tools are not offered, not executed, and logged), refund/price tools never existing, human handoff (AI silent until control is returned), follow-up stop conditions (reply, opt-out, booking, human takeover, lead lost) and max attempts, review routing, knowledge retrieval and SSRF protection, customer identity merge, Twilio signature verification, the Claude tool loop against a mocked client (tool-result pairing, refusal → handoff, provider error → handoff), the claim guard, and the full Dubai Smile Clinic scenario.

## Deployment (Vercel)

Create a Vercel project with **Root Directory = `front-office`**, a Postgres database with pgvector (e.g. Neon/Supabase), set the environment variables above, and run `npm run db:migrate` against it. `vercel.json` schedules `/api/cron/tick` every 5 minutes (set `CRON_SECRET`; Vercel sends it as a bearer token).

## Status — what is real today

| Area | Status |
|---|---|
| Website chat widget, AI receptionist (Claude or rules engine), tools, permissions, audit | Live |
| Built-in calendar, availability, booking/rescheduling/cancellation | Live |
| Inbox, human handoff, leads, customers, missed opportunities, analytics | Live (computed from real data) |
| Follow-ups, reminders, review requests | Live via cron; delivered by the best configured channel |
| SMS / WhatsApp (Twilio), email (Resend) | Implemented; require credentials |
| Stripe subscriptions | Implemented; require Stripe keys and price ids |
| Google Calendar / external booking systems | Not available yet (shown as such) |
| Instagram DMs | Not available yet |
| Voice receptionist | Architecture and provider contract in `src/server/channels/voice.ts`; needs a telephony + speech provider |
| Rate limiting | In-memory per instance — use a shared store (Redis/Upstash) when running multiple instances |
