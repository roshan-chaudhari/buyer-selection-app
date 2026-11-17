import { useState, useCallback, useMemo } from "react";
import { projectService, type ProjectItem } from "../../services/projectService";
import type { TableType } from "../../types/table";

import type { ToastType } from "../../hooks/useToast";
type ShowToastFn = (message: string, type?: ToastType) => void;

interface UseProjectItemEditingProps {
  project: TableType | undefined;
  showToast: ShowToastFn;
  refreshItems: (projectId: number) => Promise<ProjectItem[]>;
  statusOptions: { value: string; label: string; id: number }[];
  items?: ProjectItem[];
}

export function useProjectItemEditing({ project, showToast, refreshItems, statusOptions, items }: UseProjectItemEditingProps) {
  const [editStates, setEditStates] = useState<Record<number, Partial<ProjectItem>>>({});

  const hasUnsavedChanges = useMemo(() => {
    return Object.values(editStates).some(
      (draft) => draft && Object.keys(draft).length > 0
    );
  }, [editStates]);

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

  const discardAllDrafts = useCallback(() => {
    setEditStates({});
  }, []);

  const saveAllDrafts = useCallback(
    async (currentItems?: ProjectItem[]): Promise<boolean> => {
      const targetItems = currentItems || items || [];
      const dirtyIds = Object.keys(editStates)
        .map(Number)
        .filter((id) => {
          const draft = editStates[id];
          return draft && Object.keys(draft).length > 0;
        });

      if (dirtyIds.length === 0) return true;

      const resolveDraft = <T,>(drafted: T | undefined, fallback: T): T =>
        drafted !== undefined ? drafted : fallback;

      try {
        await Promise.all(
          dirtyIds.map(async (id) => {
            const item = targetItems.find((it) => it.id === id);
            if (!item) return;
            const drafts = editStates[id];
            if (!drafts) return;

            const finalStatus = resolveDraft(
              drafts.colorwayStatus,
              item.colorwayStatus || "Selected"
            );
            const matchedStatusOpt = statusOptions.find(
              (opt) => opt.value === finalStatus
            );
            const finalStatusId = matchedStatusOpt
              ? matchedStatusOpt.id
              : resolveDraft(drafts.colorStatusId, item.colorStatusId ?? 0);

            await projectService.updateProjectItem(item.id!, {
              styleId: item.styleId ?? 0,
              colorId: item.colorId ?? 0,
              colorStatusId: finalStatusId,
              styleMaterialNumber: item.styleMaterialNumber,
              styleMaterialName: item.styleMaterialName,
              colorway: item.colorway,
              colorwayStatus: finalStatus,
              selectionCondition: resolveDraft(
                drafts.selectionCondition,
                item.selectionCondition || "As-Is"
              ),
              sampleDue: resolveDraft(drafts.sampleDue, item.sampleDue),
              buyerComments: resolveDraft(
                drafts.buyerComments,
                item.buyerComments ?? ""
              ),
              internalComments: resolveDraft(
                drafts.internalComments,
                item.internalComments ?? ""
              ),
              annotatedImage: item.annotatedImage,
            });
          })
        );

        setEditStates({});
        showToast("All changes saved successfully!");
        if (project?.id) await refreshItems(project.id);
        return true;
      } catch (err) {
        console.error("[useProjectItemEditing] saveAllDrafts failed:", err);
        showToast(
          err instanceof Error ? err.message : "Failed to save changes",
          "error"
        );
        return false;
      }
    },
    [editStates, items, project, showToast, refreshItems, statusOptions]
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

    const finalStatus = resolveDraft(drafts.colorwayStatus, item.colorwayStatus || "Selected");
    const matchedStatusOpt = statusOptions.find(opt => opt.value === finalStatus);
    const finalStatusId = matchedStatusOpt ? matchedStatusOpt.id : resolveDraft(drafts.colorStatusId, item.colorStatusId ?? 0);

    try {
      await projectService.updateProjectItem(item.id, {
        styleId: item.styleId ?? 0,
        colorId: item.colorId ?? 0,
        colorStatusId: finalStatusId,
        styleMaterialNumber: item.styleMaterialNumber,
        styleMaterialName: item.styleMaterialName,
        colorway: item.colorway,
        colorwayStatus: finalStatus,
        selectionCondition: resolveDraft(drafts.selectionCondition, item.selectionCondition || "As-Is"),
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
  }, [editStates, project, showToast, refreshItems, statusOptions]);

  return {
    editStates,
    hasUnsavedChanges,
    getDraftValue,
    handleFieldChange,
    handleInlineSave,
    saveAllDrafts,
    discardAllDrafts,
  };
}
