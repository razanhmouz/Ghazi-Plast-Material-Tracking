import type { QueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { getGetTraceQueryKey } from "@workspace/api-client-react";
import type { RunUpdate } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export type Insp = RunUpdate["inspectionResult"];
export type Rel = RunUpdate["releaseDecision"];

export const INSP: Record<Insp, { label: string; cls: string; Icon: typeof CircleCheck }> = {
  pending: { label: "Pending", cls: "bg-muted text-muted-foreground border-border", Icon: CircleDashed },
  passed: { label: "Passed", cls: "bg-[hsl(158_42%_92%)] text-[hsl(158_50%_24%)] border-[hsl(158_35%_78%)]", Icon: CircleCheck },
  failed: { label: "Failed", cls: "bg-[hsl(356_60%_94%)] text-destructive border-[hsl(356_45%_82%)]", Icon: CircleX },
};
export const REL: Record<Rel, { label: string; cls: string; bar: string }> = {
  pending: { label: "Awaiting decision", cls: "bg-muted text-muted-foreground border-border", bar: "hsl(200 12% 62%)" },
  released: { label: "Released", cls: "bg-[hsl(158_42%_92%)] text-[hsl(158_50%_24%)] border-[hsl(158_35%_78%)]", bar: "hsl(158 42% 36%)" },
  hold: { label: "On hold", cls: "bg-[hsl(36_95%_90%)] text-[hsl(28_80%_30%)] border-[hsl(34_80%_72%)]", bar: "hsl(32 92% 52%)" },
  rejected: { label: "Rejected", cls: "bg-[hsl(356_60%_94%)] text-destructive border-[hsl(356_45%_82%)]", bar: "hsl(356 62% 42%)" },
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
