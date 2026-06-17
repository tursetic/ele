import React, { useEffect, useState, useRef } from 'react';
import {
  X, MapPin, AlertTriangle, Loader2, ChevronDown, ChevronUp,
  Building2, Bookmark, Folder, FolderPlus
} from 'lucide-react';
import { ElevatorWithBadges, InspectionRecord, SettingsFields, BookmarkFolder } from '../types';
import { fetchInspectionHistory } from '../types'; // App.tsx의 유입 구조 상속 동기화
import { fetchInspectionHistory as fetchHistoryApi } from '../utils/api';
import { checkShuttleSection, formatDate, formatRatedSpeed, formatElevatorNo, getStatusBadgeClass } from '../utils/elevatorHelpers';
import { addBookmark, removeBookmark, isBookmarked, detectBookmarkChanges, updateBookmarkData, setGlobalChanges, getFolders, createFolder } from '../utils/bookmarks';

interface Props {
  elevator: ElevatorWithBadges;
  settings: SettingsFields;
  onClose: () => void;
  onNavigateToMap?: (elevator: ElevatorWithBadges) => void;
}

function getModelColorClass(manufacturerName?: string): string {
  const name = manufacturerName || '';
  if (name.includes('현대엘')) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  if (name.includes('오티스엘')) {
    return 'text-indigo-600 dark:text-indigo-400';
  }
  if (name.includes('티케이엘')) {
    return 'text-sky-500 dark:text-sky-400';
  }
  if (name.includes('미쓰비시') || name.includes('후지테크')) {
    return 'text-red-500 dark:text-red-400';
  }
  return 'text-[#8B4513] dark:text-[#EAA850]';
}

// 대시 전용 유효값 판별 헬퍼 (공백 유령 문자 및 -, -- 전수 필터링)
const isValidVal = (val: any) => val && val.trim() !== '' && val !== '-' && !/^-+$/.test(val.trim());

function GridCell({ label, value, show = true, className = "" }: { label: string; value?: string | null; show?: boolean; className?: string }) {
  // 요구사항 2) 대시만 무한히 존재하는 유령 데이터 분기 차단 원천 봉쇄
  if (!show || !value || !isValidVal(value)) return null;
  return (
    <div className={`flex items-center justify-between gap-1 px-2 py-0.5 bg-slate-50/50 dark:bg-gray-800/40 rounded-lg border border-slate-100/40 dark:border-gray-800/30 text-[11.5px] ${className}`}>
      <span className="text-slate-400 dark:text-gray-500 font-medium shrink-0">{label}</span>
      <span className="font-medium text-slate-800 dark:text-gray-200 text-right truncate pl-1">{value}</span>
    </div>
  );
}

function DashboardCard({ title, children }: { title: string; children: React.ReactNode }) {
  const visibleCount = React.Children.toArray(children).filter(Boolean).length;
  if (visibleCount === 0) return null;
  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1 mb-0.5 px-0.5">
        <span className="text-[9.5px] font-black text-slate-400 dark:text-gray-500 tracking-wider uppercase">{title}</span>
      </div>
      <div className="bg-white dark:bg-gray-800 border border-slate-200/50 dark:border-gray-700/50 rounded-xl p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
        <div className="grid grid-cols-2 gap-1">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ElevatorModal({ elevator: el, settings: s, onClose, onNavigateToMap }: Props) {
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [loadingInspect, setLoadingInspect] = useState(true);
  const [showAllInspect, setShowAllInspect] = useState(false);
  const [hideRegularPass, setHideRegularPass] = useState(() => {
    try {
      return localStorage.getItem('hideRegularPass') === 'true';
    } catch (_) { return false; }
  });
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(true);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const folderTriggerRef = useRef<HTMLButtonElement>(null);
  const [newFolderName, setNewFolderName] = useState('');

  const toggleHideRegularPass = () => {
    const next = !hideRegularPass;
    setHideRegularPass(next);
    try { localStorage.setItem('hideRegularPass', String(next)); } catch (_) {}
  };

  useEffect(() => {
    if (!showFolderPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = folderTriggerRef.current?.contains(target);
      const clickedPopup = folderPickerRef.current?.contains(target);
      if (!clickedTrigger && !clickedPopup) {
        setShowFolderPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFolderPicker]);

  useEffect(() => {
    if (!showFolderPicker) return;
    const handleScroll = () => setShowFolderPicker(false);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [showFolderPicker]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const hadPushState = !history.state?.modalOpen;
    if (hadPushState) history.pushState({modalOpen: true}, '');
    const onPopState = (e: PopStateEvent) => {
      onClose();
    };
    window.addEventListener('popstate', onPopState);
    
    const settingsMenuOpen = (window as any).__settingsMenuOpen;
    const prevOverflow = document.body.style.overflow || '';
    if (!settingsMenuOpen) {
      document.body.style.overflow = 'hidden';
    }
    (window as any).__elevatorModalOpen = true;
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
      (window as any).__elevatorModalOpen = false;
      if (hadPushState && history.state?.modalOpen) {
        history.replaceState(history.state._prev || {}, '');
      }
      if ((window as any).__settingsMenuOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    };
  }, [onClose]);

  useEffect(() => {
    setLoadingInspect(true);
    setBookmarkLoading(true);
    const controller = new AbortController();

    Promise.all([
      fetchHistoryApi(el.elevatorNo, 1, controller.signal).then((data) => {
        if (controller.signal.aborted) return;
        const sorted = [...data.records].sort((a, b) => b.inspctDt.localeCompare(a.inspctDt));
        setInspections(sorted);
      }).catch(() => {
        if (controller.signal.aborted) return;
        setInspections([]);
      }),
      isBookmarked(el.elevatorNo).then((result) => {
        if (controller.signal.aborted) return;
        setBookmarked(result);
        if (result) {
          const detectedChanges = detectBookmarkChanges(el);
          if (detectedChanges.length > 0) {
            updateBookmarkData(el);
            setGlobalChanges(detectedChanges);
          }
        }
      }).catch(() => {}).finally(() => {
        if (!controller.signal.aborted) setBookmarkLoading(false);
      })
    ]).finally(() => {
      if (!controller.signal.aborted) setLoadingInspect(false);
    });

    return () => {
      controller.abort();
    };
  }, [el.elevatorNo]);

  const handleToggleBookmark = async () => {
    if (bookmarked) {
      setBookmarkLoading(true);
      try {
        await removeBookmark(el.elevatorNo);
        setBookmarked(false);
      } catch (err) {
        console.error('Bookmark action failed:', err);
      } finally {
        setBookmarkLoading(false);
      }
    } else {
      setShowFolderPicker(true);
      getFolders().then(setFolders).catch(() => {});
    }
  };

  const handleAddToFolder = async (folderId: string | null) => {
    setBookmarkLoading(true);
    setShowFolderPicker(false);
    try {
      await addBookmark(el, folderId);
      setBookmarked(true);
      const detectedChanges = detectBookmarkChanges(el);
      if (detectedChanges.length > 0) {
        updateBookmarkData(el);
        setGlobalChanges(detectedChanges);
      }
    } catch (err) {
      console.error('Bookmark action failed:', err);
    } finally {
      setBookmarkLoading(false);
    }
  };

  const shuttle = checkShuttleSection(el.shuttleSection);
  const hasReplacement = el.frstInstallationDe && el.installationDe && el.frstInstallationDe !== el.installationDe;
  const recentEmergencyInspect = inspections.find((r) => r.inspctKind === '수시검사');
  const filteredInspections = hideRegularPass
    ? inspections.filter((r) => !(r.inspctKind === '정기검사' && r.psexamYn === '합격'))
    : inspections;
  const displayedInspections = (hideRegularPass || showAllInspect) ? filteredInspections : filteredInspections.slice(0, 4);

  const statusBadgeClass = getStatusBadgeClass(el.elvtrStts || '');
  const modelColorClass = getModelColorClass(el.manufacturerName);

  const hasBasicInfo = s.elvtrDivNm || s.elvtrFormNm || s.elvtrKindNm || s.elvtrModel || s.elvtrStts;
  const hasInstallInfo = s.frstInstallationDe || s.installationDe;
  const hasMaintenanceInfo = s.subcntrCpny || s.mntCpnyNm || s.mntCpnyTelno || s.partcpntNm || s.partcpntTelno;
  const hasMaintenanceData = el.subcntrCpny || el.mntCpnyNm || el.mntCpnyTelno || el.partcpntNm || el.partcpntTelno;

  const asignNo = (el.elvtrAsignNo || '').trim().replace(/호기$|호$/, '');
  const displayAsign = asignNo ? `${asignNo}호기` : '승강기';
  
  const displayAsignWithPlace = el.installationPlace 
    ? `${displayAsign} (${el.installationPlace.trim()})` 
    : displayAsign;

  const resmptDe = (el as any).elvtrResmptDe || (el as any).resmptDe;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" data-modal="elevator-detail" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-xs" onClick={onClose} />

      <div className="relative mt-auto bg-slate-50 dark:bg-gray-950 rounded-t-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="flex justify-center pt-2 pb-0.5 shrink-0 bg-white dark:bg-gray-900 rounded-t-2xl">
          <div className="w-9 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>

        <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 border-b border-gray-100 dark:border-gray-800 px-4 pb-1 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Building2 size={14} className="text-blue-500 shrink-0" />
                <h2 className="text-[14.5px] font-black text-gray-900 dark:text-gray-100 truncate tracking-tight">{el.buldNm || '건물명 없음'}</h2>
                {el.isTopGround && <span className="bg-amber-50/40 dark:bg-amber-950/10 text-amber-600/90 dark:text-amber-500/80 border border-amber-200/30 text-[8.5px] font-normal rounded px-1 shrink-0">최고층</span>}
                {el.isDeepUnderground && <span className="bg-slate-100 dark:bg-gray-800 text-slate-500 text-[8.5px] font-normal rounded px-1 shrink-0">최저층</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {s.elvtrStts && el.elvtrStts && <span className={`px-1.5 py-0.25 text-[10px] font-bold rounded border tracking-tight ${statusBadgeClass}`}>{el.elvtrStts}</span>}
                <span className="px-1.5 py-0.25 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 text-[9.5px] font-bold rounded border border-slate-200/40 dark:border-gray-600/40 shrink-0">{displayAsignWithPlace}</span>
                <span className="px-1.5 py-0.25 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 text-[9.5px] font-bold rounded border border-slate-200/40 dark:border-gray-600/40 shrink-0 tracking-tight">{formatElevatorNo(el.elevatorNo)}</span>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 relative">
              <div ref={folderPickerRef}>
                <button
                  ref={folderTriggerRef}
                  onClick={handleToggleBookmark}
                  disabled={bookmarkLoading}
                  className={`p-1.5 rounded-xl transition-all ${bookmarked ? 'bg-yellow-500/10 text-yellow-500' : 'text-gray-400'}`}
                >
                  <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />
                </button>
                {showFolderPicker && !bookmarked && (
                  <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[140px] z-[9999]">
                    <button onClick={() => handleAddToFolder(null)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"><Bookmark size={11} /> 폴더 없음</button>
                    {folders.map(f => (
                      <button key={f.id} onClick={() => handleAddToFolder(f.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <Folder size={11} className={f.active ? 'text-yellow-500' : 'text-gray-400'} fill={f.active ? 'currentColor' : 'none'} />
                        <span className="truncate">{f.name}</span>
                      </button>
                    ))}
                    <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1 px-2">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              e.preventDefault();
                              const name = newFolderName.trim();
                              if (!name) return;
                              const folder = await createFolder(name);
                              setFolders(prev => [...prev, folder]);
                              setNewFolderName('');
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          placeholder="새 폴더"
                          className="flex-1 min-w-0 px-1.5 py-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-[10px] text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const name = newFolderName.trim();
                            if (!name) return;
                            const folder = await createFolder(name);
                            setFolders(prev => [...prev, folder]);
                            setNewFolderName('');
                          }}
                          className="p-1 text-blue-500 hover:text-blue-600 shrink-0"
                          title="폴더 생성"
                        >
                          <FolderPlus size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} className="text-gray-500" /></button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-3 py-1 pb-3 space-y-1.5">

          {/* 🎯 [완치 1] 수시검사 알림 박스 다크 모드 고대비 테두리 가드 바인딩 (dark:border-red-900/50) */}
          {recentEmergencyInspect && (
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/50 rounded-xl px-2.5 py-1 flex items-center gap-2 text-[11px] font-bold text-red-700 dark:text-red-400 shadow-none">
              <AlertTriangle size={11} className="shrink-0" />
              <span>수시검사 이력이 있습니다. ({formatDate(recentEmergencyInspect.inspctDt)})</span>
            </div>
          )}

          <div
            onClick={() => {
              if (onNavigateToMap && el.address1) {
                onNavigateToMap(el);
              }
            }}
            className={`bg-white dark:bg-gray-800 border border-slate-200/40 dark:border-gray-700/50 rounded-xl px-2.5 py-0.5 flex flex-col gap-0 text-[11.5px] text-gray-600 dark:text-gray-400 shadow-none ${
              onNavigateToMap && el.address1 ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700/50 active:scale-[0.98] transition-all' : ''
            }`}
          >
            <div className="flex items-center gap-2 py-0">
              <MapPin size={12} className="text-blue-500 shrink-0" />
              <p className="truncate flex-1 font-medium">{el.address1} <span className="text-slate-400 font-normal">{el.address2 || ''}</span></p>
              {onNavigateToMap && el.address1 && (
                <span className="text-[9px] text-blue-500 dark:text-blue-400 font-medium shrink-0">지도</span>
              )}
            </div>
            {s.buldPrpos && el.buldPrpos && (
              <span className="block pl-5 text-slate-400/80 dark:text-gray-500/70 text-[9px] font-normal leading-none pb-0.5">{el.buldPrpos}</span>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 border border-slate-200/60 dark:border-gray-700/60 rounded-xl p-2.5 shadow-none flex flex-col space-y-1 relative">
            <div className="flex items-baseline gap-1.5 flex-wrap text-[14.5px]">
              <span className="text-slate-900 dark:text-gray-100 font-black tracking-tight shrink-0">{el.manufacturerName || '제조사 미기재'}</span>
              <span className="text-slate-200 dark:text-gray-700 text-xs font-normal shrink-0">|</span>
              <span className={`${modelColorClass} font-black tracking-tight truncate flex-1`}>{el.elvtrModel || '모델명 미기재'}</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap">
              <span className={`px-1.5 py-0.25 rounded border text-[9.5px] font-bold ${`shuttle` in window && !(window as any).shuttle?.valid ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50' : 'bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-700/40'}`}>{el.shuttleSection || '전층'} 운행</span>
              <span className="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded text-[10.5px] font-bold">{formatRatedSpeed(el.ratedSpeed)}</span>
              <span className="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded text-[10.5px] font-bold">{el.liveLoad ? `${String(el.liveLoad).replace(/kg/gi, '').trim()} kg` : '-'}</span>
            </div>

            <div className="text-[11px] text-slate-400 dark:text-gray-500 pt-0.5 border-t border-slate-100 dark:border-gray-700/60 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="flex flex-col gap-0 leading-none">
                  {hasReplacement ? (
                    <>
                      <span className="font-semibold text-slate-600 dark:text-gray-400 text-[11px] leading-tight">교체 {formatDate(el.installationDe)}</span>
                      <span className="text-slate-400 dark:text-gray-500 text-[9.5px] font-medium leading-tight">최초설치 {formatDate(el.frstInstallationDe)}</span>
                    </>
                  ) : el.installationDe ? (
                    <span className="font-semibold text-slate-600 dark:text-gray-400 text-[11px] leading-tight">설치 {formatDate(el.installationDe)}</span>
                  ) : null}
                </div>
                {s.elvtrKindNm && el.elvtrKindNm && (
                  <span className="px-1.5 py-0.25 text-[10px] font-bold border border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 rounded shrink-0 tracking-tight self-center">
                    {el.elvtrKindNm}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {hasBasicInfo && (
            <DashboardCard title="제원 및 규격">
              <GridCell label="승강기 구분" value={el.elvtrDivNm} show={s.elvtrDivNm} />
              <GridCell label="승강기 형식" value={el.elvtrFormNm} show={s.elvtrFormNm} />
              <GridCell label="운행층수" value={el.shuttleFloorCnt ? `${el.shuttleFloorCnt.trim().replace(/개층|층/g, '')}개 층` : null} />
              <GridCell label="지상·지하" value={`▵${el.divGroundFloorCnt || '-'} ▿${el.divUndgrndFloorCnt || '-'}`} />
              <GridCell label="적재하중" value={el.liveLoad} show={s.liveLoad} />
              <GridCell label="최대정원" value={el.ratedCap} show={s.ratedCap} />
            </DashboardCard>
          )}

          {hasInstallInfo && (
            <DashboardCard title="설치 및 검사 정보">
              <GridCell label="최초설치일" value={formatDate(el.frstInstallationDe)} show={s.frstInstallationDe} />
              <GridCell label="설치일자" value={formatDate(el.installationDe)} show={s.installationDe} />
              
              <GridCell label="최종검사결과" value={el.lastResultNm} />
              {isValidVal(resmptDe) ? (
                <GridCell label="운행 재개일" value={formatDate(resmptDe)} />
              ) : (
                <div className="opacity-0 pointer-events-none select-none" aria-hidden="true" />
              )}
              
              {isValidVal(el.pauseAblDe) ? <GridCell label="휴폐지일자" value={formatDate(el.pauseAblDe)} /> : null}
              {isValidVal(el.pauseAblDe) && (isValidVal(el.pauseAbleResn) ? <GridCell label="휴폐지사유" value={el.pauseAbleResn} /> : <div className="opacity-0 pointer-events-none select-none" aria-hidden="true" />)}
            </DashboardCard>
          )}

          {hasMaintenanceInfo && hasMaintenanceData && (
            <DashboardCard title="유지관리 정보">
              <GridCell label="보수업체명" value={el.mntCpnyNm} show={s.mntCpnyNm} />
              <GridCell label="업체연락처" value={el.mntCpnyTelno} show={s.mntCpnyTelno} />
              <GridCell label="관리주체명" value={el.partcpntNm} show={s.partcpntNm} />
              <GridCell label="주체연락처" value={el.partcpntTelno} show={s.partcpntTelno} />
            </DashboardCard>
          )}

          <div className="pt-0.5">
            <div className="flex items-center justify-between mb-0.5 px-0.5">
              <div className="flex items-center gap-1">
                <div className="w-1 h-3 bg-blue-500 rounded-full" />
                <h4 className="text-[10.5px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">검사 이력</h4>
              </div>
              {inspections.length > 0 && (
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${hideRegularPass ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} onClick={toggleHideRegularPass}>
                    {hideRegularPass && <svg viewBox="0 0 10 8" width="6" height="4" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span className="text-[9.5px] text-gray-500 font-bold" onClick={toggleHideRegularPass}>정기검사 합격 숨기기</span>
                </label>
              )}
            </div>

            {loadingInspect ? (
              <div className="flex items-center justify-center py-2 text-xs text-gray-400 font-medium">
                <Loader2 size={12} className="animate-spin text-blue-400" /> 데이터 로딩 중...
              </div>
            ) : inspections.length === 0 ? (
              <p className="text-center py-2 text-xs text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200">검사 이력이 존재하지 않습니다.</p>
            ) : (
              <div className="space-y-1">
                {displayedInspections.map((record, idx) => {
                  const isEmergency = record.inspctKind === '수시검사';
                  const isRegular = record.inspctKind === '정기검사';
                  const isFailed = record.psexamYn === '불합격';
                  const isPassed = record.psexamYn === '합격';
                  const isConditional = record.psexamYn && !isPassed && !isFailed;

                  // 🎨 [완치 2] 검사 이력 카드 배경 및 테두리 다크 모드 최적화 (dark:border-red-900/50 등 반영)
                  let cardBg = 'bg-white dark:bg-gray-800 border-slate-200/40 dark:border-gray-700/60';
                  if (isFailed) {
                    cardBg = 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50';
                  } else if (isEmergency) {
                    cardBg = 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/50';
                  } else if (!isRegular) {
                    cardBg = 'bg-slate-100/70 dark:bg-slate-800/60 border-slate-200/40 dark:border-gray-700/50';
                  }

                  const resultChip = isFailed
                    ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/60'
                    : isConditional
                    ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/60'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/60';

                  return (
                    <div key={idx} className={`rounded-xl px-2.5 py-1.5 border text-xs flex flex-col gap-0.5 ${cardBg}`}>
                      {/* 🎯 [완치 3] 배지 간의 수평 정렬 간격을 gap-1.5에서 gap-1로 좁혀 파편화 소멸 */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          <span className="px-1 py-0.5 rounded bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-gray-600 text-[10.5px] font-bold shrink-0">{record.inspctKind || '-'}</span>
                          <span className={`px-1.5 py-0.5 rounded font-normal text-[10.5px] shrink-0 whitespace-nowrap ${resultChip}`}>{record.psexamYn}</span>
                          <p className="text-slate-400/70 dark:text-gray-500/70 text-[9.5px] font-normal truncate flex-1 min-w-0 ml-0.5">{record.inspctInsttNm || '-'}</p>
                        </div>
                        <span className="font-normal shrink-0 text-[10.5px] text-slate-600 dark:text-gray-400 tracking-tight">{formatDate(record.inspctDt)}</span>
                      </div>
                      
                      {/* 🎯 [완치 4] 줄 간격 마진 패딩 최소 밀착 오더 완치 (mt-0 및 leading-tight 제어 추가) */}
                      {(record.applcBeDt || record.applcEnDt) && (
                        <p className="text-slate-400 dark:text-gray-400 pl-1 text-[10.5px] font-normal mt-0 leading-tight">
                          유효기간 {formatDate(record.applcBeDt)} ~ {formatDate(record.applcEnDt)}
                        </p>
                      )}
                    </div>
                  );
                })}

                {!hideRegularPass && filteredInspections.length > 4 && (
                  <button
                    onClick={() => setShowAllInspect(!showAllInspect)}
                    className="w-full py-1 text-[11px] font-bold text-blue-600 hover:bg-white dark:hover:bg-gray-800 border border-slate-200/40 rounded-lg transition-all mt-0.5"
                  >
                    {showAllInspect ? '검사 이력 접기' : `전체 이력 더 보기 (${filteredInspections.length - 4}건)`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}