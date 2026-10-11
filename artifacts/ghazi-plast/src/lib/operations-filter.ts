import type { Material, Run } from "@workspace/api-client-react";
import { INSP, REL, fmt } from "./trace-shared";

export type OperationsGroup = {
  run: Run;
  rows: { destination: Run["destinations"][number] | null; index: number }[];
};

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/g, " ");

/** Filter display rows only; retain original run objects and destination indexes for edits/deletion. */
export function filterOperations(runs: Run[], materials: Material[], search: string): OperationsGroup[] {
  const keyword = normalize(search);
  const materialById = new Map(materials.map(material => [material.id, material]));
  return runs.flatMap(run => {
    const material = materialById.get(run.materialId);
    const rows = run.destinations.length
      ? run.destinations.map((destination, index) => ({ destination, index }))
      : [{ destination: null, index: 0 }];
    const matchingRows = rows.filter(({ destination }) => {
      if (!keyword) return true;
      const inspection = destination?.inspectionResult ?? run.inspectionResult;
      const values = [
        run.id, run.materialId, material?.name, material?.supplier, material?.alert,
        run.quantity, fmt(run.quantity), "cups", run.inkLot || "Missing",
        destination?.name ?? "No destination recorded",
        destination?.type, destination?.type === "inventory" ? "Warehouse inventory" : destination ? "Shipped truck" : "",
        destination?.quantity, destination ? fmt(destination.quantity) : "—",
        inspection, INSP[inspection].label, destination?.inspectionResult ? "Row QC" : `${run.checklist.length} checks`,
        run.releaseDecision, REL[run.releaseDecision].label, run.qualityNotes,
        "QC Inspection Checklist Open checklist",
        ...run.checklist.flatMap(entry => Object.values(entry)),
      ];
      return normalize(values.filter(value => value != null).join(" ")).includes(keyword);
    });
    return matchingRows.length ? [{ run, rows: matchingRows }] : [];
  });
}
