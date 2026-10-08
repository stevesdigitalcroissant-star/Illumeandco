/**
 * AI Front Office — relational schema.
 *
 * Tenancy model
 * ─────────────
 *   organization (the paying account)  ──<  business (a location / brand)  ──<  everything else
 *
 * Every tenant-owned table carries `business_id`. Parent tables expose a
 * UNIQUE (business_id, id) key and children reference it with composite
 * foreign keys, so the database itself refuses a row that points at another
 * tenant's customer, conversation, service or staff member. Application code
 * additionally scopes every query by business id (see src/server/context.ts).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const businessRef = () =>
  uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" });

/** pgvector column. Dimension matches the configured embedding model (voyage-3.5 → 1024). */
export const EMBEDDING_DIMENSIONS = 1024;
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${EMBEDDING_DIMENSIONS})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return value.slice(1, -1).split(",").map(Number);
  },
});

// ─── Enums ────────────────────────────────────────────────────────────
export const memberRole = pgEnum("member_role", ["owner", "manager", "staff"]);
export const businessType = pgEnum("business_type", [
  "clinic",
  "dentist",
  "salon",
  "barber",
  "spa",
  "wellness",
  "other",
]);
export const channelKind = pgEnum("channel_kind", [
  "web_chat",
  "whatsapp",
  "instagram",
  "sms",
  "email",
  "voice",
]);
export const conversationStatus = pgEnum("conversation_status", [
  "new",
  "ai_handling",
  "human_handling",
  "waiting",
  "resolved",
]);
export const conversationOwner = pgEnum("conversation_owner", ["ai", "human"]);
export const messageRole = pgEnum("message_role", ["customer", "ai", "human", "system"]);
export const leadStatus = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "appointment_booked",
  "completed",
  "lost",
]);
export const appointmentStatus = pgEnum("appointment_status", [
  "booked",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);
export const appointmentSource = pgEnum("appointment_source", ["ai", "staff", "online"]);
export const knowledgeKind = pgEnum("knowledge_kind", ["text", "faq", "document", "url"]);
export const knowledgeStatus = pgEnum("knowledge_status", ["pending", "indexed", "failed"]);
export const actorType = pgEnum("actor_type", ["user", "ai", "system", "customer"]);
export const aiActionStatus = pgEnum("ai_action_status", ["success", "error", "denied"]);
export const scheduledStatus = pgEnum("scheduled_status", [
  "scheduled",
  "sent",
  "cancelled",
  "skipped",
  "failed",
]);
export const reminderKind = pgEnum("reminder_kind", ["confirmation", "reminder_24h", "same_day"]);
export const reviewStatus = pgEnum("review_status", [
  "scheduled",
  "sent",
  "responded",
  "cancelled",
  "skipped",
]);
export const availabilityKind = pgEnum("availability_kind", ["work", "break"]);

// ─── Identity ─────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token — the raw token is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeBusinessId: uuid("active_business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("org_member_unique").on(t.organizationId, t.userId)],
);

// ─── Business ─────────────────────────────────────────────────────────
export type BusinessPolicies = {
  cancellation?: string;
  refund?: string;
  late?: string;
  booking?: string;
};

export const businesses = pgTable(
  "businesses",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: businessType("type").notNull().default("other"),
    description: text("description"),
    timezone: text("timezone").notNull().default("UTC"),
    currency: text("currency").notNull().default("USD"),
    address: text("address"),
    city: text("city"),
    country: text("country"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    policies: jsonb("policies").$type<BusinessPolicies>().notNull().default({}),
    /** Booking engine settings */
    slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(15),
    defaultBufferMinutes: integer("default_buffer_minutes").notNull().default(0),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(60),
    maxAdvanceDays: integer("max_advance_days").notNull().default(60),
    /** Public identifier used by the website widget. Not a secret. */
    publicKey: text("public_key").notNull(),
    onboardingStep: integer("onboarding_step").notNull().default(1),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    /** Demo businesses are clearly labelled in the UI and hold seed data only. */
    isDemo: boolean("is_demo").notNull().default(false),
    /** This business's own Twilio numbers (E.164). A number belongs to exactly one business, so replies route to it. */
    smsFrom: text("sms_from"),
    whatsappFrom: text("whatsapp_from"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("businesses_public_key_idx").on(t.publicKey),
    uniqueIndex("businesses_sms_from_idx").on(t.smsFrom).where(sql`${t.smsFrom} is not null`),
    uniqueIndex("businesses_whatsapp_from_idx").on(t.whatsappFrom).where(sql`${t.whatsappFrom} is not null`),
    index("businesses_org_idx").on(t.organizationId),
  ],
);

/** Opening hours. Several rows per weekday allow split shifts. weekday: 1=Mon … 7=Sun (ISO). */
export const businessHours = pgTable(
  "business_hours",
  {
    id: id(),
    businessId: businessRef(),
    weekday: smallint("weekday").notNull(),
    openTime: text("open_time").notNull(), // "09:00"
    closeTime: text("close_time").notNull(), // "18:00"
  },
  (t) => [index("business_hours_business_idx").on(t.businessId, t.weekday)],
);

export const blackoutDates = pgTable(
  "blackout_dates",
  {
    id: id(),
    businessId: businessRef(),
    staffId: uuid("staff_id"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("blackout_business_idx").on(t.businessId),
    foreignKey({ columns: [t.businessId, t.staffId], foreignColumns: [staff.businessId, staff.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const staff = pgTable(
  "staff",
  {
    id: id(),
    businessId: businessRef(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("staff_business_id_unique").on(t.businessId, t.id)],
);

/** Staff working hours and breaks. If a staff member has no 'work' rows, business hours apply. */
export const availability = pgTable(
  "availability",
  {
    id: id(),
    businessId: businessRef(),
    staffId: uuid("staff_id").notNull(),
    kind: availabilityKind("kind").notNull().default("work"),
    weekday: smallint("weekday").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
  },
  (t) => [
    index("availability_staff_idx").on(t.staffId, t.weekday),
    foreignKey({ columns: [t.businessId, t.staffId], foreignColumns: [staff.businessId, staff.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const services = pgTable(
  "services",
  {
    id: id(),
    businessId: businessRef(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    /** Minor units (fils/cents). null = price on request. */
    priceCents: integer("price_cents"),
    /** "starts at" pricing */
    priceIsFrom: boolean("price_is_from").notNull().default(false),
    durationMinutes: integer("duration_minutes").notNull(),
    /** null = use business default buffer */
    bufferMinutes: integer("buffer_minutes"),
    onlineBookingEnabled: boolean("online_booking_enabled").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("services_business_id_unique").on(t.businessId, t.id)],
);

export const serviceStaff = pgTable(
  "service_staff",
  {
    businessId: businessRef(),
    serviceId: uuid("service_id").notNull(),
    staffId: uuid("staff_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.serviceId, t.staffId] }),
    foreignKey({
      columns: [t.businessId, t.serviceId],
      foreignColumns: [services.businessId, services.id],
    }).onDelete("cascade"),
    foreignKey({ columns: [t.businessId, t.staffId], foreignColumns: [staff.businessId, staff.id] }).onDelete(
      "cascade",
    ),
  ],
);

// ─── Customers, leads, conversations ─────────────────────────────────
export type CustomerMemory = { facts: { key: string; value: string; at: string }[] };

export const customers = pgTable(
  "customers",
  {
    id: id(),
    businessId: businessRef(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    source: text("source"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Durable facts the AI learned (preferences, language…). Never medical data. */
    memory: jsonb("memory").$type<CustomerMemory>().notNull().default({ facts: [] }),
    optedOut: boolean("opted_out").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("customers_business_id_unique").on(t.businessId, t.id),
    uniqueIndex("customers_business_email_idx")
      .on(t.businessId, sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
    uniqueIndex("customers_business_phone_idx")
      .on(t.businessId, t.phone)
      .where(sql`${t.phone} is not null`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    businessId: businessRef(),
    customerId: uuid("customer_id").notNull(),
    channel: channelKind("channel").notNull(),
    /** sha256 of the channel-side identity (widget visitor token, phone number, …) */
    channelIdentityHash: text("channel_identity_hash"),
    status: conversationStatus("status").notNull().default("new"),
    owner: conversationOwner("owner").notNull().default("ai"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    handoffRequestedAt: timestamp("handoff_requested_at", { withTimezone: true }),
    handoffReason: text("handoff_reason"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    /** Short-lived working memory for the agent (last service discussed, slots offered…). */
    agentState: jsonb("agent_state").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("conversations_business_id_unique").on(t.businessId, t.id),
    index("conversations_business_last_idx").on(t.businessId, t.lastMessageAt),
    index("conversations_identity_idx").on(t.businessId, t.channel, t.channelIdentityHash),
    foreignKey({
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    businessId: businessRef(),
    conversationId: uuid("conversation_id").notNull(),
    role: messageRole("role").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    channel: channelKind("channel").notNull(),
    /** For outbound messages: how/if the channel delivered it. */
    deliveryStatus: text("delivery_status"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    foreignKey({
      columns: [t.businessId, t.conversationId],
      foreignColumns: [conversations.businessId, conversations.id],
    }).onDelete("cascade"),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    businessId: businessRef(),
    customerId: uuid("customer_id").notNull(),
    conversationId: uuid("conversation_id"),
    source: text("source").notNull(),
    serviceId: uuid("service_id"),
    serviceInterest: text("service_interest"),
    status: leadStatus("status").notNull().default("new"),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    appointmentId: uuid("appointment_id"),
    notes: text("notes"),
    lostReason: text("lost_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("leads_business_id_unique").on(t.businessId, t.id),
    index("leads_business_status_idx").on(t.businessId, t.status),
    foreignKey({
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.businessId, t.conversationId],
      foreignColumns: [conversations.businessId, conversations.id],
    }),
    foreignKey({
      columns: [t.businessId, t.serviceId],
      foreignColumns: [services.businessId, services.id],
    }),
  ],
);

// ─── Appointments ─────────────────────────────────────────────────────
export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    businessId: businessRef(),
    customerId: uuid("customer_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    staffId: uuid("staff_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** endsAt + buffer. The exclusion constraint uses [startsAt, blockedUntil). */
    blockedUntil: timestamp("blocked_until", { withTimezone: true }).notNull(),
    status: appointmentStatus("status").notNull().default("booked"),
    source: appointmentSource("source").notNull(),
    bookedByUserId: uuid("booked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id"),
    leadId: uuid("lead_id"),
    /** Price snapshot at booking time (minor units). */
    priceCents: integer("price_cents"),
    notes: text("notes"),
    rescheduledFromId: uuid("rescheduled_from_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("appointments_business_id_unique").on(t.businessId, t.id),
    index("appointments_business_start_idx").on(t.businessId, t.startsAt),
    index("appointments_customer_idx").on(t.customerId),
    foreignKey({
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.businessId, t.serviceId],
      foreignColumns: [services.businessId, services.id],
    }),
    foreignKey({ columns: [t.businessId, t.staffId], foreignColumns: [staff.businessId, staff.id] }),
    foreignKey({
      columns: [t.businessId, t.conversationId],
      foreignColumns: [conversations.businessId, conversations.id],
    }),
  ],
);

// ─── Knowledge base ──────────────────────────────────────────────────
export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: id(),
    businessId: businessRef(),
    kind: knowledgeKind("kind").notNull(),
    title: text("title").notNull(),
    /** Raw text (text/faq/document) — for FAQs: "Q: …\nA: …" */
    content: text("content"),
    url: text("url"),
    status: knowledgeStatus("status").notNull().default("pending"),
    error: text("error"),
    chunkCount: integer("chunk_count").notNull().default(0),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("knowledge_sources_business_id_unique").on(t.businessId, t.id)],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: id(),
    businessId: businessRef(),
    sourceId: uuid("source_id").notNull(),
    position: integer("position").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    createdAt: createdAt(),
  },
  (t) => [
    index("knowledge_chunks_business_idx").on(t.businessId),
    foreignKey({
      columns: [t.businessId, t.sourceId],
      foreignColumns: [knowledgeSources.businessId, knowledgeSources.id],
    }).onDelete("cascade"),
  ],
);

// ─── AI configuration ────────────────────────────────────────────────
export type AiPermissions = {
  answer_faqs: boolean;
  capture_leads: boolean;
  book_appointments: boolean;
  reschedule_appointments: boolean;
  cancel_appointments: boolean;
  send_messages: boolean;
  create_follow_ups: boolean;
  request_reviews: boolean;
  update_customers: boolean;
  /** Not implemented as AI tools; kept so owners see they are explicitly off. */
  issue_refunds: boolean;
  change_prices: boolean;
};

export const aiAgents = pgTable(
  "ai_agents",
  {
    id: id(),
    businessId: businessRef(),
    kind: text("kind").notNull().default("receptionist"),
    name: text("name").notNull().default("Front Desk"),
    tone: text("tone").notNull().default("friendly"),
    /** 0 = casual … 100 = very formal */
    formality: integer("formality").notNull().default(50),
    /** 0 = strictly professional … 100 = very warm */
    warmth: integer("warmth").notNull().default(60),
    emojiUsage: text("emoji_usage").notNull().default("none"), // none | light | frequent
    greeting: text("greeting"),
    languages: text("languages").array().notNull().default(sql`'{en}'::text[]`),
    brandPersonality: text("brand_personality"),
    customInstructions: text("custom_instructions"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("ai_agents_business_kind_unique").on(t.businessId, t.kind)],
);

export type FollowUpConfig = {
  enabled: boolean;
  delayHours: number;
  maxAttempts: number;
  style: "gentle" | "direct" | "value";
  stopWhenLeadLost: boolean;
};
export type ReminderConfig = {
  confirmation: boolean;
  reminder24h: boolean;
  sameDay: boolean;
  sameDayHoursBefore: number;
  templates: { confirmation: string; reminder_24h: string; same_day: string };
};
export type ReviewConfig = {
  enabled: boolean;
  delayHours: number;
  positiveThreshold: number;
  links: { label: string; url: string }[];
  template: string;
};
export type WidgetConfig = {
  title: string;
  accentColor: string;
  position: "right" | "left";
  logoUrl: string | null;
  greeting: string | null;
};
export type MissedOpportunityConfig = { noReturnDays: number; staleLeadHours: number };
export type BookingRules = { requireName: boolean; requireContact: boolean };
export type RecoveryConfig = {
  missedCall: {
    /** Track missed calls as opportunities. */
    enabled: boolean;
    /** Let the AI text the caller back (also needs the "Send messages" AI permission). */
    textBack: boolean;
    template: string;
  };
  slots: {
    /** Track freed slots (cancellations, reschedules, slot.opened events) and rank waitlisted customers for them. */
    enabled: boolean;
    /** Offer freed slots automatically; when off, a person clicks "Recover slot" to send the offers. */
    autoOffer: boolean;
    /** How many top candidates are offered a slot at once (first to accept gets it). */
    batchSize: number;
    /** How long an offer stays open before the next candidates are tried. */
    offerMinutes: number;
    template: string;
  };
  leads: {
    /** Turn incoming leads (forms, ads, automation tools) into tracked opportunities. */
    enabled: boolean;
    /** Let the AI send the first message right away (also needs the "Send messages" AI permission). */
    firstTouch: boolean;
    template: string;
  };
};

export const aiSettings = pgTable("ai_settings", {
  businessId: uuid("business_id")
    .primaryKey()
    .references(() => businesses.id, { onDelete: "cascade" }),
  permissions: jsonb("permissions").$type<AiPermissions>().notNull(),
  followUp: jsonb("follow_up").$type<FollowUpConfig>().notNull(),
  reminders: jsonb("reminders").$type<ReminderConfig>().notNull(),
  reviews: jsonb("reviews").$type<ReviewConfig>().notNull(),
  widget: jsonb("widget").$type<WidgetConfig>().notNull(),
  missedOpportunities: jsonb("missed_opportunities").$type<MissedOpportunityConfig>().notNull(),
  booking: jsonb("booking").$type<BookingRules>().notNull().default({ requireName: true, requireContact: true }),
  recovery: jsonb("recovery")
    .$type<RecoveryConfig>()
    .notNull()
    .default({
      missedCall: {
        enabled: true,
        textBack: true,
        template: "Hi, this is {{business}} — sorry we missed your call! How can we help? Reply here and we'll take care of you.",
      },
      slots: {
        enabled: true,
        autoOffer: false,
        batchSize: 3,
        offerMinutes: 60,
        template: "Hi {{customer_name}}, good news — a {{service}} appointment just opened up at {{business}}: {{when}}. Reply YES to take it (first come, first served).",
      },
      leads: {
        enabled: true,
        firstTouch: true,
        template: "Hi {{customer_name}}, thanks for your enquiry{{about_service}} at {{business}}! When would suit you? Reply here and I'll check availability.",
      },
    }),
  updatedAt: updatedAt(),
});

/** Every tool call the AI attempts — successful, failed or denied by permissions. */
export const aiActions = pgTable(
  "ai_actions",
  {
    id: id(),
    businessId: businessRef(),
    conversationId: uuid("conversation_id"),
    agentId: uuid("agent_id"),
    tool: text("tool").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<unknown>(),
    status: aiActionStatus("status").notNull(),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_actions_business_idx").on(t.businessId, t.createdAt),
    index("ai_actions_conversation_idx").on(t.conversationId),
  ],
);

// ─── Automations ─────────────────────────────────────────────────────
export const followUps = pgTable(
  "follow_ups",
  {
    id: id(),
    businessId: businessRef(),
    customerId: uuid("customer_id").notNull(),
    leadId: uuid("lead_id"),
    conversationId: uuid("conversation_id"),
    attempt: integer("attempt").notNull().default(1),
    reason: text("reason"),
    /** Explicit message; if null the message is composed at send time. */
    message: text("message"),
    /**
     * lead: a nudge to someone who enquired and went quiet (all stop conditions, re-armed up to maxAttempts).
     * missed_call: a single text-back to someone whose call went unanswered — they contacted us, so an
     * existing booking doesn't stop it (they may be calling about it), and it is never repeated.
     * first_touch: the first reply to a new lead from a form/ad/automation tool; sent once, never re-armed.
     * slot_offer: offering a freed slot to someone on the waitlist (they asked for it, so an existing booking doesn't stop it).
     */
    purpose: text("purpose").$type<"lead" | "missed_call" | "first_touch" | "slot_offer">().notNull().default("lead"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: scheduledStatus("status").notNull().default("scheduled"),
    /** Why it was cancelled/skipped/failed, or the delivery result. */
    statusReason: text("status_reason"),
    createdBy: actorType("created_by").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("follow_ups_due_idx").on(t.status, t.scheduledFor),
    index("follow_ups_business_idx").on(t.businessId),
    foreignKey({
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
    foreignKey({ columns: [t.businessId, t.leadId], foreignColumns: [leads.businessId, leads.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const appointmentReminders = pgTable(
  "appointment_reminders",
  {
    id: id(),
    businessId: businessRef(),
    appointmentId: uuid("appointment_id").notNull(),
    kind: reminderKind("kind").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: scheduledStatus("status").notNull().default("scheduled"),
    statusReason: text("status_reason"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("reminders_due_idx").on(t.status, t.scheduledFor),
    foreignKey({
      columns: [t.businessId, t.appointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
    }).onDelete("cascade"),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    businessId: businessRef(),
    appointmentId: uuid("appointment_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    /** Public token for the rating page (/r/[token]). */
    token: text("token").notNull(),
    status: reviewStatus("status").notNull().default("scheduled"),
    statusReason: text("status_reason"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    rating: smallint("rating"),
    feedback: text("feedback"),
    /** positive → public review links shown; negative → routed privately to owner */
    routedTo: text("routed_to"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reviews_token_idx").on(t.token),
    uniqueIndex("reviews_appointment_idx").on(t.appointmentId),
    index("reviews_due_idx").on(t.status, t.scheduledFor),
    foreignKey({
      columns: [t.businessId, t.appointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
  ],
);

/** A missed opportunity the team dismissed (opportunities themselves are computed live). */
export const opportunityDismissals = pgTable(
  "opportunity_dismissals",
  {
    id: id(),
    businessId: businessRef(),
    key: text("key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("opportunity_dismissals_key_idx").on(t.businessId, t.key)],
);

// ─── Opportunity Engine ──────────────────────────────────────────────
/** Where a customer journey is. Derived from evidence; never set by the model alone. */
export const opportunityStage = pgEnum("opportunity_stage", [
  "new_lead",
  "interested",
  "high_intent",
  "booking_in_progress",
  "needs_follow_up",
  "waiting",
  "booked",
  "cancelled",
  "no_show",
  "reactivation",
  "needs_human",
  "completed",
  "lost",
]);
export const opportunityKind = pgEnum("opportunity_kind", ["lead", "cancellation", "no_show", "reactivation", "needs_human", "missed_call"]);
export const opportunityStatus = pgEnum("opportunity_status", ["open", "won", "lost", "dismissed"]);
export const opportunityBlocker = pgEnum("opportunity_blocker", [
  "none",
  "price",
  "availability",
  "undecided",
  "consulting_someone",
  "unresponsive",
  "opted_out",
  "needs_staff",
]);
export const opportunityAction = pgEnum("opportunity_action", ["follow_up", "offer_rebooking", "reactivate", "human_review", "none"]);

/** One piece of evidence behind an opportunity's classification. */
export type OpportunityEvidence = { at: string; kind: string; detail: string; messageId?: string };

/**
 * A customer opportunity: what is happening, what they want, what is
 * blocking conversion, what should happen next (and whether the AI may do
 * it), and the outcome. At most one OPEN opportunity exists per key, so
 * re-evaluating is idempotent and safe under concurrency.
 */
export const opportunities = pgTable(
  "opportunities",
  {
    id: id(),
    businessId: businessRef(),
    /** Stable identity, e.g. `lead:<customerId>`, `cancellation:<appointmentId>`. */
    key: text("key").notNull(),
    kind: opportunityKind("kind").notNull(),
    stage: opportunityStage("stage").notNull(),
    status: opportunityStatus("status").notNull().default("open"),
    customerId: uuid("customer_id").notNull(),
    conversationId: uuid("conversation_id"),
    leadId: uuid("lead_id"),
    /** The appointment this opportunity is about (cancelled / no-show visit). */
    sourceAppointmentId: uuid("source_appointment_id"),
    serviceId: uuid("service_id"),
    title: text("title").notNull(),
    /** What the customer wants, in their terms (from facts, not guesses). */
    wants: text("wants"),
    blocker: opportunityBlocker("blocker").notNull().default("none"),
    blockerDetail: text("blocker_detail"),
    /** 0–100, computed from evidence. */
    intentScore: smallint("intent_score").notNull().default(0),
    nextAction: opportunityAction("next_action").notNull().default("none"),
    nextActionLabel: text("next_action_label"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    /** "ai" when automation may do it, "human" when staff must. */
    nextActionBy: text("next_action_by").notNull().default("human"),
    followUpId: uuid("follow_up_id"),
    evidence: jsonb("evidence").$type<OpportunityEvidence[]>().notNull().default([]),
    /** Service price when known — always presented as an estimate. */
    estimatedValueCents: integer("estimated_value_cents"),
    wonAppointmentId: uuid("won_appointment_id"),
    /** True only when an AI/staff recovery action preceded the booking. */
    recovered: boolean("recovered").notNull().default(false),
    recoveredValueCents: integer("recovered_value_cents"),
    closedReason: text("closed_reason"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("opportunities_open_key_idx").on(t.businessId, t.key).where(sql`${t.status} = 'open'`),
    index("opportunities_business_status_idx").on(t.businessId, t.status, t.stage),
    index("opportunities_next_action_idx").on(t.businessId, t.nextActionAt),
    index("opportunities_customer_idx").on(t.businessId, t.customerId),
    foreignKey({
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.businessId, t.conversationId],
      foreignColumns: [conversations.businessId, conversations.id],
    }),
    foreignKey({
      columns: [t.businessId, t.sourceAppointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
    }),
    foreignKey({
      columns: [t.businessId, t.wonAppointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
    }),
    foreignKey({ columns: [t.businessId, t.serviceId], foreignColumns: [services.businessId, services.id] }),
  ],
);

/** In-dashboard notifications for the team (handoffs, private negative reviews…). */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    businessId: businessRef(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_business_idx").on(t.businessId, t.createdAt)],
);

// ─── Integrations, audit, billing ───────────────────────────────────
export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    businessId: businessRef(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("disconnected"),
    /** Non-secret configuration only. Secrets live in environment variables / a vault. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /** Per-business signing secret (AES-256-GCM with APP_ENCRYPTION_KEY). Never returned to the browser except once on creation. */
    secretCiphertext: text("secret_ciphertext"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("integrations_business_provider_idx").on(t.businessId, t.provider)],
);

export const integrationEventStatus = pgEnum("integration_event_status", ["received", "processing", "processed", "ignored", "failed"]);

/**
 * Normalized events from the systems a business already uses (phone system,
 * forms, booking software). Each event is stored once per
 * (business, connector, external id) — retries and duplicate webhooks are
 * no-ops — and then processed by the revenue engine.
 */
export const integrationEvents = pgTable(
  "integration_events",
  {
    id: id(),
    businessId: businessRef(),
    connector: text("connector").notNull(),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: integrationEventStatus("status").notNull().default("received"),
    /** What processing did (or why it was ignored / failed). */
    result: text("result"),
    attempts: integer("attempts").notNull().default(0),
    /** Informational links (no FK: the event log outlives deleted customers). Always set by the processor, never from the payload. */
    customerId: uuid("customer_id"),
    opportunityId: uuid("opportunity_id"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("integration_events_external_idx").on(t.businessId, t.connector, t.externalId),
    index("integration_events_business_idx").on(t.businessId, t.createdAt),
    index("integration_events_pending_idx").on(t.status, t.updatedAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    businessId: businessRef(),
    actorType: actorType("actor_type").notNull(),
    actorId: text("actor_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_business_idx").on(t.businessId, t.createdAt),
    index("audit_entity_idx").on(t.entityType, t.entityId),
  ],
);

export type PlanEntitlements = {
  maxStaff: number | null;
  maxLocations: number | null;
  followUps: boolean;
  advancedAnalytics: boolean;
  channels: string[];
  voice: boolean;
};

export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // "starter", "growth", "pro"
  name: text("name").notNull(),
  description: text("description"),
  priceMonthlyCents: integer("price_monthly_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  features: text("features").array().notNull(),
  entitlements: jsonb("entitlements").$type<PlanEntitlements>().notNull(),
  stripePriceId: text("stripe_price_id"),
  highlighted: boolean("highlighted").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: text("plan_id").references(() => plans.id),
    status: text("status").notNull(), // trialing | active | past_due | canceled | none
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("subscriptions_org_idx").on(t.organizationId)],
);

// ─── Slot Recovery ────────────────────────────────────────────────────
export const waitlistStatus = pgEnum("waitlist_status", ["active", "booked", "removed"]);
export const slotStatus = pgEnum("slot_status", ["open", "offering", "pending_staff", "filled", "expired", "dismissed"]);
export const slotOfferStatus = pgEnum("slot_offer_status", ["sent", "accepted", "declined", "expired", "taken", "failed"]);
export type Daypart = "morning" | "afternoon" | "evening";

/** Customers who want an earlier/any appointment if one frees up. */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: id(),
    businessId: businessRef(),
    customerId: uuid("customer_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    /** Preferred staff member; null = anyone who performs the service. */
    staffId: uuid("staff_id"),
    earliestDate: text("earliest_date").notNull(), // YYYY-MM-DD, business timezone
    latestDate: text("latest_date"),
    dayparts: text("dayparts").array().$type<Daypart[]>().notNull().default([]),
    notes: text("notes"),
    status: waitlistStatus("status").notNull().default("active"),
    source: text("source").notNull(),
    createdBy: actorType("created_by").notNull(),
    bookedAppointmentId: uuid("booked_appointment_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("waitlist_entries_business_id_unique").on(t.businessId, t.id),
    index("waitlist_entries_active_idx").on(t.businessId, t.status),
    foreignKey({ columns: [t.businessId, t.customerId], foreignColumns: [customers.businessId, customers.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.businessId, t.serviceId], foreignColumns: [services.businessId, services.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.businessId, t.staffId], foreignColumns: [staff.businessId, staff.id] }),
  ],
);

/**
 * A freed slot — from a cancellation or reschedule in the built-in calendar,
 * or a `slot.opened` event from the business's own booking system — and what
 * happened to it.
 */
export const slotRecoveries = pgTable(
  "slot_recoveries",
  {
    id: id(),
    businessId: businessRef(),
    source: text("source").$type<"cancellation" | "reschedule" | "external">().notNull(),
    sourceAppointmentId: uuid("source_appointment_id"),
    /** Their system's id for an external slot (duplicates are ignored). */
    externalRef: text("external_ref"),
    staffId: uuid("staff_id"),
    /** The service of the freed appointment (built-in) or the one named by the event, if any. */
    serviceId: uuid("service_id"),
    /** Free text from an external system when it didn't match one of our services/staff. */
    label: text("label"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: slotStatus("status").notNull().default("open"),
    /** Value of the appointment that was lost (for "at risk" reporting). */
    lostValueCents: integer("lost_value_cents"),
    filledAppointmentId: uuid("filled_appointment_id"),
    filledCustomerId: uuid("filled_customer_id"),
    filledValueCents: integer("filled_value_cents"),
    filledBy: text("filled_by").$type<"ai" | "staff">(),
    statusNote: text("status_note"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("slot_recoveries_business_id_unique").on(t.businessId, t.id),
    uniqueIndex("slot_recoveries_source_appt_idx").on(t.businessId, t.sourceAppointmentId, t.startsAt).where(sql`${t.sourceAppointmentId} is not null`),
    uniqueIndex("slot_recoveries_external_idx").on(t.businessId, t.externalRef).where(sql`${t.externalRef} is not null`),
    index("slot_recoveries_status_idx").on(t.businessId, t.status, t.startsAt),
    foreignKey({ columns: [t.businessId, t.staffId], foreignColumns: [staff.businessId, staff.id] }),
    foreignKey({ columns: [t.businessId, t.serviceId], foreignColumns: [services.businessId, services.id] }),
  ],
);

/** One offer of a slot to one waitlisted customer. */
export const slotOffers = pgTable(
  "slot_offers",
  {
    id: id(),
    businessId: businessRef(),
    slotId: uuid("slot_id").notNull(),
    waitlistEntryId: uuid("waitlist_entry_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    status: slotOfferStatus("status").notNull().default("sent"),
    score: integer("score").notNull(),
    /** Why this person was chosen (shown to staff). */
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    conversationId: uuid("conversation_id"),
    followUpId: uuid("follow_up_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("slot_offers_slot_customer_idx").on(t.slotId, t.customerId),
    index("slot_offers_customer_idx").on(t.businessId, t.customerId, t.status),
    foreignKey({ columns: [t.businessId, t.slotId], foreignColumns: [slotRecoveries.businessId, slotRecoveries.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.businessId, t.waitlistEntryId], foreignColumns: [waitlistEntries.businessId, waitlistEntries.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.businessId, t.customerId], foreignColumns: [customers.businessId, customers.id] }).onDelete("cascade"),
  ],
);
