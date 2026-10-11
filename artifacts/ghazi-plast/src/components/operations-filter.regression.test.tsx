import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Material, Run } from "@workspace/api-client-react";
import { filterOperations } from "@/lib/operations-filter";
import { OperationsTable } from "./operations-table";

vi.mock("@/components/delete-destination", () => ({
  DeleteDestination: ({ run, index }: { run: Run; index: number }) =>
    <div data-testid="delete-target">{run.destinations[index].name} · original index {index} · total {run.quantity}</div>,
}));
afterEach(cleanup);

const materials: Material[] = [{ id: "MAT-P77-001", supplier: "P-77", name: "Polypropylene resin", alert: "Supplier quality alert" }];
const runs: Run[] = [{
  id: "CUP-501", materialId: materials[0].id, quantity: 4000, inkLot: "INK-RED-42",
  inspectionResult: "passed", releaseDecision: "pending", qualityNotes: "Awaiting review", checklist: [], updatedAt: "2026-10-11T00:00:00Z",
  destinations: [
    { id: "dest-a", name: "Customer A", quantity: 2500, type: "shipped" },
    { id: "dest-b", name: "Customer B", quantity: 1500, type: "shipped", inspectionResult: "failed" },
  ],
}, {
  id: "CUP-502", materialId: materials[0].id, quantity: 3000, inkLot: "",
  inspectionResult: "passed", releaseDecision: "pending", qualityNotes: "", checklist: [], updatedAt: "2026-10-11T00:00:00Z",
  destinations: [
    { id: "dest-c", name: "Customer C", quantity: 2000, type: "shipped" },
    { id: "dest-stock", name: "Warehouse", quantity: 1000, type: "inventory" },
  ],
}];
const count = (query: string) => filterOperations(runs, materials, query).flatMap(group => group.rows).length;

describe("global operations filter", () => {
  it("matches related material IDs, supplier and material type without an API search", () => {
    for (const text of ["MAT-P77-001", "p-77", "polypropylene", "RESIN"]) expect(count(text)).toBe(4);
    expect(count("CUP-501")).toBe(2);
  });

  it("matches individual destinations rather than including their siblings", () => {
    const groups = filterOperations(runs, materials, "  cUsToMeR   B  ");
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map(row => row.destination?.name)).toEqual(["Customer B"]);
    expect(groups[0].rows[0].index).toBe(1);
    expect(groups[0].run).toBe(runs[0]);
    expect(runs[0].destinations).toHaveLength(2);
    expect(runs[0].quantity).toBe(4000);
  });

  it("searches raw and formatted quantities, ink, QC, checklist and inventory", () => {
    for (const query of ["2500", "2,500", "1,000", "failed", "inventory", "Warehouse"]) expect(count(query)).toBe(1);
    expect(count("INK-RED")).toBe(2);
    expect(count("Missing")).toBe(2);
    expect(count("passed")).toBe(3);
    expect(count("Open checklist")).toBe(4);
    expect(count("0 checks")).toBe(3);
  });

  it("clears to all records, treats punctuation literally, and preserves empty-destination batches", () => {
    expect(count("")).toBe(4);
    expect(count("   ")).toBe(4);
    expect(count("no such customer")).toBe(0);
    expect(count("[.*")).toBe(0);
    const empty = { ...runs[0], destinations: [] };
    expect(filterOperations([empty], materials, "No destination recorded")[0].rows[0].destination).toBeNull();
  });

  it("shows only matching rows and keeps edit, checklist and delete bound to the original records", () => {
    const onEdit = vi.fn(), onChecklist = vi.fn();
    render(<OperationsTable groups={filterOperations(runs, materials, "Customer B")} filter="Customer B" onEdit={onEdit} onChecklist={onChecklist} />);
    expect(screen.queryByTestId("row-op-CUP-501-0")).toBeNull();
    expect(screen.getByTestId("row-op-CUP-501-1")).toBeTruthy();
    expect(screen.queryByTestId("group-batch-CUP-502")).toBeNull();
    expect(screen.getByTestId("text-batch-total-CUP-501").textContent).toContain("4,000");
    fireEvent.click(screen.getByTestId("button-edit-ink-CUP-501"));
    expect(onEdit).toHaveBeenCalledWith(runs[0]);
    fireEvent.click(screen.getByTestId("link-checklist-CUP-501-1"));
    expect(onChecklist).toHaveBeenCalledWith(runs[0]);
    fireEvent.click(screen.getByTestId("button-delete-destination-CUP-501-1"));
    expect(screen.getByTestId("delete-target").textContent).toBe("Customer B · original index 1 · total 4000");
  });

  it("updates displayed rows immediately when the filter changes and restores them on clear", () => {
    const props = { onEdit: vi.fn(), onChecklist: vi.fn() };
    const { rerender } = render(<OperationsTable {...props} groups={filterOperations(runs, materials, "")} filter="" />);
    expect(screen.getAllByTestId(/^row-op-/)).toHaveLength(4);
    rerender(<OperationsTable {...props} groups={filterOperations(runs, materials, "Customer A")} filter="Customer A" />);
    expect(screen.getAllByTestId(/^row-op-/)).toHaveLength(1);
    rerender(<OperationsTable {...props} groups={[]} filter="not found" />);
    expect(screen.queryAllByTestId(/^row-op-/)).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toContain("No operations match");
    rerender(<OperationsTable {...props} groups={filterOperations(runs, materials, "")} filter="" />);
    expect(screen.getAllByTestId(/^row-op-/)).toHaveLength(4);
  });
});
