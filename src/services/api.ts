import axios from "axios";
import { getStoredToken } from "../auth/tokenUtils";
import { type InforUser, type GenericLookUp } from "../types/api";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
});

export const corsProxyApi = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL || "") + "/cors-proxy",
});

function buildTargetUrl(endpoint: string, iu: string, ti: string): string {
  const baseUrl = iu.trim().endsWith("/") ? iu.trim() : `${iu.trim()}/`;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;

  if (endpoint.startsWith("https://")) {
    return endpoint;
  }

  return cleanEndpoint.startsWith(ti)
    ? `${baseUrl}${cleanEndpoint}`
    : `${baseUrl}${ti}/${cleanEndpoint}`;
}

corsProxyApi.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const iu = localStorage.getItem("iu");
  const ti = localStorage.getItem("ti");
  if (!iu || !ti) return config;

  config.headers["x-target-url"] = buildTargetUrl(config.url || "", iu, ti);
  return config;
});

let requestInterceptorId: number | null = null;
let responseInterceptorId: number | null = null;

/**
 * Set to `true` before starting a project sync operation and back to `false`
 * in the finally block. While true, the Axios 401/402 response interceptor
 * will NOT redirect the browser to "/" — it will throw the error back to the
 * sync's own try/catch so it can be handled gracefully without killing the page.
 */
export let syncInProgress = false;
export function setSyncInProgress(value: boolean): void {
  syncInProgress = value;
}

export const setupInterceptors = () => {
  if (requestInterceptorId !== null)
    api.interceptors.request.eject(requestInterceptorId);
  if (responseInterceptorId !== null)
    api.interceptors.response.eject(responseInterceptorId);
  requestInterceptorId = api.interceptors.request.use(
    (config) => {
      const token = getStoredToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      const cleanEndpoint = config.url || "";

      if (cleanEndpoint.startsWith("/api/")) {
        if (
          cleanEndpoint.includes("/odata2/") ||
          cleanEndpoint.includes("/job/") ||
          cleanEndpoint.includes("/library/") ||
          cleanEndpoint.includes("/pdm/") ||
          cleanEndpoint.includes("/document") // PLM pdm/document services
        ) {
          const iu = localStorage.getItem("iu");
          const ti = localStorage.getItem("ti");
          if (iu) config.headers["x-infor-url"] = iu;
          if (ti) config.headers["x-tenant-id"] = ti;
        }
        return config;
      }

      const iu = localStorage.getItem("iu");
      const ti = localStorage.getItem("ti");

      if (!iu || !ti) return config;

      config.headers["x-target-url"] = buildTargetUrl(cleanEndpoint, iu, ti);
      return config;
    },
    (err: unknown) => {
      console.error("Request interceptor error:", err);
      return Promise.reject(err);
    },
  );

  responseInterceptorId = api.interceptors.response.use(
    (res) => res,
    (err: unknown) => {
      const error = err as CustomError;
      const status = error.response?.status;
      if (status === 402 || status === 401) {
        const urlStr = String(error.config?.url ?? "");
        const configHeaders = error.config?.headers;
        const targetUrlStr = String(
          configHeaders?.["x-target-url"] ??
          (typeof configHeaders?.get === "function"
            ? configHeaders.get("x-target-url")
            : "") ??
          "",
        );
        const isUserInfoReq =
          urlStr.includes("getinfo") || targetUrlStr.includes("getinfo");
        if (isUserInfoReq) {
          console.warn(
            "User info request failed with 401/402, bypassing force logout for development.",
          );
          return Promise.reject(err);
        }

        // If a sync operation is in progress, do NOT redirect — the page redirect
        // would destroy the entire JS execution context and silently kill the sync.
        // Instead, throw the error so the sync's try/catch can log it gracefully.
        if (syncInProgress) {
          console.error(
            `[api] PLM API returned ${status} during active sync. Skipping redirect — error will be caught by sync handler.`,
            error.config?.url,
          );
          return Promise.reject(err);
        }

        console.warn("Session expired or login required.");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("session");
        error.handled = true;
        window.location.href = "/";
      }
      return Promise.reject(err);
    },
  );
};

// Initialize interceptors immediately for out-of-the-box operation
setupInterceptors();

export interface CustomError extends Error {
  handled?: boolean;
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
  config?: {
    url?: string;
    headers?: Record<string, string> & {
      get?: (name: string) => string | null;
    };
  };
}

type ApiConfig = {
  showToast?: boolean;
};

interface ApiResponseWrapper<T> {
  success: boolean;
  message: string;
  data: T | null;
  meta?: unknown;
}

const apiProcessor = <T>(
  success: boolean,
  data: T,
  message: string,
  error: unknown,
  meta?: unknown,
  _config: ApiConfig = { showToast: true },
): T | ApiResponseWrapper<T> => {
  void _config;
  if (success) {
    if (Array.isArray(data)) {
      if (meta) {
        return Object.assign([...data], { meta }) as unknown as T;
      }
      return data;
    }

    return {
      success: true,
      message,
      data,
      meta,
    };
  }

  const errorMsg =
    message ||
    (error instanceof Error ? error.message : String(error || "")) ||
    "Something went wrong";
  console.error("API Error:", errorMsg);
  return { success: false, message: errorMsg, data: null };
};

const handleApiError = (err: unknown): ApiResponseWrapper<any> => {
  const error = err as CustomError;
  if (error?.handled)
    return { success: false, message: "Handled error", data: null };

  const message =
    error?.response?.data?.message || error?.message || "Something went wrong";
  console.error("API Error:", message);
  return { success: false, message, data: null };
};

//#region User Services
export const userService = {
  getCurrentUser: async (): Promise<ApiResponseWrapper<InforUser>> => {
    try {
      const response = await corsProxyApi.get<InforUser>(
        "FASHIONPLM/security/api/security/user/getinfo/guid",
      );
      const data = response.data as unknown;
      const rawUser: InforUser | null =
        (data as { d?: { results?: InforUser[] } })?.d?.results?.[0] ??
        (data as { d?: InforUser })?.d ??
        (data as { value?: InforUser[] })?.value?.[0] ??
        (Array.isArray(data)
          ? (data as InforUser[])[0]
          : (data as InforUser)) ??
        null;

      if (!rawUser) {
        return apiProcessor(
          false,
          null,
          "Failed to load user info",
          null,
          undefined,
          { showToast: false },
        ) as unknown as ApiResponseWrapper<InforUser>;
      }

      return apiProcessor(
        true,
        rawUser,
        "User loaded successfully",
        null,
        undefined,
        { showToast: false },
      ) as unknown as ApiResponseWrapper<InforUser>;
    } catch (err: unknown) {
      return handleApiError(err) as unknown as ApiResponseWrapper<InforUser>;
    }
  },
};

export async function fetchCurrentUser(): Promise<InforUser> {
  const result = await userService.getCurrentUser();
  if (result && result.success && result.data) {
    return result.data;
  }
  throw new Error(result?.message || "Failed to fetch user");
}

export const odata2Service = {
  /**
   * Call GET /api/odata2/GenericLookUpAll with optional OData filter params.
   * Example: genericLookup({ GlrefId: 1 })
   */
  genericLookup: async (
    params: { GlrefId?: number;[key: string]: unknown } = {},
  ): Promise<unknown> => {
    const token = getStoredToken();

    const filterParts = Object.entries(params)
      .map(([key, value]) => {
        const formattedValue = typeof value === "string" ? `'${value}'` : value;
        return `${key} eq ${formattedValue}`;
      })
      .join(" and ");

    const queryString = filterParts
      ? `?$filter=${encodeURIComponent(filterParts)}`
      : "";

    const response = await api.get(
      `/api/odata2/GenericLookUpAll${queryString}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );

    return response.data;
  },

  /**
   * Fetches and normalizes generic lookup data into a standard option list.
   */
  getLookupOptions: async (glrefId: number): Promise<{ value: string; label: string; id: number }[]> => {
    try {
      const response = await odata2Service.genericLookup({ GlrefId: glrefId });
      if (!response || typeof response !== "object") return [];

      const r = response as Record<string, unknown>;
      let list: GenericLookUp[] = [];

      if (Array.isArray(response)) {
        list = response as GenericLookUp[];
      } else if (Array.isArray(r.value)) {
        list = r.value as GenericLookUp[];
      } else {
        const d = r.d as Record<string, unknown> | undefined;
        if (d && typeof d === "object") {
          if (Array.isArray(d.results)) {
            list = d.results as GenericLookUp[];
          } else {
            list = [d as unknown as GenericLookUp];
          }
        }
      }

      return list
        .map((opt) => ({
          value: opt.Name || opt.Code || "",
          label: opt.Name || opt.Code || "",
          id: opt.GlValId || 0,
        }))
        .filter((opt) => opt.value !== "");
    } catch (err) {
      console.error(`[odata2Service] getLookupOptions failed for GlrefId ${glrefId}:`, err);
      return [];
    }
  }
};

export const odata2style = {
  getStyleData: async (
    params: { StyleId?: number; StyleCode?: string; Name?: string; search?: string; [key: string]: unknown } = {},
  ): Promise<unknown> => {
    const token = getStoredToken();

    const filterParts = params.search
      ? `(StyleCode eq '${String(params.search).replace(/'/g, "''")}' or Name eq '${String(params.search).replace(/'/g, "''")}')`
      : Object.entries(params)
          .map(([key, value]) => {
            const formattedValue = typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : value;
            return `${key} eq ${formattedValue}`;
          })
          .join(" and ");

    const queryString = filterParts
      ? `?$filter=IsDeleted eq 0 and ${encodeURIComponent(filterParts)}&$expand=StyleColorways`
      : `?$expand=StyleColorways`;

    const response = await api.get(`/api/odata2/Style${queryString}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    return response.data;
  },

  refreshStyleData: async (): Promise<unknown> => {
    const token = getStoredToken();
    const queryString = `?$expand=StyleColorways`;

    const response = await api.get(`/api/odata2/Style${queryString}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    return response.data;
  },
};


export const odata2styleCopy = {
  getStyleDatacopy: async (
    params: { StyleCode?: string; Name?: string;[key: string]: unknown } = {},
  ): Promise<unknown> => {
    const token = getStoredToken();

    const filterParts = Object.entries(params)
      .map(([key, value]) => {
        const formattedValue = typeof value === "string"
          ? `'${value.replace(/'/g, "''")}'`
          : value;
        return `${key} eq ${formattedValue}`;
      })
      .join(" and ");

    const queryString = filterParts
      ? `?$filter=IsDeleted eq 0 and ${encodeURIComponent(filterParts)}`
      : "";

    const response = await api.get(`/api/odata2/Style${queryString}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    return response.data;
  },

  refreshStyleData: async (): Promise<unknown> => {
    const token = getStoredToken();
    const response = await api.get(`/api/odata2/Style`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    return response.data;
  },
};
//#endregion

// ── Quick Test: Call GenericLookUpAll with GlrefId=1 and GlValId=4 ───────────
// Remove this block once confirmed working
/*(async () => {
  try {
    console.log("[OData2] Calling getStyleData with filter: StyleId eq 449");
    const result = await odata2style.getStyleData({ StyleId: 449 });
    console.log("[OData2] getStyleData Response:", JSON.stringify(result));
  } catch (err) {
    console.error("[OData2] getStyleData failed:", err);
  }
})(); */

// ── PLM Attachment Query Payload ─────────────────────────────────────────────
export const getPlmAttachmentGridBody = (
  finalStyleId: number | string,
  schema: string,
  userId: number | string,
  roleId: number | string
) => {
  return {
    roleId: Number(roleId),
    userId: Number(userId),
    mainEntity: "Style",
    entities: [
      {
        ignoreMetadata: false,
        searchable: [],
        dataFilter: {
          Conditions: [
            {
              fieldName: "StyleId",
              operator: "=",
              value: String(finalStyleId),
            },
          ],
        },
        parent: null,
        name: "Style",
        sortInfo: null,
        extendedFields: [],
        lookupRef: [],
        columns: [
          "StyleCode",
          "IsNormal",
          "FreeField1",
          "FreeField2",
          "FreeField3",
          "FreeField4",
          "NumericValue1",
          "NumericValue2",
          "Remark",
          "IsCostingSynced",
          "ProductMaterialStatus",
          "StylePatternNumber",
          "MarketSpecNumber",
          "PatternSpecNumber",
          "SupplierId",
          "IsSetAsMainSupplier",
          "OpItemTempId",
          "ResponsibleId",
          "CreateDate",
          "ModifyDate",
          "ModifyId",
          "SupplierCountryId",
          "LinePlanName",
          "CarryOver",
          "Variant",
          "UserDefinedField8Ids",
          "UserDefinedField9Ids",
          "UserDefinedField10Ids",
          "UserDefinedField12Ids",
          "UserDefinedField11Ids",
          "UserDefinedField4Id",
          "UserDefinedField3Id",
          "UserDefinedField2Id",
          "UserDefinedField1Id",
          "UserDefinedField13Ids",
          "Quantity",
          "ExFactoryDate",
          "RetailInStoreDate",
          "Date3",
          "Date4",
          "CreateId",
          "CopiedFrom",
          "SupplierPurchasePrice",
          "SupplierPurchasePriceCurrencyId",
          "CostPriceBase",
          "CostPriceBaseCurrencyId",
          "UserDefinedField5Id",
          "UserDefinedField6Id",
          "UserDefinedField7Id",
          "Set",
          "IsArchived",
          "StyleId",
          "RowVersion",
          "RowVersionText",
          "IsDeleted",
          "IsSameId",
          "BOMLineMainMaterial",
          "BOMLineComposition",
          "CostPriceCurrencyId",
          "IsGenAIGenerated",
          "NameCulture",
          "DescriptionCulture",
        ],
      },
      {
        ignoreMetadata: false,
        searchable: null,
        dataFilter: null,
        sortInfos: null,
        parent: "Attachments",
        name: "AttaDetail",
        sortInfo: null,
        extendedFields: [],
        lookupRef: null,
        columns: [
          "AttaDetailsId",
          "AttaFileListId",
          "DtlType",
          "Name",
          "Comment",
          "Value",
        ],
        pageInfo: null,
      },
    ],
    lookups: [],
    includeLookups: true,
    pageType: "details",
    isNewRecord: false,
    Schema: schema,
  };
};


export const getPlmColorwayDetailsGridBody = (
  finalStyleId: number | string,
  schema: string,
  userId: number | string,
  roleId: number | string
) => {
  return {
    roleId: Number(roleId),
    userId: Number(userId),
    personalizationId: 0,
    entity: "StyleColorways",
    pageType: "list",
    dataFilter: {
      Conditions: [
        {
          fieldName: "StyleId",
          operator: "=",
          value: Number(finalStyleId),
        },
      ],
    },
    includeLookups: false,
    pageInfo: null,
    moduleCaller: "list",
    Schema: schema,
  };
};


// ── Attachment filter helpers ─────────────────────────────────────────────────────

/** Returns the MIME type inferred from a filename's extension. */
function getMimeTypeFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

/** Returns true if the attachment is categorised as a Style Image. */
function isStyleImageAttachment(att: any): boolean {
  return att.Type === "Style Images" || att.type === "Style Images";
}

/** Returns true if the attachment is marked as the default. */
function isDefaultAttachment(att: any): boolean {
  return (
    att.IsDefault === 1 ||
    att.isDefault === 1 ||
    att.IsDefault === true ||
    att.isDefault === true ||
    String(att.IsDefault) === "1" ||
    String(att.isDefault) === "1"
  );
}

/**
 * Fetches the primary style image from PLM for a given StyleId.
 * Prefers attachments of type "Style Images" with IsDefault = 1.
 * Falls back to any "Style Images" attachment, then raw base64 Value.
 * Direct S3 URLs are proxied through the backend to avoid canvas CORS issues.
 */
export async function fetchStyleImage(
  styleId: number | string,
  currentUser: any
): Promise<string | null> {
  if (!styleId || !currentUser) return null;

  const schema = currentUser.activeSchema;
  const userId = currentUser.userId;
  const roleId = currentUser.activeRoleId;

  const body = getPlmAttachmentGridBody(styleId, schema, userId, roleId);
  const token = getStoredToken();

  const apiStart = performance.now();
  console.log(`[PERFORMANCE LOG] fetchStyleImage API request started for StyleId ${styleId} at ${new Date().toISOString()}`);

  try {
    const response = await api.post<any>(
      "/api/odata2/view/entity/data/get",
      body,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );

    const apiEnd = performance.now();
    console.log(`[PERFORMANCE LOG] fetchStyleImage API request completed. Duration: ${(apiEnd - apiStart).toFixed(2)}ms`);

    const responseData = response.data;
    if (!responseData) return null;

    const entities = responseData.entities || responseData.d?.entities || [];

    const styleEntity = entities.find(
      (e: any) => e.name === "Style" || e.Name === "Style"
    );
    if (!styleEntity) return null;

    const column = styleEntity.column || styleEntity.Column;
    if (!column) return null;

    const attachments: any[] = column.Attachments || column.attachments || [];
    if (attachments.length === 0) return null;

    // Prefer: Type === "Style Images" AND IsDefault === 1; fall back to any Style Images
    const imgAttachment =
      attachments.find((att) => isStyleImageAttachment(att) && isDefaultAttachment(att)) ??
      attachments.find((att) => isStyleImageAttachment(att));

    if (!imgAttachment) return null;

    // If a direct S3 URL exists, return the proxy URL directly.
    // The backend will stream the binary image directly to the browser,
    // which is faster, memory-efficient, and avoids CORS canvas issues.
    const directUrl = imgAttachment.Image || imgAttachment.ImageCustom || imgAttachment.ImageThumb;
    if (directUrl) {
      return `/api/projects/proxy-image?url=${encodeURIComponent(directUrl)}`;
    }

    // Fallback: parse raw base64 Value field
    const rawValue = imgAttachment.Value || imgAttachment.value;
    if (!rawValue) return null;

    if (rawValue.startsWith("data:")) return rawValue;

    const filename =
      imgAttachment.OFilename ||
      imgAttachment.CFilename ||
      imgAttachment.Name ||
      imgAttachment.name ||
      "";
    const mimeType = getMimeTypeFromFilename(filename);
    return `data:${mimeType};base64,${rawValue}`;
  } catch (err) {
    console.error(`[fetchStyleImage] Failed to fetch image for StyleId ${styleId}:`, err);
    throw err;
  }
}

// ── Style Node Fetcher ────────────────────────────────────────────────────────

/**
 * Fetches the full PLM "Style" entity column node for a given StyleId.
 * Uses getPlmAttachmentGridBody under the hood and returns ONLY the Style
 * entity's column data — all scalar fields, free fields, user-defined fields,
 * dates, etc. — stripping attachments and other child entities.
 *
 * Returns null if the style is not found or the call fails.
 */
export async function fetchPlmStyleDetails(
  styleId: number | string,
  currentUser: any
): Promise<Record<string, unknown> | null> {
  console.log(`[fetchPlmStyleDetails] Called with styleId: ${styleId}`, "currentUser:", currentUser);
  if (!styleId || !currentUser) {
    console.warn(`[fetchPlmStyleDetails] Missing styleId or currentUser. styleId: ${styleId}`);
    return null;
  }

  const schema = currentUser.activeSchema;
  const userId = currentUser.userId;
  const roleId = currentUser.activeRoleId;

  const body = getPlmAttachmentGridBody(styleId, schema, userId, roleId);
  const token = getStoredToken();

  // console.log(`[fetchPlmStyleDetails] Built body:`, JSON.stringify(body, null, 2));
  // console.log(`[fetchPlmStyleDetails] Stored Token exists: ${!!token}`);

  try {
    console.log(`[fetchPlmStyleDetails] Sending POST request to /api/odata2/view/entity/data/get...`);
    const response = await api.post<any>(
      "/api/odata2/view/entity/data/get",
      body,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );

    const responseData = response.data;
    console.log(`[fetchPlmStyleDetails] Received response. Status: ${response.status}`);
    console.log(`[fetchPlmStyleDetails] responseData for StyleId ${styleId}:`, JSON.stringify(responseData, null, 2));

    if (!responseData) {
      console.warn(`[fetchPlmStyleDetails] Empty responseData received for StyleId ${styleId}`);
      return null;
    }

    // Navigate to the entities array (handles both wrapped and flat responses)
    const entities: any[] = responseData.entities || responseData.d?.entities || [];
    console.log(`[fetchPlmStyleDetails] Extracted entities count: ${entities.length}`);

    // Find the "Style" entity node
    const styleEntity = entities.find(
      (e: any) => e.name === "Style" || e.Name === "Style"
    );
    if (!styleEntity) {
      console.warn(`[fetchPlmStyleDetails] Style entity node not found in entities array for StyleId ${styleId}. Entities:`, entities);
      return null;
    }

    // Return the column object — the flat Style record with all PLM fields
    const column = styleEntity.column || styleEntity.Column;
    console.log(`[fetchPlmStyleDetails] Extracted Style columns keys:`, Object.keys(column || {}));
    return (column as Record<string, unknown>) ?? null;
  } catch (err) {
    console.error(`[fetchPlmStyleDetails] Failed to fetch PLM node for StyleId ${styleId}. Error details:`, err);
    throw err;
  }
}


export async function fetchPlmColorwayDetails(
  styleId: number | string,
  currentUser: any
): Promise<any[] | null> {
  if (!styleId || !currentUser) return null;

  const schema = currentUser.activeSchema;
  const userId = currentUser.userId;
  const roleId = currentUser.activeRoleId;

  const body = getPlmColorwayDetailsGridBody(styleId, schema, userId, roleId);
  const token = getStoredToken();

  try {
    const response = await api.post<any>(
      "/api/odata2/view/layout/data/get",
      body,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );

    const responseData = response.data;
    console.log(`[fetchPlmColorwayDetails] responseData for StyleId ${styleId}:`, JSON.stringify(responseData, null, 2));

    if (!responseData) return null;

    // Navigate to the entities array (handles both wrapped and flat responses)
    const entities: any[] = responseData.entities || responseData.d?.entities || [];

    // Filter and map only the entities matching "StyleColorways"
    const colorways = entities
      .filter((e: any) => e && (e.name === "StyleColorways" || e.Name === "StyleColorways"))
      .map((e: any) => e.column || e.Column)
      .filter((c: any) => c != null);

    console.log(`[fetchPlmColorwayDetails] Extracted ${colorways.length} StyleColorways:`, JSON.stringify(colorways, null, 2));
    return colorways;
  } catch (err) {
    console.error(`[fetchPlmColorwayDetails] Failed to fetch colorways for StyleId ${styleId}:`, err);
    throw err;
  }
}


//#endregion

// ── PLM Job Tasks ─────────────────────────────────────────────────────────────

/**
 * Posts a job task request to PLM.
 * Endpoint: POST /api/job/tasks
 *
 * The caller is responsible for building the request body (use buildStyleCopyPayload
 * from plmStyleCopyPayload.ts). This function only handles the HTTP call.
 *
 * @param requestBody - The fully-built payload (PlmStyleCopyRequest or any job body)
 */
export async function createPlmJobTask(
  requestBody: Record<string, unknown>,
): Promise<{ success: boolean; jobId?: string | number; message?: string; data?: unknown }> {
  const token = getStoredToken();

  const { data } = await api.post<any>(
    "/api/job/tasks",
    requestBody,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  return data;
}

/**
 * Gets details of style copying task items to find the newly created style code.
 * Endpoint: POST /api/job/tasks/items
 */
export async function getPlmJobTaskItems(params: {
  taskKeys: string[];
  Schema: string;
}): Promise<any> {
  const token = getStoredToken();

  const { data } = await api.post(
    "/api/job/tasks/items",
    params,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  return data;
}

export async function getIdGeneratorDetails(params: {
  autoNumberId: string;
  Schema: string;
}): Promise<unknown> {
  const token = getStoredToken();

  const { data } = await api.post(
    "/api/library/tools/idgenerator/get",
    params,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  return data;
}

/**
 * Uploads style image file metadata to PLM document service.
 * Endpoint: POST /api/document/UploadFile/
 */
export async function uploadPlmStyleImage(
  payload: Record<string, unknown>,
): Promise<any> {
  const token = getStoredToken();
  const url = "/api/document/UploadFile/";
  try {
    const response = await api.post<any>(
      url,
      payload,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    return response.data;
  } catch (err: any) {
    if (err.response) {
      console.log(`[uploadPlmStyleImage] Error status: ${err.response.status}`);
    }
    throw err;
  }
}

export const odata2material = {
  getMaterialData: async (
    params: { MaterialId?: number; MaterialCode?: string; MaterialName?: string; search?: string; [key: string]: unknown } = {},
  ): Promise<unknown> => {
    const token = getStoredToken();
    console.log("[odata2material.getMaterialData] Called with params:", JSON.stringify(params, null, 2));

    const filterParts = params.search
      ? `(MaterialCode eq '${String(params.search).replace(/'/g, "''")}' or MaterialName eq '${String(params.search).replace(/'/g, "''")}')`
      : Object.entries(params)
          .map(([key, value]) => {
            const formattedValue = typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : value;
            return `${key} eq ${formattedValue}`;
          })
          .join(" and ");

    const queryString = filterParts
      ? `?$filter=IsDeleted eq 0 and ${encodeURIComponent(filterParts)}&$expand=MaterialColorways`
      : `?$expand=MaterialColorways`;

    const requestUrl = `/api/odata2/MATERIAL${queryString}`;

    try {
      const response = await api.get(requestUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return response.data;
    } catch (err: any) {
      if (err.response) {
        console.error("[odata2material.getMaterialData] Error Response status:", err.response.status);
      }
      throw err;
    }
  },
};

export const getPlmMaterialColorwayDetailsGridBody = (
  finalMaterialId: number | string,
  schema: string,
  userId: number | string,
  roleId: number | string
) => {
  return {
    roleId: Number(roleId),
    userId: Number(userId),
    personalizationId: 0,
    entity: "MaterialColorways",
    pageType: "list",
    dataFilter: {
      Conditions: [
        {
          fieldName: "MaterialId",
          operator: "=",
          value: Number(finalMaterialId),
        },
      ],
    },
    includeLookups: false,
    pageInfo: null,
    moduleCaller: "list",
    Schema: schema,
  };
};

export async function fetchPlmMaterialColorways(
  materialId: number | string,
  currentUser: any
): Promise<any[] | null> {
  if (!materialId || !currentUser) return null;

  const schema = currentUser.activeSchema;
  const userId = currentUser.userId;
  const roleId = currentUser.activeRoleId;

  const body = getPlmMaterialColorwayDetailsGridBody(materialId, schema, userId, roleId);
  const token = getStoredToken();

  try {
    const response = await api.post<any>(
      "/api/odata2/view/layout/data/get",
      body,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );

    const responseData = response.data;

    if (!responseData) return null;
    const entities: any[] = responseData.entities || responseData.d?.entities || [];
    const colorways = entities
      .filter((e: any) => e && (e.name === "MaterialColorways" || e.Name === "MaterialColorways"))
      .map((e: any) => e.column || e.Column)
      .filter((c: any) => c != null);

    return colorways;
  } catch (err) {
    console.error(`[fetchPlmMaterialColorways] Failed to fetch colorways for MaterialId ${materialId}:`, err);
    throw err;
  }
}

export const getPlmMaterialAttachmentGridBody = (
  finalMaterialId: number | string,
  schema: string,
  userId: number | string,
  roleId: number | string
) => {
  return {
    roleId: Number(roleId),
    userId: Number(userId),
    mainEntity: "Material",
    entities: [
      {
        ignoreMetadata: false,
        searchable: [],
        dataFilter: {
          Conditions: [
            {
              fieldName: "MaterialId",
              operator: "=",
              value: String(finalMaterialId),
            },
          ],
        },
        parent: null,
        name: "Material",
        sortInfo: null,
        extendedFields: [],
        lookupRef: [],
        columns: [
          "MaterialCode",
          "MaterialName",
          "Description",
          "MaterialId",
          "RowVersion",
          "RowVersionText",
          "IsDeleted",
        ],
      },
      {
        ignoreMetadata: false,
        searchable: null,
        dataFilter: null,
        sortInfos: null,
        parent: "Attachments",
        name: "AttaDetail",
        sortInfo: null,
        extendedFields: [],
        lookupRef: null,
        columns: [
          "AttaDetailsId",
          "AttaFileListId",
          "DtlType",
          "Name",
          "Comment",
          "Value",
        ],
        pageInfo: null,
      },
    ],
    lookups: [],
    includeLookups: true,
    pageType: "details",
    isNewRecord: false,
    Schema: schema,
  };
};

export async function fetchPlmMaterialDetails(
  materialId: number | string,
  currentUser: any
): Promise<Record<string, unknown> | null> {
  if (!materialId || !currentUser) return null;

  const schema = currentUser.activeSchema;
  const userId = currentUser.userId;
  const roleId = currentUser.activeRoleId;

  const body = getPlmMaterialAttachmentGridBody(materialId, schema, userId, roleId);
  const token = getStoredToken();

  try {
    const response = await api.post<any>(
      "/api/odata2/view/entity/data/get",
      body,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );

    const responseData = response.data;
    if (!responseData) return null;

    const entities: any[] = responseData.entities || responseData.d?.entities || [];
    const materialEntity = entities.find(
      (e: any) => e.name === "Material" || e.Name === "Material"
    );
    if (!materialEntity) return null;

    const column = materialEntity.column || materialEntity.Column;
    return (column as Record<string, unknown>) ?? null;
  } catch (err) {
    console.error(`[fetchPlmMaterialDetails] Failed to fetch material details for MaterialId ${materialId}:`, err);
    throw err;
  }
}

export async function savePlmMaterialColorways(
  payload: Record<string, unknown>
): Promise<any> {
  const token = getStoredToken();
  const url = "/api/pdm/material/colorways/save";
  try {
    const response = await api.post<any>(
      url,
      payload,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    return response.data;
  } catch (err) {
    console.error(`[savePlmMaterialColorways] Failed to save material colorways:`, err);
    throw err;
  }
}

export async function savePlmStyleOverview(
  payload: Record<string, unknown>
): Promise<any> {
  const token = getStoredToken();
  const { data } = await api.post(
    "/api/pdm/style/v2/save",
    payload,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
  return data;
}

