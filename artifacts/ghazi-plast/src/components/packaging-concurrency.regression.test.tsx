import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PackagingBatch } from "@workspace/api-client-react";
import { PackagingEditor } from "./packaging-record";

const api = vi.hoisted(() => ({ mutate: vi.fn(), reload: vi.fn() }));
vi.mock("@workspace/api-client-react", async importOriginal => ({
  ...await importOriginal<object>(),
  useUpdatePackagingBatch: () => ({ mutate: api.mutate, isPending: false }),
  useCreatePackagingBatch: () => ({ mutate: vi.fn(), isPending: false }),
  listPackagingBatches: api.reload,
}));
// Unrelated detail panels do not participate in the editor's conflict state.
vi.mock("./packaging-documents", () => ({ PackagingDocuments: () => null }));
vi.mock("./packaging-allocation-history", () => ({ PackagingAllocationHistory: () => null }));

const initial: PackagingBatch = {
  id: "test-batch", lotId: "LOT", category: "ink", materialName: "Initial material",
  supplierName: "Supplier", supplierCountry: "", supplierContact: "", quantity: 5,
  unit: "kg", status: "pending", complianceStatus: "pending", documentRef: "",
  complianceNotes: "", finishedBatches: [], destinations: [], demo: false,
  allocations: [{ finishedLotId: "FIN", customer: "Initial customer", quantity: 10, unit: "pieces" }],
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const newer: PackagingBatch = { ...initial, materialName: "Server material", allocations: [
  { ...initial.allocations![0], customer: "Server customer", quantity: 99 },
], updatedAt: "2026-01-01T00:00:00.001Z" };

afterEach(cleanup);
beforeEach(() => { api.mutate.mockReset(); api.reload.mockReset(); });
function setup() {
  const saved = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <PackagingEditor batch={initial} close={vi.fn()} saved={saved}/>
  </QueryClientProvider>);
  fireEvent.change(screen.getByTestId("input-packaging-materialName"), { target: { value: "My draft" } });
  fireEvent.change(screen.getByTestId("input-packaging-quantity"), { target: { value: "12.5" } });
  fireEvent.change(screen.getByTestId("input-packaging-finishedBatches"), { target: { value: "MY-FIN\nSECOND" } });
  fireEvent.change(screen.getByTestId("input-packaging-destinations"), { target: { value: "My destination" } });
  fireEvent.change(screen.getByLabelText("Allocation 1 customer"), { target: { value: "My customer" } });
  fireEvent.change(screen.getByLabelText("Allocation 1 quantity"), { target: { value: "42" } });
  return saved;
}
function assertDraft() {
  for (const [id, value] of Object.entries({
    materialName: "My draft", quantity: "12.5", finishedBatches: "MY-FIN\nSECOND", destinations: "My destination",
  })) expect((screen.getByTestId(`input-packaging-${id}`) as HTMLInputElement).value).toBe(value);
  expect((screen.getByLabelText("Allocation 1 customer") as HTMLInputElement).value).toBe("My customer");
  expect((screen.getByLabelText("Allocation 1 quantity") as HTMLInputElement).value).toBe("42");
}
function save() { fireEvent.click(screen.getByTestId("button-save-packaging")); }
function rejectWith(current: PackagingBatch) {
  api.mutate.mockImplementationOnce((_args, callbacks) => callbacks.onError({
    status: 409, data: { code: "EDIT_CONFLICT", current },
  }));
}

test("conflict → reload → explicit reconciliation keeps the entire draft and only then changes its token", async () => {
  const saved = setup();
  rejectWith(newer);
  save();
  expect(api.mutate.mock.calls[0][0].data.expectedUpdatedAt).toBe(initial.updatedAt);
  assertDraft();
  expect(screen.getByRole("region", { name: "Review conflicting record" }).textContent).toContain("Server customer");
  expect((screen.getByTestId("button-save-packaging") as HTMLButtonElement).disabled).toBe(true);
  const latest = { ...newer, updatedAt: "2026-01-01T00:00:00.002Z", materialName: "Even newer" };
  api.reload.mockResolvedValueOnce([latest]);
  fireEvent.click(screen.getByRole("button", { name: "Reload latest · keep my draft" }));
  await waitFor(() => expect(screen.getByText("Even newer")).toBeTruthy());
  assertDraft();
  expect(api.mutate).toHaveBeenCalledTimes(1);
  expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "I reviewed the latest · reconcile my draft" }));
  assertDraft();
  expect(api.mutate).toHaveBeenCalledTimes(1); // Review must not automatically save.
  const third = { ...latest, updatedAt: "2026-01-01T00:00:00.003Z" };
  rejectWith(third);
  save();
  expect(api.mutate.mock.calls[1][0].data).toMatchObject({
    expectedUpdatedAt: latest.updatedAt, materialName: "My draft", quantity: 12.5,
    finishedBatches: ["MY-FIN", "SECOND"], destinations: ["My destination"],
    allocations: [{ finishedLotId: "FIN", customer: "My customer", quantity: 42, unit: "pieces" }],
  });
  assertDraft();
  expect((screen.getByTestId("button-save-packaging") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "I reviewed the latest · reconcile my draft" }));
  api.mutate.mockImplementationOnce(({ data }, callbacks) => callbacks.onSuccess({ ...initial, ...data, updatedAt: "2026-01-01T00:00:00.004Z" }));
  save();
  expect(api.mutate.mock.calls[2][0].data.expectedUpdatedAt).toBe(third.updatedAt);
  expect(saved).toHaveBeenCalledTimes(1);
});

test.each(["network failure", "deleted record"])("failed reload preserves draft and conflict gate: %s", async reason => {
  setup();
  rejectWith(newer);
  save();
  if (reason === "network failure") api.reload.mockRejectedValueOnce(new Error("Network unavailable"));
  else api.reload.mockResolvedValueOnce([]);
  fireEvent.click(screen.getByRole("button", { name: "Reload latest · keep my draft" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(
    reason === "network failure" ? "Network unavailable" : "no longer exists",
  ));
  assertDraft();
  expect((screen.getByTestId("button-save-packaging") as HTMLButtonElement).disabled).toBe(true);
  expect(api.mutate).toHaveBeenCalledTimes(1);
});
