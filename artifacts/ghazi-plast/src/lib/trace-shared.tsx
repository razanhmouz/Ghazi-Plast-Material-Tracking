import type { QueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { getGetTraceQueryKey } from "@workspace/api-client-react";
import type { RunUpdate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export type Insp = RunUpdate["inspectionResult"];
export type Rel = RunUpdate["releaseDecision"];

export const INSP: Record<Insp, { label: string; cls: string; Icon: typeof CircleCheck }> = {
  pending: { label: "Pending", cls: "bg-muted text-muted-foreground border-border", Icon: CircleDashed },
  passed: { label: "Passed", cls: "tone-ok", Icon: CircleCheck },
  failed: { label: "Failed", cls: "tone-bad", Icon: CircleX },
};
export const REL: Record<Rel, { label: string; cls: string; bar: string }> = {
  pending: { label: "Awaiting decision", cls: "bg-muted text-muted-foreground border-border", bar: "hsl(214 22% 50%)" },
  released: { label: "Released", cls: "tone-ok", bar: "hsl(158 64% 50%)" },
  hold: { label: "On hold", cls: "tone-warn", bar: "hsl(45 96% 52%)" },
  rejected: { label: "Rejected", cls: "tone-bad", bar: "hsl(356 75% 56%)" },
};
export const fmt = (n: number) => n.toLocaleString("en-US");

export function Pill({ cls, children, testId }: { cls: string; children: React.ReactNode; testId?: string }) {
  return <span data-testid={testId} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", cls)}>{children}</span>;
}

export function InspPill({ v, testId }: { v: Insp; testId?: string }) {
  const c = INSP[v];
  return <Pill cls={c.cls} testId={testId}><c.Icon className="h-3 w-3" />{c.label}</Pill>;
}

/** Invalidate every /api/trace variant (with or without search params). */
export function invalidateTrace(qc: QueryClient) {
  const root = getGetTraceQueryKey()[0];
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === root });
}

export function errStatus(e: unknown): number | undefined {
  return typeof e === "object" && e && "status" in e && typeof (e as { status: unknown }).status === "number" ? (e as { status: number }).status : undefined;
}
export function errMessage(e: unknown): string {
  const d = typeof e === "object" && e && "data" in e ? (e as { data: unknown }).data : null;
  if (d && typeof d === "object") {
    for (const k of ["error", "message", "detail"]) {
      const v = (d as Record<string, unknown>)[k];
      if (typeof v === "string") return v;
    }
  }
  return e instanceof Error ? e.message : "Unknown error";
}
