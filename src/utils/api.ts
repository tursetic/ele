import { Elevator, InspectionRecord } from '../types';

const SERVICE_KEY = 'dacb12c7e73fb2551105593c7e389df3fbc7b235a1ccf46a22f26ce3de5a2713';
const BASE = 'https://apis.data.go.kr/B553664/ElevatorInformationService';

// In-memory cache with TTL: avoids redundant network calls for the same query/page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const searchCache = new Map<string, { data: { items: Elevator[]; totalCount: number }; expiry: number }>();
const inspectCache = new Map<string, { data: { records: InspectionRecord[]; totalCount: number }; expiry: number }>();

// ★ [카카오 웹 자바스크립트 인증키] 따옴표 절대 유지
const KAKAO_KEY = 'faaff9b8bee1edfe7d5c7f3889f1d117';

function getCached<T>(cache: Map<string, { data: T; expiry: number }>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(cache: Map<string, { data: T; expiry: number }>, key: string, data: T): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

function getText(el: Element, tag: string): string {
  return el.querySelector(tag)?.textContent?.trim() ?? '';
}

function parseElevatorItem(item: Element): Elevator {
  return {
    elevatorNo: getText(item, 'elevatorNo'),
    buldNm: getText(item, 'buldNm'),
    address1: getText(item, 'address1'),
    address2: getText(item, 'address2'),
    buldMgtNo1: getText(item, 'buldMgtNo1'),
    buldMgtNo2: getText(item, 'buldMgtNo2'),
    elvtrDivNm: getText(item, 'elvtrDivNm'),
    elvtrFormNm: getText(item, 'elvtrFormNm'),
    elvtrKindNm: getText(item, 'elvtrKindNm'),
    elvtrModel: getText(item, 'elvtrModel'),
    elvtrStts: getText(item, 'elvtrStts'),
    frstInstallationDe: getText(item, 'frstInstallationDe'),
    installationDe: getText(item, 'installationDe'),
    lastInspctDe: getText(item, 'lastInspctDe'),
    lastInspctKind: getText(item, 'lastInspctKind'),
    inspctInstt: getText(item, 'inspctInstt'),
    lastResultNm: getText(item, 'lastResultNm'),
    divGroundFloorCnt: getText(item, 'divGroundFloorCnt'),
    divUndgrndFloorCnt: getText(item, 'divUndgrndFloorCnt'),
    shuttleFloorCnt: getText(item, 'shuttleFloorCnt'),
    ratedSpeed: getText(item, 'ratedSpeed'),
    ratedCap: getText(item, 'ratedCap'),
    liveLoad: getText(item, 'liveLoad'),
    installationPlace: getText(item, 'installationPlace'),
    shuttleSection: getText(item, 'shuttleSection'),
    manufacturerName: getText(item, 'manufacturerName'),
    elvtrAsignNo: getText(item, 'elvtrAsignNo'),
    mrYn: getText(item, 'mrYn'),
    applcBeDt: getText(item, 'applcBeDt'),
    applcEnDt: getText(item, 'applcEnDt'),
    pauseAblDe: getText(item, 'pauseAblDe'),
    pauseAbleResn: getText(item, 'pauseAbleResn'),
    subcntrCpny: getText(item, 'subcntrCpny'),
    mntCpnyNm: getText(item, 'mntCpnyNm'),
    mntCpnyTelno: getText(item, 'mntCpnyTelno'),
    partcpntNm: getText(item, 'partcpntNm'),
    partcpntTelno: getText(item, 'partcpntTelno'),
    buldPrpos: getText(item, 'buldPrpos'),
    elvtrResmptDe: getText(item, 'elvtrResmptDe'),
  };
}

async function fetchXml(url: string, signal?: AbortSignal): Promise<Document> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return new DOMParser().parseFromString(text, 'text/xml');
}

export async function searchByElevatorNo(elevatorNo: string, pageNo: number = 1, signal?: AbortSignal): Promise<{ items: Elevator[], totalCount: number }> {
  const cacheKey = `elev:${elevatorNo}:${pageNo}`;
  const cached = getCached(searchCache, cacheKey);
  if (cached) return cached;

  const url = `${BASE}/getElevatorViewM?serviceKey=${SERVICE_KEY}&elevator_no=${elevatorNo}&numOfRows=100&pageNo=${pageNo}`;
  const doc = await fetchXml(url, signal);
  const totalCount = parseInt(doc.querySelector('totalCount')?.textContent ?? '0', 10);
  const items = Array.from(doc.querySelectorAll('item')).map(parseElevatorItem);
  const result = { items, totalCount };
  setCached(searchCache, cacheKey, result);
  return result;
}

export async function searchByAddress(params: {
  sido?: string;
  sigungu?: string;
  buldNm?: string;
  pageNo?: number;
  numOfRows?: string;
  signal?: AbortSignal;
}): Promise<{ items: Elevator[], totalCount: number }> {
  const pageNo = params.pageNo ?? 1;
  const numOfRows = params.numOfRows || '100';
  const cacheKey = `addr:${params.sido || ''}:${params.sigungu || ''}:${params.buldNm || ''}:${pageNo}:${numOfRows}`;
  const cached = getCached(searchCache, cacheKey);
  if (cached) return cached;

  const query = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    numOfRows,
    pageNo: pageNo.toString(),
  });
  if (params.sido) query.set('sido', params.sido);
  if (params.sigungu) query.set('sigungu', params.sigungu);
  if (params.buldNm) query.set('buld_nm', params.buldNm);

  const url = `${BASE}/getElevatorListM?${query.toString()}`;
  const doc = await fetchXml(url, params.signal);
  const totalCount = parseInt(doc.querySelector('totalCount')?.textContent ?? '0', 10);
  const items = Array.from(doc.querySelectorAll('item')).map(parseElevatorItem);
  const result = { items, totalCount };
  setCached(searchCache, cacheKey, result);
  return result;
}

export async function fetchInspectionHistory(elevatorNo: string, pageNo: number = 1, signal?: AbortSignal): Promise<{ records: InspectionRecord[], totalCount: number }> {
  const cacheKey = `insp:${elevatorNo}:${pageNo}`;
  const cached = getCached(inspectCache, cacheKey);
  if (cached) return cached;

  const url = `${BASE}/getElvtrInspctInqireM?serviceKey=${SERVICE_KEY}&elevator_no=${elevatorNo}&numOfRows=100&pageNo=${pageNo}`;
  const doc = await fetchXml(url, signal);
  const totalCount = parseInt(doc.querySelector('totalCount')?.textContent ?? '0', 10);
  const items = Array.from(doc.querySelectorAll('item')).map((item) => ({
    applcBeDt: getText(item, 'applcBeDt'),
    applcEnDt: getText(item, 'applcEnDt'),
    node_id: getText(item, 'nodeId'),
    inspctDt: getText(item, 'inspctDt'),
    inspctKind: getText(item, 'inspctKind'),
    psexamYn: getText(item, 'psexamYn'),
    inspctInsttNm: getText(item, 'inspctInsttNm'),
  }));
  const sorted = items.sort((a, b) => b.inspctDt.localeCompare(a.inspctDt));
  const result = { records: sorted, totalCount };
  setCached(inspectCache, cacheKey, result);
  return result;
}

// Singleton promise so kakao.maps.load() is called at most once
let kakaoLoadPromise: Promise<void> | null = null;

export function ensureKakaoReady(): Promise<void> {
  if (kakaoLoadPromise) return kakaoLoadPromise;

  kakaoLoadPromise = new Promise<void>((resolve, reject) => {
    const TIMEOUT_MS = 5000;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      kakaoLoadPromise = null;
      reject(new Error('Kakao SDK Load Timeout'));
    }, TIMEOUT_MS);

    if ((window as any).kakao && (window as any).kakao.maps?.load) {
      settled = true;
      clearTimeout(timer);
      (window as any).kakao.maps.load(() => resolve());
      return;
    }

    console.log("▶ [Kakao] 불필요한 프록시 제거 -> CDN 직통 및 Referrer 강제 주입 우회 개시");
    const script = document.createElement('script');
    script.type = 'text/javascript';
    
    // ★ 프록시 우회 경로 전면 폐기하고 공식 카카오 CDN 주소로 직통 연결합니다.
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&libraries=services&autoload=false`;
    
    // ★ [CORS 차단 해제 치트키] crossOrigin 속성을 "절대" 명시하지 않는 것이 핵심입니다!
    // 표준 script 태그는 crossOrigin을 빼면 CORS 검사 대상에서 완전히 제외되어 통과됩니다.
    // 그러면서 referrerpolicy만 unsafe-url로 고정하면, 브라우저가 Referer 헤더를 누락 없이 완벽히 쥐어 보냅니다.
    script.referrerPolicy = 'unsafe-url'; 
    script.async = true;
    script.defer = true;

    script.onload = () => {
      const kakao = (window as any).kakao;
      if (kakao && kakao.maps && typeof kakao.maps.load === 'function') {
        kakao.maps.load(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          console.log("✅ [Kakao] 직통 위성 안착 및 지도/로컬 라이브러리 로드 완료");
          resolve();
        });
      }
    };

    script.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      kakaoLoadPromise = null;
      console.error("❌ [Kakao] 스크립트 주입 실패:", err);
      reject(new Error('Kakao CDN Network Error'));
    };

    document.head.appendChild(script);
  });

  return kakaoLoadPromise;
}

export function geocodeAddress(address: string, signal?: AbortSignal): Promise<[number, number] | null> {
  if (signal?.aborted) return Promise.resolve(null);

  return ensureKakaoReady()
    .then(() => {
      if (signal?.aborted) return null;
      return new Promise<[number, number] | null>((resolve) => {
        const kakao = (window as any).kakao;
        if (!kakao || !kakao.maps?.services) {
          resolve(null);
          return;
        }
        const geocoder = new kakao.maps.services.Geocoder();
        geocoder.addressSearch(address, (result: any[], status: string) => {
          if (signal?.aborted) { resolve(null); return; }
          if (status === 'OK' && result.length > 0) {
            resolve([parseFloat(result[0].y), parseFloat(result[0].x)]);
          } else {
            resolve(null);
          }
        });
      });
    })
    .catch((err) => {
      console.error('[geocodeAddress] Kakao SDK error:', err);
      return null;
    });
}

// src/utils/api.ts 파일 맨 하단에 그대로 추가해 주세요.

export interface EleBuildingFeature {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    BULD_NM: string;
    ADDRESS: string;
    ELVTR_CNT: number;
    GROUND_FLOOR_CNT: number;
    UNDGRND_FLOOR_CNT: number;
    BULD_PRPOS_LCLAS_NM: string;
    BULD_PRPOS_SCLAS_NM: string;
  };
}

// 📐 수학적 발견: 외부 무거운 GIS 라이브러리 없이 구면 메르카토르 미터 좌표계로 정밀 변환
export function convertWGS84ToEPSG3857(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return [x, y];
}

export async function fetchEleBuildings(
  bounds: { xmin: number; ymin: number; xmax: number; ymax: number; }, 
  layerType: 'q' | 'limit' = 'q',
  signal?: AbortSignal
) {
  const p3857_min = convertWGS84ToEPSG3857(bounds.xmin, bounds.ymin);
  const p3857_max = convertWGS84ToEPSG3857(bounds.xmax, bounds.ymax);

  const bboxParam = `${p3857_min[0]},${p3857_min[1]},${p3857_max[0]},${p3857_max[1]},EPSG:3857`;
  const viewparamsParam = `xmin:${bounds.xmin};ymin:${bounds.ymin};xmax:${bounds.xmax};ymax:${bounds.ymax}`;
  const baseUrl = "/api/proxy";
  
  const typeName = layerType === 'limit' ? 'koelsadp:building_limit' : 'koelsadp:building_q';

  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '1.0.0',
    REQUEST: 'GetFeature',
    OUTPUTFORMAT: 'application/json',
    TYPENAME: typeName,
    BBOX: bboxParam,
    VIEWPARAMS: viewparamsParam // 🎯 완치 가드: q와 limit 둘 다 SQL View 기반이므로 조건문 없이 무조건 주입합니다.
  });

  const url = `${baseUrl}?${params.toString()}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  
  const data = await res.json();
  return data.features || [];
}