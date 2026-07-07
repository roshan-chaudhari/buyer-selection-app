import { useState, useCallback } from "react";
import { projectService, type ProjectItem } from "../../services/projectService";
import type { TableType } from "../../types/table";

type ShowToastFn = (message: string, type?: string) => void;

interface UseProjectItemEditingProps {
  project: TableType | undefined;
  showToast: ShowToastFn;
  refreshItems: (projectId: number) => Promise<ProjectItem[]>;
}

export function useProjectItemEditing({ project, showToast, refreshItems }: UseProjectItemEditingProps) {
  const [editStates, setEditStates] = useState<Record<number, Partial<ProjectItem>>>({});

  const getDraftValue = useCallback(
    <K extends keyof ProjectItem>(item: ProjectItem, field: K): ProjectItem[K] => {
      if (!item.id) return item[field];
      const draft = editStates[item.id];
      if (draft && draft[field] !== undefined) return draft[field] as ProjectItem[K];
      return item[field];
    },
    [editStates],
  );

  const handleFieldChange = useCallback(
    <K extends keyof ProjectItem>(itemId: number, field: K, value: ProjectItem[K]) => {
      setEditStates((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], [field]: value },
      }));
    },
    [],
  );

  const handleInlineSave = useCallback(async (item: ProjectItem) => {
    if (!item.id) return;
    const drafts = editStates[item.id];
    if (!drafts) {
      showToast("No changes detected", "info");
      return;
    }

    const resolveDraft = <T,>(drafted: T | undefined, fallback: T): T =>
      drafted !== undefined ? drafted : fallback;

    try {
      await projectService.updateProjectItem(item.id, {
        styleId: item.styleId ?? 0,
        colorId: item.colorId ?? 0,
        colorStatusId: resolveDraft(drafts.colorStatusId, item.colorStatusId ?? 0),
        styleMaterialNumber: item.styleMaterialNumber,
        styleMaterialName: item.styleMaterialName,
        colorway: item.colorway,
        colorwayStatus: resolveDraft(drafts.colorwayStatus, item.colorwayStatus ?? "Pending"),
        selectionCondition: item.selectionCondition,
        sampleDue: resolveDraft(drafts.sampleDue, item.sampleDue),
        buyerComments: resolveDraft(drafts.buyerComments, item.buyerComments ?? ""),
        internalComments: resolveDraft(drafts.internalComments, item.internalComments ?? ""),
        annotatedImage: item.annotatedImage,
      });

      showToast("Colorway updated successfully!");
      setEditStates((prev) => {
        const updated = { ...prev };
        delete updated[item.id!];
        return updated;
      });

      if (project?.id) await refreshItems(project.id);
    } catch (err) {
      console.error("[useProjectItemEditing] handleInlineSave failed:", err);
      showToast(err instanceof Error ? err.message : "Failed to save colorway", "error");
    }
  }, [editStates, project, showToast, refreshItems]);

  return { editStates, getDraftValue, handleFieldChange, handleInlineSave };
}
