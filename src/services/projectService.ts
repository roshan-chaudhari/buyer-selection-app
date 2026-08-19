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
  },

  lockProject: async (id: number): Promise<TableType> => {
    try {
      console.log(`[projectService.lockProject] Sending lock request to DB for project ${id}...`);
      const { data } = await api.patch(`/api/projects/${id}/lock`);
      console.log(`[projectService.lockProject] Backend lock response:`, data);
      const projData = data?.data || data?.project;
      if (projData && (projData.id || projData.projectName)) {
        return mapBackendToTableType(projData);
      }
      if (data && (data.success || data.id)) {
        return (data.id ? mapBackendToTableType(data) : { id, isLocked: true } as TableType);
      }
      throw new Error(data?.message || 'Failed to lock project');
    } catch (err: unknown) {
      console.error(`[projectService.lockProject] Error locking project ${id}:`, err);
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  uploadImageToS3: async (params: {
    projectName: string;
    styleName: string;
    base64Data?: string;
    file?: File;
    fileName?: string;
    itemId?: number;
  }): Promise<{ key: string; url: string; fileName: string }> => {
    console.log('[projectService.uploadImageToS3] Initiating image upload with params:', {
      projectName: params.projectName,
      styleName: params.styleName,
      fileName: params.fileName,
      itemId: params.itemId,
      hasFile: !!params.file,
      fileSize: params.file?.size,
      hasBase64: !!params.base64Data,
      base64Length: params.base64Data?.length,
    });

    try {
      let response;
      if (params.file) {
        const formData = new FormData();
        formData.append('image', params.file);
        formData.append('projectName', params.projectName);
        formData.append('styleName', params.styleName);
        if (params.fileName) formData.append('fileName', params.fileName);
        if (params.itemId) formData.append('itemId', String(params.itemId));

        console.log('[projectService.uploadImageToS3] Sending multipart/form-data to /api/projects/upload-image');
        response = await api.post('/api/projects/upload-image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        console.log('[projectService.uploadImageToS3] Sending JSON payload to /api/projects/upload-image');
        response = await api.post('/api/projects/upload-image', {
          projectName: params.projectName,
          styleName: params.styleName,
          base64Data: params.base64Data,
          fileName: params.fileName,
          itemId: params.itemId,
        });
      }

      console.log('[projectService.uploadImageToS3] Backend response received:', response.data);

      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      throw new Error(response.data?.message || 'Failed to upload image to S3');
    } catch (err: unknown) {
      console.error('[projectService.uploadImageToS3] Upload failed:', err);
      throw new Error(getErrorMessage(err), { cause: err });
    }
  },

  deleteImageFromS3: async (urlOrKey: string): Promise<boolean> => {
    try {
      console.log(`[projectService.deleteImageFromS3] Requesting deletion of S3 image: ${urlOrKey}`);
      const { data } = await api.delete('/api/projects/s3-image', {
        params: { url: urlOrKey },
      });
      return data?.success || false;
    } catch (err: unknown) {
      console.warn('[projectService.deleteImageFromS3] Failed to delete image from S3:', err);
      return false;
    }
  },

  deleteStyleImagesFromS3: async (projectName: string, styleName: string): Promise<boolean> => {
    try {
      console.log(`[projectService.deleteStyleImagesFromS3] Requesting batch deletion for style "${styleName}" in project "${projectName}"`);
      const { data } = await api.delete('/api/projects/style-images', {
        params: { projectName, styleName },
      });
      return data?.success || false;
    } catch (err: unknown) {
      console.warn('[projectService.deleteStyleImagesFromS3] Failed to delete style images from S3:', err);
      return false;
    }
  },

};

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
  annotatedImage?: string | null;
  createdDate?: string;
  colorwaysWithIds?: { colorway: string; colorId: number }[];
}
//#endregion
