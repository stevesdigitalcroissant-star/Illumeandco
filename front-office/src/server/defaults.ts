import type {
  AiPermissions,
  FollowUpConfig,
  MissedOpportunityConfig,
  ReminderConfig,
  ReviewConfig,
  WidgetConfig,
} from "@/db/schema";

/** Safe defaults: the AI can inform, capture and book, but never refund or change prices. */
export const DEFAULT_AI_PERMISSIONS: AiPermissions = {
  answer_faqs: true,
  capture_leads: true,
  book_appointments: true,
  reschedule_appointments: true,
  cancel_appointments: true,
  send_messages: true,
  create_follow_ups: true,
  request_reviews: true,
  update_customers: true,
  issue_refunds: false,
  change_prices: false,
};

export const DEFAULT_FOLLOW_UP: FollowUpConfig = {
  enabled: true,
  delayHours: 24,
  maxAttempts: 2,
  style: "gentle",
  stopWhenLeadLost: true,
};

export const DEFAULT_REMINDERS: ReminderConfig = {
  confirmation: true,
  reminder24h: true,
  sameDay: true,
  sameDayHoursBefore: 3,
  templates: {
    confirmation:
      "Hi {{customer_name}}, your {{service}} at {{business}} is confirmed for {{date}} at {{time}}. Reply here if you need to change it.",
    reminder_24h:
      "Hi {{customer_name}}, a reminder that your {{service}} at {{business}} is tomorrow, {{date}} at {{time}}. See you then!",
    same_day:
      "Hi {{customer_name}}, see you today at {{time}} for your {{service}} at {{business}}.",
  },
};

export const DEFAULT_REVIEWS: ReviewConfig = {
  enabled: true,
  delayHours: 2,
  positiveThreshold: 4,
  links: [],
  template:
    "Hi {{customer_name}}, thank you for visiting {{business}}! How was your {{service}}? It takes 10 seconds: {{review_link}}",
};

export const DEFAULT_WIDGET: WidgetConfig = {
  title: "Chat with us",
  accentColor: "#0f766e",
  position: "right",
  logoUrl: null,
  greeting: null,
};

export const DEFAULT_MISSED_OPPORTUNITIES: MissedOpportunityConfig = {
  noReturnDays: 120,
  staleLeadHours: 48,
};

export const BUSINESS_TYPES = [
  { value: "clinic", label: "Clinic" },
  { value: "dentist", label: "Dentist" },
  { value: "salon", label: "Salon" },
  { value: "barber", label: "Barber" },
  { value: "spa", label: "Spa" },
  { value: "wellness", label: "Wellness" },
  { value: "other", label: "Other" },
] as const;

export const MEDICAL_TYPES = new Set(["clinic", "dentist", "wellness"]);
