import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationMembers } from "@/db/schema";
import { signUp, verifyCredentials } from "@/server/auth";
import type { Ctx } from "@/server/context";
import { addExistingMember, changeMemberRole, inviteNewMember, listMembers, removeMember } from "@/server/services/team";
import { createClinic } from "./helpers";
import { randomBytes } from "node:crypto";

const uniq = () => randomBytes(5).toString("hex");

describe("team & roles", () => {
  it("adds an existing account, invites a new one with a working temporary password, and lists both", async () => {
    const { ctx } = await createClinic();
    const email = `existing-${uniq()}@test.dev`;
    await signUp({ name: "Maya Manager", email, password: "correct-horse-battery" });
    await addExistingMember(ctx, { email: email.toUpperCase(), role: "manager" });
    await expect(addExistingMember(ctx, { email, role: "staff" })).rejects.toThrow(/already on the team/);
    await expect(addExistingMember(ctx, { email: `nobody-${uniq()}@test.dev`, role: "staff" })).rejects.toThrow(/No account/);

    const invitedEmail = `invited-${uniq()}@test.dev`;
    const inv = await inviteNewMember(ctx, { name: "Sam Staff", email: invitedEmail, role: "staff" });
    expect(inv.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(await verifyCredentials(invitedEmail, inv.temporaryPassword)).not.toBeNull();
    await expect(inviteNewMember(ctx, { name: "Dup", email, role: "staff" })).rejects.toThrow(/already exists/);

    const members = await listMembers(ctx);
    expect(members.map((m) => m.role).sort()).toEqual(["manager", "owner", "staff"]);
  });

  it("never removes or demotes the last owner, and only owners manage members", async () => {
    const { ctx, organization } = await createClinic();
    const [owner] = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, organization.id));
    await expect(removeMember(ctx, owner!.id)).rejects.toThrow(/last owner/);
    await expect(changeMemberRole(ctx, owner!.id, "manager")).rejects.toThrow(/at least one owner/);

    const inv = await inviteNewMember(ctx, { name: "Second Owner", email: `o2-${uniq()}@test.dev`, role: "manager" });
    await changeMemberRole(ctx, inv.memberId, "owner");
    await changeMemberRole(ctx, owner!.id, "manager"); // now allowed: another owner exists
    await expect(changeMemberRole(ctx, inv.memberId, "superuser")).rejects.toThrow(/Unknown role/);

    const managerCtx: Ctx = { ...ctx, actor: { type: "user", userId: owner!.userId, name: "M", role: "manager" } };
    await expect(inviteNewMember(managerCtx, { name: "X", email: `x-${uniq()}@test.dev`, role: "staff" })).rejects.toThrow(/permission/);
  });

  it("cannot touch members of another organization", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    const [bOwner] = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, b.organization.id));
    await expect(changeMemberRole(a.ctx, bOwner!.id, "staff")).rejects.toThrow(/not found/);
    await expect(removeMember(a.ctx, bOwner!.id)).rejects.toThrow(/not found/);
    const inv = await inviteNewMember(a.ctx, { name: "Temp", email: `t-${uniq()}@test.dev`, role: "staff" });
    await removeMember(a.ctx, inv.memberId);
    expect((await listMembers(a.ctx)).length).toBe(1);
  });
});
