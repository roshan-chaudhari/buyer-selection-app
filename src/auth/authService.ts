import axios from 'axios';

import { type IonapiConfig, type TokenResponse } from '../types/api';
export type { IonapiConfig, TokenResponse };


/**
 * Helper to build the exact token endpoint URL securely.
 */
function buildTokenUrl(pu: string, ot: string = 'token.oauth2'): string {
  const cleanPu = pu.trim();
  return cleanPu.endsWith('/') ? `${cleanPu}${ot}` : `${cleanPu}/${ot}`;
}

/**
 * Helper to send a POST request through the local Connect CORS proxy (/cors-proxy) to fetch the OAuth token.
 */
const API_BASE =
  "https://buyersectionapp-api-hxg5eqfrb6ezfzab.centralindia-01.azurewebsites.net";

async function postTokenRequest(
  tokenUrl: string,
  params: URLSearchParams
): Promise<TokenResponse> {
  const response = await axios.post<TokenResponse>(
    `${API_BASE}/cors-proxy`,
    params.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-target-url": tokenUrl,
      },
    }
  );

  return response.data;
}

/**
 * Fetches the OAuth token from Infor using the client_credentials grant type,
 * exactly replicating the logic in the .NET backend.
 */
export async function fetchClientCredentialsToken(config: IonapiConfig): Promise<TokenResponse> {
  const pu = config.pu || "";
  const ot = config.ot || "token.oauth2";
  const tokenUrl = buildTokenUrl(pu, ot);

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", config.ci);
  params.append("client_secret", config.cs || "");

  return postTokenRequest(tokenUrl, params);
}

/**
 * Reads a .ionapi file, parses its JSON content, validates keys,
 * and saves it into localStorage's ionapiList to store the profile locally.
 */
export function handleIonapiUpload(file: File): Promise<IonapiConfig> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== 'string') {
          throw new Error('Could not read file content');
        }

        const config: IonapiConfig = JSON.parse(text);

        // Validation of required keys in an ION API config file
        if (!config.cn) {
          throw new Error("Invalid .ionapi file: Missing client name (cn)");
        }
        if (!config.ci) {
          throw new Error("Invalid .ionapi file: Missing client ID (ci)");
        }

        // Save to localStorage list of profiles
        const listStr = localStorage.getItem('ionapiList');
        let list: IonapiConfig[] = [];
        if (listStr) {
          try {
            list = JSON.parse(listStr);
            if (!Array.isArray(list)) {
              list = [];
            }
          } catch {
            list = [];
          }
        }

        // Prevent duplicate profiles by matching on Client Name (cn) and overwrite if exists
        const filteredList = list.filter(item => item.cn !== config.cn);
        filteredList.push(config);
        localStorage.setItem('ionapiList', JSON.stringify(filteredList));

        // Fetch the client credentials token directly from the frontend
        fetchClientCredentialsToken(config)
          .then((tokenData) => {
            const tokenDataWithTimestamp = {
              ...tokenData,
              retrieved_at: Date.now()
            };
            localStorage.setItem("accessToken", JSON.stringify(tokenDataWithTimestamp));
          })
          .catch(() => {
            // Silently catch or handle token error without noisy debug log
          });

        resolve(config);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    reader.onerror = () => {
      reject(new Error('File reading error'));
    };

    reader.readAsText(file);
  });
}

/**
 * Stores OAuth connection parameters to localStorage and redirects the browser
 * to the Infor PLM authorization page.
 */
export function loginWithIonapi(config: IonapiConfig): void {
  localStorage.setItem("ci", config.ci || "");
  localStorage.setItem("cs", config.cs || "");
  localStorage.setItem("ti", config.ti || "");
  localStorage.setItem("iu", config.iu || "");
  localStorage.setItem("ot", config.ot || "");
  localStorage.setItem("ru", config.ru || "");
  
  const puVal = config.pu || "";
  const parts = puVal.split(".com");
  const parsedPu = parts[0] ? parts[0] + ".com" : "";
  localStorage.setItem("pu", parsedPu);
  localStorage.setItem("pu1", puVal);

  const redirect = `${config.pu || ""}${config.oa || ""}?client_id=${encodeURIComponent(config.ci || "")}&AuthMode=Prompt&response_type=code&redirect_uri=${encodeURIComponent(config.ru || "")}&TenantId=${encodeURIComponent(config.ti || "")}`;
  window.location.href = redirect;
}

/**
 * Exchanges an authorization code for an OAuth token using the authorization_code grant type.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const ci = localStorage.getItem("ci") || "";
  const cs = localStorage.getItem("cs") || "";
  const ru = localStorage.getItem("ru") || "";
  const pu1 = localStorage.getItem("pu1") || "";
  const ot = localStorage.getItem("ot") || "token.oauth2";
  const pu = localStorage.getItem("pu") || "";

  const tokenUrl = buildTokenUrl(pu1 || pu, ot);

  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", ru);
  params.append("client_id", ci);
  params.append("client_secret", cs);

  return postTokenRequest(tokenUrl, params);
}
