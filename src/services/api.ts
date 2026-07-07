import axios from "axios";
import { getStoredToken } from "../auth/tokenUtils";
import { type InforUser, type GenericLookUp } from "../types/api";

// Empty baseURL: all routing is done by Vite's proxy rules.
// - /api/projects        → proxied to http://localhost:5000 (local backend)
// - /cors-proxy          → handled by the dynamic CORS tunnel (Infor external API)
export const api = axios.create({
  baseURL: "",
});

// Dedicated axios instance for Infor CORS-proxy calls.
// baseURL = '/cors-proxy' so relative paths route through the Vite middleware,
// and the interceptor below builds x-target-url correctly from the path.
export const corsProxyApi = axios.create({
  baseURL: "/cors-proxy",
});

/**
 * Shared utility to build the Infor API target URL dynamically.
 */
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

// Configures Axios interceptors to resolve credentials, token, and target path
export const setupInterceptors = () => {
  // Eject existing interceptors before re-registering (safe for HMR)
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

      // Local backend calls (/api/...) go through Vite's proxy directly — skip x-target-url
      if (cleanEndpoint.startsWith("/api/")) {
        return config;
      }

      // Resolve Infor API Base URL and Tenant ID dynamically (for /cors-proxy calls)
      const iu = localStorage.getItem("iu");
      const ti = localStorage.getItem("ti");

      // If credentials aren't set yet, skip adding x-target-url
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
  config: ApiConfig = { showToast: true },
): T | ApiResponseWrapper<T> => {
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
      // Use the dedicated corsProxyApi instance (baseURL='/cors-proxy') so the
      // request hits the Vite middleware and x-target-url is built from the path.
      const response = await corsProxyApi.get<InforUser>(
        "FASHIONPLM/security/api/security/user/getinfo/guid",
      );
      // API returns a plain camelCase object — cast directly.
      // OData fallbacks handle edge cases where the payload is wrapped (d.results / value / array).
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

/**
 * Backward compatible wrapper function that extracts the user object.
 */
export async function fetchCurrentUser(): Promise<InforUser> {
  const result = await userService.getCurrentUser();
  if (result && result.success && result.data) {
    return result.data;
  }
  throw new Error(result?.message || "Failed to fetch user");
}

//#region OData2 Services

/**
 * Generic service to call OData2 endpoints through the backend proxy.
 * The backend constructs the full Infor URL using the .ionapi config (TI + IU).
 * Frontend only passes the endpoint name and optional OData query params.
 */
export const odata2Service = {
  /**
   * Call GET /api/odata2/GenericLookUpAll with optional OData filter params.
   * Example: genericLookup({ GlrefId: 1 })
   */
  genericLookup: async (
    params: { GlrefId?: number; [key: string]: unknown } = {},
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
    params: { StyleId?: number; [key: string]: unknown } = {},
  ): Promise<unknown> => {
    const token = getStoredToken();

    const filterParts = Object.entries(params)
      .map(([key, value]) => {
        const formattedValue = typeof value === "string" ? `'${value}'` : value;
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

  const schema = currentUser.activeSchema || "FSH212";
  const userId = currentUser.userId || 50;
  const roleId = currentUser.activeRoleId || 1;

  const body = getPlmAttachmentGridBody(styleId, schema, userId, roleId);
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

    // If a direct S3 URL exists, proxy it to avoid canvas CORS issues
    const directUrl = imgAttachment.Image || imgAttachment.ImageCustom || imgAttachment.ImageThumb;
    if (directUrl) {
      try {
        const proxyResponse = await api.get<any>("/api/projects/proxy-image", {
          params: { url: directUrl },
        });
        if (proxyResponse.data?.data?.dataUrl) {
          return proxyResponse.data.data.dataUrl;
        }
      } catch {
        // Fallback to direct URL if proxy fails (works in <img> but not canvas)
        return directUrl;
      }
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

//#endregion
