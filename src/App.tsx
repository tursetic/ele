import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Settings, Map as MapIcon, List, AlertCircle, Bell, XCircle, Sliders, Building2 } from 'lucide-react';
import { Elevator as ElevatorType, ElevatorWithBadges, SettingsFields, SearchHistory, FilterOptions, SearchTab, GeoGroup } from './types';
import { searchByElevatorNo, searchByAddress, geocodeAddress, searchByIntegrationAddress } from './utils/api';
import { sortElevators, assignBadges, collectFilterOptions, parseRatedSpeed, formatRatedSpeed, formatElevatorNo, extractYear, formatDate } from './utils/elevatorHelpers';
import { getBookmarkedElevatorNos, markChangeNotified, BookmarkChange, subscribeToChanges, clearGlobalChanges, getNotificationHistory } from './utils/bookmarks';

import BuildingLayerMap from './components/BuildingLayerMap';
import SearchFormAdvanced from './components/SearchFormAdvanced';
import ElevatorCard from './components/ElevatorCard';
import ElevatorModal from './components/ElevatorModal';
import MapView from './components/MapView';
import SettingsMenu from './components/SettingsMenu';
import Pagination from './components/Pagination';
import FilterSidebar from './components/FilterSidebar';
import BellNotification from './components/BellNotification';

const ROWS_PER_PAGE = 100;
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
  addressQuery?: string;
}

const DEFAULT_SETTINGS: SettingsFields = {
  elvtrDivNm: true, elvtrFormNm: true, elvtrKindNm: true, elvtrModel: true, elvtrStts: true,
  frstInstallationDe: true, installationDe: true, lastInspctDe: true, lastInspctKind: true,
  inspctInstt: true, divGroundFloorCnt: true, divUndgrndFloorCnt: true, ratedSpeed: true,
  ratedCap: true, liveLoad: true, installationPlace: true, shuttleSection: true, mrYn: true,
  subcntrCpny: true, mntCpnyNm: true, mntCpnyTelno: true, partcpntNm: true, partcpntTelno: true, buldPrpos: true,
};

function loadSettings(): SettingsFields {
  try {
    const stored = localStorage.getItem('elevatorSettings');
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch (_) {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: SettingsFields) {
  try { localStorage.setItem('elevatorSettings', JSON.stringify(settings)); } catch (_) {}
}

export default function App() {
  const [searchTab, setSearchTab] = useState<SearchTab>('building');
  const [elevatorNoQuery, setElevatorNoQuery] = useState('');
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const [building, setBuilding] = useState('');
  const [addressQuery, setAddressQuery] = useState('');

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

  const allResultsRef = useRef<ElevatorWithBadges[] | null>(null);
  const [isSecretSearch, setIsSecretSearch] = useState(false);
  const isSecretSearchRef = useRef<boolean>(false);
  const secretInputBlockedRef = useRef<boolean>(false);
  const [secretInput, setSecretInput] = useState('');
  const [secretLoading, setSecretLoading] = useState(false);

  const totalPages = useMemo(() => {
    if (isSecretSearchRef.current && allResultsRef.current) {
      return Math.ceil(allResultsRef.current.length / ROWS_PER_PAGE);
    }
    return Math.ceil(totalCount / ROWS_PER_PAGE);
  }, [totalCount]);
  const [lastSearchParams, setLastSearchParams] = useState<LastSearchParams | null>(null);

  interface TabCache {
    pageResults: ElevatorWithBadges[]; currentPage: number; totalCount: number;
    lastSearchParams: LastSearchParams | null; hasSearched: boolean; viewMode: 'list' | 'map';
    hasVisitedMap: boolean; mapState: MapState | null; allResults: ElevatorWithBadges[] | null;
    isSecretSearch: boolean; geoGroups: GeoGroup[]; mapKey: number; scrollPosition: number;
  }
  const tabCacheRef = useRef<Record<string, TabCache | null>>({});
  const mapViewRef = useRef<{ getMapState: () => MapState | null; setMapState: (state: MapState) => void } | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  // 🎯 [메모리 패치 선언] 동일 탭 내에서 토글 스위칭할 때 불필요한 오픈 API 지오코딩 리로드를 가로막는 상호 비교 레퍼런스 가드 스냅샷
  const lastGeocodedResultsKeyRef = useRef<string>('');

  const handleTabChange = useCallback((newTab: SearchTab) => {
    const currentTab = searchTab;
    const currentMapState = viewMode === 'map' && mapViewRef.current ? mapViewRef.current.getMapState() : null;
    const currentScrollPosition = viewMode === 'list' ? (mainScrollRef.current?.scrollTop || 0) : viewModeScrollRef.current;

    tabCacheRef.current[currentTab] = {
      pageResults, currentPage, totalCount, lastSearchParams, hasSearched, viewMode, hasVisitedMap,
      mapState: currentMapState, allResults: allResultsRef.current, isSecretSearch: isSecretSearchRef.current,
      geoGroups, mapKey, scrollPosition: currentScrollPosition,
    };

    const cached = tabCacheRef.current[newTab];
    if (cached) {
      setPageResults(cached.pageResults); setCurrentPage(cached.currentPage); setTotalCount(cached.totalCount);
      setLastSearchParams(cached.lastSearchParams); setHasSearched(cached.hasSearched); setViewMode(cached.viewMode);
      setHasVisitedMap(cached.hasVisitedMap); allResultsRef.current = cached.allResults; setIsSecretSearch(cached.isSecretSearch);
      isSecretSearchRef.current = cached.isSecretSearch; setGeoGroups(cached.geoGroups); setMapKey(cached.mapKey);
      setError(''); setSearchTab(newTab);
      
      viewModeScrollRef.current = cached.scrollPosition;
      tabScrollMapRef.current[newTab] = cached.scrollPosition;
      isRestoringScrollRef.current = true;

      if (cached.viewMode === 'map' && cached.mapState) {
        setRestoreMode(true);
        setTimeout(() => {
          if (mapViewRef.current && cached.mapState) { mapViewRef.current.setMapState(cached.mapState); setRestoreMode(false); }
        }, 200);
      } else { setRestoreMode(false); }
    } else {
      setPageResults([]); setCurrentPage(1); setTotalCount(0); setLastSearchParams(null);
      setHasSearched(false); setGeoGroups([]); setViewMode('list'); setHasVisitedMap(false);
      allResultsRef.current = null; setIsSecretSearch(false); isSecretSearchRef.current = false;
      setError(''); setSearchTab(newTab);
    }
  }, [searchTab, pageResults, currentPage, totalCount, lastSearchParams, hasSearched, viewMode, hasVisitedMap, geoGroups, mapKey]);

  const [selectedElevator, setSelectedElevator] = useState<ElevatorWithBadges | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showBell, setShowBell] = useState(false);
  const [settings, setSettings] = useState<SettingsFields>(loadSettings);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getBookmarkedElevatorNos().then(setBookmarkedIds).catch(() => {});
    const handleUpdate = () => getBookmarkedElevatorNos().then(setBookmarkedIds).catch(() => {});
    window.addEventListener('bookmarksUpdated', handleUpdate);
    return () => window.removeEventListener('bookmarksUpdated', handleUpdate);
  }, []);

  const [bookmarkChanges, setBookmarkChanges] = useState<BookmarkChange[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    setNotificationCount(getNotificationHistory().length);
    const handleUpdate = () => setNotificationCount(getNotificationHistory().length);
    window.addEventListener('notificationHistoryUpdated', handleUpdate);
    return () => window.removeEventListener('notificationHistoryUpdated', handleUpdate);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToChanges(setBookmarkChanges); return unsubscribe;
  }, []);

  useEffect(() => {
    const runBackgroundBookmarkCheck = async () => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const lastCheckDate = localStorage.getItem('brelev_last_bookmark_check_date');
        if (lastCheckDate === todayStr) return;

        const storedRaw = localStorage.getItem('brelev_local_bookmarks_v1');
        if (!storedRaw) { localStorage.setItem('brelev_last_bookmark_check_date', todayStr); return; }

        const storedBookmarks = JSON.parse(storedRaw) as any[];
        if (!Array.isArray(storedBookmarks) || storedBookmarks.length === 0) { localStorage.setItem('brelev_last_bookmark_check_date', todayStr); return; }

        let accumulatedChanges: any[] = [];
        const { detectBookmarkChanges, updateBookmarkData } = await import('./utils/bookmarks');

        const scanPromises = storedBookmarks.map(async (bm) => {
          const elvNo = bm.elevator_no || bm.elevatorNo; if (!elvNo) return;
          try {
            const res = await searchByElevatorNo(elvNo.toString().trim());
            if (res && res.items && res.items.length > 0) {
              const latestData = res.items[0];
              const detected = detectBookmarkChanges(latestData);
              if (detected && detected.length > 0) { updateBookmarkData(latestData); accumulatedChanges.push(...detected); }
            }
          } catch (err) { console.error(err); }
        });

        await Promise.all(scanPromises);
        if (accumulatedChanges.length > 0) {
          const { setGlobalChanges } = await import('./utils/bookmarks'); setGlobalChanges(accumulatedChanges);
        }
        localStorage.setItem('brelev_last_bookmark_check_date', todayStr);
      } catch (error) { console.error(error); }
    };
    runBackgroundBookmarkCheck();
  }, []);

  const handleDismissChanges = useCallback(() => {
    markChangeNotified(bookmarkChanges); clearGlobalChanges();
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
    setSettings(next); saveSettings(next);
  }, []);

  const handleElevatorSelect = useCallback((el: ElevatorWithBadges) => {
    const viewEntry: SearchHistory = {
      type: 'view', query: el.buldNm || el.elevatorNo, timestamp: Date.now(),
      elevatorNo: el.elevatorNo, buldNm: el.buldNm, elvtrModel: el.elvtrModel, elevatorData: el,
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
  const viewModeScrollRef = useRef<number>(0);
  const tabScrollMapRef = useRef<Record<string, number>>({ address: 0, building: 0, elevatorNo: 0, mapSearch: 0 });
  const isRestoringScrollRef = useRef<boolean>(false);

  const filterOptions: FilterOptions = useMemo(
    () => (pageResults.length > 0 ? collectFilterOptions(pageResults) : {
      divGroundFloorCnt: [], manufacturerName: [], elvtrModel: [], installationYear: [],
      ratedSpeed: [], liveLoad: [], elvtrDivNm: [], elvtrFormNm: [], elvtrKindNm: [], elvtrStts: [], lastResultNm: [],
    }),
    [pageResults]
  );

  const applyFilters = useCallback((results: ElevatorWithBadges[]): ElevatorWithBadges[] => {
    let filtered = [...results];
    if (hideEscalator) filtered = filtered.filter((el) => el.elvtrDivNm !== '에스컬레이터' && el.elvtrDivNm !== '무빙워크');
    if (modelKeyword.trim()) filtered = filtered.filter((el) => el.elvtrModel?.toLowerCase().includes(modelKeyword.toLowerCase()));
    if (minGroundFloor.trim()) {
      const minVal = parseInt(minGroundFloor, 10);
      if (!isNaN(minVal)) filtered = filtered.filter((el) => (parseInt(el.divGroundFloorCnt, 10) || 0) >= minVal);
    }
    if (minSpeed.trim()) {
      const minVal = parseFloat(minSpeed);
      if (!isNaN(minVal)) filtered = filtered.filter((el) => (parseRatedSpeed(el.ratedSpeed) ?? 0) >= minVal);
    }
    for (const [key, values] of Object.entries(selectedFilters)) {
      if (values.length === 0) continue;
      filtered = filtered.filter((el) => {
        let elValue = key === 'ratedSpeed' ? formatRatedSpeed(el.ratedSpeed) : key === 'installationYear' ? (extractYear(el.installationDe) || extractYear(el.frstInstallationDe)) : (el as any)[key];
        return elValue ? values.includes(elValue) : false;
      });
    }
    return filtered;
  }, [hideEscalator, modelKeyword, minGroundFloor, minSpeed, selectedFilters]);

  const enhancedPageResults = useMemo(() => {
    const floorsMap: Record<string, { maxGround: number; maxUnderground: number }> = {};
    pageResults.forEach((el) => {
      const key = `${el.buldNm || '건물명 없음'}_${el.address1 || ''}`;
      if (!floorsMap[key]) floorsMap[key] = { maxGround: 0, maxUnderground: 0 };
      const g = parseInt(el.divGroundFloorCnt, 10) || 0; const u = parseInt(el.divUndgrndFloorCnt, 10) || 0;
      if (g > floorsMap[key].maxGround) floorsMap[key].maxGround = g;
      if (u > floorsMap[key].maxUnderground) floorsMap[key].maxUnderground = u;
    });
    return pageResults.map(el => {
      const key = `${el.buldNm || '건물명 없음'}_${el.address1 || ''}`;
      return { ...el, buildingMaxGround: floorsMap[key]?.maxGround || 0, buildingMaxUnderground: floorsMap[key]?.maxUnderground || 0 };
    });
  }, [pageResults]);

  const displayResults = useMemo(() => applyFilters(enhancedPageResults), [enhancedPageResults, applyFilters]);

  const paginatedDisplayResults = useMemo(() => {
    if (isSecretSearch && allResultsRef.current && viewMode === 'list') {
      const filteredAll = applyFilters(allResultsRef.current.map(el => ({ ...el, buildingMaxGround: el.buildingMaxGround || 0, buildingMaxUnderground: el.buildingMaxUnderground || 0 })));
      return filteredAll.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);
    }
    return displayResults;
  }, [displayResults, currentPage, viewMode, applyFilters, isSecretSearch]);

  const groupedBuildings = useMemo(() => {
    const groups: Record<string, { buildingName: string; address: string; elevators: ElevatorWithBadges[] }> = {};
    const resultsToGroup = viewMode === 'list' ? paginatedDisplayResults : displayResults;
    resultsToGroup.forEach((el) => {
      const key = `${el.buldNm || '건물명 없음'}_${el.address1 || ''}`;
      if (!groups[key]) groups[key] = { buildingName: el.buldNm || '건물명 없음', address: `${el.address1 || ''}${el.address2 ? ` ${el.address2}` : ''}`, elevators: [] };
      groups[key].elevators.push(el);
    });
    return Object.values(groups);
  }, [paginatedDisplayResults, displayResults, viewMode]);

  const unmappedBuildings = useMemo(() => {
    const mappedIds = new Set<string>();
    for (const group of geoGroups) { for (const ev of group.elevators) { mappedIds.add(ev.elevatorNo); } }
    const unmapped = displayResults.filter(el => !mappedIds.has(el.elevatorNo)); if (unmapped.length === 0) return [];
    const groups: Record<string, { buildingName: string; address: string; elevators: ElevatorWithBadges[] }> = {};
    unmapped.forEach((el) => {
      const key = `${el.buldNm || '건물명 없음'}_${el.address1 || ''}`;
      if (!groups[key]) { groups[key] = { buildingName: el.buldNm || '건물명 없음', address: `${el.address1 || ''}${el.address2 ? ` ${el.address2}` : ''}`, elevators: [] }; }
      groups[key].elevators.push(el);
    });
    return Object.values(groups);
  }, [displayResults, geoGroups]);

  const fetchPage = useCallback(async (pageNo: number, params: LastSearchParams, signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      let rawResults: ElevatorType[] = []; let total = 0;
      if (params.tab === 'elevatorNo') {
        const result = await searchByElevatorNo(params.elevatorNo || '', pageNo, signal);
        rawResults = result.items; total = result.totalCount;
      } else if (params.tab === 'address') {
        const result = await searchByIntegrationAddress({ addressQuery: params.addressQuery || '', pageNo, signal });
        rawResults = result.items; total = result.totalCount;
      } else {
        const result = await searchByAddress({ sido: params.sido, sigungu: params.sigungu, buldNm: params.buldNm, pageNo, signal });
        rawResults = result.items; total = result.totalCount;
      }
      const sorted = sortElevators(rawResults); const withBadges = assignBadges(sorted);
      setPageResults(withBadges); setTotalCount(total);
      allResultsRef.current = null; setIsSecretSearch(false); isSecretSearchRef.current = false; secretInputBlockedRef.current = false;
    } catch (err) {
      if (signal?.aborted) return;
      setError('비상호출 버튼을 누른 후 잠시 기다려 주십시오.'); console.error(err);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  const handleSecretInputKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    if (secretInputBlockedRef.current || secretLoading) { setSecretInput(''); return; }
    const inputPhrase = secretInput.trim(); setSecretInput('');
    if (inputPhrase !== SECRET_PHRASE) { secretInputBlockedRef.current = true; return; }
    setSecretLoading(true); setError('');
    try {
      let totalCountForSecret = 0;
      const allItems: ElevatorType[] = [];

      if (searchTab === 'address') {
        const currentAddressQuery = addressQuery.trim();
        const firstResult = await searchByIntegrationAddress({ addressQuery: currentAddressQuery, pageNo: 1 });
        totalCountForSecret = firstResult.totalCount;
        if (totalCountForSecret > SECRET_MAX_TOTAL) {
          setError('정원 초과입니다. 나중에 타신 분은 내려주십시오.'); setSecretLoading(false); secretInputBlockedRef.current = true; return;
        }
        const maxPage = Math.ceil(totalCountForSecret / 100);
        for (let page = 1; page <= maxPage; page++) {
          const pageResult = await searchByIntegrationAddress({ addressQuery: currentAddressQuery, pageNo: page });
          allItems.push(...pageResult.items);
        }
        const sorted = sortElevators(allItems); const withBadges = assignBadges(sorted);
        allResultsRef.current = withBadges; setIsSecretSearch(true); isSecretSearchRef.current = true; secretInputBlockedRef.current = true;
        setPageResults(withBadges); setTotalCount(totalCountForSecret); setHasSearched(true);
        setLastSearchParams({ tab: 'address', addressQuery: currentAddressQuery });
      } else {
        const currentSido = sido.trim() || undefined; const currentSigungu = sigungu.trim() || undefined; const currentBuldNm = building.trim() || undefined;
        const firstResult = await searchByAddress({ sido: currentSido, sigungu: currentSigungu, buldNm: currentBuldNm, pageNo: 1, numOfRows: '1' });
        totalCountForSecret = firstResult.totalCount;
        if (totalCountForSecret > SECRET_MAX_TOTAL) {
          setError('정원 초과입니다. 나중에 타신 분은 내려주십시오.'); setSecretLoading(false); secretInputBlockedRef.current = true; return;
        }
        const maxPage = Math.ceil(totalCountForSecret / SECRET_FETCH_ROWS);
        for (let page = 1; page <= maxPage; page++) {
          const pageResult = await searchByAddress({ sido: currentSido, sigungu: currentSigungu, buldNm: currentBuldNm, pageNo: page, numOfRows: SECRET_FETCH_ROWS.toString() });
          allItems.push(...pageResult.items);
        }
        const sorted = sortElevators(allItems); const withBadges = assignBadges(sorted);
        allResultsRef.current = withBadges; setIsSecretSearch(true); isSecretSearchRef.current = true; secretInputBlockedRef.current = true;
        setPageResults(withBadges); setTotalCount(totalCountForSecret); setHasSearched(true);
        setLastSearchParams({ tab: 'building', sido: currentSido, sigungu: currentSigungu, buldNm: currentBuldNm });
      }
      setCurrentPage(1); setSelectedFilters({}); setHideEscalator(true); setModelKeyword(''); setMinGroundFloor(''); setMinSpeed('');
    } catch (err) { setError('검색 중 오류가 발생했습니다.'); } finally { setSecretLoading(false); }
  }, [secretInput, secretLoading, sido, sigungu, building, searchTab, addressQuery]);

  // 🎯 [토글 버그 근본 완치 패치] viewMode가 'list'로 바뀔 때 고생해서 긁어온 geoGroups 캐시를 파괴하던 기존 결함을 제거하고 조건 가드 장착
  useEffect(() => {
    if (displayResults.length === 0) {
      geocodeAbortRef.current?.abort(); geocodeAbortRef.current = null;
      setGeoGroups([]);
      lastGeocodedResultsKeyRef.current = '';
      return;
    }

    // 목록 보기 모드일 때는 지도 갱신 계산을 유예하되, 기존 데이터 테이블을 초기화하지(setGeoGroups([])) 않고 메모리에 온전히 킵(Keep)한다!
    if (viewMode !== 'map') {
      return;
    }

    // 결과 목록 식별을 위한 원자 키 생성
    const currentResultsKey = `${displayResults.length}_${displayResults[0]?.elevatorNo || ''}_${displayResults[displayResults.length - 1]?.elevatorNo || ''}`;
    
    // 이미 현재 데이터 기반으로 마커 연산이 완료되어 킵(Keep)되어 있다면 지오코딩 프로세스를 실행하지 않고 우회 스킵
    if (lastGeocodedResultsKeyRef.current === currentResultsKey && geoGroups.length > 0) {
      return;
    }

    geocodeAbortRef.current?.abort(); geocodeAbortRef.current = null;
    const addressMap = new Map<string, { buildingName: string; elevators: ElevatorWithBadges[] }>();
    for (const el of displayResults) {
      const addr = (el.address1 || el.address2 || '').trim(); if (!addr) continue;
      if (!addressMap.has(addr)) addressMap.set(addr, { buildingName: el.buldNm || '', elevators: [] });
      addressMap.get(addr)!.elevators.push(el);
    }
    const uniqueAddresses = Array.from(addressMap.entries()); 
    if (uniqueAddresses.length === 0) { 
      setGeoGroups([]); 
      setGeocoding(false); 
      lastGeocodedResultsKeyRef.current = currentResultsKey;
      return; 
    }

    const controller = new AbortController(); geocodeAbortRef.current = controller; const signal = controller.signal;
    setGeocoding(true);
    const run = async () => {
      try {
        const finalGeoGroups: GeoGroup[] = []; const BATCH_SIZE = 5;
        for (let i = 0; i < uniqueAddresses.length; i += BATCH_SIZE) {
          if (signal?.aborted) return;
          const currentBatch = uniqueAddresses.slice(i, i + BATCH_SIZE);
          const batchPromises = currentBatch.map(async ([addr, { buildingName, elevators }]) => {
            try {
              const coords = await geocodeAddress(addr, signal); if (!coords || signal?.aborted) return null;
              return { address: addr, buildingName, lat: coords[0], lng: coords[1], elevators };
            } catch (_) { return null; }
          });
          const settled = await Promise.allSettled(batchPromises); if (signal?.aborted) return;
          settled.forEach((r) => { if (r.status === 'fulfilled' && r.value !== null) finalGeoGroups.push(r.value); });
          if (uniqueAddresses.length > BATCH_SIZE) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        if (signal?.aborted) return; 
        setGeoGroups(finalGeoGroups);
        lastGeocodedResultsKeyRef.current = currentResultsKey;
      } catch (err) { console.error(err); } finally { if (!signal?.aborted) setGeocoding(false); }
    };
    run(); return () => { controller.abort(); };
  }, [displayResults, viewMode, geoGroups.length]);

  const handleSearch = useCallback(async () => {
    geocodeAbortRef.current?.abort(); searchAbortRef.current?.abort();
    const controller = new AbortController(); searchAbortRef.current = controller;
    setLoading(true); setError(''); setCurrentPage(1); setPageResults([]); setGeoGroups([]); setHasSearched(true);
    setSelectedFilters({}); setHideEscalator(true); setModelKeyword(''); setMinGroundFloor(''); setMinSpeed('');
    isRestoringScrollRef.current = true; setViewMode('list'); setHasVisitedMap(false); setMapKey(k => k + 1);

    let params: LastSearchParams;
    if (searchTab === 'elevatorNo') {
      const query = elevatorNoQuery.trim(); if (!query) { setError('행선버튼을 눌러 주세요.'); setLoading(false); return; }
      params = { tab: 'elevatorNo', elevatorNo: query };
    } else if (searchTab === 'address') {
      const query = addressQuery.trim(); if (!query) { setError('주소를 입력해 주세요.'); setLoading(false); return; }
      params = { tab: 'address', addressQuery: query };
    } else {
      params = { tab: 'building', sido: sido.trim() || undefined, sigungu: sigungu.trim() || undefined, buldNm: building.trim() || undefined };
    }
    setLastSearchParams(params);

    let historyQuery = searchTab === 'elevatorNo' ? elevatorNoQuery.trim() : searchTab === 'address' ? addressQuery.trim() : [sido.trim(), sigungu.trim(), building.trim()].filter(Boolean).join(' ');
    
    // 🎯 [정합성 동기화] 이력 컴포넌트의 오독 현상을 방어하기 위해 객체 내부에 원본 상태값들을 명시적으로 직렬화 보관
    const historyEntry: any = {
      type: 'search', query: historyQuery, timestamp: Date.now(),
      searchTab,
      sido: searchTab === 'building' ? sido.trim() : undefined,
      sigungu: searchTab === 'building' ? sigungu.trim() : undefined,
      buldNm: searchTab === 'building' ? building.trim() : undefined,
      ...(searchTab === 'elevatorNo' ? { elevatorNo: elevatorNoQuery.trim() } : {}),
      ...(modelKeyword.trim() ? { elvtrModel: modelKeyword.trim() } : {}),
    };
    const existing = JSON.parse(localStorage.getItem('elevatorSearchHistory') || '[]');
    localStorage.setItem('elevatorSearchHistory', JSON.stringify([...existing, historyEntry]));
    await fetchPage(1, params, controller.signal);
  }, [searchTab, elevatorNoQuery, addressQuery, sido, sigungu, building, modelKeyword, minGroundFloor, minSpeed, fetchPage]);

  const handlePageChange = useCallback((page: number) => {
    if (isSecretSearchRef.current && allResultsRef.current) { setCurrentPage(page); return; }
    geocodeAbortRef.current?.abort(); searchAbortRef.current?.abort();
    const controller = new AbortController(); searchAbortRef.current = controller; setCurrentPage(page);
    if (lastSearchParams) fetchPage(page, lastSearchParams, controller.signal);
  }, [lastSearchParams, fetchPage]);

  const handleHistorySelect = (history: any) => {
    if (history.type === 'search' && history.elevatorNo) {
      setSearchTab('elevatorNo'); setElevatorNoQuery(history.elevatorNo); pendingHistorySearchRef.current = true;
    } else if (history.type === 'search') {
      // 🎯 [이력 복원 정밀 가드] 직렬화된 searchTab 상태 또는 단독 필드 유무를 가늠하여 정확한 타겟 탭으로 복원 매핑 완료
      if (history.searchTab === 'building' || history.buldNm !== undefined || 'sido' in history || 'sigungu' in history) {
        setSearchTab('building');
        setSido(history.sido || '');
        setSigungu(history.sigungu || '');
        setBuilding(history.buldNm || '');
      } else {
        setSearchTab('address');
        setAddressQuery(history.query);
      }
      pendingHistorySearchRef.current = true;
    } else if (history.elevatorNo) {
      setSearchTab('elevatorNo'); setElevatorNoQuery(history.elevatorNo); pendingHistorySearchRef.current = true;
    }
  };

  const handleFilterChange = (key: string, values: string[]) => { setSelectedFilters((prev) => ({ ...prev, [key]: values })); };

  useEffect(() => {
    if (pendingHistorySearchRef.current) { pendingHistorySearchRef.current = false; handleSearch(); }
  }, [sido, sigungu, building, elevatorNoQuery, addressQuery, searchTab, handleSearch]);

  const activeTotalPages = isSecretSearch ? Math.ceil(displayResults.length / ROWS_PER_PAGE) : totalPages;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col max-w-2xl mx-auto pb-11 relative">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-[100] shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 8l3-3 3 3M9 16l3 3 3-3M12 5v14" /></svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">elNavi</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">내 손 안에 전국을 - 엘네비</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowBell(true)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative">
            <Bell size={20} className="text-gray-500 dark:text-gray-400" />
            {notificationCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{notificationCount > 99 ? '99+' : notificationCount}</span>}
          </button>
          <button onClick={() => setShowSettings(true)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><Settings size={20} className="text-gray-500 dark:text-gray-400" /></button>
        </div>
      </header>

      {bookmarkChanges.length > 0 && (
        <div className="mx-4 mt-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 shadow-xs">
          <Bell size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black text-amber-800 dark:text-amber-300">북마크 승강기 제원 변동 사항 안내</p>
              <p className="p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg transition-colors focus:outline-none" onClick={handleDismissChanges}><XCircle size={14} className="text-amber-500 dark:text-amber-400" /></p>
            </div>
            <div className="mt-1.5 space-y-1">
              {bookmarkChanges.map((c, idx) => (
                <div key={idx} className="text-xs text-amber-800 dark:text-amber-300 bg-white/60 dark:bg-gray-800/40 p-2 rounded-lg border border-amber-200/20">
                  <p className="font-bold text-[11px] mb-1 text-gray-900 dark:text-gray-100">🏢 {c.building_name || '지정 빌딩'} <span className="font-normal text-slate-400">({formatElevatorNo(c.elevator_no)})</span></p>
                  {c.changeType === ('combined' as any) && (c as any).details ? (
                    <div className="pl-1 space-y-0.5 text-[10.5px]">
                      {(c as any).details.map((d: any, dIdx: number) => (
                        <p key={dIdx} className="truncate">• {d.field === 'model' ? '모델명' : d.field === 'installation' ? '설치일자' : '검사종류'}: <span className="line-through text-slate-400">{d.field === 'installation' ? formatDate(d.oldVal) : d.oldVal}</span> → <span className="font-bold text-blue-600 dark:text-blue-400">{d.field === 'installation' ? formatDate(d.newVal) : d.newVal}</span></p>
                      ))}
                    </div>
                  ) : (
                    <p className="pl-1 text-[10.5px] truncate">• {c.changeType === 'model' && `모델명: ${c.oldValue} → ${c.newValue}`}{c.changeType === 'installation' && `설치일자: ${formatDate(c.oldValue)} → ${formatDate(c.newValue)}`}{c.changeType === 'inspection' && `검사종류: ${c.oldValue} → ${c.newValue}`}</p>
                  )}
                </div>
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
        addressQuery={addressQuery}
        onAddressQueryChange={setAddressQuery}
        onSearch={handleSearch}
        loading={loading}
        disabled={
          loading ||
          (searchTab === 'elevatorNo' && elevatorNoQuery.trim().length !== 7) ||
          (searchTab === 'address' && !addressQuery.trim()) ||
          (searchTab === 'building' && (
            (!sido.trim() && !sigungu.trim() && !building.trim()) ||
            (sigungu.trim() && !sido.trim() && !building.trim())
          ))
        }
      />

      {pageResults.length > 0 && (searchTab === 'address' || searchTab === 'building') && (
        <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-[56px] z-[90]">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            결과 {displayResults.length}/{pageResults.length}건 | 전체 {totalCount}건
            {geocoding && <span className="ml-2 text-blue-500 dark:text-blue-400 animate-pulse">지도 갱신 중...</span>}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowFilter(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"><Sliders size={12} /> 필터</button>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button onClick={() => { isRestoringScrollRef.current = true; setViewMode('list'); }} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><List size={12} /> 목록</button>
              <button onClick={() => { if (mainScrollRef.current) { tabScrollMapRef.current[searchTab as string] = mainScrollRef.current.scrollTop; viewModeScrollRef.current = mainScrollRef.current.scrollTop; } setViewMode('map'); setHasVisitedMap(true); }} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${viewMode === 'map' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><MapIcon size={12} /> 지도</button>
            </div>
          </div>
        </div>
      )}

      <main 
        ref={mainScrollRef} 
        onScroll={(e) => {
          if (isRestoringScrollRef.current) return;
          if (viewMode === 'list') {
            const st = e.currentTarget.scrollTop; tabScrollMapRef.current[searchTab as string] = st; viewModeScrollRef.current = st;
          }
        }}
        className="flex-1 flex flex-col overflow-y-auto pb-6"
      >
        <div className={`p-4 flex-1 flex flex-col ${searchTab === 'mapSearch' ? '' : 'hidden'}`}>
          <BuildingLayerMap visible={searchTab === 'mapSearch'} settings={settings} bookmarkedIds={bookmarkedIds} viewedIds={viewedIds} onBookmarkChange={() => getBookmarkedElevatorNos().then(setBookmarkedIds).catch(() => {})} onShowBookmarkPicker={(el) => setSelectedElevator(el)} onLoadingStateChange={(state) => setLoading(state)} onBuildingSelect={(elevatorsList) => { if (elevatorsList.length > 0) handleElevatorSelect(elevatorsList[0]); }} />
        </div>

        {searchTab !== 'mapSearch' && pageResults.length > 0 && activeTotalPages > 1 && viewMode === 'list' && (
          <div className="px-4 pt-3 pb-1"><Pagination currentPage={currentPage} totalPages={activeTotalPages} onPageChange={handlePageChange} /></div>
        )}

        {error && (
          <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3"><AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" /><p className="text-sm text-red-600">{error}</p></div>
        )}

        {loading && searchTab !== 'buildingLayer' && (
          <div className="p-4 space-y-3">{[1, 2, 3].map((i) => (<div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-3 animate-pulse"><div className="h-3 bg-gray-200 rounded w-3/4 mb-1.5" /><div className="h-2.5 bg-gray-100 rounded w-1/2" /></div>))}</div>
        )}

        {!loading && hasSearched && pageResults.length === 0 && !error && searchTab !== 'buildingLayer' && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center"><p className="text-sm text-gray-500">지금 검색된 결과는 존재하지 않습니다.</p></div>
        )}

        {hasVisitedMap && hasSearched && searchTab !== 'mapSearch' && (
          <div className={`p-4 ${viewMode === 'map' ? '' : 'hidden'}`}>
            <MapView ref={mapViewRef} geoGroups={geoGroups} geocoding={geocoding} mapKey={mapKey} totalElevators={displayResults.length} onMarkerClick={handleElevatorSelect} visible={viewMode === 'map'} bookmarkedIds={bookmarkedIds} viewedIds={viewedIds} settings={settings} onMapReady={() => {}} onBookmarkChange={() => getBookmarkedElevatorNos().then(setBookmarkedIds).catch(() => {})} onShowBookmarkPicker={(el) => setSelectedElevator(el)} focusAddress={focusAddress} restoreMode={restoreMode} />
            <div className="mt-1.5 w-full"><input type="text" value={secretInput} onChange={(e) => setSecretInput(e.target.value)} onKeyDown={handleSecretInputKeyDown} className="w-full px-3 py-2 text-xs font-normal bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-none" /></div>

            {viewMode === 'map' && !geocoding && unmappedBuildings.length > 0 && (
              <div className="mt-3">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2 text-xs text-rose-600 dark:text-rose-400 font-medium">주소가 대응되지 않는 건물은 표시하지 못했습니다. (총 {unmappedBuildings.reduce((s, g) => s + g.elevators.length, 0)}대)</div>
                <div className="mt-2 space-y-2">{unmappedBuildings.map((group, idx) => (<ElevatorCard key={`unmapped-${group.buildingName}-${idx}`} buildingName={group.buildingName} address={group.address} elevators={group.elevators} settings={settings} onSelect={handleElevatorSelect} bookmarkedIds={bookmarkedIds} viewedIds={viewedIds} />))}</div>
              </div>
            )}
          </div>
        )}

        {!loading && viewMode === 'list' && groupedBuildings.length > 0 && searchTab !== 'buildingLayer' && (
          <div className="p-4 space-y-2">{groupedBuildings.map((group, idx) => (<ElevatorCard key={`${group.buildingName}-${idx}`} buildingName={group.buildingName} address={group.address} elevators={group.elevators} settings={settings} onSelect={handleElevatorSelect} bookmarkedIds={bookmarkedIds} viewedIds={viewedIds} />))}</div>
        )}

        {pageResults.length > 0 && activeTotalPages > 1 && viewMode === 'list' && searchTab !== 'buildingLayer' && (
          <div className="px-4 pb-3"><Pagination currentPage={currentPage} totalPages={activeTotalPages} onPageChange={handlePageChange} /></div>
        )}
      </main>

      {selectedElevator && (<ElevatorModal elevator={selectedElevator} settings={settings} onClose={() => setSelectedElevator(null)} onNavigateToMap={(el) => { setSelectedElevator(null); setViewMode('map'); setHasVisitedMap(true); setFocusAddress(el.address1 || undefined); }} />)}
      {showSettings && (<SettingsMenu settings={settings} onChange={handleSettingsChange} onClose={() => setShowSettings(false)} onHistorySelect={handleHistorySelect} onBookmarkSelect={(el) => setSelectedElevator(el)} />)}
      {showFilter && (<FilterSidebar filters={filterOptions} selected={selectedFilters} onFilterChange={handleFilterChange} onClose={() => setShowFilter(false)} elevators={pageResults} modelKeyword={modelKeyword} onModelKeywordChange={setModelKeyword} minGroundFloor={minGroundFloor} onMinGroundFloorChange={setMinGroundFloor} minSpeed={minSpeed} onMinSpeedChange={setMinSpeed} hideEscalator={hideEscalator} onHideEscalatorChange={setHideEscalator} />)}
      {showBell && (<BellNotification onClose={() => setShowBell(false)} onItemClick={(change) => { if (change.elevator_no) { setSearchTab('elevatorNo'); setElevatorNoQuery(change.elevator_no); pendingHistorySearchRef.current = true; } }} />)}

      <nav className="fixed bottom-0 left-0 right-0 z-[150] max-w-2xl mx-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-100 dark:border-gray-800 flex items-center justify-around h-11 px-2 shadow-[0_-2px_8px_rgba(0,0,0,0.02)]">
        <button
          type="button" onClick={() => handleTabChange('elevatorNo')}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${searchTab === 'elevatorNo' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400 dark:text-gray-500 font-medium'}`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>
          <span className="text-[10px]">번호 검색</span>
        </button>

        <button
          type="button" onClick={() => handleTabChange('building')}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${searchTab === 'building' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400 dark:text-gray-500 font-medium'}`}
        >
          <Building2 size={16} />
          <span className="text-[10px]">건물명 검색</span>
        </button>

        <button
          type="button" onClick={() => handleTabChange('address')}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${searchTab === 'address' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400 dark:text-gray-500 font-medium'}`}
        >
          <List size={16} />
          <span className="text-[10px]">주소 검색</span>
        </button>

        <button
          type="button" onClick={() => handleTabChange('mapSearch')}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${searchTab === 'mapSearch' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400 dark:text-gray-500 font-medium'}`}
        >
          <MapIcon size={16} />
          <span className="text-[10px]">지도 검색</span>
        </button>
      </nav>
    </div>
  );
}