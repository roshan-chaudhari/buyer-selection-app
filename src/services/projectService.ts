import { api } from './api';
import type { TableType } from '../types/table';
import type { InforUser } from '../types/api';
import { getErrorMessage } from '../utils/error';

export interface BackendProject {
  id: number;
  projectName: string;
  section: string;
  buyerId: number | null;
  buyerName: string | null;
  description: string | null;
  selectionDate: string | null;
  itemsCount: number;
  lastUpdated: string;
}

const mapBackendToTableType = (p: BackendProject): TableType => ({
  id: p.id,
  ProjectName: p.projectName || '',
  BuyerId: p.buyerId ?? undefined,
  BuyerName: p.buyerName || '',
  Description: p.description || '',
  SelectionDate: p.selectionDate ? new Date(p.selectionDate) : new Date(),
  Items: p.itemsCount || 0,
  LastUpdated: p.lastUpdated ? new Date(p.lastUpdated) : new Date(),
  Actions: '',
  section: p.section || 'Draft'
});

//#region Project Service
export const projectService = {

  getAllProjects: async (): Promise<TableType[]> => {
    try {
      const { data } = await api.get('/api/projects');
      if (data && data.success && Array.isArray(data.data)) {
        return data.data.map(mapBackendToTableType);
      }
      return [];
    } catch (err: unknown) {
      return [];
    }
  },

  createProject: async (
    project: { name: string; buyerName: string; buyerId?: number; description: string; selectionDate: string; itemsCount?: number },
    currentUser?: InforUser | null
  ): Promise<TableType> => {
    const payload = {
      projectName: project.name,
      section: 'Draft',
      buyerId: project.buyerId ?? null,
      buyerName: project.buyerName,
      description: project.description,
      selectionDate: project.selectionDate || null,
      items: project.itemsCount || 0,
      userId: currentUser?.userId || null,
      userName: currentUser
        ? `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.email
        : null,
    };

    try {
      const { data } = await api.post('/api/projects', payload);
      if (data && data.success && data.data) {
        return mapBackendToTableType(data.data as BackendProject);
      }
      throw new Error(data?.message || 'Failed to create project on backend');
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  updateProject: async (
    id: number,
    project: { name: string; buyerName: string; buyerId?: number; description: string; selectionDate: string; itemsCount?: number; section?: string },
    currentUser?: InforUser | null
  ): Promise<TableType> => {
    const payload = {
      projectName: project.name,
      section: project.section || 'Draft',
      buyerId: project.buyerId ?? null,
      buyerName: project.buyerName,
      description: project.description,
      selectionDate: project.selectionDate || null,
      items: project.itemsCount !== undefined ? project.itemsCount : 0,
      userId: currentUser?.userId || null,
      userName: currentUser
        ? `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.email
        : null,
    };

    try {
      const { data } = await api.put(`/api/projects/${id}`, payload);
      if (data && data.success && data.data) {
        return mapBackendToTableType(data.data as BackendProject);
      }
      throw new Error(data?.message || 'Failed to update project on backend');
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  deleteProject: async (
    id: number,
    currentUser?: InforUser | null
  ): Promise<boolean> => {
    const userId = currentUser?.userId || '';
    const userName = currentUser
      ? `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.email
      : '';

    try {
      const { data } = await api.delete(`/api/projects/${id}`, {
        params: { userId, userName },
      });
      if (data && data.success) {
        return true;
      }
      throw new Error(data?.message || 'Failed to delete project');
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  getItemsForProject: async (projectId: number): Promise<ProjectItem[]> => {
    try {
      const { data } = await api.get(`/api/projects/${projectId}/items`);
      if (data && data.success && Array.isArray(data.data)) {
        return data.data as ProjectItem[];
      }
      return [];
    } catch (err: unknown) {
      return [];
    }
  },

  addItemToProject: async (
    projectId: number,
    item: Omit<ProjectItem, 'id' | 'projectId'>
  ): Promise<ProjectItem> => {
    try {
      const { data } = await api.post(`/api/projects/${projectId}/items`, item);
      if (data && data.success && data.data) {
        return data.data as ProjectItem;
      }
      throw new Error(data?.message || 'Failed to add item to project');
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  updateProjectItem: async (
    itemId: number,
    item: Omit<ProjectItem, 'id' | 'projectId'>
  ): Promise<ProjectItem> => {
    try {
      const { data } = await api.put(`/api/projects/items/${itemId}`, item);
      if (data && data.success && data.data) {
        return data.data as ProjectItem;
      }
      throw new Error(data?.message || 'Failed to update item');
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  deleteProjectItem: async (
    itemId: number
  ): Promise<boolean> => {
    try {
      const { data } = await api.delete(`/api/projects/items/${itemId}`);
      if (data && data.success) {
        return true;
      }
      throw new Error(data?.message || 'Failed to delete item');
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  }

};

export interface ProjectItem {
  id?: number;
  projectId: number;
  styleId?: number;
  colorId?: number;
  styleMaterialNumber: string;
  styleMaterialName: string;
  colorway: string;
  colorwayStatus: string;
  colorStatusId?: number;
  selectionCondition: string;
  sampleDue: string | null;
  buyerComments: string;
  internalComments: string;
  annotatedImage?: string | null;
  createdDate?: string;
  colorwaysWithIds?: { colorway: string; colorId: number }[];
}
//#endregion
