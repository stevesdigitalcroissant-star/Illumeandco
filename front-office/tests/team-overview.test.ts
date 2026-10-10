/** Team overview: owners see everyone, managers see the staff under them, staff see nothing; numbers come from real activity. */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, conversations, messages, staff as staffTable } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { createCustomer } from "@/server/services/customers";
import { inviteNewMember } from "@/server/services/team";
import { personDetail, setReportsTo, teamOverview, visibleTeam } from "@/server/services/team-overview";
import { createClinic } from "./helpers";

const HOUR = 3600_000;
const since = new Date(Date.now() - 30 * 24 * HOUR);

async function team() {
  const c = await createClinic();
  const add = async (name: string, role: "manager" | "staff") => {
    const m = await inviteNewMember(c.ctx, { name, email: `${name.toLowerCase().replace(/\W/g, "")}-${randomBytes(4).toString("hex")}@test.dev`, role });
    const [row] = await db.query.organizationMembers.findMany({ where: (t, { eq }) => eq(t.id, m.memberId) });
    const ctx: Ctx = { businessId: c.business.id, actor: { type: "user", userId: row!.userId, name, role } };
    return { memberId: m.memberId, userId: row!.userId, ctx };
  };
  const maya = await add("Maya Manager", "manager");
  const omar = await add("Omar Manager", "manager");
  const sara = await add("Sara Staff", "staff");
  const tom = await add("Tom Staff", "staff");
  const nina = await add("Nina Staff", "staff");
  await setReportsTo(c.ctx, sara.memberId, maya.memberId);
  await setReportsTo(c.ctx, tom.memberId, omar.memberId);
  return { c, maya, omar, sara, tom, nina };
}

describe("who sees whom", () => {
  it("owner sees everyone; a manager sees their staff and unassigned staff; staff can't look", async () => {
    const t = await team();
    const names = async (ctx: Ctx) => (await visibleTeam(ctx)).people.map((p) => p.name).sort();
    expect(await names(t.c.ctx)).toEqual(["Maya Manager", "Nina Staff", "Omar Manager", "Sara Staff", "Tom Staff"]);
    expect(await names(t.maya.ctx)).toEqual(["Nina Staff", "Sara Staff"]);
    expect(await names(t.omar.ctx)).toEqual(["Nina Staff", "Tom Staff"]);
    await expect(visibleTeam(t.sara.ctx)).rejects.toThrow();
    await expect(personDetail(t.maya.ctx, t.tom.memberId, since)).rejects.toThrow(/not found/i);
    await expect(personDetail(t.sara.ctx, t.nina.memberId, since)).rejects.toThrow();
  });

  it("only the owner sets reporting lines, only staff report, only to a manager — and never across organizations", async () => {
    const t = await team();
    const other = await createClinic("Other");
    await expect(setReportsTo(t.maya.ctx, t.nina.memberId, t.maya.memberId)).rejects.toThrow();
    await expect(setReportsTo(t.c.ctx, t.maya.memberId, t.omar.memberId)).rejects.toThrow(/Only staff/);
    await expect(setReportsTo(t.c.ctx, t.nina.memberId, t.sara.memberId)).rejects.toThrow(/Choose a manager/);
    await expect(setReportsTo(other.ctx, t.nina.memberId, null)).rejects.toThrow(/not found/i);
    expect((await visibleTeam(other.ctx)).people).toHaveLength(0);
    await setReportsTo(t.c.ctx, t.sara.memberId, null);
    expect((await visibleTeam(t.omar.ctx)).people.map((p) => p.name)).toContain("Sara Staff");
  });
});

describe("scorecards", () => {
  it("count assigned conversations, replies and reply speed, bookings made and appointments performed", async () => {
    const t = await team();
    const biz = t.c.business.id;
    const cust = (await createCustomer(t.c.ctx, { name: "Pat", phone: `+9715${String(randomBytes(4).readUInt32BE() % 1e8).padStart(8, "0")}` })).customer;
    const now = Date.now();
    // One conversation assigned to Sara, waiting on her; she replied 10 minutes after the customer earlier.
    const [conv] = await db
      .insert(conversations)
      .values({ businessId: biz, customerId: cust.id, channel: "web_chat", owner: "human", status: "human_handling", assignedUserId: t.sara.userId, lastMessageAt: new Date(now - HOUR), lastCustomerMessageAt: new Date(now - HOUR) })
      .returning();
    await db.insert(messages).values([
      { businessId: biz, conversationId: conv!.id, role: "customer", content: "Hi", channel: "web_chat", createdAt: new Date(now - 3 * HOUR) },
      { businessId: biz, conversationId: conv!.id, role: "human", authorUserId: t.sara.userId, content: "Hello!", channel: "web_chat", createdAt: new Date(now - 3 * HOUR + 10 * 60_000) },
      { businessId: biz, conversationId: conv!.id, role: "customer", content: "Thanks", channel: "web_chat", createdAt: new Date(now - HOUR) },
    ]);
    // Sara booked a whitening; Dr. Omar (staff on the calendar) is Tom's login and performed a cleaning; one no-show.
    await db.update(staffTable).set({ userId: t.tom.userId }).where(eq(staffTable.id, t.c.staff.omar.id));
    const appt = (o: Partial<typeof appointments.$inferInsert>) =>
      ({ businessId: biz, customerId: cust.id, serviceId: t.c.services.cleaning.id, staffId: t.c.staff.omar.id, source: "staff" as const, priceCents: 30000, ...o }) as typeof appointments.$inferInsert;
    const at = (h: number) => ({ startsAt: new Date(now + h * HOUR), endsAt: new Date(now + h * HOUR + 45 * 60_000), blockedUntil: new Date(now + h * HOUR + 45 * 60_000) });
    await db.insert(appointments).values([
      appt({ ...at(48), serviceId: t.c.services.whitening.id, staffId: t.c.staff.amira.id, priceCents: 65000, bookedByUserId: t.sara.userId }),
      appt({ ...at(-48), status: "completed" }),
      appt({ ...at(-24), status: "no_show" }),
    ]);

    const o = await teamOverview(t.maya.ctx, since);
    const sara = o.people.find((p) => p.name === "Sara Staff")!.stats;
    expect(sara).toMatchObject({ openConversations: 1, waitingOnThem: 1, replies: 1, avgReplyMinutes: 10, booked: 1, bookedValueCents: 65000 });
    expect(sara.lastActiveAt).not.toBeNull();
    const tom = (await teamOverview(t.omar.ctx, since)).people.find((p) => p.name === "Tom Staff")!.stats;
    expect(tom).toMatchObject({ completed: 1, completedValueCents: 30000, noShows: 1, replies: 0 });

    const detail = await personDetail(t.c.ctx, t.sara.memberId, since);
    expect(detail.conversations).toHaveLength(1);
    expect(detail.booked[0]).toMatchObject({ service: "Teeth whitening", priceCents: 65000 });
    // Another business's owner sees none of this.
    const other = await createClinic("Elsewhere");
    expect((await teamOverview(other.ctx, since)).people).toHaveLength(0);
  });
});
