import { getSession, requireBusiness } from "@/lib/session";
import { AppError, roleCan } from "@/server/context";
import { exportCustomerData } from "@/server/services/privacy";

/** Download everything held about one customer as JSON (owners and managers). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("Not signed in", { status: 401 });
  const { ctx, role } = await requireBusiness();
  if (!roleCan(role, "business.manage")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  try {
    const data = await exportCustomerData(ctx, id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="customer-${id}.json"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof AppError && e.code === "not_found") return new Response("Not found", { status: 404 });
    throw e;
  }
}
