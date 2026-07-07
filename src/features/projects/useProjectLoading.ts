import { useState, useCallback, useEffect } from "react";
import { projectService, type ProjectItem } from "../../services/projectService";
import { getStoredToken } from "../../auth/tokenUtils";
import type { TableType } from "../../types/table";

type ShowToastFn = (message: string, type?: string) => void;

interface UseProjectLoadingProps {
  projectName: string;
  navigate: (path: string) => void;
  showToast: ShowToastFn;
}

export function useProjectLoading({ projectName, navigate, showToast }: UseProjectLoadingProps) {
  const [project, setProject] = useState<TableType | undefined>(undefined);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshItems = useCallback(async (projectId: number) => {
    const latest = await projectService.getItemsForProject(projectId);
    setItems(latest);
    return latest;
  }, []);

  const fetchProjectData = useCallback(async () => {
    const allProjects = await projectService.getAllProjects();
    const found = allProjects.find((p) => p.ProjectName === projectName);
    setProject(found);

    if (found?.id) {
      const projectItems = await projectService.getItemsForProject(found.id);
      setItems(projectItems);
      return { project: found, items: projectItems };
    }
    return { project: found, items: [] as ProjectItem[] };
  }, [projectName]);

  // Load project + items on mount
  useEffect(() => {
    if (!getStoredToken()) return;
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      try {
        await fetchProjectData();
      } catch (err) {
        console.error("[useProjectLoading] loadProject failed:", err);
        showToast("Failed to load project details", "error");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void load();
    return () => { isMounted = false; };
  }, [fetchProjectData, showToast]);

  // Redirect when project is not found after load
  useEffect(() => {
    if (!isLoading && !project) navigate("/dashboard");
  }, [isLoading, project, navigate]);

  return {
    project,
    setProject,
    items,
    isLoading,
    setIsLoading,
    fetchProjectData,
    refreshItems,
  };
}
