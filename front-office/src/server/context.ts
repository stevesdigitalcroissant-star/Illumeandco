/**
 * Tenant context, actors and role-based permissions.
 *
 * Every service function receives a `Ctx`. The business id inside it is the
 * only tenant id a service may read or write — it is resolved from the
 * signed-in session (dashboard), the widget public key (website chat) or the
 * job row (background work), never from user-supplied request bodies.
 */
import type { Tx } from "@/db";
import { db as defaultDb } from "@/db";

export type Role = "owner" | "manager" | "staff";

export type Actor =
  | { type: "user"; userId: string; name: string; role: Role }
  | { type: "ai"; agentId: string | null; name: string }
  | { type: "system"; name: string }
  | { type: "customer"; customerId: string | null; name: string };

export type Ctx = {
  businessId: string;
  actor: Actor;
  /** Optional transaction; services default to the shared pool. */
  tx?: Tx;
};

export const dbOf = (ctx: Ctx): Tx => ctx.tx ?? defaultDb;

export const withTx = (ctx: Ctx, tx: Tx): Ctx => ({ ...ctx, tx });

export const systemCtx = (businessId: string, name = "System"): Ctx => ({
  businessId,
  actor: { type: "system", name },
});

// ─── Errors ───────────────────────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public code:
      | "not_found"
      | "forbidden"
      | "invalid"
      | "conflict"
      | "unavailable"
      | "not_configured"
      | "unauthenticated",
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export const notFound = (what: string) => new AppError("not_found", `${what} not found`);
export const forbidden = (msg = "You do not have permission to do that") => new AppError("forbidden", msg);
export const invalid = (msg: string) => new AppError("invalid", msg);
export const conflict = (msg: string) => new AppError("conflict", msg);

// ─── Role permissions (human users) ──────────────────────────────────
export type Permission =
  | "business.manage" // settings, services, staff, hours, knowledge, AI, automations
  | "billing.manage"
  | "members.manage"
  | "analytics.view"
  | "audit.view"
  | "conversations.view_all"
  | "conversations.reply"
  | "customers.view_all"
  | "customers.edit"
  | "leads.manage"
  | "appointments.view_all"
  | "appointments.manage";

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "business.manage",
    "billing.manage",
    "members.manage",
    "analytics.view",
    "audit.view",
    "conversations.view_all",
    "conversations.reply",
    "customers.view_all",
    "customers.edit",
    "leads.manage",
    "appointments.view_all",
    "appointments.manage",
  ]),
  manager: new Set<Permission>([
    "business.manage",
    "analytics.view",
    "audit.view",
    "conversations.view_all",
    "conversations.reply",
    "customers.view_all",
    "customers.edit",
    "leads.manage",
    "appointments.view_all",
    "appointments.manage",
  ]),
  // Staff work their assigned conversations, customers and appointments.
  staff: new Set<Permission>(["conversations.reply", "appointments.manage", "customers.edit"]),
};

export function roleCan(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Throws unless the actor may perform `permission`. Non-user actors are governed elsewhere (AI → ai/permissions.ts). */
export function assertCan(ctx: Ctx, permission: Permission) {
  if (ctx.actor.type !== "user") return;
  if (!roleCan(ctx.actor.role, permission)) throw forbidden();
}

export function isRestrictedStaff(ctx: Ctx): ctx is Ctx & { actor: { type: "user"; role: "staff"; userId: string } } {
  return ctx.actor.type === "user" && ctx.actor.role === "staff";
}

export function actorLabel(actor: Actor) {
  switch (actor.type) {
    case "user":
      return actor.name;
    case "ai":
      return actor.name;
    case "system":
      return actor.name;
    case "customer":
      return actor.name || "Customer";
  }
}

export function actorId(actor: Actor): string | null {
  switch (actor.type) {
    case "user":
      return actor.userId;
    case "ai":
      return actor.agentId;
    case "customer":
      return actor.customerId;
    default:
      return null;
  }
}
