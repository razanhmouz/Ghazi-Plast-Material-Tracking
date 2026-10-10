import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, packagingTeams, packagingTeamMembers, usersTable } from "@workspace/db";
import { CreateEvidenceTeamBody } from "@workspace/api-zod";

export const teamsForUser = (userId: string) => db.select({ id: packagingTeams.id })
  .from(packagingTeams).where(or(eq(packagingTeams.ownerId, userId),
    inArray(packagingTeams.id, db.select({ id: packagingTeamMembers.teamId })
      .from(packagingTeamMembers).where(eq(packagingTeamMembers.userId, userId)))));

const router: IRouter = Router();
const base = "/packaging/teams";
router.use(base, (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Log in to manage evidence teams." }); return; }
  if (req.method !== "GET") {
    try {
      if (req.get("sec-fetch-site") === "cross-site" ||
          (req.get("origin") && new URL(req.get("origin")!).host !== req.get("host"))) {
        res.status(403).json({ error: "Use this application's page." }); return;
      }
    } catch { res.status(403).json({ error: "Invalid origin." }); return; }
  }
  next();
});
router.get(base, async (req, res) => {
  const ids = await teamsForUser(req.user!.id);
  const teams = ids.length ? await db.select().from(packagingTeams).where(inArray(packagingTeams.id, ids.map(t => t.id))) : [];
  const result = await Promise.all(teams.map(async team => ({
    id: team.id, name: team.name, isOwner: team.ownerId === req.user!.id,
    members: team.ownerId === req.user!.id
      ? (await db.select({ userId: packagingTeamMembers.userId }).from(packagingTeamMembers).where(eq(packagingTeamMembers.teamId, team.id))).map(m => m.userId)
      : [],
  })));
  res.json(result);
});
router.post(base, async (req, res) => {
  const input = CreateEvidenceTeamBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Provide a team name up to 80 characters." }); return; }
  if (!input.data.name.trim()) { res.status(400).json({ error: "Provide a team name." }); return; }
  const [team] = await db.insert(packagingTeams).values({ id: randomUUID(), name: input.data.name.trim(), ownerId: req.user!.id }).returning();
  res.status(201).json({ id: team.id, name: team.name, isOwner: true, members: [] });
});
router.put(`${base}/:teamId/members/:userId`, async (req, res) => {
  const [team] = await db.select().from(packagingTeams).where(and(eq(packagingTeams.id, req.params.teamId), eq(packagingTeams.ownerId, req.user!.id)));
  if (!team) { res.status(404).json({ error: "Team not found or you are not its owner." }); return; }
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, req.params.userId));
  if (!user) { res.status(400).json({ error: "Ask your colleague to log in and provide their exact account ID." }); return; }
  if (user.id === team.ownerId) { res.status(400).json({ error: "The owner already has access." }); return; }
  await db.insert(packagingTeamMembers).values({ teamId: team.id, userId: user.id }).onConflictDoNothing();
  res.status(204).end();
});
router.delete(`${base}/:teamId/members/:userId`, async (req, res) => {
  const [team] = await db.select().from(packagingTeams).where(and(eq(packagingTeams.id, req.params.teamId), eq(packagingTeams.ownerId, req.user!.id)));
  if (!team) { res.status(404).json({ error: "Team not found or you are not its owner." }); return; }
  await db.delete(packagingTeamMembers).where(and(eq(packagingTeamMembers.teamId, team.id), eq(packagingTeamMembers.userId, req.params.userId)));
  res.status(204).end();
});
router.use((error: unknown, req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
  req.log.error("Evidence team operation failed");
  res.status(503).json({ error: "Team operation failed. Please retry." });
});
export default router;
