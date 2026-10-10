import { and, desc, eq, lt } from "drizzle-orm";
import { db, packagingAccessHistory } from "@workspace/db";

export function historyCursor(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("Invalid history cursor");
  }
  return Number(value);
}

export async function accessHistory(scope: "teamId" | "documentId", id: string, before?: number) {
  const rows = await db.select({
    id: packagingAccessHistory.id, actorId: packagingAccessHistory.actorId,
    createdAt: packagingAccessHistory.createdAt, action: packagingAccessHistory.action,
    memberId: packagingAccessHistory.memberId, previousTeamId: packagingAccessHistory.previousTeamId,
    nextTeamId: packagingAccessHistory.nextTeamId,
  }).from(packagingAccessHistory).where(and(
    eq(packagingAccessHistory[scope], id),
    before === undefined ? undefined : lt(packagingAccessHistory.id, before),
  )).orderBy(desc(packagingAccessHistory.id)).limit(51);
  return { items: rows.slice(0, 50), nextBefore: rows.length > 50 ? rows[49].id : null };
}
