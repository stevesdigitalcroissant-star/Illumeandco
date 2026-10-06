/**
 * Team & roles. Membership is held at the organization that owns the current
 * business; every lookup is scoped to that organization, resolved from
 * ctx.businessId (never from client input).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db as rootDb, type Tx } from "@/db";
import { businesses, organizationMembers, sessions, users } from "@/db/schema";
import { audit } from "../audit";
import { hashPassword, normalizeEmail, randomToken } from "../auth";
import { AppError, assertCan, dbOf, invalid, notFound, type Ctx, type Role } from "../context";

const ROLES: Role[] = ["owner", "manager", "staff"];

function assertRole(role: string): asserts role is Role {
  if (!ROLES.includes(role as Role)) throw invalid("Unknown role.");
}

async function organizationOf(ctx: Ctx) {
  const b = await dbOf(ctx).query.businesses.findFirst({ where: eq(businesses.id, ctx.businessId), columns: { organizationId: true } });
  if (!b) throw notFound("Business");
  return b.organizationId;
}

export async function listMembers(ctx: Ctx) {
  assertCan(ctx, "business.manage");
  const organizationId = await organizationOf(ctx);
  return dbOf(ctx)
    .select({
      id: organizationMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMembers.role,
      createdAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(asc(organizationMembers.createdAt));
}

async function getMember(ctx: Ctx, memberId: string, organizationId: string) {
  const [m] = await dbOf(ctx)
    .select({ id: organizationMembers.id, userId: organizationMembers.userId, role: organizationMembers.role, name: users.name, email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, organizationId)));
  if (!m) throw notFound("Team member");
  return m;
}

async function ownerCount(tx: Tx, organizationId: string) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, "owner")));
  return r?.n ?? 0;
}

async function inTx<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>) {
  return ctx.tx ? fn(ctx.tx) : rootDb.transaction(fn);
}

/** Add an existing user account (looked up by email) to this organization. */
export async function addExistingMember(ctx: Ctx, input: { email: string; role: string }) {
  assertCan(ctx, "members.manage");
  assertRole(input.role);
  const email = normalizeEmail(input.email);
  const organizationId = await organizationOf(ctx);
  const user = await dbOf(ctx).query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (!user) throw new AppError("not_found", "No account uses that email. Create an invited account instead.");
  const existing = await dbOf(ctx).query.organizationMembers.findFirst({
    where: and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, user.id)),
  });
  if (existing) throw new AppError("conflict", `${user.name} is already on the team.`);
  const [m] = await dbOf(ctx).insert(organizationMembers).values({ organizationId, userId: user.id, role: input.role }).returning();
  await audit(ctx, {
    action: "member.updated",
    summary: `${user.name} (${user.email}) added to the team as ${input.role}`,
    entityType: "member",
    entityId: m!.id,
  });
  return { memberId: m!.id, name: user.name, email: user.email };
}

/**
 * Create a new user account with a one-time temporary password and add it to
 * the team. The password is returned once and never stored in plain text.
 */
export async function inviteNewMember(ctx: Ctx, input: { name: string; email: string; role: string }) {
  assertCan(ctx, "members.manage");
  assertRole(input.role);
  const name = input.name.trim();
  if (!name) throw invalid("Please enter the person's name.");
  const email = normalizeEmail(input.email);
  const organizationId = await organizationOf(ctx);
  const temporaryPassword = randomToken(12);
  const passwordHash = await hashPassword(temporaryPassword);
  const role = input.role;
  const result = await inTx(ctx, async (tx) => {
    const exists = await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
    if (exists) throw new AppError("conflict", "An account with that email already exists — add it as an existing account instead.");
    const [user] = await tx.insert(users).values({ email, name, passwordHash }).returning();
    const [m] = await tx.insert(organizationMembers).values({ organizationId, userId: user!.id, role }).returning();
    await audit({ ...ctx, tx }, {
      action: "member.updated",
      summary: `Account created for ${name} (${email}) and added to the team as ${role}`,
      entityType: "member",
      entityId: m!.id,
    });
    return { memberId: m!.id, name, email };
  });
  return { ...result, temporaryPassword };
}

export async function changeMemberRole(ctx: Ctx, memberId: string, role: string) {
  assertCan(ctx, "members.manage");
  assertRole(role);
  const organizationId = await organizationOf(ctx);
  return inTx(ctx, async (tx) => {
    const m = await getMember({ ...ctx, tx }, memberId, organizationId);
    if (m.role === role) return m;
    if (m.role === "owner" && (await ownerCount(tx, organizationId)) <= 1) throw invalid("Every organization needs at least one owner.");
    await tx.update(organizationMembers).set({ role }).where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, organizationId)));
    await audit({ ...ctx, tx }, {
      action: "member.updated",
      summary: `${m.name}'s role changed from ${m.role} to ${role}`,
      entityType: "member",
      entityId: memberId,
      details: { from: m.role, to: role },
    });
    return { ...m, role };
  });
}

export async function removeMember(ctx: Ctx, memberId: string) {
  assertCan(ctx, "members.manage");
  const organizationId = await organizationOf(ctx);
  await inTx(ctx, async (tx) => {
    const m = await getMember({ ...ctx, tx }, memberId, organizationId);
    if (m.role === "owner" && (await ownerCount(tx, organizationId)) <= 1) throw invalid("You can't remove the last owner.");
    await tx.delete(organizationMembers).where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, organizationId)));
    // Access is re-checked against membership on every request; also clear any
    // session still pointing at this organization's businesses.
    await tx.execute(sql`
      update ${sessions} set active_business_id = null
      where user_id = ${m.userId} and active_business_id in (select id from ${businesses} where organization_id = ${organizationId})`);
    await audit({ ...ctx, tx }, {
      action: "member.updated",
      summary: `${m.name} (${m.email}) removed from the team`,
      entityType: "member",
      entityId: memberId,
    });
  });
}
