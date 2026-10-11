import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QualityEmailRetryButton } from "./quality-email-retry-dialog";

const state = vi.hoisted(() => ({
  authenticated: true,
  mutate: vi.fn(),
  preview: {
    version: "a".repeat(64), recipient: "original@example.invalid", currentRecipient: "original@example.invalid",
    sender: "sender@example.invalid", subject: "Saved subject", body: "Saved decision: 42 cups",
    requiresReconciliation: true, blockedReason: null as string | null, expiresAt: "2026-10-12T12:00:00Z",
  },
}));
vi.mock("@workspace/replit-auth-web", () => ({ useAuth: () => ({ isAuthenticated: state.authenticated, user: { id: "test" } }) }));
vi.mock("@workspace/api-client-react", () => ({
  usePreviewQualityEmailRetry: () => ({ data: state.preview, isFetching: false, isError: false }),
  useConfirmQualityEmailRetry: () => ({ mutate: state.mutate, isPending: false }),
  getListQualityActionsQueryKey: () => ["history"],
}));
vi.mock("@/lib/trace-shared", () => ({ errMessage: (e: Error) => e.message }));
afterEach(() => { cleanup(); state.mutate.mockClear(); state.authenticated = true; state.preview.blockedReason = null; });
const mount = () => render(<QueryClientProvider client={new QueryClient()}><QualityEmailRetryButton requestId="decision-test" /></QueryClientProvider>);

describe("retry confirmation", () => {
  it("shows original contents and requires recorded reconciliation before sending", () => {
    mount();
    fireEvent.click(screen.getByText("Review email retry"));
    expect(screen.getByText("Saved subject")).toBeTruthy();
    expect(screen.getByText("Saved decision: 42 cups")).toBeTruthy();
    const confirm = screen.getByText("Confirm & retry original email") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Resend log reconciliation details"), { target: { value: "Checked logs: no accepted email." } });
    expect(confirm.disabled).toBe(false);
    expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(state.mutate).toHaveBeenCalledOnce();
    expect(state.mutate.mock.calls[0][0]).toEqual({ requestId: "decision-test", data: {
      version: state.preview.version, confirmed: true, logsCheckedNoAcceptance: true, reconciliation: "Checked logs: no accepted email.",
    } });
  });
  it("cancel sends nothing and a blocked preview cannot be confirmed", () => {
    state.preview.blockedReason = "Safe window expired";
    mount();
    fireEvent.click(screen.getByText("Review email retry"));
    expect(screen.getByRole("alert").textContent).toContain("Safe window expired");
    expect((screen.getByText("Confirm & retry original email") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Cancel, send nothing"));
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("does not offer retries while signed out", () => {
    state.authenticated = false;
    mount();
    expect(screen.queryByText("Review email retry")).toBeNull();
  });
});
