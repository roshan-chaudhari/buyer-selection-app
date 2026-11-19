import { api } from './api';
import type { TableType } from '../types/table';
import type { InforUser } from '../types/api';
import { getErrorMessage } from '../utils/error';

export interface BackendProject {
  id: number;
  projectName: string;
  section: string;
  isLocked: boolean;
  buyerId: number | null;
  buyerName: string | null;
  description: string | null;
  selectionDate: string | null;
  itemsCount: number;
  lastUpdated: string;
}

export interface ProjectItem {
  id?: number;
  projectId: number;
  styleId?: number;
  colorId?: number;
  styleMaterialNumber: string;
  styleMaterialName: string;
  itemType?: 'Style' | 'Material';
  colorway: string;
  colorwayStatus: string;
  colorStatusId?: number;
  selectionCondition: string;
  sampleDue: string | null;
  buyerComments: string;
  internalComments: string;
  /** True when this item was added locally and does not exist in PLM. It will be excluded from PLM sync. */
  notInPLM?: boolean;
  annotatedImage?: string | null;
  createdDate?: string;
  colorwaysWithIds?: { colorway: string; colorId: number }[];
}

/** Maps backend database project payload into UI TableType */
const mapBackendToTableType = (p: any): TableType => ({
  id: p.id,
  ProjectName: p.projectName || p.ProjectName || '',
  BuyerId: p.buyerId ?? p.BuyerId ?? undefined,
  BuyerName: p.buyerName || p.BuyerName || '',
  Description: p.description || p.Description || '',
  SelectionDate: p.selectionDate ? new Date(p.selectionDate) : (p.SelectionDate ? new Date(p.SelectionDate) : new Date()),
  Items: p.itemsCount ?? p.items ?? p.Items ?? 0,
  LastUpdated: p.lastUpdated ? new Date(p.lastUpdated) : (p.LastUpdated ? new Date(p.LastUpdated) : new Date()),
  Actions: '',
  section: p.section || 'Draft',
  isLocked: Boolean(
    p.isLocked === true ||
    p.isLocked === 1 ||
    p.isLocked === '1' ||
    p.isLock === true ||
    p.isLock === 1 ||
    p.isLock === '1' ||
    p.is_locked === true ||
    p.is_locked === 1 ||
    p.is_locked === '1' ||
    p.IsLocked === true ||
    p.IsLocked === 1
  ),
});

export const projectService = {
  /** Fetches all projects from database */
  getAllProjects: async (): Promise<TableType[]> => {
    try {
      const { data } = await api.get('/api/projects');
      if (data && data.success && Array.isArray(data.data)) {
        return data.data.map(mapBackendToTableType);
      }
      return [];
    } catch {
      return [];
    }
  },

  /** Creates a new project in database */
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

  /** Updates an existing project metadata in database */
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

  /** Deletes a project from database */
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
      return Boolean(data && data.success);
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  /** Fetches items for a specific project */
  getItemsForProject: async (projectId: number): Promise<ProjectItem[]> => {
    try {
      const { data } = await api.get(`/api/projects/${projectId}/items`);
      if (data && data.success && Array.isArray(data.data)) {
        return data.data as ProjectItem[];
      }
      return [];
    } catch {
      return [];
    }
  },

  /** Adds a new item to a project */
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

  /** Updates an item in a project */
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

  /** Deletes an item from a project */
  deleteProjectItem: async (
    itemId: number
  ): Promise<boolean> => {
    try {
      const { data } = await api.delete(`/api/projects/items/${itemId}`);
      return Boolean(data && data.success);
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  /** Sets project IsLock = 1 and section = 'Syncro PLM' in database */
  lockProject: async (id: number): Promise<TableType> => {
    try {
      const { data } = await api.patch(`/api/projects/${id}/lock`);
      const projData = data?.data || data?.project;
      if (projData && (projData.id || projData.projectName)) {
        return mapBackendToTableType(projData);
      }
      if (data && (data.success || data.id)) {
        return (data.id ? mapBackendToTableType(data) : { id, isLocked: true } as TableType);
      }
      throw new Error(data?.message || 'Failed to lock project');
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  /** Uploads an image to S3 via backend proxy/service */
  uploadImageToS3: async (params: {
    projectName: string;
    styleName: string;
    base64Data?: string;
    file?: File;
    fileName?: string;
    itemId?: number;
  }): Promise<{ key: string; url: string; fileName: string }> => {
    try {
      let response;
      if (params.file) {
        const formData = new FormData();
        formData.append('image', params.file);
        formData.append('projectName', params.projectName);
        formData.append('styleName', params.styleName);
        if (params.fileName) formData.append('fileName', params.fileName);
        if (params.itemId) formData.append('itemId', String(params.itemId));

        response = await api.post('/api/projects/upload-image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        response = await api.post('/api/projects/upload-image', {
          projectName: params.projectName,
          styleName: params.styleName,
          base64Data: params.base64Data,
          fileName: params.fileName,
          itemId: params.itemId,
        });
      }

      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      throw new Error(response.data?.message || 'Failed to upload image to S3');
    } catch (err: unknown) {
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  /** Deletes an image from S3 storage (PLM default images are protected and can never be deleted) */
  deleteImageFromS3: async (urlOrKey: string): Promise<boolean> => {
    if (!urlOrKey) return false;
    // The PLM default image can never be deleted from S3, only annotations can be
    if (urlOrKey.includes('_default_') || urlOrKey.includes('-default-')) {
      console.warn('[projectService] Protected PLM default image from deletion:', urlOrKey);
      return false;
    }
    try {
      const { data } = await api.delete('/api/projects/s3-image', {
        params: { url: urlOrKey },
      });
      return Boolean(data?.success);
    } catch {
      return false;
    }
  },

  /** Deletes all images belonging to a style from S3 */
  deleteStyleImagesFromS3: async (projectName: string, styleName: string): Promise<boolean> => {
    try {
      const { data } = await api.delete('/api/projects/style-images', {
        params: { projectName, styleName },
      });
      return Boolean(data?.success);
    } catch {
      return false;
    }
  },

  /** Deletes all images belonging to an entire project from S3 */
  deleteProjectImagesFromS3: async (projectName: string): Promise<boolean> => {
    try {
      const { data } = await api.delete('/api/projects/project-images', {
        params: { projectName },
      });
      return Boolean(data?.success);
    } catch {
      return false;
    }
  },
};
