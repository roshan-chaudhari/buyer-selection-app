import type { ProjectItem } from "../services/projectService";
import type { InforUser } from "./api";

export interface ProjectDetailsPageProps {
  navigate: (path: string) => void;
  projectName: string;
  currentUser?: InforUser | null;
}

export interface GroupedStyle {
  styleMaterialNumber: string;
  styleMaterialName: string;
  annotatedImage?: string | null;
  selectionCondition: string;
  items: ProjectItem[];
}
