import { useCallback, useState } from "react";
import { getStoredToken } from "../../auth/tokenUtils";
import {
  api,
  fetchPlmStyleDetails,
  odata2styleCopy,
  createPlmJobTask,
  getPlmJobTaskItems,
  fetchPlmColorwayDetails,
  setSyncInProgress,
  fetchCurrentUser,
  uploadPlmStyleImage,
  savePlmDocument,
} from "../../services/api";
import { materialSyncService } from "../../services/sync/material/materialSync.service";
import { styleOverviewService } from "../../services/sync/style/styleOverview.service";
import {
  buildStyleCopyPayload,
  extractStyleInputFromNode,
} from "../../services/plmStyleCopyPayload";
import {
  buildSaveColorwayPayload,
  savePlmStyleColorways,
} from "../../services/plmupdatestylecolordetails";
import { projectService, type ProjectItem } from "../../services/projectService";
import { extractODataList } from "../../utils/odata";
import { resolveImageBlob } from "../../utils/image";
import type { InforUser } from "../../types/api";
import type { TableType } from "../../types/table";
import type { GroupedStyle } from "../../types/projects";
import { PLM_SYNCED_SECTIONS } from "./constants";
import { groupItemsByStyle } from "./ProjectDetailsHelpers";
import type { ToastType } from "../../hooks/useToast";

type ShowToastFn = (message: string, type?: ToastType) => void;

interface UseProjectSyncProps {
  project: TableType | undefined;
  setProject: React.Dispatch<React.SetStateAction<TableType | undefined>>;
  showToast: ShowToastFn;
  refreshItems: (projectId: number) => Promise<ProjectItem[]>;
  currentUser: InforUser | null;
}

/** Resolves StyleId from items or by querying PLM for alphanumeric StyleCode */
async function resolveGroupStyleId(
  _firstItem: ProjectItem,
  group: GroupedStyle,
): Promise<number | undefined> {
  const validItem = group.items.find((item) => item.styleId && item.styleId !== 0);
  if (validItem && validItem.styleId) {
    return validItem.styleId;
  }

  const isNumeric = group.styleMaterialNumber.length > 0 && /^\d+$/.test(group.styleMaterialNumber);
  if (isNumeric) {
    return Number(group.styleMaterialNumber);
  }

  try {
    const response = await odata2styleCopy.getStyleDatacopy({ StyleCode: group.styleMaterialNumber });
    const styleList = extractODataList<any>(response);
    if (styleList.length > 0) {
      const foundId = styleList[0].StyleId ?? styleList[0].Id;
      if (foundId) {
        return Number(foundId);
      }
    }
  } catch (err) {
    console.warn(`[useProjectSync] Failed to resolve StyleId from PLM for code ${group.styleMaterialNumber}:`, err);
  }

  return undefined;
}

/** Extracts target style code from PLM background job task items */
function extractNewStyleCode(_jobResponse: any, taskItemsResponse: any): string {
  const taskItemsList = extractODataList<any>(taskItemsResponse);
  const taskItem =
    taskItemsList[0] ?? taskItemsResponse?.data?.[0] ?? taskItemsResponse;

  const messageStr = taskItem?.message ?? taskItemsResponse?.message;
  if (messageStr && messageStr.includes(" | ")) {
    return messageStr.split(" | ")[0].trim();
  }

  return (
    taskItem?.TargetCode ??
    taskItem?.targetCode ??
    taskItem?.Code ??
    taskItem?.TargetValue ??
    taskItem?.targetValue ??
    taskItem?.StyleCode ??
    ""
  );
}

/** Matches PLM colorway details with project colorway items */
function matchColorways(
  newStyleDetails: any[],
  groupItems: ProjectItem[],
): { plmColorway: any; projItem: ProjectItem }[] {
  const matched: { plmColorway: any; projItem: ProjectItem }[] = [];

  for (const plmCol of newStyleDetails) {
    const plmCode = (plmCol.Code || plmCol.code || "").toLowerCase().trim();
    const plmName = (plmCol.Name || plmCol.name || "").toLowerCase().trim();

    const projItem = groupItems.find((item) => {
      const projCol = (item.colorway || "").toLowerCase().trim();
      return projCol === plmCode || projCol === plmName;
    });

    if (projItem) {
      matched.push({ plmColorway: plmCol, projItem });
    }
  }

  return matched;
}

/** Collects all unique image references from a style group */
function extractAllImageRefs(group: GroupedStyle, firstItem?: ProjectItem): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  function addIfValid(url: unknown) {
    if (!url) return;
    let str = String(url).trim();
    if (str === "" || str === "null" || str === "undefined" || str === "[]" || str === "{}") {
      return;
    }
    if (str.startsWith('"') && str.endsWith('"')) {
      try {
        str = JSON.parse(str);
      } catch { }
    }

    if (str.startsWith('[')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          for (const it of parsed) {
            if (!it) continue;
            if (typeof it === 'string' && it.trim()) {
              addIfValid(it.trim());
            } else if (typeof it === 'object') {
              const val = (it as any).annotated || (it as any).original || (it as any).url || (it as any).src;
              if (val && typeof val === 'string' && val.trim()) {
                addIfValid(val.trim());
              }
            }
          }
        }
      } catch { }
      return;
    }

    if (str.startsWith('{')) {
      try {
        const parsed = JSON.parse(str);
        const val = parsed.annotated || parsed.original || parsed.url || parsed.src;
        if (val && typeof val === 'string' && val.trim()) {
          addIfValid(val.trim());
        }
      } catch { }
      return;
    }

    if (
      !seen.has(str) &&
      (str.includes('amazonaws.com') ||
        str.includes('buyerapp-image') ||
        str.startsWith('data:') ||
        str.startsWith('blob:') ||
        str.startsWith('http'))
    ) {
      seen.add(str);
      images.push(str);
    }
  }

  if (group) {
    addIfValid(group.annotatedImage);
  }
  if (firstItem) {
    addIfValid(firstItem.annotatedImage);
  }
  for (const it of group?.items || []) {
    addIfValid(it.annotatedImage);
  }

  return images;
}

/** Extracts a clean file name from an image reference */
function extractImageFileName(imageRef: string, fallbackName?: string): string {
  if (!imageRef) return `${fallbackName || 'style'}.jpg`;

  let target = String(imageRef).trim();

  if (target.includes('url=')) {
    try {
      const parsedUrl = new URL(target, 'http://localhost');
      const inner = parsedUrl.searchParams.get('url');
      if (inner) {
        target = decodeURIComponent(inner).trim();
      }
    } catch { }
  }

  try {
    const urlObj = new URL(target, 'http://localhost');
    const pathname = urlObj.pathname;
    const lastSlashIdx = pathname.lastIndexOf('/');
    if (lastSlashIdx !== -1) {
      const extracted = pathname.substring(lastSlashIdx + 1);
      if (extracted && extracted.includes('.')) {
        return decodeURIComponent(extracted);
      }
    }
  } catch { }

  const cleanTarget = target.split('?')[0].split('#')[0];
  const lastSlash = Math.max(cleanTarget.lastIndexOf('/'), cleanTarget.lastIndexOf('\\'));
  const rawFileName = lastSlash !== -1 ? cleanTarget.substring(lastSlash + 1) : cleanTarget;

  if (rawFileName && rawFileName.includes('.')) {
    return decodeURIComponent(rawFileName);
  }

  return `${fallbackName || 'style'}.jpg`;
}

/** Generates a standard UUID string */
export function generateUUID(): string {
  const globalCrypto: Crypto | undefined =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }

  if (globalCrypto?.getRandomValues) {
    const bytes = globalCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Processes PLM duplication, image upload, colorways, and overview for a style group */
async function processStyleGroup(
  group: GroupedStyle,
  currentUser: InforUser,
  projectId: number,
  refreshItems: (id: number) => Promise<ProjectItem[]>,
  project: TableType,
): Promise<{ ItemId: number; ItemName: string; ItemNumber: string; ItemType: 'Style' } | undefined> {
  const firstItem = group.items[0];
  if (!firstItem) return;

  const resolvedStyleId = await resolveGroupStyleId(firstItem, group);
  if (!resolvedStyleId) {
    console.warn(`[useProjectSync] No valid StyleId could be resolved for group ${group.styleMaterialNumber}. Skipping.`);
    return;
  }

  const styleNode = await fetchPlmStyleDetails(resolvedStyleId, currentUser);
  if (!styleNode) {
    console.warn(`[useProjectSync] fetchPlmStyleDetails returned null for StyleId ${resolvedStyleId}. Exiting.`);
    return;
  }

  // 1. Extract style input and build copy payload
  const styleInput = extractStyleInputFromNode(styleNode);
  styleInput.selectionCondition = firstItem.selectionCondition;

  const payload = await buildStyleCopyPayload(
    styleInput.StyleNumber,
    1,
    styleInput,
    currentUser.activeSchema,
    currentUser.userId,
  );

  // 2. Post copy job to PLM
  const jobResponse = await createPlmJobTask(payload as unknown as Record<string, unknown>);

  // 3. Wait for PLM background copy to complete
  await new Promise((resolve) => setTimeout(resolve, 4000));

  // 4. Retrieve job task items to find the newly created style code
  const taskItemKey =
    (jobResponse as any)?.taskItemKey ??
    (jobResponse as any)?.data?.taskItemKey ??
    (jobResponse as any)?.jobId;

  if (!taskItemKey) {
    console.warn(`[useProjectSync] No taskItemKey found in job response for ${group.styleMaterialNumber}.`);
    return;
  }

  const taskItemsResponse = await getPlmJobTaskItems({
    taskKeys: [String(taskItemKey)],
    Schema: currentUser.activeSchema,
  });

  const newStyleCode = extractNewStyleCode(jobResponse, taskItemsResponse);
  if (!newStyleCode) {
    console.warn(`[useProjectSync] Newly created StyleCode not found for ${group.styleMaterialNumber}. Skipping.`);
    return;
  }

  // 5. Search PLM for the newly created style
  const styleSearchResponse = await odata2styleCopy.getStyleDatacopy({ StyleCode: newStyleCode });
  const foundStyles = extractODataList<any>(styleSearchResponse);

  if (foundStyles.length === 0) {
    console.warn(`[useProjectSync] Newly created style "${newStyleCode}" not found in search.`);
    return;
  }

  const newStyle = foundStyles[0];
  const newStyleId = newStyle.StyleId ?? newStyle.Id;
  const newStyleName = String(newStyle.StyleNumber ?? newStyle.Name ?? newStyle.StyleName ?? "");

  // 5.1 Upload style images from S3 / annotated image
  const imageRefs = extractAllImageRefs(group, firstItem);

  if (imageRefs.length > 0) {
    for (let imgIdx = 0; imgIdx < imageRefs.length; imgIdx++) {
      const imgRef = imageRefs[imgIdx];
      try {
        const imgBlob = await resolveImageBlob(imgRef);
        if (!imgBlob) {
          throw new Error(`Could not fetch image binary data from: ${imgRef}`);
        }

        const objGuid = generateUUID();
        const rawBaseUrl =
          import.meta.env.VITE_PLM_BASE_URL ||
          localStorage.getItem("iu") ||
          "https://prd-euc1.fplm.eu1.inforcloudsuite.com/";
        const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl : `${rawBaseUrl}/`;
        const objectFilePath = `blob:${baseUrl}${objGuid}`;
        const originalObjectName = extractImageFileName(imgRef, `${group.styleMaterialNumber || newStyleCode}_${imgIdx + 1}`);

        const atta = {
          objectFilePath,
          objectExtension: null,
          sequence: imgIdx,
          details: {
            name: null,
            note: null,
            dlType: 11,
            type: "styleImages",
          },
          referenceId: Number(newStyleId),
          modifyDate: "0001-01-01T00:00:00",
          code: "E0012",
          isDefault: false,
          objectId: 0,
          originalObjectName,
          objectStream: null,
          tempId: generateUUID(),
        };

        const formData = new FormData();
        formData.append("file", imgBlob, originalObjectName);
        formData.append("atta", JSON.stringify(atta));
        formData.append("type", "styleImages");
        formData.append("formType", "file");
        formData.append("schema", currentUser.activeSchema || "FSH4");
        formData.append("overwrite", "false");

        const uploadResponse = await uploadPlmStyleImage(formData);

        if (uploadResponse) {
          const addedFile =
            (uploadResponse?.addedFiles && uploadResponse.addedFiles[0]) ||
            (uploadResponse?.AttaFileListDto && uploadResponse.AttaFileListDto[0]?.addedFiles && uploadResponse.AttaFileListDto[0].addedFiles[0]) ||
            (Array.isArray(uploadResponse) && uploadResponse[0]?.addedFiles && uploadResponse[0].addedFiles[0]) ||
            (Array.isArray(uploadResponse) && uploadResponse[0]) ||
            null;

          const thumbUrl = addedFile?.thumbUrl || uploadResponse?.thumbUrl || null;
          const customUrl = addedFile?.customUrl || uploadResponse?.customUrl || null;
          const objectKey = addedFile?.objectKey || originalObjectName;
          const oldFileName = addedFile?.oldFileName || originalObjectName;

          const saveDocumentPayload = {
            AttaFileListDto: [
              {
                objectFilePath: atta.objectFilePath,
                objectExtension: atta.objectExtension ?? null,
                sequence: atta.sequence ?? 0,
                details: {
                  name: atta.details?.name ?? null,
                  note: atta.details?.note ?? null,
                  dlType: atta.details?.dlType ?? 11,
                  type: atta.details?.type ?? "styleImages",
                },
                referenceId: Number(newStyleId),
                modifyDate: atta.modifyDate || "0001-01-01T00:00:00",
                code: atta.code || "E0012",
                isDefault: atta.isDefault ?? false,
                objectId: atta.objectId ?? 0,
                originalObjectName,
                objectStream: atta.objectStream ?? null,
                tempId: atta.tempId,
                objectKey,
                oldFileName,
                documentUrl: addedFile?.documentUrl ?? null,
                thumbUrl,
                customUrl,
                type: "styleImages",
              },
            ],
            Schema: uploadResponse?.Schema || currentUser.activeSchema || "FSH4",
          };

          await savePlmDocument(saveDocumentPayload);
        }
      } catch (uploadErr: any) {
        console.error(`[useProjectSync] Failed to upload style image ${imgIdx + 1}/${imageRefs.length} for style "${newStyleCode}":`, uploadErr);
      }
    }
  }

  // 6. Fetch full details of the newly created style
  const newStyleDetails = await fetchPlmColorwayDetails(newStyleId, currentUser);

  // 7. Match and save project colorways to PLM
  const matchedColorways = Array.isArray(newStyleDetails)
    ? matchColorways(newStyleDetails, group.items)
    : [];

  if (matchedColorways.length > 0) {
    const savePayload = buildSaveColorwayPayload({
      newStyleId: Number(newStyleId),
      newStyleCode,
      newStyleName,
      matchedColorways,
      currentUser,
    });
    await savePlmStyleColorways(savePayload);
  }

  // 8. Update Style Overview after colorway update completes
  await styleOverviewService.updateStyleOverviewAfterSync({
    newStyleId,
    projItem: firstItem,
    currentUser,
    buyerId: project.BuyerId || null,
    projectName: project.ProjectName || "",
  });

  // 9. Refresh UI
  await refreshItems(projectId);

  return {
    ItemId: Number(newStyleId),
    ItemName: newStyleName,
    ItemNumber: newStyleCode,
    ItemType: 'Style' as const,
  };
}

/** Custom hook handling the full project PLM synchronization and post-sync locking lifecycle */
export function useProjectSync({
  project,
  setProject,
  showToast,
  refreshItems,
  currentUser,
}: UseProjectSyncProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncProject = useCallback(async () => {
    if (!project?.id) return;

    if (!project.Items || project.Items === 0) {
      showToast("Please add at least one item to synchronize", "warning");
      return;
    }

    setIsSyncing(true);
    const previousSection = project.section;
    setProject((prev) =>
      prev ? { ...prev, section: PLM_SYNCED_SECTIONS[0] } : prev,
    );

    setSyncInProgress(true);

    try {
      const latestItems = await refreshItems(project.id);
      const groups = groupItemsByStyle(latestItems);
      const totalStyles = groups.length;
      const totalColorways = latestItems.filter((i) => !!i.colorway).length;

      const syncedStylesList: { ItemId: number; ItemName: string; ItemNumber: string; ItemType: 'Style' | 'Material' }[] = [];

      let activeUser = currentUser;
      if (!activeUser) {
        try {
          activeUser = await fetchCurrentUser();
        } catch (err) {
          console.error("[useProjectSync] Failed to load user profile:", err);
          throw new Error(
            "User session is still loading. Please check your connection and try Sync again.",
            { cause: err }
          );
        }
      }

      for (const group of groups) {
        if (!group.items[0]) continue;
        try {
          if (group.itemType === 'Material') {
            const syncedMaterial = await materialSyncService.processMaterialGroup(group, activeUser, project.id, refreshItems);
            if (syncedMaterial) {
              syncedStylesList.push(syncedMaterial);
            }
          } else {
            const syncedStyle = await processStyleGroup(group, activeUser, project.id, refreshItems, project);
            if (syncedStyle) {
              syncedStylesList.push(syncedStyle);
            }
          }
        } catch (nodeErr) {
          console.error(`[useProjectSync] Failed to process PLM task for ${group.styleMaterialNumber}:`, nodeErr);
        }
      }

      // Step 0: Create Project container in PLM and link all synced styles
      if (currentUser && syncedStylesList.length > 0) {
        const checkBrokenRules = (data: any) => {
          if (data?.brokenRules && Array.isArray(data.brokenRules)) {
            return data.brokenRules.find(
              (rule: any) => rule.ruleDescription === "PROJECT.CODE_ALREADY_EXISTS"
            );
          }
          return null;
        };

        try {
          const createPayload = {
            project: {
              projectId: "0",
              code: project.ProjectName,
              name: project.ProjectName,
              description: project.Description ?? "",
              projectDetail: [],
            },
            roleId: Number(currentUser.activeRoleId ?? 1005),
            modifyId: Number(currentUser.userId),
            userId: Number(currentUser.userId),
            Schema: currentUser.activeSchema,
          };

          const createRes = await api.post<any>("/api/pdm/project/save", createPayload, {
            headers: getStoredToken() ? { Authorization: `Bearer ${getStoredToken()}` } : {},
          });

          const resData = createRes.data;
          const hasConflict = checkBrokenRules(resData) || checkBrokenRules(resData?.data);
          if (hasConflict) {
            throw new Error(`Project code "${project.ProjectName}" already exists in PLM (PROJECT.CODE_ALREADY_EXISTS). Please rename the project before syncing.`);
          }

          const key = resData?.key ?? resData?.data?.key;
          const firstRowVersion = resData?.rowVersionText ?? resData?.data?.rowVersionText;

          if (key && firstRowVersion) {
            const projectDetail = syncedStylesList.map((style, idx) => ({
              ProjectDetailId: -(idx + 1),
              ProjectId: String(key),
              ItemId: style.ItemId,
              ItemName: style.ItemName,
              ItemNumber: style.ItemNumber,
              Type: style.ItemType || "Style",
            }));

            const updatePayload = {
              project: {
                projectId: String(key),
                code: project.ProjectName,
                name: project.ProjectName,
                description: project.Description ?? "",
                projectDetail,
              },
              rowVersionText: firstRowVersion,
              roleId: Number(currentUser.activeRoleId ?? 1005),
              modifyId: Number(currentUser.userId),
              userId: Number(currentUser.userId),
              Schema: currentUser.activeSchema,
            };

            const updateRes = await api.post<any>("/api/pdm/project/save", updatePayload, {
              headers: getStoredToken() ? { Authorization: `Bearer ${getStoredToken()}` } : {},
            });

            const updateResData = updateRes.data;
            const updateConflict = checkBrokenRules(updateResData) || checkBrokenRules(updateResData?.data);
            if (updateConflict) {
              throw new Error(`Project code "${project.ProjectName}" already exists in PLM (PROJECT.CODE_ALREADY_EXISTS).`, { cause: updateConflict });
            }
          } else {
            throw new Error("PLM Project save did not return key or rowVersionText.");
          }
        } catch (projErr: any) {
          console.error("[useProjectSync] Failed to create project container or add styles in PLM:", projErr);
          const errData = projErr?.response?.data;
          const hasConflict = checkBrokenRules(errData) || checkBrokenRules(errData?.data);
          if (hasConflict) {
            throw new Error(`Project code "${project.ProjectName}" already exists in PLM (PROJECT.CODE_ALREADY_EXISTS). Please rename the project before syncing.`, { cause: projErr });
          }
          throw projErr;
        }
      }

      // Lock is the final step — only executed after all PLM operations succeed 100%
      const lockedProject = await projectService.lockProject(project.id);
      setProject(lockedProject);

      showToast(
        `Project synchronized — ${totalStyles} style(s), ${totalColorways} colorway(s) loaded.`,
      );
    } catch (err) {
      console.error("[useProjectSync] Failed to sync project:", err);
      setProject((prev) =>
        prev ? { ...prev, section: previousSection } : prev,
      );
      showToast(
        err instanceof Error ? err.message : "Failed to synchronize project",
        "error",
      );
    } finally {
      setSyncInProgress(false);
      setIsSyncing(false);
    }
  }, [project, setProject, showToast, refreshItems, currentUser]);

  return { handleSyncProject, isSyncing };
}
