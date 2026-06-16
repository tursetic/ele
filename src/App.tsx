import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Settings, Map as MapIcon, List, AlertCircle, Bell, XCircle, Sliders } from 'lucide-react';
import { Elevator as ElevatorType, ElevatorWithBadges, SettingsFields, SearchHistory, FilterOptions, SearchTab, GeoGroup } from './types';
import { searchByElevatorNo, searchByAddress, geocodeAddress } from './utils/api';
import { sortElevators, assignBadges, collectFilterOptions, parseRatedSpeed, formatRatedSpeed, extractYear, formatDate } from './utils/elevatorHelpers';
import { getBookmarkedElevatorNos, getAllBookmarkChanges, markChangeNotified, BookmarkChange, subscribeToChanges, clearGlobalChanges } from './utils/bookmarks';

// ★ [누락 해결] 건물 레이어 전용 격리 지도를 최상단에 명확하게 로드하여 ReferenceError 원천 차단
import BuildingLayerMap from './components/BuildingLayerMap';

import SearchFormAdvanced from './components/SearchFormAdvanced';
import ElevatorCard from './components/ElevatorCard';
import ElevatorModal from './components/ElevatorModal';
import MapView from './components/MapView';
import SettingsMenu from './components/SettingsMenu';
import Pagination from './components/Pagination';
import FilterSidebar from './components/FilterSidebar';

const ROWS_PER_PAGE = 100;

// ★ [비밀 문구 상수] 향후 다른 검색 탭/기능에서도 동일하게 사용. 한 곳에서 수정하면 전체 반영됨.
export const SECRET_PHRASE = '서해철도선';
const SECRET_FETCH_ROWS = 500;
const SECRET_MAX_TOTAL = 5000;

export interface MapState {
  center: { lat: number; lng: number };
  level: number;
  openedOverlayAddress: string | null;
}

interface LastSearchParams {
  tab: SearchTab;
  elevatorNo?: string;
  sido?: string;
  sigungu?: string;
  buldNm?: string;
}

const DEFAULT_SETTINGS: SettingsFields = {
  elvtrDivNm: true,
  elvtrFormNm: true,
  elvtrKindNm: true,
  elvtrModel: true,
  elvtrStts: true,
  frstInstallationDe: true,
  installationDe: true,
  lastInspctDe: true,
  lastInspctKind: true,
  inspctInstt: true,
  divGroundFloorCnt: true,
  divUndgrndFloorCnt: true,
  ratedSpeed: true,
  ratedCap: true,
  liveLoad: true,
  installationPlace: true,
  shuttleSection: true,
  mrYn: true,
  subcntrCpny: true,
  mntCpnyNm: true,
  mntCpnyTelno: true,
  partcpntNm: true,
  partcpntTelno: true,
  buldPrpos: true,
};

function loadSettings(): SettingsFields {
  try {
    const stored = localStorage.getItem('elevatorSettings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (_) {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: SettingsFields) {
  try {
    localStorage.setItem('elevatorSettings', JSON.stringify(settings));
  } catch (_) {}
}

export default function App() {
  const [searchTab, setSearchTab] = useState<SearchTab>('address');
  const [elevatorNoQuery, setElevatorNoQuery] = useState('');
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const [building, setBuilding] = useState('');

  const [modelKeyword, setModelKeyword] = useState('');
  const [minGroundFloor, setMinGroundFloor] = useState('');
  const [minSpeed, setMinSpeed] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pageResults, setPageResults] = useState<ElevatorWithBadges[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [hasVisitedMap, setHasVisitedMap] = useState(false);
  const [geoGroups, setGeoGroups] = useState<GeoGroup[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [focusAddress, setFocusAddress] = useState<string | undefined>(undefined);
  const [restoreMode, setRestoreMode] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ★ [비밀 문구 검색 상태] session-scoped, totalPages보다 먼저 선언해야 함
  const allResultsRef = useRef<ElevatorWithBadges[] | null>(null);
  const [isSecretSearch, setIsSecretSearch] = useState(false);
  const isSecretSearchRef = useRef<boolean>(false);
  const secretInputBlockedRef = useRef<boolean>(false);
  const [secretInput, setSecretInput] = useState('');
  const [secretLoading, setSecretLoading] = useState(false);

  const totalPages = useMemo(() => {
    // 비밀 검색 모드에서는 전체 allResults 기준
    if (isSecretSearchRef.current && allResultsRef.current) {
      return Math.ceil(allResultsRef.current.length / ROWS_PER_PAGE);
    }
    return Math.ceil(totalCount / ROWS_PER_PAGE);
  }, [totalCount]);
  const [lastSearchParams, setLastSearchParams] = useState<LastSearchParams | null>(null);

  interface TabCache {
    pageResults: ElevatorWithBadges[];
    currentPage: number;
    totalCount: number;
    lastSearchParams: LastSearchParams | null;
    hasSearched: boolean;
    viewMode: 'list' | 'map';
    hasVisitedMap: boolean;
    mapState: MapState | null;
    allResults: ElevatorWithBadges[] | null;
    isSecretSearch: boolean;
    geoGroups: GeoGroup[];
    mapKey: number;
  }
  const tabCacheRef = useRef<Record<string, TabCache | null>>({});
  const mapViewRef = useRef<{ getMapState: () => MapState | null; setMapState: (state: MapState) => void } | null>(null);

  const handleTabChange = useCallback((newTab: SearchTab) => {
    const currentTab = searchTab;
    const currentMapState = viewMode === 'map' && mapViewRef.current ? mapViewRef.current.getMapState() : null;
    tabCacheRef.current[currentTab] = {
      pageResults,
      currentPage,
      totalCount,
      lastSearchParams,
      hasSearched,
      viewMode,
      hasVisitedMap,
      mapState: currentMapState,
      allResults: allResultsRef.current,
      isSecretSearch: isSecretSearchRef.current,
      geoGroups,
      mapKey,
    };

    const cached = tabCacheRef.current[newTab];
    if (cached) {
      setPageResults(cached.pageResults);
      setCurrentPage(cached.currentPage);
      setTotalCount(cached.totalCount);
      setLastSearchParams(cached.lastSearchParams);
      setHasSearched(cached.hasSearched);
      setViewMode(cached.viewMode);
      setHasVisitedMap(cached.hasVisitedMap);
      allResultsRef.current = cached.allResults;
      setIsSecretSearch(cached.isSecretSearch);
      isSecretSearchRef.current = cached.isSecretSearch;
      setGeoGroups(cached.geoGroups);
      setMapKey(cached.mapKey);
      setError('');
      setSearchTab(newTab);
      // Restore map state after a delay to allow map to initialize
      if (cached.viewMode === 'map' && cached.mapState) {
        setRestoreMode(true);
        setTimeout(() => {
          if (mapViewRef.current && cached.mapState) {
            mapViewRef.current.setMapState(cached.mapState);
            setRestoreMode(false);
          }
        }, 200);
      } else {
        setRestoreMode(false);
      }
    } else {
      setPageResults([]);
      setCurrentPage(1);
      setTotalCount(0);
      setLastSearchParams(null);
      setHasSearched(false);
      setGeoGroups([]);
      setViewMode('list');
      setHasVisitedMap(false);
      allResultsRef.current = null;
      setIsSecretSearch(false);
      isSecretSearchRef.current = false;
      setError('');
      setSearchTab(newTab);
    }
  }, [searchTab, pageResults, currentPage, totalCount, lastSearchParams, hasSearched, viewMode, hasVisitedMap, geoGroups, mapKey]);

  const [selectedElevator, setSelectedElevator] = useState<ElevatorWithBadges | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [settings, setSettings] = useState<SettingsFields>(loadSettings);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getBookmarkedElevatorNos().then(setBookmarkedIds).catch(() => {});
    const handleUpdate = () => getBookmarkedElevatorNos().then(setBookmarkedIds).catch(() => {});
    window.addEventListener('bookmarksUpdated', handleUpdate);
    return () => window.removeEventListener('bookmarksUpdated', handleUpdate);
  }, []);

  const [bookmarkChanges, setBookmarkChanges] = useState<BookmarkChange[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToChanges(setBookmarkChanges);
    return unsubscribe;
  }, []);

  const handleDismissChanges = useCallback(() => {
    markChangeNotified(bookmarkChanges);
    clearGlobalChanges();
  }, [bookmarkChanges]);

  const [viewedIds, setViewedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('elevatorViewHistory');
      if (stored) {
        const items = JSON.parse(stored) as SearchHistory[];
        return new Set(items.filter((h) => h.elevatorNo).map((h) => h.elevatorNo!));
      }
    } catch {}
    return new Set();
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem('elevatorViewHistory');
      if (stored) {
        const items = JSON.parse(stored) as SearchHistory[];
        setViewedIds(new Set(items.filter((h) => h.elevatorNo).map((h) => h.elevatorNo!)));
      }
    } catch {}
  }, [selectedElevator]);

  const handleSettingsChange = useCallback((next: SettingsFields) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const handleElevatorSelect = useCallback((el: ElevatorWithBadges) => {
    const viewEntry: SearchHistory = {
      type: 'view',
      query: el.buldNm || el.elevatorNo,
      timestamp: Date.now(),
      elevatorNo: el.elevatorNo,
      buldNm: el.buldNm,
      elvtrModel: el.elvtrModel,
      elevatorData: el,
    };
    try {
      const existing = JSON.parse(localStorage.getItem('elevatorViewHistory') || '[]');
      localStorage.setItem('elevatorViewHistory', JSON.stringify([...existing, viewEntry]));
      setViewedIds((prev) => new Set([...prev, el.elevatorNo]));
    } catch {}
    setSelectedElevator(el);
  }, []);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [hideEscalator, setHideEscalator] = useState(true);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const pendingHistorySearchRef = useRef<boolean>(false);

  const filterOptions: FilterOptions = useMemo(
    () => (pageResults.length > 0 ? collectFilterOptions(pageResults) : {
      divGroundFloorCnt: [],
      manufacturerName: [],
      elvtrModel: [],
      installationYear: [],
      ratedSpeed: [],
      liveLoad: [],
      elvtrDivNm: [],
      elvtrFormNm: [],
      elvtrKindNm: [],
      elvtrStts: [],
      lastResultNm: [],
    }),
    [pageResults]
  );

  const applyFilters = useCallback((results: ElevatorWithBadges[]): ElevatorWithBadges[] => {
    let filtered = [...results];

    if (hideEscalator) {
      filtered = filtered.filter((el) => el.elvtrDivNm !== '에스컬레이터' && el.elvtrDivNm !== '무빙워크');
    }

    if (modelKeyword.trim()) {
      filtered = filtered.filter((el) =>
        el.elvtrModel?.toLowerCase().includes(modelKeyword.toLowerCase())
      );
    }
    if (minGroundFloor.trim()) {
      const minVal = parseInt(minGroundFloor, 10);
      if (!isNaN(minVal)) {
        filtered = filtered.filter((el) => {
          const floors = parseInt(el.divGroundFloorCnt, 10);
          return !isNaN(floors) && floors >= minVal;
        });
      }
    }
    if (minSpeed.trim()) {
      const minVal = parseFloat(minSpeed);
      if (!isNaN(minVal)) {
        filtered = filtered.filter((el) => {
          const speed = parseRatedSpeed(el.ratedSpeed);
          return speed !== null && speed >= minVal;
        });
      }
    }

    for (const [key, values] of Object.entries(selectedFilters)) {
      if (values.length === 0) continue;
      filtered = filtered.filter((el) => {
        let elValue: string;
        if (key === 'ratedSpeed') {
          elValue = formatRatedSpeed(el.ratedSpeed);
        } else if (key === 'installationYear') {
          elValue = extractYear(el.installationDe) || extractYear(el.frstInstallationDe);
        } else {
          elValue = (el as any)[key];
        }
        if (!elValue) return false;
        return values.includes(elValue);
      });
    }

    return filtered;
  }, [hideEscalator, modelKeyword, minGroundFloor, minSpeed, selectedFilters]);

  const enhancedPageResults = useMemo(() => {
    const floorsMap: Record<string, { maxGround: number; maxUnderground: number }> = {};
    pageResults.forEach((el) => {
      const key = `${el.buldNm || '건물명 없음'}_${el.address1 || ''}`;
      if (!floorsMap[key]) {
        floorsMap[key] = { maxGround: 0, maxUnderground: 0 };
      }
      const g = parseInt(el.divGroundFloorCnt, 10) || 0;
      const u = parseInt(el.divUndgrndFloorCnt, 10) || 0;
      if (g > floorsMap[key].maxGround) floorsMap[key].maxGround = g;
      if (u > floorsMap[key].maxUnderground) floorsMap[key].maxUnderground = u;
    });

    return pageResults.map(el => {
      const key = `${el.buldNm || '건물명 없음'}_${el.address1 || ''}`;
      return {
        ...el,
        buildingMaxGround: floorsMap[key]?.maxGround || 0,
        buildingMaxUnderground: floorsMap[key]?.maxUnderground || 0
      };
    });
  }, [pageResults]);

  const displayResults = useMemo(
    () => applyFilters(enhancedPageResults),
    [enhancedPageResults, applyFilters]
  );

  // 🎯 [완치 1] 시크릿 대량 검색 모드일 때 100건 조각이 아니라 수집된 전체(Total) 결과에 필터링이 먹힌 후 슬라이싱 배분되도록 연산 공식 수정
  // 🎯 [완치 1] 시크릿 검색 모드일 때, 100건 조각이 아니라 수집된 전체(Total) 대량 결과물에 대해 유저 필터가 선제 동기화되도록 연산 순서 정정
  const paginatedDisplayResults = useMemo(() => {
    if (isSecretSearch && allResultsRef.current && viewMode === 'list') {
      // 1. 수집된 5000건 이하의 전체 데이터에 대해 사용자가 지정한 필터를 먼저 매핑 적용
      const filteredAll = applyFilters(allResultsRef.current.map(el => ({
        ...el,
        buildingMaxGround: el.buildingMaxGround || 0,
        buildingMaxUnderground: el.buildingMaxUnderground || 0,
      })));
      
      // 2. 필터가 완벽하게 먹힌 결과셋 위에서 현재 목차 페이지 오프셋(100건)만큼 슬라이싱 분배
      const start = (currentPage - 1) * ROWS_PER_PAGE;
      const end = start + ROWS_PER_PAGE;
      return filteredAll.slice(start, end);
    }
    return displayResults;
  }, [displayResults, currentPage, viewMode, applyFilters, isSecretSearch]);

  const groupedBuildings = useMemo(() => {
    const groups: Record<string, { buildingName: string; address: string; elevators: ElevatorWithBadges[] }> = {};

    // 목록 보기에는 페이지네이션 결과 사용, 지도 보기에는 전체 사용
    const resultsToGroup = viewMode === 'list' ? paginatedDisplayResults : displayResults;

    resultsToGroup.forEach((el) => {
      const key = `${el.buldNm || '건물명 없음'}_${el.address1 || ''}`;
      if (!groups[key]) {
        groups[key] = {
          buildingName: el.buldNm || '건물명 없음',
          address: `${el.address1 || ''}${el.address2 ? ` ${el.address2}` : ''}`,
          elevators: []
        };
      }
      groups[key].elevators.push(el);
    });

    return Object.values(groups);
  }, [paginatedDisplayResults, displayResults, viewMode]);

  const unmappedBuildings = useMemo(() => {
    const mappedIds = new Set<string>();
    for (const group of geoGroups) {
      for (const ev of group.elevators) {
        mappedIds.add(ev.elevatorNo);
      }
    }
    const unmapped = displayResults.filter(el => !mappedIds.has(el.elevatorNo));
    if (unmapped.length === 0) return [];

    const groups: Record<string, { buildingName: string; address: string; elevators: ElevatorWithBadges[] }> = {};
    unmapped.forEach((el) => {
      const key = `${el.buldNm || '건물명 없음'}_${el.address1 || ''}`;
      if (!groups[key]) {
        groups[key] = {
          buildingName: el.buldNm || '건물명 없음',
          address: `${el.address1 || ''}${el.address2 ? ` ${el.address2}` : ''}`,
          elevators: []
        };
      }
      groups[key].elevators.push(el);
    });

    return Object.values(groups);
  }, [displayResults, geoGroups]);

  const fetchPage = useCallback(async (pageNo: number, params: LastSearchParams, signal?: AbortSignal) => {
    setLoading(true);
    setError('');

    try {
      let rawResults: ElevatorType[] = [];
      let total = 0;

      if (params.tab === 'elevatorNo') {
        const result = await searchByElevatorNo(params.elevatorNo || '', pageNo, signal);
        rawResults = result.items;
        total = result.totalCount;
      } else {
        const result = await searchByAddress({
          sido: params.sido || undefined,
          sigungu: params.sigungu || undefined,
          buldNm: params.buldNm || undefined,
          pageNo,
          signal,
        });
        rawResults = result.items;
        total = result.totalCount;
      }

      const sorted = sortElevators(rawResults);
      const withBadges = assignBadges(sorted);
      setPageResults(withBadges);
      setTotalCount(total);
      // Reset secret search state on normal search
      allResultsRef.current = null;
      setIsSecretSearch(false);
      isSecretSearchRef.current = false;
      secretInputBlockedRef.current = false;
    } catch (err) {
      if (signal?.aborted) return;
      setError('비상호출 버튼을 누른 후 잠시 기다려 주십시오.');
      console.error(err);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // ★ [비밀 문구 검색 핸들러] 엔터키 전용, 버튼 없음
  const handleSecretInputKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    
    // 🎯 요구사항 반영: 최초 시도에서 틀렸다면, 이후에 맞는 문구를 입력하든 틀린 문구를 입력하든 무조건 철저히 차단
    if (secretInputBlockedRef.current) {
      setSecretInput('');
      return;
    }

    if (secretLoading) return;

    const inputPhrase = secretInput.trim();

    // 맞든 틀리든 엔터를 치는 순간에는 입력창을 항상 흔적 없이 초기화
    setSecretInput('');

    if (inputPhrase !== SECRET_PHRASE) {
      // 🎯 최초 시도에서 문구를 틀린 기점: 티 내지 않고 내부 세션 락다운만 즉시 활성화 후 종료
      secretInputBlockedRef.current = true;
      return;
    }

    setSecretLoading(true);
    setError('');

    try {
      // 주소 Param 상속 연동 구조 유지
      const currentSido = sido.trim() || undefined;
      const currentSigungu = sigungu.trim() || undefined;
      const currentBuldNm = building.trim() || undefined;

      const firstResult = await searchByAddress({
        sido: currentSido,
        sigungu: currentSigungu,
        buldNm: currentBuldNm,
        pageNo: 1,
        numOfRows: '1',
      });

      const totalCountForSecret = firstResult.totalCount;

      if (totalCountForSecret > SECRET_MAX_TOTAL) {
        setError('정원 초과입니다. 나중에 타신 분은 내려주십시오.');
        setSecretLoading(false);
        secretInputBlockedRef.current = true;
        return;
      }

      const maxPage = Math.ceil(totalCountForSecret / SECRET_FETCH_ROWS);
      const allItems: ElevatorType[] = [];

      // 500건 단위 연쇄 비동기 수집 루프 (유저님 정품 엔진 규격 준수)
      for (let page = 1; page <= maxPage; page++) {
        const pageResult = await searchByAddress({
          sido: currentSido,
          sigungu: currentSigungu,
          buldNm: currentBuldNm,
          pageNo: page,
          numOfRows: SECRET_FETCH_ROWS.toString(),
        });
        allItems.push(...pageResult.items);
      }

      const sorted = sortElevators(allItems);
      const withBadges = assignBadges(sorted);

      allResultsRef.current = withBadges;
      setIsSecretSearch(true);
      isSecretSearchRef.current = true;
      secretInputBlockedRef.current = true; // 성공한 뒤에도 인풋창 고정 잠금

      setPageResults(withBadges);
      setTotalCount(totalCountForSecret);
      setHasSearched(true);
      setLastSearchParams({
        tab: 'address',
        sido: currentSido,
        sigungu: currentSigungu,
        buldNm: currentBuldNm,
      });
      setCurrentPage(1);
      setSelectedFilters({});
      setHideEscalator(true);
      setModelKeyword('');
      setMinGroundFloor('');
      setMinSpeed('');
    } catch (err) {
      console.error('[SecretSearch] Error:', err);
      setError('검색 중 오류가 발생했습니다.');
    } finally {
      setSecretLoading(false);
    }
  }, [secretInput, secretLoading, sido, sigungu, building]);

  useEffect(() => {
    geocodeAbortRef.current?.abort();
    geocodeAbortRef.current = null;

    if (displayResults.length === 0) {
      setGeoGroups([]);
      return;
    }

    if (viewMode !== 'map') {
      return;
    }

    const addressMap = new Map<string, { buildingName: string; elevators: ElevatorWithBadges[] }>();
    for (const el of displayResults) {
      const addr = (el.address1 || el.address2 || '').trim();
      if (!addr) continue;
      if (!addressMap.has(addr)) {
        addressMap.set(addr, { buildingName: el.buldNm || '', elevators: [] });
      }
      addressMap.get(addr)!.elevators.push(el);
    }

    const uniqueAddresses = Array.from(addressMap.entries());
    if (uniqueAddresses.length === 0) {
      setGeoGroups([]);
      setGeocoding(false);
      return;
    }

    const controller = new AbortController();
    geocodeAbortRef.current = controller;
    const signal = controller.signal;

    setGeocoding(true);

    // 🎯 [완치 치트키] 수천 건의 대량 데이터 유입 시 카카오 Geocoder API 서버의 드롭 차단 제어 장치
            // 🎯 [완치 2구역] 고속 마커 로드와 카카오 API 차단 우회를 모두 만족하는 최적 밸런스 스로틀링 엔진
    const run = async () => {
      try {
        const finalGeoGroups: GeoGroup[] = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < uniqueAddresses.length; i += BATCH_SIZE) {
          if (signal?.aborted) return;
          
          const currentBatch = uniqueAddresses.slice(i, i + BATCH_SIZE);
          const batchPromises = currentBatch.map(async ([addr, { buildingName, elevators }]) => {
            try {
              const coords = await geocodeAddress(addr, signal);
              if (!coords || signal?.aborted) return null;
              return {
                address: addr,
                buildingName,
                lat: coords[0],
                lng: coords[1],
                elevators,
              };
            } catch (_) {
              return null;
            }
          });

          const settled = await Promise.allSettled(batchPromises);
          if (signal?.aborted) return;

          settled.forEach((r) => {
            if (r.status === 'fulfilled' && r.value !== null) {
              finalGeoGroups.push(r.value);
            }
          });

          // 딜레이를 60ms로 반토막 내어 전체 마커 렌더링 시간을 0.5초 대단위로 단축
          if (uniqueAddresses.length > BATCH_SIZE) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }

        if (signal?.aborted) return;
        setGeoGroups(finalGeoGroups);
      } catch (err) {
        console.error('[geocoding] Fatal error:', err);
      } finally {
        setGeocoding(false);
      }
    };

    run();

    return () => {
      controller.abort();
    };
  }, [displayResults, viewMode]);

  const handleSearch = useCallback(async () => {
    geocodeAbortRef.current?.abort();
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setLoading(true);
    setError('');
    setCurrentPage(1);
    setPageResults([]);
    setGeoGroups([]);
    setHasSearched(true);
    setSelectedFilters({});
    setHideEscalator(true);
    setModelKeyword('');
    setMinGroundFloor('');
    setMinSpeed('');
    setViewMode('list');
    setHasVisitedMap(false);
    setMapKey(k => k + 1);

    let params: LastSearchParams;

    if (searchTab === 'elevatorNo') {
      const query = elevatorNoQuery.trim();
      if (!query) {
        setError('행선버튼을 눌러 주세요.');
        setLoading(false);
        return;
      }
      params = { tab: 'elevatorNo', elevatorNo: query };
    } else {
      params = {
        tab: 'address',
        sido: sido.trim() || undefined,
        sigungu: sigungu.trim() || undefined,
        buldNm: building.trim() || undefined,
      };
    }

    setLastSearchParams(params);

    const historyEntry: SearchHistory = searchTab === 'elevatorNo'
      ? {
          type: 'search',
          query: elevatorNoQuery.trim(),
          timestamp: Date.now(),
          elevatorNo: elevatorNoQuery.trim(),
        }
      : {
          type: 'search',
          query: [sido.trim(), sigungu.trim(), building.trim()].filter(Boolean).join(' '),
          timestamp: Date.now(),
          ...(building.trim() ? { buldNm: building.trim() } : {}),
          ...(modelKeyword.trim() ? { elvtrModel: modelKeyword.trim() } : {}),
        };
    const existing = JSON.parse(localStorage.getItem('elevatorSearchHistory') || '[]');
    localStorage.setItem('elevatorSearchHistory', JSON.stringify([...existing, historyEntry]));

    await fetchPage(1, params, controller.signal);
  }, [searchTab, elevatorNoQuery, sido, sigungu, building, modelKeyword, minGroundFloor, minSpeed, fetchPage]);

  const handlePageChange = useCallback((page: number) => {
    // 비밀 검색 모드에서는 로컬 페이지네이션 사용
    if (isSecretSearchRef.current && allResultsRef.current) {
      setCurrentPage(page);
      return;
    }

    geocodeAbortRef.current?.abort();
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setCurrentPage(page);
    if (lastSearchParams) {
      fetchPage(page, lastSearchParams, controller.signal);
    }
  }, [lastSearchParams, fetchPage]);

  const handleHistorySelect = (history: SearchHistory) => {
    if (history.type === 'search' && history.elevatorNo) {
      setSearchTab('elevatorNo');
      setElevatorNoQuery(history.elevatorNo);
      pendingHistorySearchRef.current = true;
    } else if (history.type === 'search') {
      setSearchTab('address');
      const buldNm = history.buldNm || '';
      const queryWithoutBuld = buldNm
        ? history.query.replace(new RegExp(`\\s*${buldNm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim()
        : history.query;
      const parts = queryWithoutBuld.split(/\s+/);
      setSido(parts[0] || '');
      setSigungu(parts.length > 1 ? parts.slice(1).join(' ') : '');
      setBuilding(buldNm);
      pendingHistorySearchRef.current = true;
    } else if (history.elevatorNo) {
      setSearchTab('elevatorNo');
      setElevatorNoQuery(history.elevatorNo);
      pendingHistorySearchRef.current = true;
    }
  };

  const handleFilterChange = (key: string, values: string[]) => {
    setSelectedFilters((prev) => ({ ...prev, [key]: values }));
  };

  useEffect(() => {
    if (pendingHistorySearchRef.current) {
      pendingHistorySearchRef.current = false;
      handleSearch();
    }
  }, [sido, sigungu, building, elevatorNoQuery, searchTab, handleSearch]);

  const activeTotalPages = isSecretSearch ? Math.ceil(displayResults.length / ROWS_PER_PAGE) : totalPages;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col max-w-2xl mx-auto">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-[100] shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 8l3-3 3 3M9 16l3 3 3-3M12 5v14" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">elNavi</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">내 손 안에 전국을 - 엘네비</p>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <Settings size={20} className="text-gray-500 dark:text-gray-400" />
        </button>
      </header>

      {bookmarkChanges.length > 0 && (
        <div className="mx-4 mt-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <Bell size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">북마크 변경사항 알림</p>
              <button
                onClick={handleDismissChanges}
                className="p-0.5 hover:bg-amber-100 dark:hover:bg-amber-800 rounded transition-colors"
              >
                <XCircle size={14} className="text-amber-500 dark:text-amber-400" />
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {bookmarkChanges.map((c, idx) => (
                <p key={idx} className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-medium">{c.building_name || c.elevator_no}</span>: {
                  c.changeType === 'model' && `모델명 ${c.oldValue} → ${c.newValue}`}
                  {c.changeType === 'installation' && `설치일자 ${formatDate(c.oldValue)} → ${formatDate(c.newValue)}`}
                  {c.changeType === 'inspection' && `검사종류 ${c.oldValue} → ${c.newValue}`}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      <SearchFormAdvanced
        tab={searchTab}
        onTabChange={handleTabChange}
        elevatorNoQuery={elevatorNoQuery}
        onElevatorNoQueryChange={setElevatorNoQuery}
        sido={sido}
        onSidoChange={setSido}
        sigungu={sigungu}
        onSigunguChange={setSigungu}
        building={building}
        onBuildingChange={setBuilding}
        onSearch={handleSearch}
        loading={loading}
      />

      {pageResults.length > 0 && searchTab === 'address' && (
        <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-[56px] z-[90]">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            결과 {displayResults.length}/{pageResults.length}건 | 전체 {totalCount}건
            {geocoding && <span className="ml-2 text-blue-500 dark:text-blue-400 animate-pulse">지도 갱신 중...</span>}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowFilter(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
            >
              <Sliders size={12} /> 필터
            </button>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
              >
                <List size={12} /> 목록
              </button>
              <button
                onClick={() => {
                  setViewMode('map');
                  setHasVisitedMap(true);
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === 'map' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
              >
                <MapIcon size={12} /> 지도
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* 🛡️ [Keep-Alive 장착] DOM 파괴를 차단하고 hidden 클래스로 감추어 지도 위치 영구 보존 및 북마크 연동 완료 */}
        <div className={`p-4 flex-1 flex flex-col ${searchTab === 'mapSearch' ? '' : 'hidden'}`}>
          <BuildingLayerMap
            visible={searchTab === 'mapSearch'}
            settings={settings}
            bookmarkedIds={bookmarkedIds}
            viewedIds={viewedIds}
            onBookmarkChange={() => getBookmarkedElevatorNos().then(setBookmarkedIds).catch(() => {})}
            onShowBookmarkPicker={(el) => setSelectedElevator(el)}
            onLoadingStateChange={(state) => setLoading(state)}
            onBuildingSelect={(elevatorsList) => {
              if (elevatorsList.length > 0) {
                handleElevatorSelect(elevatorsList[0]);
              }
            }}
          />
        </div>

        {searchTab !== 'mapSearch' && pageResults.length > 0 && activeTotalPages > 1 && viewMode === 'list' && (
          <div className="px-4 pt-3 pb-1">
            <Pagination currentPage={currentPage} totalPages={activeTotalPages} onPageChange={handlePageChange} />
          </div>
        )}

        {error && (
          <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {loading && searchTab !== 'buildingLayer' && (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-3 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-1.5" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {!loading && hasSearched && pageResults.length === 0 && !error && searchTab !== 'buildingLayer' && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <p className="text-sm text-gray-500">지금 검색된 결과는 존재하지 않습니다.</p>
          </div>
        )}

        {hasVisitedMap && hasSearched && searchTab !== 'mapSearch' && (
          <div className={`p-4 ${viewMode === 'map' ? '' : 'hidden'}`}>
            <MapView
              ref={mapViewRef}
              geoGroups={geoGroups}
              geocoding={geocoding}
              mapKey={mapKey}
              totalElevators={displayResults.length}
              onMarkerClick={handleElevatorSelect}
              visible={viewMode === 'map'}
              bookmarkedIds={bookmarkedIds}
              viewedIds={viewedIds}
              settings={settings}
              onMapReady={() => {}}
              onBookmarkChange={() => getBookmarkedElevatorNos().then(setBookmarkedIds).catch(() => {})}
              onShowBookmarkPicker={(el) => setSelectedElevator(el)}
              focusAddress={focusAddress}
              restoreMode={restoreMode}
            />
            
            {/* 🎯 [완치 3 - 스텔스 마감] 글자 굵기 정상화(font-normal), 플레이스홀더 전면 삭제, 맞든 틀리든 항상 공백 리셋 연동 완료 */}
            <div className="mt-1.5 w-full">
              <input
                type="text"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                onKeyDown={handleSecretInputKeyDown}
                className="w-full px-3 py-2 text-xs font-normal bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-none"
              />
            </div>

            {viewMode === 'map' && !geocoding && unmappedBuildings.length > 0 && (
              <div className="mt-3">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  주소가 대응되지 않는 건물은 표시하지 못했습니다. (총 {unmappedBuildings.reduce((s, g) => s + g.elevators.length, 0)}대)
                </div>
                <div className="mt-2 space-y-2">
                  {unmappedBuildings.map((group, idx) => (
                    <ElevatorCard
                      key={`unmapped-${group.buildingName}-${idx}`}
                      buildingName={group.buildingName}
                      address={group.address}
                      elevators={group.elevators}
                      settings={settings}
                      onSelect={handleElevatorSelect}
                      bookmarkedIds={bookmarkedIds}
                      viewedIds={viewedIds}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && viewMode === 'list' && groupedBuildings.length > 0 && searchTab !== 'buildingLayer' && (
          <div className="p-4 space-y-2">
            {groupedBuildings.map((group, idx) => (
              <ElevatorCard
                key={`${group.buildingName}-${idx}`}
                buildingName={group.buildingName}
                address={group.address}
                elevators={group.elevators}
                settings={settings}
                onSelect={handleElevatorSelect}
                bookmarkedIds={bookmarkedIds}
                viewedIds={viewedIds}
              />
            ))}
          </div>
        )}

        {pageResults.length > 0 && activeTotalPages > 1 && viewMode === 'list' && searchTab !== 'buildingLayer' && (
          <div className="px-4 pb-3">
            <Pagination currentPage={currentPage} totalPages={activeTotalPages} onPageChange={handlePageChange} />
          </div>
        )}
      </main>

      {selectedElevator && (
        <ElevatorModal
          elevator={selectedElevator}
          settings={settings}
          onClose={() => setSelectedElevator(null)}
          onNavigateToMap={(el) => {
            setSelectedElevator(null);
            setViewMode('map');
            setHasVisitedMap(true);
            setFocusAddress(el.address1 || undefined);
          }}
        />
      )}

      {showSettings && (
        <SettingsMenu settings={settings} onChange={handleSettingsChange} onClose={() => setShowSettings(false)} onHistorySelect={handleHistorySelect} onBookmarkSelect={(el) => setSelectedElevator(el)} />
      )}

      {showFilter && (
        <FilterSidebar
          filters={filterOptions}
          selected={selectedFilters}
          onFilterChange={handleFilterChange}
          onClose={() => setShowFilter(false)}
          elevators={pageResults}
          modelKeyword={modelKeyword}
          onModelKeywordChange={setModelKeyword}
          minGroundFloor={minGroundFloor}
          onMinGroundFloorChange={setMinGroundFloor}
          minSpeed={minSpeed}
          onMinSpeedChange={setMinSpeed}
          hideEscalator={hideEscalator}
          onHideEscalatorChange={setHideEscalator}
        />
      )}
    </div>
  );
}