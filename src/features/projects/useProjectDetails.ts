import { useEffect, useState, useCallback, useMemo } from "react";
import { projectService, type ProjectItem } from "../../services/projectService";
import { odata2Service } from "../../services/api";
import type { ColorwayOption, InforUser } from "../../types/api";
import { useToast, type ToastState } from "../../hooks/useToast";
import type { GroupedStyle } from "../../types/projects";
import type { TableType } from "../../types/table";
import { PLM_SYNCED_SECTIONS } from "./constants";
import { groupItemsByStyle } from "./ProjectDetailsHelpers";
import { useProjectLoading } from "./useProjectLoading";
import { useProjectSort } from "./useProjectSort";
import { useProjectAnnotation } from "./useProjectAnnotation";
import { useProjectItemEditing } from "./useProjectItemEditing";
import { useProjectDeletion } from "./useProjectDeletion";
import { usePlmColorways } from "./usePlmColorways";
import { usePlmStyleImages } from "./usePlmStyleImages";
import { useProjectSync } from "./useProjectSync";

interface UseProjectDetailsProps {
  projectName: string;
  navigate: (path: string) => void;
  currentUser: InforUser | null;
}

export function useProjectDetails({
  projectName,
  navigate,
  currentUser,
}: UseProjectDetailsProps) {
  const { toast, showToast, clearToast } = useToast();

  const [statusOptions, setStatusOptions] = useState<
    { value: string; label: string; id: number }[]
  >([]);

  // ── Sub-hooks ────────────────────────────────────────────────────────────────
  const {
    project,
    setProject,
    items,
    isLoading,
    setIsLoading,
    fetchProjectData,
    refreshItems,
  } = useProjectLoading({ projectName, navigate, showToast });

  const { sortColumn, sortDirection, sortedGroupedStyles, handleSort } =
    useProjectSort({ items });

  const { annotationItem, isAnnotationOpen, openAnnotation, closeAnnotation } =
    useProjectAnnotation();

  const { editStates, getDraftValue, handleFieldChange, handleInlineSave } =
    useProjectItemEditing({ project, showToast, refreshItems, statusOptions });

  const {
    deleteItemTarget,
    setDeleteItemTarget,
    isDeletingItem,
    deleteStyleTarget,
    setDeleteStyleTarget,
    isDeletingStyle,
    handleDeleteStyle,
    handleDeleteStyleConfirm,
    handleDeleteItemConfirm,
  } = useProjectDeletion({ project, showToast, refreshItems });

  const { plmColorwaysMap, resetAndReloadAll } = usePlmColorways({
    sortedGroupedStyles,
  });

  const { plmImagesMap, loadingPlmImages, plmImagesErrors, loadStyleImage } =
    usePlmStyleImages({ sortedGroupedStyles, currentUser });

  const { handleSyncProject, isSyncing } = useProjectSync({
    project,
    setProject,
    showToast,
    refreshItems,
    currentUser,
  });

  // ── UI State ─────────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ProjectItem | null>(null);

  // Compatibility adapter for ProjectDetailsModals setToast prop
  const setToast = useCallback(
    (t: ToastState | null) => {
      if (t) showToast(t.message, t.type);
      else clearToast();
    },
    [showToast, clearToast],
  );

  // Load colorway status dropdown options
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const options = await odata2Service.getLookupOptions(231);
        if (isMounted && options.length > 0) setStatusOptions(options);
      } catch (err) {
        console.error("Failed to load status options:", err);
      }
    };
    void load();
    return () => { isMounted = false; };
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const isSynced = useMemo(
    () => !!project && PLM_SYNCED_SECTIONS.includes(project.section || ""),
    [project],
  );

  const isLocked = useMemo(() => project?.isLocked ?? false, [project]);

  // ── Event Handlers ────────────────────────────────────────────────────────────

  const handleProjectSave = useCallback(
    (updated: TableType) => {
      setProject(updated);
      showToast("Project updated successfully");
      if (updated.ProjectName !== projectName) {
        navigate(`/project/${encodeURIComponent(updated.ProjectName)}`);
      }
    },
    [projectName, navigate, showToast, setProject],
  );

  const handleItemSave = useCallback(async () => {
    showToast("Item updated successfully");
    if (project?.id) {
      try {
        await refreshItems(project.id);
      } catch (err) {
        console.error("Failed to refresh project items after edit:", err);
      }
    }
  }, [project, showToast, refreshItems]);

  const handleSaveAnnotation = useCallback(
    async (itemId: number, annotatedDataUrl: string) => {
      const target = items.find((it) => it.id === itemId);
      if (!target) return;
      try {
        await projectService.updateProjectItem(itemId, {
          styleMaterialNumber: target.styleMaterialNumber,
          styleMaterialName: target.styleMaterialName,
          colorway: target.colorway,
          colorwayStatus: target.colorwayStatus,
          colorStatusId: target.colorStatusId,
          selectionCondition: target.selectionCondition,
          sampleDue: target.sampleDue,
          buyerComments: target.buyerComments,
          internalComments: target.internalComments,
          annotatedImage: annotatedDataUrl,
        });
        showToast("Annotation saved successfully!");
        if (project?.id) await refreshItems(project.id);
      } catch (err) {
        console.error("[useProjectDetails] handleSaveAnnotation failed:", err);
        showToast(
          err instanceof Error ? err.message : "Failed to save annotation",
          "error",
        );
      }
    },
    [items, project, showToast, refreshItems],
  );

  const handleAddStyles = useCallback(
    async (updated: TableType) => {
      setProject(updated);
      showToast("Styles added successfully");
      if (!updated.id) return;
      await refreshItems(updated.id);
    },
    [showToast, refreshItems, setProject],
  );

  const handleColorwayDropdownChange = useCallback(
    async (
      row: GroupedStyle,
      _selectedValues: string[],
      allColorways: ColorwayOption[],
      newValStr: string,
    ) => {
      const newVals = newValStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const colorwaysWithIds = newVals.map((name) => {
        const match = allColorways.find(
          (opt) => opt.value.toLowerCase() === name.toLowerCase(),
        );
        return { colorway: name, colorId: match ? match.colorwayId : 0 };
      });

      const firstItem = row.items[0];
      if (!firstItem || !firstItem.id) return;

      const selectedStatusOpt = statusOptions.find((opt) => opt.value === "Selected");
      const resolvedColorStatusId = selectedStatusOpt
        ? selectedStatusOpt.id
        : (firstItem.colorStatusId ?? 0);

      try {
        await projectService.updateProjectItem(firstItem.id, {
          styleId: firstItem.styleId ?? 0,
          colorId: colorwaysWithIds[0]?.colorId ?? 0,
          colorStatusId: resolvedColorStatusId,
          styleMaterialNumber: firstItem.styleMaterialNumber,
          styleMaterialName: firstItem.styleMaterialName,
          colorway: newVals.join(", "),
          colorwayStatus: "Selected",
          selectionCondition: firstItem.selectionCondition || "As-Is",
          sampleDue: firstItem.sampleDue,
          buyerComments: firstItem.buyerComments || "",
          internalComments: firstItem.internalComments || "",
          annotatedImage: firstItem.annotatedImage || null,
          colorwaysWithIds,
        });
        showToast("Colorways updated successfully!");
        if (project?.id) await refreshItems(project.id);
      } catch (err) {
        console.error("Failed to update colorways inline:", err);
        showToast(
          err instanceof Error ? err.message : "Failed to update colorways",
          "error",
        );
      }
    },
    [project, showToast, refreshItems, statusOptions],
  );

  const handleConditionChange = useCallback(
    async (row: GroupedStyle, newCondition: string) => {
      try {
        await Promise.all(
          row.items.map((item) =>
            item.id
              ? projectService.updateProjectItem(item.id, {
                  styleId: item.styleId ?? 0,
                  colorId: item.colorId ?? 0,
                  colorStatusId: item.colorStatusId ?? 0,
                  styleMaterialNumber: item.styleMaterialNumber,
                  styleMaterialName: item.styleMaterialName,
                  colorway: item.colorway,
                  colorwayStatus: item.colorwayStatus,
                  selectionCondition: newCondition,
                  sampleDue: item.sampleDue,
                  buyerComments: item.buyerComments || "",
                  internalComments: item.internalComments || "",
                  annotatedImage: item.annotatedImage,
                })
              : Promise.resolve(),
          ),
        );
        showToast("Selection condition updated successfully!");
        if (project?.id) await refreshItems(project.id);
      } catch (err) {
        console.error("[useProjectDetails] handleConditionChange failed:", err);
        showToast(
          err instanceof Error ? err.message : "Failed to update selection condition",
          "error",
        );
      }
    },
    [project, showToast, refreshItems],
  );

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { items: latestItems } = await fetchProjectData();
      const groups = groupItemsByStyle(latestItems);
      await resetAndReloadAll(groups);
      showToast("Data refreshed successfully");
    } catch (err) {
      console.error("[useProjectDetails] handleRefresh failed:", err);
      showToast("Failed to refresh data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [fetchProjectData, showToast, setIsLoading, resetAndReloadAll]);

  const handleClearProject = useCallback(async () => {
    if (!project?.id || items.length === 0) return;
    setIsLoading(true);
    try {
      await Promise.all(
        items
          .filter((item) => item.id)
          .map((item) => projectService.deleteProjectItem(item.id!)),
      );
      showToast("All styles cleared from project");
      await refreshItems(project.id);
    } catch (err) {
      console.error("[useProjectDetails] handleClearProject failed:", err);
      showToast("Failed to clear project styles", "error");
    } finally {
      setIsLoading(false);
    }
  }, [project, items, showToast, refreshItems, setIsLoading]);

  // ── Public API ────────────────────────────────────────────────────────────────
  return {
    project,
    items,
    isLoading,
    isEditing,
    setIsEditing,
    isAddModalOpen,
    setIsAddModalOpen,
    selectedItem,
    setSelectedItem,
    deleteItemTarget,
    setDeleteItemTarget,
    isDeletingItem,
    annotationItem,
    isAnnotationOpen,
    toast,
    setToast,
    editStates,
    statusOptions,
    plmColorwaysMap,
    plmImagesMap,
    loadingPlmImages,
    plmImagesErrors,
    loadStyleImage,
    sortColumn,
    sortDirection,
    sortedGroupedStyles,
    isSynced,
    isLocked,
    isSyncing,
    getDraftValue,
    handleSort,
    handleFieldChange,
    handleSyncProject,
    openAnnotation,
    closeAnnotation,
    handleProjectSave,
    handleItemSave,
    handleInlineSave,
    handleSaveAnnotation,
    deleteStyleTarget,
    setDeleteStyleTarget,
    isDeletingStyle,
    handleDeleteStyleConfirm,
    handleDeleteStyle,
    handleDeleteItemConfirm,
    handleAddStyles,
    handleColorwayDropdownChange,
    handleRefresh,
    handleConditionChange,
    handleClearProject,
  };
}
