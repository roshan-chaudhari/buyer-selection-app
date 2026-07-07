import { useState, useCallback } from "react";
import type { ProjectItem } from "../../services/projectService";

export function useProjectAnnotation() {
  const [annotationItem, setAnnotationItem] = useState<ProjectItem | null>(null);
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false);

  const openAnnotation = useCallback((item: ProjectItem) => {
    setAnnotationItem(item);
    setIsAnnotationOpen(true);
  }, []);

  const closeAnnotation = useCallback(() => {
    setIsAnnotationOpen(false);
    setAnnotationItem(null);
  }, []);

  return { annotationItem, isAnnotationOpen, openAnnotation, closeAnnotation };
}
