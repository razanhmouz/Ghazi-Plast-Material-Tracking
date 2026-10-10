type Allocation = { finishedLotId: string; customer: string; quantity: number; unit: string };

// Ordering is presentation only, not a change to the recorded mapping.
export function allocationsChanged(before: Allocation[], after: Allocation[]): boolean {
  const canonical = (items: Allocation[]) => JSON.stringify(items.map(a =>
    JSON.stringify([a.finishedLotId, a.customer, a.quantity, a.unit])
  ).sort());
  return canonical(before) !== canonical(after);
}
