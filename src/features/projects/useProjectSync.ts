import { useCallback, useState } from "react";
import { getStoredToken } from "../../auth/tokenUtils";
import {
  api,
  fetchPlmStyleDetails,
  odata2styleCopy,
  createPlmJobTask,
  getPlmJobTaskItems,
  fetchPlmColorwayDetails,
} from "../../services/api";
import {
  buildStyleCopyPayload,
  extractStyleInputFromNode,
} from "../../services/plmStyleCopyPayload";
import {
  buildSaveColorwayPayload,
  savePlmStyleColorways,
} from "../../services/plmupdatestylecolordetails";
import type { ProjectItem } from "../../services/projectService";
import { extractODataList } from "../../utils/odata";
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

// ── Private helpers ───────────────────────────────────────────────────────────

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

  // Attempt to resolve the StyleId from PLM using the alphanumeric StyleCode
  try {
    console.log(`[useProjectSync] Attempting to resolve StyleId from PLM for code: ${group.styleMaterialNumber}`);
    const response = await odata2styleCopy.getStyleDatacopy({ StyleCode: group.styleMaterialNumber });
    const styleList = extractODataList<any>(response);
    if (styleList.length > 0) {
      const foundId = styleList[0].StyleId ?? styleList[0].Id;
      if (foundId) {
        console.log(`[useProjectSync] Dynamically resolved StyleId: ${foundId} for group ${group.styleMaterialNumber}`);
        return Number(foundId);
      }
    }
  } catch (err) {
    console.warn(`[useProjectSync] Failed to resolve StyleId from PLM for code ${group.styleMaterialNumber}:`, err);
  }

  return undefined;
}

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

/*
async function _updateLocalItems(
  groupItems: ProjectItem[],
  matchedColorways: { plmColorway: any; projItem: ProjectItem }[],
  newStyleId: number | string,
  newStyleCode: string,
  newStyleName: string,
): Promise<void> {
  for (const projItem of groupItems) {
    if (!projItem.id) continue;

    const matchInfo = matchedColorways.find(
      (mc) => mc.projItem.id === projItem.id,
    );
    const plmCol = matchInfo?.plmColorway;

    const finalStyleId = Number(newStyleId);
    let finalColorId = projItem.colorId ?? 0;
    let finalColorStatusId = projItem.colorStatusId ?? 0;

    if (plmCol) {
      const styleColorwayId = Number(
        plmCol.StyleColorwayId ?? plmCol.StyleColorwayID ?? plmCol.id,
      );
      finalColorId = styleColorwayId;
      finalColorStatusId = Number(projItem.colorStatusId ?? plmCol.Status ?? 1);
    }

    console.log(
      `[useProjectSync] Updating local db for item ${projItem.id} -> StyleId: ${finalStyleId}, StyleCode: ${newStyleCode}, ColorId: ${finalColorId}`,
    );

    await projectService.updateProjectItem(projItem.id, {
      styleId: finalStyleId,
      colorId: finalColorId,
      colorStatusId: finalColorStatusId,
      styleMaterialNumber: newStyleCode,
      styleMaterialName: newStyleName,
      colorway: projItem.colorway,
      colorwayStatus: projItem.colorwayStatus,
      selectionCondition: projItem.selectionCondition || "As-Is",
      sampleDue: projItem.sampleDue,
      buyerComments: projItem.buyerComments || "",
      internalComments: projItem.internalComments || "",
      annotatedImage: projItem.annotatedImage || null,
    });
  }
}

function _dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
*/

function getBase64Image(annotatedImage: string | null | undefined): string | null {
  if (!annotatedImage) return null;
  if (annotatedImage.startsWith('[')) {
    try {
      const parsed = JSON.parse(annotatedImage);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const item = parsed[0];
        if (item && typeof item === 'object') {
          return item.annotated || item.original || '';
        }
        return String(item);
      }
    } catch (e) { }
  }
  return annotatedImage;
}

function generateUUID(): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function processStyleGroup(
  group: GroupedStyle,
  currentUser: InforUser,
  projectId: number,
  refreshItems: (id: number) => Promise<ProjectItem[]>,
): Promise<void> {
  console.log(`[useProjectSync] Starting processStyleGroup for styleMaterialNumber: ${group.styleMaterialNumber}`);
  const firstItem = group.items[0];
  if (!firstItem) {
    console.warn(`[useProjectSync] No items found in group ${group.styleMaterialNumber}. Exiting processStyleGroup.`);
    return;
  }

  const resolvedStyleId = await resolveGroupStyleId(firstItem, group);
  console.log(`[useProjectSync] resolvedStyleId: ${resolvedStyleId} for group ${group.styleMaterialNumber}`);

  if (!resolvedStyleId) {
    console.warn(`[useProjectSync] No valid StyleId could be resolved for group ${group.styleMaterialNumber}. Skipping sync for this group.`);
    return;
  }

  const styleNode = await fetchPlmStyleDetails(resolvedStyleId, currentUser);
  if (!styleNode) {
    console.warn(`[useProjectSync] fetchPlmStyleDetails returned null for StyleId ${resolvedStyleId}. Exiting processStyleGroup.`);
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
  const jobResponse = await createPlmJobTask(
    payload as unknown as Record<string, unknown>,
  );
  console.log(
    `[useProjectSync] Copy job response for StyleId ${resolvedStyleId}:\n${JSON.stringify(jobResponse, null, 2)}`,
  );

  // 3. Wait for PLM background copy to complete
  await new Promise((resolve) => setTimeout(resolve, 4000));

  // 4. Retrieve job task items to find the newly created style code
  const taskItemKey =
    (jobResponse as any)?.taskItemKey ??
    (jobResponse as any)?.data?.taskItemKey ??
    (jobResponse as any)?.jobId;

  if (!taskItemKey) {
    console.warn(
      `[useProjectSync] No taskItemKey found in job response for ${group.styleMaterialNumber}.`,
    );
    return;
  }

  console.log(
    `[useProjectSync] Querying job task items for key: "${taskItemKey}"`,
  );
  const taskItemsResponse = await getPlmJobTaskItems({
    taskKeys: [String(taskItemKey)],
    Schema: currentUser.activeSchema,
  });
  console.log(
    "[useProjectSync] Task items response:",
    JSON.stringify(taskItemsResponse, null, 2),
  );

  const newStyleCode = extractNewStyleCode(jobResponse, taskItemsResponse);

  if (!newStyleCode) {
    console.warn(
      `[useProjectSync] Newly created StyleCode not found for ${group.styleMaterialNumber}. Skipping.`,
    );
    return;
  }

  // 5. Search PLM for the newly created style
  const styleSearchResponse = await odata2styleCopy.getStyleDatacopy({
    StyleCode: newStyleCode,
  });
  const foundStyles = extractODataList<any>(styleSearchResponse);

  if (foundStyles.length === 0) {
    console.warn(
      `[useProjectSync] Newly created style "${newStyleCode}" not found in search.`,
    );
    return;
  }

  const newStyle = foundStyles[0];
  const newStyleId = newStyle.StyleId ?? newStyle.Id;
  const newStyleName = String(
    newStyle.StyleNumber ?? newStyle.Name ?? newStyle.StyleName ?? "",
  );
  console.log(
    `[useProjectSync] Found new style: "${newStyleCode}" with StyleId ${newStyleId}`,
  );

  // 5.1 add image in new style 
  // console.log("[useProjectSync] group.annotatedImage:", group.annotatedImage, "firstItem.annotatedImage:", firstItem.annotatedImage);
  const base64Str = getBase64Image(group.annotatedImage || firstItem.annotatedImage);
  if (base64Str) {
    let objectFilePath = "";
    let originalObjectName = "style_image.jpg";

    const iu = localStorage.getItem("iu") || "";
    const cleanIu = iu.trim().endsWith("/") ? iu.trim() : `${iu.trim()}/`;
    const uploadImageUrl = cleanIu;
    console.log("[useProjectSync] Raw iu from localStorage:", iu);
    console.log("[useProjectSync] uploadImageUrl:", uploadImageUrl);

    let sanitizedUrl = uploadImageUrl;
    if (sanitizedUrl.startsWith("https:https://")) {
      sanitizedUrl = sanitizedUrl.replace("https:https://", "https://");
    } else if (sanitizedUrl.startsWith("http:http://")) {
      sanitizedUrl = sanitizedUrl.replace("http:http://", "http://");
    }
    console.log("[useProjectSync] sanitizedUrl:", sanitizedUrl);

    const objGuid = generateUUID();
    objectFilePath = `blob:${sanitizedUrl}${objGuid}`;

    let rawBase64: string | null = null;
    if (base64Str.startsWith("data:")) {
      try {
        rawBase64 = base64Str.split(",")[1] || null;
        const mime = base64Str.match(/:(.*?);/)?.[1] || "image/jpeg";
        const ext = mime.split("/")[1] || "jpg";
        originalObjectName = `${newStyleName}.${ext}`;
      } catch (e) {
        console.error("[useProjectSync] Failed to parse dataURL mime type:", e);
      }
    } else {
      rawBase64 = base64Str;
      const nameMatch = base64Str.match(/\/([^\/?#]+)$/);
      if (nameMatch) {
        originalObjectName = nameMatch[1];
      }
    }

    if (objectFilePath) {
      const uploadPayload = {
        objectFilePath,
        objectExtension: null,
        sequence: 0,
        details: {
          name: null,
          note: null,
          dlType: 11,
          type: "styleImages"
        },
        referenceId: Number(newStyleId),
        modifyDate: "0001-01-01T00:00:00",
        code: "E0012",
        isDefault: false,
        objectId: 0,
        originalObjectName,
        objectStream: rawBase64,
        tempId: generateUUID()
      };

      console.log("[useProjectSync] Uploading style image with payload:", JSON.stringify(uploadPayload, null, 2));

      try {
        // const uploadResponse = await uploadPlmStyleImage(uploadPayload);
        // console.log("[useProjectSync] Upload image response:", JSON.stringify(uploadResponse, null, 2));
        // const objectKey = uploadResponse?.objectKey ?? uploadResponse?.data?.objectKey;
        // console.log(`[useProjectSync] Successfully uploaded image, got objectKey: ${objectKey}`);
      } catch (uploadErr: any) {
        console.error("[useProjectSync] Failed to upload style image to PLM:", uploadErr);
        if (uploadErr.response) {
          console.log("[useProjectSync] Upload error response status:", uploadErr.response.status);
          console.log("[useProjectSync] Upload error response data:", JSON.stringify(uploadErr.response.data, null, 2));
        }
      }
    }
  } else {
    console.log("[useProjectSync] No annotated image found for style copy. Skipping image upload.");
  }

  // 6. Fetch full details of the newly created style
  const newStyleDetails = await fetchPlmColorwayDetails(
    newStyleId,
    currentUser,
  );
  console.log(
    `[useProjectSync] Newly created Style Details for StyleId ${newStyleId}:\n${JSON.stringify(newStyleDetails, null, 2)}`,
  );









  // 7. Match and save project colorways to PLM
  const matchedColorways = Array.isArray(newStyleDetails)
    ? matchColorways(newStyleDetails, group.items)
    : [];

  if (matchedColorways.length > 0) {
    console.log(
      `[useProjectSync] Found ${matchedColorways.length} matched colorways for style ${newStyleCode}.`,
    );
    const savePayload = buildSaveColorwayPayload({
      newStyleId: Number(newStyleId),
      newStyleCode,
      newStyleName,
      matchedColorways,
      currentUser,
    });
    console.log(
      `[useProjectSync] Saving colorways payload:`,
      JSON.stringify(savePayload, null, 2),
    );
    const saveResult = await savePlmStyleColorways(savePayload);
    console.log(
      `[useProjectSync] Colorways saved successfully:`,
      JSON.stringify(saveResult, null, 2),
    );
  } else {
    console.log(
      `[useProjectSync] No matching colorways found for style ${newStyleCode}.`,
    );
  }

  // 8. Update local database with new style and colorway details
  // console.log(
  //   `[useProjectSync] Updating local database for ${group.items.length} items of style ${group.styleMaterialNumber}...`,
  // );
  // await updateLocalItems(
  //   group.items,
  //   matchedColorways,
  //   newStyleId,
  //   newStyleCode,
  //   newStyleName,
  // );

  // 9. Refresh UI
  await refreshItems(projectId);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

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

    try {
      const latestItems = await refreshItems(project.id);
      const groups = groupItemsByStyle(latestItems);
      const totalStyles = groups.length;
      const totalColorways = latestItems.filter((i) => !!i.colorway).length;

      console.log("[useProjectSync] Style breakdown:", groups);

      // 0. Create Project in Plm and add all style in that projects
      if (currentUser) {
        try {
          console.log("[useProjectSync] Step 0: Creating project in PLM...", project.ProjectName);
          const createPayload = {
            project: {
              projectId: "0",
              code: project.ProjectName,
              name: project.ProjectName,
              description: project.Description ?? "",
              projectDetail: []
            },
            roleId: Number(currentUser.activeRoleId ?? 1005),
            modifyId: Number(currentUser.userId),
            userId: Number(currentUser.userId),
            Schema: currentUser.activeSchema
          };

          console.log("[useProjectSync] Sending project create payload:", JSON.stringify(createPayload, null, 2));
          const createRes = await api.post<any>("/api/pdm/project/save", createPayload, {
            headers: getStoredToken() ? { Authorization: `Bearer ${getStoredToken()}` } : {}
          });
          console.log("[useProjectSync] Project create response:", JSON.stringify(createRes.data, null, 2));

          const resData = createRes.data;
          const key = resData?.key ?? resData?.data?.key;
          const firstRowVersion = resData?.rowVersionText ?? resData?.data?.rowVersionText;

          if (key && firstRowVersion) {
            const projectDetail = [];
            let index = 1;
            for (const group of groups) {
              const firstItem = group.items[0];
              if (!firstItem) continue;
              const resolvedStyleId = await resolveGroupStyleId(firstItem, group);
              if (resolvedStyleId) {
                projectDetail.push({
                  ProjectDetailId: -index,
                  ProjectId: String(key),
                  ItemId: resolvedStyleId,
                  ItemName: group.styleMaterialName || firstItem.styleMaterialName || "",
                  ItemNumber: group.styleMaterialNumber,
                  Type: "Style"
                });
                index++;
              }
            }

            if (projectDetail.length > 0) {
              const updatePayload = {
                project: {
                  projectId: String(key),
                  code: project.ProjectName,
                  name: project.ProjectName,
                  description: project.Description ?? "",
                  projectDetail
                },
                rowVersionText: firstRowVersion,
                roleId: Number(currentUser.activeRoleId ?? 1005),
                modifyId: Number(currentUser.userId),
                userId: Number(currentUser.userId),
                Schema: currentUser.activeSchema
              };

              console.log("[useProjectSync] Sending project update payload with styles:", JSON.stringify(updatePayload, null, 2));
              const updateRes = await api.post<any>("/api/pdm/project/save", updatePayload, {
                headers: getStoredToken() ? { Authorization: `Bearer ${getStoredToken()}` } : {}
              });
              console.log("[useProjectSync] Project update response:", JSON.stringify(updateRes.data, null, 2));
            } else {
              console.warn("[useProjectSync] No styles resolved to construct projectDetail.");
            }
          } else {
            console.error("[useProjectSync] PLM Project save did not return key or rowVersionText.");
          }
        } catch (projErr) {
          console.error("[useProjectSync] Step 0: Failed to create project or add styles in PLM:", projErr);
        }
      }

      for (const group of groups) {
        if (!group.items[0] || !currentUser) continue;
        try {
          await processStyleGroup(group, currentUser, project.id, refreshItems);
        } catch (nodeErr) {
          console.error(
            `[useProjectSync] Failed to process PLM copy task for ${group.styleMaterialNumber}:`,
            nodeErr,
          );
        }
      }

      // Lock the project so it becomes read-only for all users
      // try {
      //   const lockedProject = await projectService.lockProject(project.id);
      //   setProject(lockedProject);
      // } catch (lockErr) {
      //   console.error('[useProjectSync] Failed to lock project after sync:', lockErr);
      //   // Non-fatal: sync succeeded; optimistically update local state
      //   setProject((prev) => (prev ? { ...prev, isLocked: true } : prev));
      // }

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
      setIsSyncing(false);
    }
  }, [project, setProject, showToast, refreshItems, currentUser]);

  return { handleSyncProject, isSyncing };
}
