import { Elevator, ElevatorWithBadges, FilterOptions } from '../types';

export function formatElevatorNo(no?: string | null): string {
  if (!no) return '';
  const clean = no.replace(/[^0-9]/g, '');
  if (clean.length === 7) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return no;
}

export function assignBadges(elevators: Elevator[]): ElevatorWithBadges[] {
  // Badges are meaningless for a single elevator (e.g. 고유번호 search)
  if (elevators.length <= 1) {
    return elevators.map((el) => ({
      ...el,
      isTopGround: false,
      isDeepUnderground: false,
    }));
  }

  const groups: Record<string, Elevator[]> = {};
  for (const el of elevators) {
    const key = el.buldNm || '_unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(el);
  }

  const result: ElevatorWithBadges[] = [];

  for (const group of Object.values(groups)) {
    // A group of only 1 elevator should not get badges either
    const singleInGroup = group.length <= 1;
    const maxGround = Math.max(...group.map((e) => parseInt(e.divGroundFloorCnt) || 0));
    const maxUnderground = Math.max(...group.map((e) => parseInt(e.divUndgrndFloorCnt) || 0));

    for (const el of group) {
      const groundFloors = parseInt(el.divGroundFloorCnt) || 0;
      const undergroundFloors = parseInt(el.divUndgrndFloorCnt) || 0;
      result.push({
        ...el,
        isTopGround: !singleInGroup && maxGround > 0 && groundFloors === maxGround,
        isDeepUnderground: !singleInGroup && maxUnderground > 0 && undergroundFloors === maxUnderground,
      });
    }
  }

  return result;
}

/* ─── 한국 도로명주소 본선/지선 연계 시퀀스 정렬 알고리즘 (v3) ─── */

interface RobustAddress {
  prefix: string;           // 도로명 앞부분 전체 (예: 서울특별시 서초구)
  baseRoad: string;         // 기본 도로명 (예: 세종대로)
  mainLinePos: number;      // 본선 상의 시퀀스 위치 기준값 (숫자 우선 비교)
  isBranch: boolean;        // 지선(번길/길) 여부
  branchNum: number;        // 지선 번호 (0이면 본선)
  branchSuffix: string;     // '가', '나' 같은 지선 한글 부호 (없으면 '')
  buildingMainNum: number;  // 건물 본번
  buildingSubNum: number;   // 건물 부번
  isUnderground: boolean;   // 지하 여부
}

function parseAddressRobust(address1: string): RobustAddress {
  const clean = (address1 || '').trim();
  const tokens = clean.split(/\s+/);
  
  let prefix = '';
  let roadToken = '';
  let buildingTokens: string[] = [];
  
  // '로' 또는 '길'이 포함된 가장 마지막 토큰을 도로명 토큰으로 설정
  let roadIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].includes('로') || tokens[i].includes('길')) {
      roadIdx = i;
    }
  }
  
  if (roadIdx !== -1) {
    // ★ 교정: 도로명 토큰 앞부분의 행정구역 수식어 전체를 안전하게 캡처합니다.
    prefix = tokens.slice(0, roadIdx).join(' ');
    roadToken = tokens[roadIdx];
    buildingTokens = tokens.slice(roadIdx + 1);
  } else {
    prefix = '';
    roadToken = tokens[0] || '';
    buildingTokens = tokens.slice(1);
  }
  
  let baseRoad = roadToken;
  let branchNum = 0;
  let branchSuffix = '';
  
  // 도로명 토큰에서 숫자 + 번길/길 형태 분리
  const roadMatch = roadToken.match(/^(.*?)(\d+)([가-힣]*길)$/);
  if (roadMatch) {
    baseRoad = roadMatch[1];
    branchNum = parseInt(roadMatch[2], 10);
    branchSuffix = roadMatch[3].replace(/번?길$/, '');
  }
  
  const buildingStr = buildingTokens.join(' ');
  const isUnderground = buildingStr.includes('지하');
  
  // 건물 번호 추출 (본번-부번)
  const numMatch = buildingStr.match(/(\d+)(?:-(\d+))?/);
  const buildingMainNum = numMatch ? parseInt(numMatch[1], 10) : 0;
  const buildingSubNum = numMatch && numMatch[2] ? parseInt(numMatch[2], 10) : 0;
  
  const isBranch = branchNum > 0;
  const mainLinePos = isBranch ? branchNum : buildingMainNum;
  
  return {
    prefix,
    baseRoad,
    mainLinePos,
    isBranch,
    branchNum,
    branchSuffix,
    buildingMainNum,
    buildingSubNum,
    isUnderground,
  };
}

export function compareAddress1(a: string, b: string): number {
  const pa = parseAddressRobust(a);
  const pb = parseAddressRobust(b);

  // ★ 1순위 타이브레이커: 도로명 앞부분 행정구역 전체(시/도 + 시/군/구) 가나다순 우선 비교
  const prefixCompare = pa.prefix.localeCompare(pb.prefix, 'ko');
  if (prefixCompare !== 0) return prefixCompare;

  // 2순위: 기본 도로명 가나다순 정렬 (예: 세종대로 vs 을지로)
  const baseCompare = pa.baseRoad.localeCompare(pb.baseRoad, 'ko');
  if (baseCompare !== 0) return baseCompare;

  // 3순위: 주소에서 분착되는 앞쪽 숫자 시퀀스(mainLinePos) 비교
  if (pa.mainLinePos !== pb.mainLinePos) {
    return pa.mainLinePos - pb.mainLinePos;
  }

  // 4순위: 동일한 숫자 위치선상일 때, 본선 건물이 지선(골목) 진입보다 무조건 우선 배치
  if (pa.isBranch !== pb.isBranch) {
    return pa.isBranch ? 1 : -1;
  }

  // 5순위: 둘 다 지선 골목일 경우, 숫자 바로 뒤의 한글 분기 부호('가', '나')를 순차 비교
  if (pa.isBranch && pb.isBranch) {
    const suffixCompare = pa.branchSuffix.localeCompare(pb.branchSuffix, 'ko');
    if (suffixCompare !== 0) return suffixCompare;
  }

  // 6순위: 건물 본번 정렬
  if (pa.buildingMainNum !== pb.buildingMainNum) {
    return pa.buildingMainNum - pb.buildingMainNum;
  }

  // 7순위: 건물 부번 정렬
  if (pa.buildingSubNum !== pb.buildingSubNum) {
    return pa.buildingSubNum - pb.buildingSubNum;
  }

  // 8순위: 지하 여부 정렬 (지상 우선, 지하 나중)
  if (pa.isUnderground !== pb.isUnderground) {
    return pa.isUnderground ? 1 : -1;
  }

  return 0;
}

export function sortElevators(elevators: Elevator[]): Elevator[] {
  return [...elevators].sort((a, b) => {
    const addrCompare = compareAddress1(a.address1 || '', b.address1 || '');
    if (addrCompare !== 0) return addrCompare;

    const aNo = a.elvtrAsignNo || '';
    const bNo = b.elvtrAsignNo || '';
    const aNum = parseInt(aNo, 10);
    const bNum = parseInt(bNo, 10);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    if (!isNaN(aNum)) return -1;
    if (!isNaN(bNum)) return 1;
    return aNo.localeCompare(bNo, 'ko');
  });
}

export function checkShuttleSection(section?: string | null): { valid: boolean; raw: string } {
  if (!section || section.trim() === '' || section === '-') {
    return { valid: true, raw: section || '' };
  }
  const valid = /^[0-9BbFf\-~\s,]+$/.test(section.trim());
  return { valid, raw: section };
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  if (dateStr.includes('-')) return dateStr;
  if (dateStr.length === 8) return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  return dateStr;
}

export function getStatusBadgeClass(status?: string | null): string {
  if (status === '운행중') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700';
  }
  return 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700';
}

export function getStatusHexColor(status?: string | null): string {
  if (status === '운행중') return '#059669';
  return '#dc2626';
}

export function extractYear(dateStr?: string | null): string {
  if (!dateStr) return '';
  return dateStr.slice(0, 4);
}

export function parseRatedSpeed(ratedSpeedStr?: string | null): number | null {
  if (!ratedSpeedStr) return null;
  const match = ratedSpeedStr.match(/([\d.]+)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return isNaN(value) ? null : value * 60;
}

export function formatRatedSpeed(ratedSpeedStr?: string | null): string {
  const speed = parseRatedSpeed(ratedSpeedStr);
  if (speed === null) return ratedSpeedStr || '-';
  const rounded = Math.round(speed * 100) / 100;
  return `${rounded} m/min`;
}

export function collectFilterOptions(elevators: Elevator[]): FilterOptions {
  const filters: FilterOptions = {
    divGroundFloorCnt: [], manufacturerName: [], elvtrModel: [], installationYear: [],
    ratedSpeed: [], liveLoad: [], elvtrDivNm: [], elvtrFormNm: [], elvtrKindNm: [],
    elvtrStts: [], lastResultNm: [],
  };

  const keys = Object.keys(filters) as (keyof FilterOptions)[];
  const sets = Object.fromEntries(keys.map(k => [k, new Set<string>()])) as Record<keyof FilterOptions, Set<string>>;

  for (const el of elevators) {
    if (el.divGroundFloorCnt) sets.divGroundFloorCnt.add(el.divGroundFloorCnt);
    if (el.manufacturerName) sets.manufacturerName.add(el.manufacturerName);
    if (el.elvtrModel) sets.elvtrModel.add(el.elvtrModel);
    if (el.installationDe || el.frstInstallationDe) {
      const year = extractYear(el.installationDe) || extractYear(el.frstInstallationDe);
      if (year) sets.installationYear.add(year);
    }
    if (el.ratedSpeed) sets.ratedSpeed.add(formatRatedSpeed(el.ratedSpeed));
    if (el.liveLoad) sets.liveLoad.add(el.liveLoad);
    if (el.elvtrDivNm) sets.elvtrDivNm.add(el.elvtrDivNm);
    if (el.elvtrFormNm) sets.elvtrFormNm.add(el.elvtrFormNm);
    if (el.elvtrKindNm) sets.elvtrKindNm.add(el.elvtrKindNm);
    if (el.elvtrStts) sets.elvtrStts.add(el.elvtrStts);
    if (el.lastResultNm) sets.lastResultNm.add(el.lastResultNm);
  }

  for (const key of keys) {
    filters[key] = Array.from(sets[key]);

    const isNumeric = ['divGroundFloorCnt', 'installationYear', 'ratedSpeed', 'liveLoad'].includes(key);
    
    filters[key].sort((a, b) => {
      if (isNumeric) {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
        if (numA !== numB) return numA - numB;
      }
      return a.localeCompare(b, 'ko');
    });
  }

  return filters;
}