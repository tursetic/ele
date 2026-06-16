import React, { useEffect, useState, useCallback } from 'react';
import { X, Settings, Trash2, MapPin, Hash, Cpu, Sun, Moon, Monitor, Bookmark, Building2, Eye, Folder, FolderPlus, EyeOff } from 'lucide-react';
import { SettingsFields, SearchHistory, Bookmark as BookmarkType, BookmarkFolder, ThemeMode, ElevatorWithBadges } from '../types';
import { useTheme } from '../utils/useTheme';
import { getBookmarks, removeBookmark, getFolders, createFolder, updateFolder, deleteFolder } from '../utils/bookmarks';
import Pagination from './Pagination';

/* ─── [PERMANENT CORE SETTINGS RULES - NEVER DELETE] ───
   1. 전체 삭제 실행 전 window.confirm 확인 절차 필수 유지
   2. e.stopPropagation 배선을 통해 상세 모달 클릭 시 하단 레이어 중복 생성 및 간섭 현상 완전 차단
   ────────────────────────────────────────────────── */

const FIELD_GROUPS: { title: string; fields: { key: keyof SettingsFields; label: string }[] }[] = [
  {
    title: '기본 정보',
    fields: [
      { key: 'elvtrStts', label: '승강기 상태' },
      { key: 'elvtrDivNm', label: '승강기 구분' },
      { key: 'elvtrFormNm', label: '승강기 형식' },
      { key: 'elvtrKindNm', label: '승강기 종류' },
      { key: 'elvtrModel', label: '모델명' },
      { key: 'installationPlace', label: '설치 위치' },
      { key: 'shuttleSection', label: '운행 구간' },
      { key: 'buldPrpos', label: '건물용도' },
    ],
  },
  {
    title: '설치 · 검사',
    fields: [
      { key: 'frstInstallationDe', label: '최초설치일' },
      { key: 'installationDe', label: '설치일자' },
      { key: 'lastInspctDe', label: '최종 검사일' },
      { key: 'lastInspctKind', label: '최종 검사종류' },
      { key: 'inspctInstt', label: '검사 기관' },
    ],
  },
  {
    title: '기술 제원',
    fields: [
      { key: 'divGroundFloorCnt', label: '지상 운행층수' },
      { key: 'divUndgrndFloorCnt', label: '지하 운행층수' },
      { key: 'ratedSpeed', label: '정격 속도' },
      { key: 'ratedCap', label: '정원' },
      { key: 'liveLoad', label: '적재하중' },
      { key: 'mrYn', label: '기계실 여부' },
    ],
  },
  {
    title: '유지관리',
    fields: [
      { key: 'subcntrCpny', label: '보수업체명' },
      { key: 'mntCpnyNm', label: '유지관리업체' },
      { key: 'mntCpnyTelno', label: '유지관리 연락처' },
      { key: 'partcpntNm', label: '관리주체명' },
      { key: 'partcpntTelno', label: '관리주체 연락처' },
    ],
  },
];

const HISTORY_PER_PAGE = 5;
const BOOKMARKS_PER_PAGE = 5;

const DEFAULT_ELEVATOR = {
  elevatorNo: '', buldNm: '', address1: '', address2: '',
  elvtrDivNm: '', elvtrFormNm: '', elvtrKindNm: '', elvtrModel: '',
  elvtrStts: '', frstInstallationDe: '', installationDe: '',
  lastInspctDe: '', lastInspctKind: '', inspctInstt: '', lastResultNm: '',
  divGroundFloorCnt: '', divUndgrndFloorCnt: '', shuttleFloorCnt: '',
  ratedSpeed: '', ratedCap: '', liveLoad: '',
  installationPlace: '', shuttleSection: '', manufacturerName: '',
  elvtrAsignNo: '', mrYn: '', applcBeDt: '', applcEnDt: '',
  pauseAblDe: '', pauseAbleResn: '',
  subcntrCpny: '', mntCpnyNm: '', mntCpnyTelno: '',
  partcpntNm: '', partcpntTelno: '', buldPrpos: '',
};

const themeOptions: { mode: ThemeMode; icon: React.ReactNode; label: string }[] = [
  { mode: 'light', icon: <Sun size={14} />, label: '라이트' },
  { mode: 'dark', icon: <Moon size={14} />, label: '다크' },
  { mode: 'system', icon: <Monitor size={14} />, label: '시스템' },
];

interface SettingsMenuProps {
  settings: SettingsFields;
  onChange: (s: SettingsFields) => void;
  onClose: () => void;
  onHistorySelect: (h: SearchHistory) => void;
  onBookmarkSelect: (el: ElevatorWithBadges) => void;
}

const ACCORDION_KEY = 'brelev_settings_accordion_v1';
function loadAccordionState(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(ACCORDION_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}
function saveAccordionState(state: Record<string, boolean>) {
  try { localStorage.setItem(ACCORDION_KEY, JSON.stringify(state)); } catch {}
}

export default function SettingsMenu({ settings, onChange, onClose, onHistorySelect, onBookmarkSelect }: SettingsMenuProps) {
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [viewHistory, setViewHistory] = useState<SearchHistory[]>([]);

  const [accordionState, setAccordionState] = useState<Record<string, boolean>>(loadAccordionState);
  const toggleAccordion = (key: string) => {
    setAccordionState(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveAccordionState(next);
      return next;
    });
  };
  const showBookmarks = !!accordionState['bookmarks'];
  const showSearchHistory = !!accordionState['searchHistory'];
  const showViewHistory = !!accordionState['viewHistory'];
  const showFields = !!accordionState['fields'];

  const [searchHistoryPage, setSearchHistoryPage] = useState(1);
  const [viewHistoryPage, setViewHistoryPage] = useState(1);
  const [ungroupedBookmarkPage, setUngroupedBookmarkPage] = useState(1);
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(true);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderPageState, setFolderPageState] = useState<Record<string, number>>({});

  const { mode: themeMode, setTheme } = useTheme();

  const refreshBookmarks = useCallback(() => {
    setBookmarksLoading(true);
    Promise.all([
      getBookmarks().then(setBookmarks).catch(() => setBookmarks([])),
      getFolders().then(setFolders).catch(() => setFolders([])),
    ]).finally(() => setBookmarksLoading(false));
  }, []);

  // ESC + back button close
  // ESC + back button close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const hadPushState = !history.state?.settingsOpen;
    if (hadPushState) history.pushState({settingsOpen: true}, '');
    const onPopState = (e: PopStateEvent) => {
      onClose();
    };
    window.addEventListener('popstate', onPopState);
    
    // 전역 플래그 설정 (다른 컴포넌트에서 확인용)
    (window as any).__settingsMenuOpen = true;
    document.body.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
      (window as any).__settingsMenuOpen = false;
      
      if (hadPushState && history.state?.settingsOpen) {
        history.replaceState(history.state._prev || {}, '');
      }
      
      // ★ [안전 방어선 부활] 가변 변수 대신 전역 플래그를 검증하여 상세 모달까지 완벽히 닫혀있을 때만 스크롤 무조건 해제
      if (!(window as any).__elevatorModalOpen) {
        document.body.style.overflow = '';
      } else {
        document.body.style.overflow = 'hidden';
      }
    };
  }, [onClose]);

  useEffect(() => {
    try {
      const searchStored = localStorage.getItem('elevatorSearchHistory');
      if (searchStored) setSearchHistory(JSON.parse(searchStored));
    } catch {}
    try {
      const viewStored = localStorage.getItem('elevatorViewHistory');
      if (viewStored) setViewHistory(JSON.parse(viewStored));
    } catch {}
    refreshBookmarks();
  }, [refreshBookmarks]);

  const toggle = (key: keyof SettingsFields) => {
    onChange({ ...settings, [key]: !settings[key] });
  };

  const allOn = Object.values(settings).every(Boolean);
  const toggleAll = () => {
    const next = !allOn;
    const updated = { ...settings };
    for (const k of Object.keys(settings) as (keyof SettingsFields)[]) {
      updated[k] = next;
    }
    onChange(updated);
  };

  const clearSearchHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('전체 검색 히스토리를 삭제하시겠습니까?')) return;
    localStorage.removeItem('elevatorSearchHistory');
    setSearchHistory([]);
    setSearchHistoryPage(1);
  };

  const clearViewHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('전체 조회 히스토리를 삭제하시겠습니까?')) return;
    localStorage.removeItem('elevatorViewHistory');
    setViewHistory([]);
    setViewHistoryPage(1);
  };

  const handleClearAllBookmarks = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('모든 북마크를 삭제하시겠습니까?')) return;
    try {
      await Promise.all(bookmarks.map((b) => removeBookmark(b.elevator_no)));
      setBookmarks([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folder = await createFolder(name);
    setFolders(prev => [...prev, folder]);
    setNewFolderName('');
  };

  const handleToggleFolderActive = async (folderId: string, currentActive: boolean) => {
    await updateFolder(folderId, { active: !currentActive });
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, active: !currentActive } : f));
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    if (!window.confirm('이 폴더를 삭제하시겠습니까? 폴더 내 북마크는 유지됩니다.')) return;
    await deleteFolder(folderId);
    setFolders(prev => prev.filter(f => f.id !== folderId));
    refreshBookmarks();
  };

  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleDeleteSearchHistory = (e: React.MouseEvent, timestamp: number) => {
    e.stopPropagation();
    const updated = searchHistory.filter((h) => h.timestamp !== timestamp);
    localStorage.setItem('elevatorSearchHistory', JSON.stringify(updated));
    setSearchHistory(updated);
    const maxPage = Math.ceil(updated.length / HISTORY_PER_PAGE) || 1;
    if (searchHistoryPage > maxPage) setSearchHistoryPage(maxPage);
  };

  const handleDeleteViewHistory = (e: React.MouseEvent, timestamp: number) => {
    e.stopPropagation();
    const updated = viewHistory.filter((h) => h.timestamp !== timestamp);
    localStorage.setItem('elevatorViewHistory', JSON.stringify(updated));
    setViewHistory(updated);
    const maxPage = Math.ceil(updated.length / HISTORY_PER_PAGE) || 1;
    if (viewHistoryPage > maxPage) setViewHistoryPage(maxPage);
  };

  const handleHistoryClick = (e: React.MouseEvent, h: SearchHistory) => {
    e.stopPropagation();
    onHistorySelect(h);
    onClose();
  };

  // 고유번호 7자리 검색 시 기록이 깨지던 결함 완벽 해결
  const getSearchTitle = (h: any) => {
    if (h.query && h.query.trim()) return h.query.trim();
    if (h.elevatorNo) return `고유번호: ${h.elevatorNo}`;
    if (h.elevatorNoQuery) return `고유번호: ${h.elevatorNoQuery}`;
    const fallbackNo = Object.values(h).find(v => typeof v === 'string' && /^\d{7}$/.test(v));
    if (fallbackNo) return `고유번호: ${fallbackNo}`;
    return '고유번호 검색';
  };

  // 파편화된 주소, 제조사 필드를 매핑하는 지능형 통합 매퍼
  const normalizeItem = (item: any) => {
    const elData = item.elevator_data || item.elevatorData || item;
    const buildingName = item.building_name || item.buildingName || item.buldNm || elData.buldNm || '건물명 미기재';
    
    let address1 = (item.address1 || elData.address1 || '').trim();
    let address2 = (item.address2 || elData.address2 || '').trim();
    let address = (item.address || elData.address || '').trim();
    
    if (!address && address1) address = [address1, address2].filter(Boolean).join(' ');
    if (!address1 && address) address1 = address;

    const manufacturerName = (item.manufacturerName || elData.manufacturerName || item.mnfctrNm || elData.mnfctrNm || '').trim();
    const elvtrModel = (item.elvtrModel || elData.elvtrModel || item.model || elData.model || '').trim();
    
    let installationDe = (item.installationDe || elData.installationDe || '').trim();
    if (installationDe && installationDe.length === 8 && !installationDe.includes('-')) {
      installationDe = `${installationDe.slice(0, 4)}-${installationDe.slice(4, 6)}-${installationDe.slice(6, 8)}`;
    }

    const elevatorNo = item.elevator_no || item.elevatorNo || elData.elevatorNo || '';

    let displayTimestamp = '';
    const rawTime = item.timestamp || item.created_at;
    if (rawTime) {
      const d = new Date(rawTime);
      displayTimestamp = !isNaN(d.getTime()) ? d.toLocaleString('ko-KR') : String(rawTime);
    }

    return { buildingName, address, address1, address2, manufacturerName, elvtrModel, installationDe, elevatorNo, displayTimestamp };
  };

  // 상세 모달 연동 정상화 및 레이어 소멸 방지
  // ★ SettingsMenu는 열어두고 ElevatorModal만 열기 (두 레이어 공존)
  const handleItemClick = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    if (onBookmarkSelect) {
      const elData = item.elevator_data || item.elevatorData;

      if (elData && typeof elData === 'object' && elData.elevatorNo) {
        onBookmarkSelect({
          ...elData,
          isTopGround: (elData as any).isTopGround ?? false,
          isDeepUnderground: (elData as any).isDeepUnderground ?? false,
        });
      } else {
        const normalized = normalizeItem(item);
        const fullElevator: ElevatorWithBadges = {
          ...DEFAULT_ELEVATOR,
          elevatorNo: normalized.elevatorNo || '',
          buldNm: normalized.buildingName || '',
          address1: normalized.address1 || normalized.address || '',
          address2: normalized.address2 || '',
          manufacturerName: normalized.manufacturerName || '',
          elvtrModel: normalized.elvtrModel || '',
          installationDe: normalized.installationDe || '',
          elvtrStts: '운행중',
          isTopGround: false,
          isDeepUnderground: false,
        };
        onBookmarkSelect(fullElevator);
      }
      // SettingsMenu는 닫지 않음 - 사용자가 모달에서 돌아오면 설정이 그대로 있어야 함
    }
  };

  const handleDeleteBookmark = async (e: React.MouseEvent, elevatorNo: string) => {
    e.stopPropagation();
    try {
      await removeBookmark(elevatorNo);
      setBookmarks((prev) => prev.filter((b) => b.elevator_no !== elevatorNo));
    } catch (err) {
      console.error(err);
    }
  };

  const reversedSearchHistory = [...searchHistory].reverse();
  const searchHistoryTotalPages = Math.ceil(reversedSearchHistory.length / HISTORY_PER_PAGE);
  const searchHistoryStartIdx = (searchHistoryPage - 1) * HISTORY_PER_PAGE;
  const pageSearchHistoryItems = reversedSearchHistory.slice(searchHistoryStartIdx, searchHistoryStartIdx + HISTORY_PER_PAGE);

  const reversedViewHistory = [...viewHistory].reverse();
  const viewHistoryTotalPages = Math.ceil(reversedViewHistory.length / HISTORY_PER_PAGE);
  const viewHistoryStartIdx = (viewHistoryPage - 1) * HISTORY_PER_PAGE;
  const pageViewHistoryItems = reversedViewHistory.slice(viewHistoryStartIdx, viewHistoryStartIdx + HISTORY_PER_PAGE);

  const ungroupedBookmarks = bookmarks.filter(b => !b.folder_id).sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });
  const ungroupedTotalPages = Math.ceil(ungroupedBookmarks.length / BOOKMARKS_PER_PAGE);
  const ungroupedStartIdx = (ungroupedBookmarkPage - 1) * BOOKMARKS_PER_PAGE;
  const pagedUngroupedBookmarks = ungroupedBookmarks.slice(ungroupedStartIdx, ungroupedStartIdx + BOOKMARKS_PER_PAGE);

  const folderBookmarksMap: Record<string, BookmarkType[]> = {};
  for (const f of folders) {
    folderBookmarksMap[f.id] = bookmarks.filter(b => b.folder_id === f.id).sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" data-settings-menu onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/60" onClick={onClose} />
      <div className="relative mt-auto bg-white dark:bg-gray-900 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-blue-600" />
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">설정</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 pb-8 space-y-5">
          {/* Theme Toggle */}
          <div>
            <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              {themeMode === 'dark' ? <Moon size={16} className="text-indigo-400" /> : <Sun size={16} className="text-amber-500" />}
              테마 설정
            </h4>
            <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
              {themeOptions.map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setTheme(mode)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    themeMode === mode
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Bookmarks */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <div
              className="flex items-center justify-between w-full mb-3 cursor-pointer"
              onClick={() => toggleAccordion('bookmarks')}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Bookmark size={16} className="text-yellow-500 shrink-0" fill="currentColor" />
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">북마크</h4>
                {bookmarks.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-full font-bold">
                    {bookmarks.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {bookmarks.length > 0 && (
                  <button
                    onClick={handleClearAllBookmarks}
                    className="text-[11px] font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded transition-colors"
                  >
                    전체 삭제
                  </button>
                )}
                <span className="text-gray-400 dark:text-gray-500 text-xs p-1">
                  {showBookmarks ? '▼' : '▶'}
                </span>
              </div>
            </div>

            {showBookmarks && (
              <div>
                {bookmarksLoading ? (
                  <p className="text-xs text-gray-400 text-center py-3">로딩 중...</p>
                ) : (
                  <div className="space-y-2">
                    {/* Ungrouped bookmarks (폴더 없음) */}
                    {ungroupedBookmarks.length > 0 && (
                      <div className="space-y-1.5">
                        {pagedUngroupedBookmarks.map((bookmark) => {
                          const normalized = normalizeItem(bookmark);
                          return (
                            <div
                              key={bookmark.id}
                              className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100/70 dark:border-gray-700 transition-all hover:border-slate-300 dark:hover:border-gray-600 group cursor-pointer"
                              onClick={(e) => handleItemClick(e, bookmark)}
                            >
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Building2 size={11} className="text-blue-500 shrink-0" />
                                  <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate">
                                    {normalized.buildingName}
                                  </p>
                                </div>
                                <div className="pl-4.5 space-y-0.5">
                                  {normalized.address && (
                                    <p className="text-[9px] text-gray-400 dark:text-gray-500 font-normal truncate">
                                      {normalized.address}
                                    </p>
                                  )}
                                  {(normalized.manufacturerName || normalized.elvtrModel || normalized.installationDe) && (
                                    <div className="flex items-center gap-1 flex-wrap text-[9px] text-gray-500 dark:text-gray-400 font-normal">
                                      {normalized.manufacturerName && (
                                        <span className="font-bold text-gray-700 dark:text-gray-300">{normalized.manufacturerName}</span>
                                      )}
                                      {normalized.elvtrModel && (
                                        <>{normalized.manufacturerName && <span className="text-gray-300 dark:text-gray-600">·</span>}
                                        <span className="text-blue-600 dark:text-blue-400 font-semibold">{normalized.elvtrModel}</span></>
                                      )}
                                      {normalized.installationDe && (
                                        <>{(normalized.manufacturerName || normalized.elvtrModel) && <span className="text-gray-300 dark:text-gray-600">·</span>}
                                        <span>{normalized.installationDe}</span></>
                                      )}
                                    </div>
                                  )}
                                  <p className="text-[9px] text-gray-400 dark:text-gray-500 font-normal">
                                    {normalized.elevatorNo}{normalized.displayTimestamp ? ` · ${normalized.displayTimestamp}` : ''}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={(e) => handleDeleteBookmark(e, bookmark.elevator_no)}
                                className="shrink-0 p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all self-center"
                                title="북마크 삭제"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          );
                        })}
                        {ungroupedTotalPages > 1 && (
                          <Pagination
                            currentPage={ungroupedBookmarkPage}
                            totalPages={ungroupedTotalPages}
                            onPageChange={setUngroupedBookmarkPage}
                          />
                        )}
                    </div>
                    )}

                    {/* Folder groups */}
                    {folders.map(folder => {
                      const folderBookmarks = folderBookmarksMap[folder.id] || [];
                      const isExpanded = !!expandedFolders[folder.id];
                      const totalPages = Math.ceil(folderBookmarks.length / BOOKMARKS_PER_PAGE);
                      const currentPage = (folderPageState[folder.id] as number) || 1;
                      const pagedBookmarks = folderBookmarks.slice(
                        (currentPage - 1) * BOOKMARKS_PER_PAGE,
                        currentPage * BOOKMARKS_PER_PAGE
                      );

                      return (
                        <div key={folder.id} className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                          <div
                            onClick={() => toggleFolderExpand(folder.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors cursor-pointer"
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleFolderActive(folder.id, folder.active); }}
                              className={`shrink-0 p-0.5 rounded transition-colors ${folder.active ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 dark:text-gray-600 hover:text-gray-400'}`}
                              title={folder.active ? '강조 켜짐' : '강조 꺼짐'}
                            >
                              {folder.active ? <Eye size={12} /> : <EyeOff size={12} />}
                            </button>
                            <Folder size={12} className={`shrink-0 ${folder.active ? 'text-yellow-500' : 'text-gray-400 dark:text-gray-500'}`} fill={folder.active ? 'currentColor' : 'none'} />
                            <span className={`text-[11px] truncate flex-1 text-left ${folder.active ? 'font-semibold text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500 line-through'}`}>{folder.name}</span>
                            <span className="text-[9px] text-gray-400 dark:text-gray-500 shrink-0">{folderBookmarks.length}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteFolder(e, folder.id); }}
                              className="shrink-0 p-0.5 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors"
                              title="폴더 삭제"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="px-2 py-2 space-y-1.5 bg-white dark:bg-gray-900/50">
                              {folderBookmarks.length === 0 ? (
                                <p className="text-[10px] text-gray-400 text-center py-2">북마크 없음</p>
                              ) : (
                                <>
                                  {pagedBookmarks.map((bookmark) => {
                                    const normalized = normalizeItem(bookmark);
                                    return (
                                      <div
                                        key={bookmark.id}
                                        className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100/70 dark:border-gray-700 transition-all hover:border-slate-300 dark:hover:border-gray-600 group cursor-pointer"
                                        onClick={(e) => handleItemClick(e, bookmark)}
                                      >
                                        <div className="flex-1 min-w-0 space-y-0.5">
                                          <div className="flex items-center gap-1.5">
                                            <Building2 size={11} className="text-blue-500 shrink-0" />
                                            <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate">
                                              {normalized.buildingName}
                                            </p>
                                          </div>
                                          <div className="pl-4.5 space-y-0.5">
                                            {normalized.address && (
                                              <p className="text-[9px] text-gray-400 dark:text-gray-500 font-normal truncate">
                                                {normalized.address}
                                              </p>
                                            )}
                                            {(normalized.manufacturerName || normalized.elvtrModel || normalized.installationDe) && (
                                              <div className="flex items-center gap-1 flex-wrap text-[9px] text-gray-500 dark:text-gray-400 font-normal">
                                                {normalized.manufacturerName && (
                                                  <span className="font-bold text-gray-700 dark:text-gray-300">{normalized.manufacturerName}</span>
                                                )}
                                                {normalized.elvtrModel && (
                                                  <>{normalized.manufacturerName && <span className="text-gray-300 dark:text-gray-600">·</span>}
                                                  <span className="text-blue-600 dark:text-blue-400 font-semibold">{normalized.elvtrModel}</span></>
                                                )}
                                                {normalized.installationDe && (
                                                  <>{(normalized.manufacturerName || normalized.elvtrModel) && <span className="text-gray-300 dark:text-gray-600">·</span>}
                                                  <span>{normalized.installationDe}</span></>
                                                )}
                                              </div>
                                            )}
                                            <p className="text-[9px] text-gray-400 dark:text-gray-500 font-normal">
                                              {normalized.elevatorNo}{normalized.displayTimestamp ? ` · ${normalized.displayTimestamp}` : ''}
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          onClick={(e) => handleDeleteBookmark(e, bookmark.elevator_no)}
                                          className="shrink-0 p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all self-center"
                                          title="북마크 삭제"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {totalPages > 1 && (
                                    <Pagination
                                      currentPage={currentPage}
                                      totalPages={totalPages}
                                      onPageChange={(page: number) => setFolderPageState(prev => ({ ...prev, [folder.id]: page }))}
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* New folder input - placed after folder list */}
                    <div className="flex gap-1.5 pt-2 mt-2">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
                        placeholder="새 폴더명"
                        className="flex-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-[11px] text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleCreateFolder}
                        disabled={!newFolderName.trim()}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-[11px] font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-40"
                      >
                        <FolderPlus size={11} /> 추가
                      </button>
                    </div>
                  </div>
                )}

                {bookmarks.length === 0 && !bookmarksLoading && (
                  <p className="text-xs text-gray-400 text-center py-3">북마크 없음</p>
                )}
              </div>
            )}
          </div>

          {/* Search History */}
          <div
            className="border-t border-gray-100 dark:border-gray-800 pt-4 cursor-pointer"
            onClick={() => toggleAccordion('searchHistory')}
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <MapPin size={16} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">검색 히스토리</h4>
                {searchHistory.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs rounded-full font-bold">
                    {searchHistory.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {searchHistory.length > 0 && (
                  <button
                    onClick={clearSearchHistory}
                    className="text-[11px] font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded transition-colors"
                  >
                    전체 삭제
                  </button>
                )}
                <span className="text-gray-400 dark:text-gray-500 text-xs p-1">
                  {showSearchHistory ? '▼' : '▶'}
                </span>
              </div>
            </div>

            {showSearchHistory && (
              <div>
                {searchHistory.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">검색 히스토리 없음</p>
                ) : (
                  <>
                    <div className="space-y-1.5 mb-3">
                      {pageSearchHistoryItems.map((h, idx) => (
                        <div
                          key={searchHistoryStartIdx + idx}
                          className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100/70 dark:border-gray-700 transition-all hover:border-slate-300 dark:hover:border-gray-600 group cursor-pointer"
                          onClick={(e) => handleHistoryClick(e, h)}
                        >
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              {h.elevatorNo ? (
                                <Hash size={11} className="text-blue-500 shrink-0" />
                              ) : (
                                <MapPin size={11} className="text-emerald-500 shrink-0" />
                              )}
                              <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate">
                                {getSearchTitle(h)}
                              </p>
                            </div>
                            <div className="pl-4.5 space-y-0.5">
                              {h.elvtrModel && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[9px] font-medium rounded-full">
                                  <Cpu size={8} />
                                  {h.elvtrModel}
                                </span>
                              )}
                              <p className="text-[9px] text-gray-400 dark:text-gray-500 font-normal">
                                {new Date(h.timestamp).toLocaleString('ko-KR')}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleDeleteSearchHistory(e, h.timestamp)}
                            className="shrink-0 p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all self-center"
                            title="히스토리 삭제"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {searchHistoryTotalPages > 1 && (
                      <Pagination
                        currentPage={searchHistoryPage}
                        totalPages={searchHistoryTotalPages}
                        onPageChange={setSearchHistoryPage}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* View History */}
          <div
            className="border-t border-gray-100 dark:border-gray-800 pt-4 cursor-pointer"
            onClick={() => toggleAccordion('viewHistory')}
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Eye size={16} className="text-blue-500 dark:text-blue-400 shrink-0" />
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">조회 히스토리</h4>
                {viewHistory.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full font-bold">
                    {viewHistory.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {viewHistory.length > 0 && (
                  <button
                    onClick={clearViewHistory}
                    className="text-[11px] font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded transition-colors"
                  >
                    전체 삭제
                  </button>
                )}
                <span className="text-gray-400 dark:text-gray-500 text-xs p-1">
                  {showViewHistory ? '▼' : '▶'}
                </span>
              </div>
            </div>

            {showViewHistory && (
              <div>
                {viewHistory.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">조회 히스토리 없음</p>
                ) : (
                  <>
                    <div className="space-y-1.5 mb-3">
                      {pageViewHistoryItems.map((h, idx) => {
                        const normalized = normalizeItem(h);
                        return (
                          <div
                            key={viewHistoryStartIdx + idx}
                            className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100/70 dark:border-gray-700 transition-all hover:border-slate-300 dark:hover:border-gray-600 group cursor-pointer"
                            onClick={(e) => handleItemClick(e, h)}
                          >
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <Building2 size={11} className="text-blue-500 shrink-0" />
                                <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate">
                                  {normalized.buildingName}
                                </p>
                              </div>
                              <div className="pl-4.5 space-y-0.5">
                                {normalized.address && (
                                  <p className="text-[9px] text-gray-400 dark:text-gray-500 font-normal truncate">
                                    {normalized.address}
                                  </p>
                                )}
                                {(normalized.manufacturerName || normalized.elvtrModel || normalized.installationDe) && (
                                  <div className="flex items-center gap-1 flex-wrap text-[9px] text-gray-500 dark:text-gray-400 font-normal">
                                    {normalized.manufacturerName && (
                                      <span className="font-bold text-gray-700 dark:text-gray-300">{normalized.manufacturerName}</span>
                                    )}
                                    {normalized.elvtrModel && (
                                      <>{normalized.manufacturerName && <span className="text-gray-300 dark:text-gray-600">·</span>}
                                      <span className="text-blue-600 dark:text-blue-400 font-semibold">{normalized.elvtrModel}</span></>
                                    )}
                                    {normalized.installationDe && (
                                      <>{(normalized.manufacturerName || normalized.elvtrModel) && <span className="text-gray-300 dark:text-gray-600">·</span>}
                                      <span>{normalized.installationDe}</span></>
                                    )}
                                  </div>
                                )}
                                <p className="text-[9px] text-gray-400 dark:text-gray-500 font-normal">
                                  {normalized.elevatorNo} · {normalized.displayTimestamp}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDeleteViewHistory(e, h.timestamp)}
                              className="shrink-0 p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all self-center"
                              title="히스토리 삭제"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {viewHistoryTotalPages > 1 && (
                      <Pagination
                        currentPage={viewHistoryPage}
                        totalPages={viewHistoryTotalPages}
                        onPageChange={setViewHistoryPage}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
