import { useEffect, useState, useCallback, useMemo } from "react";
import { projectService, type ProjectItem } from "../../services/projectService";
import { odata2Service, fetchStyleImage, odata2style } from "../../services/api";
import { extractODataList } from "../../utils/odata";
import type { ColorwayOption, InforUser } from "../../types/api";
import { useToast, type ToastState } from "../../hooks/useToast";
import type { GroupedStyle } from "../../types/projects";
import { PLM_SYNCED_SECTIONS } from "./constants";
import { groupItemsByStyle } from "./ProjectDetailsHelpers";
import { useProjectLoading } from "./useProjectLoading";
import { useProjectSort } from "./useProjectSort";
import { useProjectAnnotation } from "./useProjectAnnotation";
import { useProjectItemEditing } from "./useProjectItemEditing";
import { useProjectDeletion } from "./useProjectDeletion";
import { usePlmColorways } from "./usePlmColorways";
import type { TableType } from "../../types/table";

interface UseProjectDetailsProps {
  projectName: string;
  navigate: (path: string) => void;
  currentUser: InforUser | null;
}

// Global session cache for pre-fetched PLM style images to avoid re-fetching on mount/remount
const globalPlmImagesCache: Record<string, string> = {};

export function useProjectDetails({ projectName, navigate, currentUser }: UseProjectDetailsProps) {
  const { toast, showToast, clearToast } = useToast();

  // ── Sub-hooks ────────────────────────────────────────────────────────────────
  const {
    project, setProject,
    items,
    isLoading, setIsLoading,
    fetchProjectData,
    refreshItems,
  } = useProjectLoading({ projectName, navigate, showToast });

  const { sortColumn, sortDirection, sortedGroupedStyles, handleSort } =
    useProjectSort({ items });

  const { annotationItem, isAnnotationOpen, openAnnotation, closeAnnotation } =
    useProjectAnnotation();

  const { editStates, getDraftValue, handleFieldChange, handleInlineSave } =
    useProjectItemEditing({ project, showToast, refreshItems });

  const {
    deleteItemTarget, setDeleteItemTarget, isDeletingItem,
    deleteStyleTarget, setDeleteStyleTarget, isDeletingStyle,
    handleDeleteStyle, handleDeleteStyleConfirm, handleDeleteItemConfirm,
  } = useProjectDeletion({ project, showToast, refreshItems });

  const { plmColorwaysMap, resetAndReloadAll } =
    usePlmColorways({ sortedGroupedStyles });

  // ── PLM Style Images state ───────────────────────────────────────────────────
  const [plmImagesMap, setPlmImagesMap] = useState<Record<string, string>>(() => ({ ...globalPlmImagesCache }));
  const [loadingPlmImages, setLoadingPlmImages] = useState<Record<string, boolean>>({});
  const [plmImagesErrors, setPlmImagesErrors] = useState<Record<string, string>>({});


  const loadStyleImage = useCallback(async (styleMaterialNumber: string, styleId?: number) => {
    if (!currentUser) return;
    setLoadingPlmImages((prev) => ({ ...prev, [styleMaterialNumber]: true }));
    setPlmImagesErrors((prev) => ({ ...prev, [styleMaterialNumber]: "" }));
    try {
      let resolvedStyleId = styleId;
      if (!resolvedStyleId) {
        const isNum = styleMaterialNumber.length > 0 && /^\d+$/.test(styleMaterialNumber);
        const queryParams = isNum ? { StyleId: Number(styleMaterialNumber) } : { StyleCode: styleMaterialNumber };
        const response = await odata2style.getStyleData(queryParams);
        const styleList = extractODataList<any>(response);
        if (styleList.length > 0) {
          resolvedStyleId = styleList[0].StyleId;
        }
      }
      if (!resolvedStyleId) {
        throw new Error("Could not resolve StyleId from style code");
      }
      const imageUrl = await fetchStyleImage(resolvedStyleId, currentUser);
      const val = imageUrl || "";
      globalPlmImagesCache[styleMaterialNumber] = val;
      setPlmImagesMap((prev) => ({ ...prev, [styleMaterialNumber]: val }));
    } catch (err) {
      console.error(`[useProjectDetails] Failed to load style image for ${styleMaterialNumber}:`, err);
      setPlmImagesErrors((prev) => ({ ...prev, [styleMaterialNumber]: err instanceof Error ? err.message : String(err) }));
      globalPlmImagesCache[styleMaterialNumber] = ""; // cache empty string to prevent infinite retry loops
      setPlmImagesMap((prev) => ({ ...prev, [styleMaterialNumber]: "" }));
    } finally {
      setLoadingPlmImages((prev) => ({ ...prev, [styleMaterialNumber]: false }));
    }
  }, [currentUser]);

  // Pre-fetch style images when list is loaded
  useEffect(() => {
    if (!currentUser) return;
    sortedGroupedStyles.forEach((group) => {
      const firstItem = group.items[0];
      if (
        firstItem &&
        plmImagesMap[group.styleMaterialNumber] === undefined &&
        globalPlmImagesCache[group.styleMaterialNumber] === undefined &&
        !loadingPlmImages[group.styleMaterialNumber]
      ) {
        void loadStyleImage(group.styleMaterialNumber, firstItem.styleId);
      }
    });
  }, [sortedGroupedStyles, plmImagesMap, loadingPlmImages, loadStyleImage, currentUser]);

  // ── UI State ─────────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ProjectItem | null>(null);
  const [statusOptions, setStatusOptions] = useState<{ value: string; label: string; id: number }[]>([]);

  // Compatibility adapter for ProjectDetailsModals setToast prop
  const setToast = useCallback((t: ToastState | null) => {
    if (t) showToast(t.message, t.type);
    else clearToast();
  }, [showToast, clearToast]);

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

  // ── Cross-cutting Handlers ────────────────────────────────────────────────────
  const handleSyncProject = useCallback(() => {
    setProject((prev) =>
      prev ? { ...prev, section: PLM_SYNCED_SECTIONS[0] } : prev
    );
    showToast("Project synchronized successfully!");
  }, [setProject, showToast]);

  const handleProjectSave = useCallback((updated: TableType) => {
    setProject(updated);
    showToast("Project updated successfully");
    if (updated.ProjectName !== projectName) {
      navigate(`/project/${encodeURIComponent(updated.ProjectName)}`);
    }
  }, [projectName, navigate, showToast, setProject]);

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

  const handleSaveAnnotation = useCallback(async (itemId: number, annotatedDataUrl: string) => {
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
      showToast(err instanceof Error ? err.message : "Failed to save annotation", "error");
    }
  }, [items, project, showToast, refreshItems]);

  const handleAddStyles = useCallback(async (updated: TableType) => {
    setProject(updated);
    showToast("Styles added successfully");
    if (!updated.id) return;
    await refreshItems(updated.id);
  }, [showToast, refreshItems, setProject]);

  const handleColorwayDropdownChange = useCallback(async (
    row: GroupedStyle,
    _selectedValues: string[],
    allColorways: ColorwayOption[],
    newValStr: string,
  ) => {
    const newVals = newValStr.split(",").map((s) => s.trim()).filter(Boolean);
    const colorwaysWithIds = newVals.map((name) => {
      const match = allColorways.find((opt) => opt.value.toLowerCase() === name.toLowerCase());
      return { colorway: name, colorId: match ? match.colorwayId : 0 };
    });

    const firstItem = row.items[0];
    if (!firstItem || !firstItem.id) return;

    try {
      await projectService.updateProjectItem(firstItem.id, {
        styleId: firstItem.styleId ?? 0,
        colorId: colorwaysWithIds[0]?.colorId ?? 0,
        colorStatusId: firstItem.colorStatusId ?? 0,
        styleMaterialNumber: firstItem.styleMaterialNumber,
        styleMaterialName: firstItem.styleMaterialName,
        colorway: newVals.join(", "),
        colorwayStatus: firstItem.colorwayStatus || "Pending",
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
      showToast(err instanceof Error ? err.message : "Failed to update colorways", "error");
    }
  }, [project, showToast, refreshItems]);

  const handleConditionChange = useCallback(async (row: GroupedStyle, newCondition: string) => {
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
      showToast(err instanceof Error ? err.message : "Failed to update selection condition", "error");
    }
  }, [project, showToast, refreshItems]);

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
          .map((item) => projectService.deleteProjectItem(item.id!))
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
