// pnpm --filter @workspace/scripts exec tsx --tsconfig ../artifacts/ghazi-plast/tsconfig.json ../artifacts/ghazi-plast/src/components/packaging-allocations.test.tsx
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AllocationTrace } from "./packaging-allocations";

for (const quantity of [0.0001, 1.2345, 0.000000001, 125]) {
  const html = renderToStaticMarkup(<AllocationTrace allocations={[
    { finishedLotId: "FIN", customer: "Customer", quantity, unit: "kg" },
  ]}/>);
  assert.ok(html.includes(`<td>${String(quantity)} kg</td>`), `Trace must preserve ${quantity} kg`);
}
console.info("Exact allocation quantity rendering checks passed.");
