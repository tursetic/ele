export interface Elevator {
  elevatorNo: string;
  buldNm: string;
  address1: string;
  address2: string;
  elvtrDivNm: string;
  elvtrFormNm: string;
  elvtrKindNm: string;
  elvtrModel: string;
  elvtrStts: string;
  frstInstallationDe: string;
  installationDe: string;
  lastInspctDe: string;
  lastInspctKind: string;
  inspctInstt: string;
  lastResultNm: string;
  divGroundFloorCnt: string;
  divUndgrndFloorCnt: string;
  shuttleFloorCnt: string;
  ratedSpeed: string;
  ratedCap: string;
  liveLoad: string;
  installationPlace: string;
  shuttleSection: string;
  manufacturerName: string;
  elvtrAsignNo: string;
  mrYn: string;
  applcBeDt: string;
  applcEnDt: string;
  pauseAblDe: string;
  pauseAbleResn: string;
  subcntrCpny: string;
  mntCpnyNm: string;
  mntCpnyTelno: string;
  partcpntNm: string;
  partcpntTelno: string;
  buldPrpos: string;
}

export interface InspectionRecord {
  applcBeDt: string;
  applcEnDt: string;
  inspctDt: string;
  inspctKind: string;
  psexamYn: string;
  inspctInsttNm: string;
  node_id?: string;
}

export type SearchTab = 'elevatorNo' | 'address' | 'building' | 'mapSearch';

export interface SettingsFields {
  elvtrDivNm: boolean;
  elvtrFormNm: boolean;
  elvtrKindNm: boolean;
  elvtrModel: boolean;
  elvtrStts: boolean;
  frstInstallationDe: boolean;
  installationDe: boolean;
  lastInspctDe: boolean;
  lastInspctKind: boolean;
  inspctInstt: boolean;
  divGroundFloorCnt: boolean;
  divUndgrndFloorCnt: boolean;
  ratedSpeed: boolean;
  ratedCap: boolean;
  liveLoad: boolean;
  installationPlace: boolean;
  shuttleSection: boolean;
  mrYn: boolean;
  subcntrCpny: boolean;
  mntCpnyNm: boolean;
  mntCpnyTelno: boolean;
  partcpntNm: boolean;
  partcpntTelno: boolean;
  buldPrpos: boolean;
}

export interface ElevatorWithBadges extends Elevator {
  isTopGround: boolean;
  isDeepUnderground: boolean;
  buildingMaxGround?: number;
  buildingMaxUnderground?: number;
}

export interface SearchHistory {
  type: 'search' | 'view';
  query: string;
  timestamp: number;
  elevatorNo?: string;
  buldNm?: string;
  elvtrModel?: string;
  filters?: Record<string, string>;
  elevatorData?: Elevator;
}

export interface FilterOptions {
  divGroundFloorCnt: string[];
  manufacturerName: string[];
  elvtrModel: string[];
  installationYear: string[];
  ratedSpeed: string[];
  liveLoad: string[];
  elvtrDivNm: string[];
  elvtrFormNm: string[];
  elvtrKindNm: string[];
  elvtrStts: string[];
  lastResultNm: string[];
}

export interface GeoGroup {
  address: string;
  buildingName: string;
  lat: number;
  lng: number;
  elevators: ElevatorWithBadges[];
}

export interface Bookmark {
  id: string;
  elevator_no: string;
  building_name: string | null;
  address: string | null;
  elevator_data: Elevator | null;
  created_at: string;
  folder_id: string | null;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

