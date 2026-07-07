import { useState, useCallback } from "react";
import { projectService, type ProjectItem } from "../../services/projectService";
import type { TableType } from "../../types/table";
import type { GroupedStyle } from "../../types/projects";

type ShowToastFn = (message: string, type?: string) => void;

interface UseProjectDeletionProps {
  project: TableType | undefined;
  showToast: ShowToastFn;
  refreshItems: (projectId: number) => Promise<ProjectItem[]>;
}

export function useProjectDeletion({ project, showToast, refreshItems }: UseProjectDeletionProps) {
  const [deleteItemTarget, setDeleteItemTarget] = useState<ProjectItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [deleteStyleTarget, setDeleteStyleTarget] = useState<GroupedStyle | null>(null);
  const [isDeletingStyle, setIsDeletingStyle] = useState(false);

  const handleDeleteStyle = useCallback((styleGroup: GroupedStyle) => {
    setDeleteStyleTarget(styleGroup);
  }, []);

  const handleDeleteStyleConfirm = useCallback(async () => {
    if (!deleteStyleTarget) return;
    setIsDeletingStyle(true);
    try {
      await Promise.all(
        deleteStyleTarget.items.map((item) =>
          item.id ? projectService.deleteProjectItem(item.id) : Promise.resolve(),
        ),
      );
      showToast("Style and all associated colorways deleted successfully");
      if (project?.id) await refreshItems(project.id);
    } catch (err) {
      console.error("[useProjectDeletion] handleDeleteStyleConfirm failed:", err);
      showToast(err instanceof Error ? err.message : "Failed to delete style", "error");
    } finally {
      setDeleteStyleTarget(null);
      setIsDeletingStyle(false);
    }
  }, [deleteStyleTarget, project, showToast, refreshItems]);

  const handleDeleteItemConfirm = useCallback(async () => {
    if (!deleteItemTarget?.id) return;
    setIsDeletingItem(true);
    try {
      await projectService.deleteProjectItem(deleteItemTarget.id);
      showToast("Colorway item deleted successfully");
      if (project?.id) await refreshItems(project.id);
    } catch (err) {
      console.error("[useProjectDeletion] handleDeleteItemConfirm failed:", err);
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setDeleteItemTarget(null);
      setIsDeletingItem(false);
    }
  }, [deleteItemTarget, project, showToast, refreshItems]);

  return {
    deleteItemTarget,
    setDeleteItemTarget,
    isDeletingItem,
    deleteStyleTarget,
    setDeleteStyleTarget,
    isDeletingStyle,
    handleDeleteStyle,
    handleDeleteStyleConfirm,
    handleDeleteItemConfirm,
  };
}
