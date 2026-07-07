import { useState, useCallback, useMemo } from "react";
import type { ProjectItem } from "../../services/projectService";
import { groupItemsByStyle, sortGroupedStyles } from "./ProjectDetailsHelpers";

interface UseProjectSortProps {
  items: ProjectItem[];
}

export function useProjectSort({ items }: UseProjectSortProps) {
  const [sortColumn, setSortColumn] = useState("styleMaterialNumber");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const sortedGroupedStyles = useMemo(() => {
    const groups = groupItemsByStyle(items);
    return sortGroupedStyles(groups, sortColumn, sortDirection);
  }, [items, sortColumn, sortDirection]);

  const handleSort = useCallback((key: string) => {
    const isCurrentAsc = sortColumn === key && sortDirection === "asc";
    setSortDirection(isCurrentAsc ? "desc" : "asc");
    setSortColumn(key);
  }, [sortColumn, sortDirection]);

  return { sortColumn, sortDirection, sortedGroupedStyles, handleSort };
}
