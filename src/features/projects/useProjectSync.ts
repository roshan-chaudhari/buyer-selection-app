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

function extractAllImageRefs(group: GroupedStyle, firstItem?: ProjectItem): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  function addIfValid(url: unknown) {
    if (!url) return;
    let str = String(url).trim();
    if (str === "" || str === "null" || str === "undefined" || str === "[]" || str === "{}") {
      return;
    }
    // Handle double stringification
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
      } catch (e) {
        console.warn("[useProjectSync] Failed to parse annotatedImage JSON array:", e);
      }
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

function extractImageFileName(imageRef: string, fallbackName?: string): string {
  if (!imageRef) return `${fallbackName || 'style'}.jpg`;

  let target = String(imageRef).trim();

  // 1. If it's a proxy URL, extract the real inner S3 URL
  if (target.includes('url=')) {
    try {
      const parsedUrl = new URL(target, 'http://localhost');
      const inner = parsedUrl.searchParams.get('url');
      if (inner) {
        target = decodeURIComponent(inner).trim();
      }
    } catch { }
  }

  // 2. Strip any query parameters or hash (e.g. S3 presigned params ?X-Amz-...) and extract filename
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

  // 3. Extract pure filename directly from path without any alterations
  const cleanTarget = target.split('?')[0].split('#')[0];
  const lastSlash = Math.max(cleanTarget.lastIndexOf('/'), cleanTarget.lastIndexOf('\\'));
  const rawFileName = lastSlash !== -1 ? cleanTarget.substring(lastSlash + 1) : cleanTarget;

  if (rawFileName && rawFileName.includes('.')) {
    return decodeURIComponent(rawFileName);
  }

  return `${fallbackName || 'style'}.jpg`;
}

export function generateUUID(): string {
  const globalCrypto: Crypto | undefined =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  // 1. Native, spec-guaranteed v4 UUID.
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }

  // 2. Cryptographically secure random bytes, assembled by hand.
  if (globalCrypto?.getRandomValues) {
    const bytes = globalCrypto.getRandomValues(new Uint8Array(16));

    // Per RFC 4122 §4.4: set version (4) and variant (10xx) bits.
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

  // 3. Math.random fallback — not cryptographically secure.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
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
  project: TableType,
): Promise<{ ItemId: number; ItemName: string; ItemNumber: string; ItemType: 'Style' } | undefined> {
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


  async function resolveImageBlob(imgRef: string): Promise<Blob | null> {
    if (!imgRef) return null;

    if (imgRef.startsWith("data:")) {
      try {
        const res = await fetch(imgRef);
        return await res.blob();
      } catch {
        return null;
      }
    }

    try {
      const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
      const proxyUrl = imgRef.includes("/api/projects/proxy-image")
        ? imgRef
        : `${defaultBaseUrl}/api/projects/proxy-image?url=${encodeURIComponent(imgRef)}`;

      const res = await fetch(proxyUrl);
      if (res.ok) {
        return await res.blob();
      }
    } catch (err) {
      console.warn("[useProjectSync] Failed to fetch image via proxy, trying direct fetch:", err);
    }

    try {
      const directRes = await fetch(imgRef);
      if (directRes.ok) {
        return await directRes.blob();
      }
    } catch (err) {
      console.error("[useProjectSync] Direct fetch failed for image:", err);
    }

    return null;
  }

  // 5.1 add images in new style from S3 / annotated image (upload all images for this style)
  const imageRefs = extractAllImageRefs(group, firstItem);

  if (imageRefs.length > 0) {
    console.log(`[useProjectSync] Found ${imageRefs.length} style image(s) for StyleId ${newStyleId} ("${newStyleCode}"). Preparing upload...`);

    for (let imgIdx = 0; imgIdx < imageRefs.length; imgIdx++) {
      const imgRef = imageRefs[imgIdx];
      console.log(`[useProjectSync] [Image ${imgIdx + 1}/${imageRefs.length}] Preparing style image upload for StyleId ${newStyleId} from: ${imgRef}`);
      try {
        // 1. Fetch image binary blob from S3
        const imgBlob = await resolveImageBlob(imgRef);
        if (!imgBlob) {
          throw new Error(`Could not fetch image binary data from: ${imgRef}`);
        }

        // 2. Build metadata attachment object
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
            type: "styleImages"
          },
          referenceId: Number(newStyleId),
          modifyDate: "0001-01-01T00:00:00",
          code: "E0012",
          isDefault: false,
          objectId: 0,
          originalObjectName,
          objectStream: null,
          tempId: generateUUID()
        };

        // 3. Build Multipart FormData matching Infor PLM specifications
        const formData = new FormData();
        formData.append("file", imgBlob, originalObjectName);
        formData.append("atta", JSON.stringify(atta));
        formData.append("type", "styleImages");
        formData.append("formType", "file");
        formData.append("schema", currentUser.activeSchema || "FSH4");
        formData.append("overwrite", "false");

        console.log(`[useProjectSync] [Image ${imgIdx + 1}/${imageRefs.length}] Uploading style image to PLM for style "${newStyleCode}" with StyleId ${newStyleId}...`);
        console.log(`[useProjectSync] Attachment metadata (atta):`, JSON.stringify(atta, null, 2));

        const uploadResponse = await uploadPlmStyleImage(formData);
        console.log(`[useProjectSync] [Image ${imgIdx + 1}/${imageRefs.length}] Upload response:`, JSON.stringify(uploadResponse, null, 2));

        // 4. Save and assign uploaded image in style via PLM document save API
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

          console.log(`[useProjectSync] [Image ${imgIdx + 1}/${imageRefs.length}] Saving and assigning style image for StyleId ${newStyleId} (StyleCode: "${newStyleCode}")...`);
          console.log(`[useProjectSync] Document Save Payload:`, JSON.stringify(saveDocumentPayload, null, 2));

          const saveDocResponse = await savePlmDocument(saveDocumentPayload);
          console.log(`[useProjectSync] [Image ${imgIdx + 1}/${imageRefs.length}] Document save response:`, JSON.stringify(saveDocResponse, null, 2));
        }
      } catch (uploadErr: any) {
        console.error(`[useProjectSync] Failed to upload/assign style image ${imgIdx + 1}/${imageRefs.length} to PLM for style "${newStyleCode}":`, uploadErr);
        if (uploadErr.response) {
          console.log("[useProjectSync] Upload error response status:", uploadErr.response.status);
          console.log("[useProjectSync] Upload error response data:", JSON.stringify(uploadErr.response.data, null, 2));
        }
      }
    }
  } else {
    console.log(`[useProjectSync] No annotated images found for style "${newStyleCode}". Skipping image upload.`);
  }

  //5.2 add image in new style from document library.






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

  // Perform additional Style Overview update after colorway update completes
  console.log(`[useProjectSync] Completing Style Overview update for style ${newStyleCode}...`);
  await styleOverviewService.updateStyleOverviewAfterSync({
    newStyleId,
    projItem: firstItem,
    currentUser,
    buyerId: project.BuyerId || null,
    projectName: project.ProjectName || "",
  });





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

  return {
    ItemId: Number(newStyleId),
    ItemName: newStyleName,
    ItemNumber: newStyleCode,
    ItemType: 'Style' as const,
  };
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

    // Signal to the Axios interceptor that a sync is active.
    // This prevents 401/402 PLM API errors from triggering window.location.href = "/"
    // which would kill the entire JS execution context mid-sync.
    setSyncInProgress(true);

    try {
      const latestItems = await refreshItems(project.id);
      const groups = groupItemsByStyle(latestItems);
      const totalStyles = groups.length;
      const totalColorways = latestItems.filter((i) => !!i.colorway).length;

      // Avoid logging the full `groups` object — it contains large base64 `annotatedImage`
      // strings that can crash the JS runtime on tablets when serialized by the console engine.
      console.log(
        "[useProjectSync] Style breakdown: total groups =",
        groups.length,
        "| styles =",
        groups.map((g) => g.styleMaterialNumber),
      );

      const syncedStylesList: { ItemId: number; ItemName: string; ItemNumber: string; ItemType: 'Style' | 'Material' }[] = [];

      let activeUser = currentUser;
      if (!activeUser) {
        console.log("[useProjectSync] currentUser is null, attempting to fetch user profile dynamically...");
        try {
          activeUser = await fetchCurrentUser();
          console.log("[useProjectSync] Dynamically loaded user:", activeUser.userId);
        } catch (err) {
          console.error("[useProjectSync] Failed to dynamically load user:", err);
          throw new Error(
            "User session is still loading or could not be loaded. Please check your connection, wait a moment, and try Sync again.",
            { cause: err }
          );
        }
      }

      for (const group of groups) {
        if (!group.items[0]) continue;
        try {
          if (group.itemType === 'Material') {
            const syncedMaterial = await materialSyncService.processMaterialGroup(group, activeUser, project.id, refreshItems);
            console.log("[useProjectSync] syncedMaterial:", syncedMaterial);
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
          console.error(
            `[useProjectSync] Failed to process PLM copy task for ${group.styleMaterialNumber}:`,
            nodeErr,
          );
        }
      }

      // 0. Create Project in Plm and add all style in that projects
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

          // Check for broken rules in successful response
          const hasConflict = checkBrokenRules(resData) || checkBrokenRules(resData?.data);
          if (hasConflict) {
            throw new Error("PROJECT.CODE_ALREADY_EXISTS", { cause: hasConflict });
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
              Type: style.ItemType || "Style"
            }));

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
            console.error("[useProjectSync] PLM Project save did not return key or rowVersionText.");
          }
        } catch (projErr: any) {
          console.error("[useProjectSync] Step 0: Failed to create project container or add styles in PLM:", projErr);
          const errData = projErr?.response?.data;
          const hasConflict = checkBrokenRules(errData) || checkBrokenRules(errData?.data);
          if (hasConflict) {
            console.warn("[useProjectSync] PLM Project code already exists in PLM. Styles have been synced. Proceeding to finalize and lock project in DB.");
          } else {
            console.warn("[useProjectSync] Non-fatal PLM Project container save warning:", projErr);
          }
        }
      }

      // Lock the project in the database so it becomes read-only for all users
      console.log(`[useProjectSync] Updating database lock status (IsLock = 1) for project ID ${project.id}...`);
      const lockedProject = await projectService.lockProject(project.id);
      setProject(lockedProject);
      console.log(`[useProjectSync] Project ${project.id} locked in database successfully:`, lockedProject);

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
      // Always restore normal auth-redirect behavior after sync completes/fails
      setSyncInProgress(false);
      setIsSyncing(false);
    }
  }, [project, setProject, showToast, refreshItems, currentUser]);

  return { handleSyncProject, isSyncing };
}
