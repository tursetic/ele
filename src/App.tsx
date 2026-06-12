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

  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.ceil(totalCount / ROWS_PER_PAGE);
  const [lastSearchParams, setLastSearchParams] = useState<LastSearchParams | null>(null);

  interface TabCache {
    pageResults: ElevatorWithBadges[];
    currentPage: number;
    totalCount: number;
    lastSearchParams: LastSearchParams | null;
    hasSearched: boolean;
  }
  const tabCacheRef = useRef<Record<string, TabCache | null>>({});

  const handleTabChange = useCallback((newTab: SearchTab) => {
    const currentTab = searchTab;
    tabCacheRef.current[currentTab] = {
      pageResults,
      currentPage,
      totalCount,
      lastSearchParams,
      hasSearched,
    };

    const cached = tabCacheRef.current[newTab];
    if (cached) {
      setPageResults(cached.pageResults);
      setCurrentPage(cached.currentPage);
      setTotalCount(cached.totalCount);
      setLastSearchParams(cached.lastSearchParams);
      setHasSearched(cached.hasSearched);
    } else {
      setPageResults([]);
      setCurrentPage(1);
      setTotalCount(0);
      setLastSearchParams(null);
      setHasSearched(false);
      setGeoGroups([]);
    }
    setError('');
    setViewMode('list');
    setSearchTab(newTab);
  }, [searchTab, pageResults, currentPage, totalCount, lastSearchParams, hasSearched]);

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

  const groupedBuildings = useMemo(() => {
    const groups: Record<string, { buildingName: string; address: string; elevators: ElevatorWithBadges[] }> = {};

    displayResults.forEach((el) => {
      const key = `${el.buldNm || '건물명 없음'}_${el.address1 || ''}`;
      if (!groups[key]) {
        groups[key] = {
          buildingName: el.buldNm || '건물명 없음',
          address: `${el.address1 || ''}${el.address2 ? ` · ${el.address2}` : ''}`,
          elevators: []
        };
      }
      groups[key].elevators.push(el);
    });

    return Object.values(groups);
  }, [displayResults]);

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
          address: `${el.address1 || ''}${el.address2 ? ` · ${el.address2}` : ''}`,
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

    const run = async () => {
      try {
        const promises = uniqueAddresses.map(async ([addr, { buildingName, elevators }]) => {
          try {
            const coords = await geocodeAddress(addr, signal);
            if (!coords || signal.aborted) return null;
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

        const settled = await Promise.allSettled(promises);
        if (signal.aborted) return;
        const groups = settled
          .filter((r): r is PromiseFulfilledResult<GeoGroup> => r.status === 'fulfilled' && r.value !== null)
          .map((r) => r.value);
        setGeoGroups(groups);
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col max-w-2xl mx-auto">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 8l3-3 3 3M9 16l3 3 3-3M12 5v14" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Brelev</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">승강기 정보 조회</p>
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
        <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-12 z-10">
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
        {/* 건물 레이어 단독 전용 격리 탭 구역 새둥지 안착 */}
        {searchTab === 'buildingLayer' && (
          <div className="p-4 flex-1 flex flex-col">
            <BuildingLayerMap
              onLoadingStateChange={(state) => setLoading(state)}
              onBuildingSelect={(elevatorsList, forceOpenModal) => {
                if (elevatorsList.length > 0) {
                  // 다 대수 여부 분기를 거쳐 정돈된 최종 타겟 1대를 상세모달창으로 안전하게 바인딩
                  handleElevatorSelect(elevatorsList[0]);
                }
              }}
            />
          </div>
        )}

        {searchTab !== 'buildingLayer' && pageResults.length > 0 && totalPages > 1 && viewMode === 'list' && (
          <div className="px-4 pt-3 pb-1">
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
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

        {hasVisitedMap && hasSearched && searchTab !== 'buildingLayer' && (
          <div className={`p-4 ${viewMode === 'map' ? '' : 'hidden'}`}>
            <MapView
              geoGroups={geoGroups}
              geocoding={geocoding}
              mapKey={mapKey}
              totalElevators={displayResults.length}
              onMarkerClick={handleElevatorSelect}
              visible={viewMode === 'map'}
              bookmarkedIds={bookmarkedIds}
              viewedIds={viewedIds}
              onMapReady={() => {}}
              onBookmarkChange={() => getBookmarkedElevatorNos().then(setBookmarkedIds).catch(() => {})}
              onShowBookmarkPicker={(el) => setSelectedElevator(el)}
              focusAddress={focusAddress}
            />
            {viewMode === 'map' && unmappedBuildings.length > 0 && (
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

        {pageResults.length > 0 && totalPages > 1 && viewMode === 'list' && searchTab !== 'buildingLayer' && (
          <div className="px-4 pb-3">
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
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
