export interface IonapiConfig {
  ti?: string;
  cn: string;
  ci: string;
  cs?: string;
  iu?: string;
  pu?: string;
  oa?: string;
  ot?: string;
  or?: string;
  ru?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface InforUser {
  userId: number;
  userGuid: string;
  firstName: string;
  lastName: string;
  roleIds: string;
  roleName: string;
  userImage: string | null;
  activeSchema: string;
  email: string;
  dbVersion: string;
  appVersion: string;
  versionName: string | null;
  isUserExternal: boolean;
  supplierId: number | null;
  hasAccess: boolean;
  clientVersion: string;
  mingleBaseUrl: string;
  activeRoleId: number;
  baseLanguage: string;
  currentYear: number | null;
  isEEM: boolean;
  supplierCode: string | null;
  isWorkOnSysLanguage: boolean;
  brokenRules: unknown | null;
  exception: unknown | null;
}


export interface GenericLookUp {
  ModifyDate: string
  Id: number
  GlrefId: number
  LookUpType: string
  GlValId: number
  Code: string
  Name: string
  Description: string
  Status: number
  sequence: number
  IsSystemDefined: number
  Translations: Translation[]
}

export interface Translation {
  CultureInfoId: number;
  Tabref: string;
  RefId: number;
  CultureId: number;
  Name: string;
  Description: string;
  Culture: string;
}

export interface StyleColorway {
  StyleColorwayId?: number;
  Name?: string;
  Description?: string;
  Code?: string;
}

export interface StyleObject {
  StyleId?: number;
  StyleColorways?: StyleColorway[];
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface ColorwayOption extends SelectOption {
  colorwayId: number;
}

export interface LookupOption extends SelectOption {
  id: number;
}
