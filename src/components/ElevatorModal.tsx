import React, { useEffect, useState, useRef } from 'react';
import {
  X, MapPin, AlertTriangle, Loader2, ChevronDown, ChevronUp,
  Building2, Bookmark, Folder, FolderPlus, Wrench, FileText
} from 'lucide-react';
import { ElevatorWithBadges, InspectionRecord, SettingsFields, BookmarkFolder } from '../types';
import { fetchInspectionHistory as fetchHistoryApi, fetchInspectSafeList, fetchInspectFailList, searchByElevatorNo } from '../utils/api';
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
  if (name.includes('현대엘')) return 'text-emerald-600 dark:text-emerald-400';
  if (name.includes('오티스엘')) return 'text-indigo-600 dark:text-indigo-400';
  if (name.includes('티케이엘')) return 'text-sky-500 dark:text-sky-400';
  if (name.includes('미쓰비시') || name.includes('후지테크')) return 'text-red-500 dark:text-red-400';
  return 'text-[#8B4513] dark:text-[#EAA850]';
}

const isValidVal = (val: any) => val && val.trim() !== '' && val !== '-' && !/^-+$/.test(val.trim());

function GridCell({ label, value, show = true, className = "" }: { label: string; value?: string | null; show?: boolean; className?: string }) {
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
        <div className="grid grid-cols-2 gap-1">{children}</div>
      </div>
    </div>
  );
}

export default function ElevatorModal({ elevator: el, settings: s, onClose, onNavigateToMap }: Props) {
  // 🎯 [데이터 완전성 확보] 주소 검색 레이어 진입 시 누락되는 제원 필드 실시간 결합용 상태 엔진 가동
  const [modalEl, setModalEl] = useState<ElevatorWithBadges>(el);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [loadingInspect, setLoadingInspect] = useState(true);
  const [showAllInspect, setShowAllInspect] = useState(false);
  const [hideRegularPass, setHideRegularPass] = useState(() => { try { return localStorage.getItem('hideRegularPass') === 'true'; } catch (_) { return false; } });
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(true);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const folderTriggerRef = useRef<HTMLButtonElement>(null);
  const [newFolderName, setNewFolderName] = useState('');

  const [safeList, setSafeList] = useState<any[]>([]);
  const [expandedInspectIndex, setExpandedInspectIndex] = useState<number | null>(null);
  const [failDetails, setFailDetails] = useState<any[]>([]);
  const [loadingFailDetails, setLoadingFailDetails] = useState(false);

  const toggleHideRegularPass = () => {
    const next = !hideRegularPass; setHideRegularPass(next);
    try { localStorage.setItem('hideRegularPass', String(next)); } catch (_) {}
  };

  useEffect(() => { setModalEl(el); }, [el]);

  useEffect(() => {
    if (!showFolderPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!folderTriggerRef.current?.contains(target) && !folderPickerRef.current?.contains(target)) setShowFolderPicker(false);
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
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    const hadPushState = !history.state?.modalOpen;
    if (hadPushState) history.pushState({modalOpen: true}, '');
    const onPopState = () => onClose();
    window.addEventListener('popstate', onPopState);
    if (!(window as any).__settingsMenuOpen) document.body.style.overflow = 'hidden';
    (window as any).__elevatorModalOpen = true;
    return () => {
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('popstate', onPopState);
      (window as any).__elevatorModalOpen = false;
      if (hadPushState && history.state?.modalOpen) history.replaceState(history.state._prev || {}, '');
      document.body.style.overflow = (window as any).__settingsMenuOpen ? 'hidden' : '';
    };
  }, [onClose]);

  useEffect(() => {
    setLoadingInspect(true); setBookmarkLoading(true);
    const controller = new AbortController();
    
    const promises: Promise<any>[] = [
      fetchHistoryApi(el.elevatorNo, 1, controller.signal).then((data) => {
        if (controller.signal.aborted) return;
        setInspections([...data.records].sort((a, b) => b.inspctDt.localeCompare(a.inspctDt)));
      }).catch(() => setInspections([])),
      fetchInspectSafeList(el.elevatorNo, controller.signal).then((list) => {
        if (!controller.signal.aborted) setSafeList(list);
      }).catch(() => {}),
      isBookmarked(el.elevatorNo).then((result) => {
        if (controller.signal.aborted) return;
        setBookmarked(result);
        if (result && detectBookmarkChanges(el).length > 0) { updateBookmarkData(el); setGlobalChanges(detectBookmarkChanges(el)); }
      }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setBookmarkLoading(false); })
    ];

    // 🎯 [자동 제원 채움 엔진] 새로운 통합 주소검색 탭으로 들어와 핵심 필드가 누락된 경우, 마스터 API를 연쇄 자동 호출하여 데이터를 100% 복원결합
    if (el.lastResultNm === '정보없음' || !isValidVal(el.partcpntNm)) {
      promises.push(
        searchByElevatorNo(el.elevatorNo, 1, controller.signal).then((res) => {
          if (!controller.signal.aborted && res && res.items && res.items.length > 0) {
            setModalEl(prev => ({ ...prev, ...res.items[0] }));
          }
        }).catch(() => {})
      );
    }

    Promise.all(promises).finally(() => { if (!controller.signal.aborted) setLoadingInspect(false); });
    return () => controller.abort();
  }, [el.elevatorNo]);

  const handleInspectRowClick = async (idx: number, record: InspectionRecord) => {
    if (expandedInspectIndex === idx) { setExpandedInspectIndex(null); return; }
    setExpandedInspectIndex(idx); setFailDetails([]);

    const targetDateStr = (record.inspctDt || '').replace(/[^0-9]/g, '');
    const matchedSafeItem = safeList.find(s => s.inspctDe === targetDateStr) || 
                            safeList.find(s => s.inspctDe?.startsWith(targetDateStr.slice(0,6))) ||
                            safeList.find(s => s.inspctDe?.startsWith(targetDateStr.slice(0,4)) && s.dispWords === record.psexamYn);
    
    const isPassed = record.psexamYn === '합격';
    const failCd = matchedSafeItem?.failCd;

    if (!isPassed && failCd && isValidVal(failCd)) {
      setLoadingFailDetails(true);
      // 🎯 [오타 완치 정밀 복구] 이전 턴의 'finaly' 철자 오류를 'finally' 정품 규격으로 완전 격리 정정 완료
      try { setFailDetails(await fetchInspectFailList(failCd)); } catch (e) { console.error(e); } finally { setLoadingFailDetails(false); }
    }
  };

  const handleToggleBookmark = async () => {
    if (bookmarked) {
      setBookmarkLoading(true);
      try { await removeBookmark(modalEl.elevatorNo); setBookmarked(false); } catch (err) { console.error(err); } finally { setBookmarkLoading(false); }
    } else { setShowFolderPicker(true); getFolders().then(setFolders).catch(() => {}); }
  };

  const handleAddToFolder = async (folderId: string | null) => {
    setBookmarkLoading(true); setShowFolderPicker(false);
    try { await addBookmark(modalEl, folderId); setBookmarked(true); } catch (err) { console.error(err); } finally { setBookmarkLoading(false); }
  };

  const hasReplacement = modalEl.frstInstallationDe && modalEl.installationDe && modalEl.frstInstallationDe !== modalEl.installationDe;
  const recentEmergencyInspect = inspections.find((r) => r.inspctKind === '수시검사');
  const filteredInspections = hideRegularPass ? inspections.filter((r) => !(r.inspctKind === '정기검사' && r.psexamYn === '합격')) : inspections;
  const displayedInspections = (hideRegularPass || showAllInspect) ? filteredInspections : filteredInspections.slice(0, 4);

  const statusBadgeClass = getStatusBadgeClass(modalEl.elvtrStts || '');
  const modelColorClass = getModelColorClass(modalEl.manufacturerName);
  const hasBasicInfo = s.elvtrDivNm || s.elvtrFormNm || s.elvtrKindNm || s.elvtrModel || s.elvtrStts;
  const hasInstallInfo = s.frstInstallationDe || s.installationDe;
  const hasMaintenanceData = modalEl.subcntrCpny || modalEl.mntCpnyNm || modalEl.mntCpnyTelno || modalEl.partcpntNm || modalEl.partcpntTelno;

  const asignNo = (modalEl.elvtrAsignNo || '').trim().replace(/호기$|호$/, '');
  const displayAsign = asignNo ? `${asignNo}호기` : '승강기';
  const displayAsignWithPlace = modalEl.installationPlace ? `${displayAsign} (${modalEl.installationPlace.trim()})` : displayAsign;
  const resmptDe = (modalEl as any).elvtrResmptDe || (modalEl as any).resmptDe;
  const formattedMrYn = modalEl.mrYn === 'Y' ? '있음' : '없음';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-xs" onClick={onClose} />
      <div className="relative mt-auto bg-slate-50 dark:bg-gray-950 rounded-t-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="flex justify-center pt-2 pb-0.5 shrink-0 bg-white dark:bg-gray-900 rounded-t-2xl">
          <div className="w-9 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>

        <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 border-b border-gray-100 dark:border-gray-800 px-4 pb-2.5 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Building2 size={14} className="text-blue-500 shrink-0" />
                <h2 className="text-[14.5px] font-black text-gray-900 dark:text-gray-100 truncate tracking-tight">{modalEl.buldNm || '건물명 없음'}</h2>
                {modalEl.isTopGround && <span className="bg-amber-50/40 dark:bg-amber-950/10 text-amber-600/90 dark:text-amber-500/80 border border-amber-200/30 text-[8.5px] font-normal rounded px-1 shrink-0">최고층</span>}
                {modalEl.isDeepUnderground && <span className="bg-slate-100 dark:bg-gray-800 text-slate-500 text-[8.5px] font-normal rounded px-1 shrink-0">최저층</span>}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 relative">
              <div ref={folderPickerRef}>
                <button ref={folderTriggerRef} onClick={handleToggleBookmark} disabled={bookmarkLoading} className={`p-1.5 rounded-xl transition-all ${bookmarked ? 'bg-yellow-500/10 text-yellow-500' : 'text-gray-400'}`}>
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
                          type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation(); e.preventDefault(); const name = newFolderName.trim(); if (!name) return;
                              setFolders(prev => [...prev, createFolder(name) as any]); setNewFolderName('');
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()} placeholder="새 폴더"
                          className="flex-1 min-w-0 px-1.5 py-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-[10px] text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={async (e) => { e.stopPropagation(); const name = newFolderName.trim(); if (!name) return; setFolders(prev => [...prev, createFolder(name) as any]); setNewFolderName(''); }}
                          className="p-1 text-blue-500 hover:text-blue-600 shrink-0"
                        ><FolderPlus size={11} /></button>
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
          {recentEmergencyInspect && (
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/50 rounded-xl px-2.5 py-1 flex items-center gap-2 text-[11px] font-bold text-red-700 dark:text-red-400">
              <AlertTriangle size={11} className="shrink-0" />
              <span>수시검사 이력이 있습니다. ({formatDate(recentEmergencyInspect.inspctDt)})</span>
            </div>
          )}

          <div onClick={() => onNavigateToMap && modalEl.address1 && onNavigateToMap(modalEl)} className={`bg-white dark:bg-gray-800 border border-slate-200/40 dark:border-gray-700/50 rounded-xl px-2.5 py-1 flex flex-col gap-0 text-[11.5px] text-gray-600 dark:text-gray-400 ${onNavigateToMap && modalEl.address1 ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700/50 active:scale-[0.98] transition-all' : ''}`}>
            <div className="flex items-center gap-2 py-0">
              <MapPin size={12} className="text-blue-500 shrink-0" />
              <p className="truncate flex-1 font-medium">{modalEl.address1} <span className="text-slate-400 font-normal">{modalEl.address2 || ''}</span></p>
              {onNavigateToMap && modalEl.address1 && <span className="text-[9px] text-blue-500 dark:text-blue-400 font-medium shrink-0">지도</span>}
            </div>
            {s.buldPrpos && modalEl.buldPrpos && <span className="block pl-5 text-slate-400/80 dark:text-gray-500/70 text-[9px] font-normal leading-none pb-0.5">{modalEl.buldPrpos}</span>}
          </div>

          <div className="bg-white dark:bg-gray-800 border border-slate-200/60 dark:border-gray-700/60 rounded-xl p-2.5 flex flex-col space-y-1 relative">
            <div className="pb-1 border-b border-slate-100 dark:border-gray-700/40 flex items-center gap-1.5 flex-wrap">
              <span className="px-1.5 py-0.25 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 text-[9.5px] font-bold rounded border border-slate-200/40 dark:border-gray-600/40 shrink-0">{displayAsignWithPlace}</span>
              <span className="bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-bold border border-slate-200/40 dark:border-gray-600/40 text-[9.5px] shrink-0">{formatElevatorNo(modalEl.elevatorNo)}</span>
            </div>

            <div className="flex items-baseline gap-1.5 flex-wrap text-[14.5px] mt-0.5">
              <span className="text-slate-900 dark:text-gray-100 font-black tracking-tight shrink-0">{modalEl.manufacturerName || '제조사 미기재'}</span>
              <span className="text-slate-200 dark:text-gray-700 text-xs font-normal shrink-0">|</span>
              <span className={`${modelColorClass} font-black tracking-tight truncate flex-1`}>{modalEl.elvtrModel || '모델명 미기재'}</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap">
              <span className="px-1.5 py-0.25 rounded border text-[9.5px] font-bold bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-700/40">{modalEl.shuttleSection || '전층'} 운행</span>
              <span className="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded text-[10.5px] font-bold">{formatRatedSpeed(modalEl.ratedSpeed)}</span>
              <span className="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded text-[10.5px] font-bold">{modalEl.liveLoad ? `${String(modalEl.liveLoad).replace(/kg/gi, '').trim()} kg` : '-'}</span>
            </div>

            <div className="text-[11px] text-slate-400 dark:text-gray-500 pt-1 mt-1 border-t border-slate-100 dark:border-gray-700/60 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="flex flex-col gap-0 leading-none">
                  {hasReplacement ? (
                    <>
                      <span className="font-semibold text-slate-600 dark:text-gray-400 text-[11px] leading-tight">교체 {formatDate(modalEl.installationDe)}</span>
                      <span className="text-slate-400 dark:text-gray-500 text-[9.5px] font-medium leading-tight">최초설치 {formatDate(modalEl.frstInstallationDe)}</span>
                    </>
                  ) : modalEl.installationDe ? (
                    <span className="font-medium text-slate-600 dark:text-gray-400 text-[11px] leading-tight">설치 {formatDate(modalEl.installationDe)}</span>
                  ) : null}
                </div>
                {s.elvtrKindNm && modalEl.elvtrKindNm && <span className="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded border-0 text-[10.5px] font-bold shrink-0 self-center">{modalEl.elvtrKindNm}</span>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.elvtrStts && modalEl.elvtrStts && <span className={`px-1.5 py-0.25 text-[10.5px] font-bold rounded border tracking-tight ${statusBadgeClass}`}>{modalEl.elvtrStts}</span>}
              </div>
            </div>
          </div>
          
          {hasBasicInfo && (
            <DashboardCard title="제원 및 규격">
              <GridCell label="승강기 구분" value={modalEl.elvtrDivNm} show={s.elvtrDivNm} />
              <GridCell label="승강기 형식" value={modalEl.elvtrFormNm} show={s.elvtrFormNm} />
              <GridCell label="운행층수" value={modalEl.shuttleFloorCnt ? `${modalEl.shuttleFloorCnt.trim().replace(/개층|층/g, '')}개 층` : null} />
              <GridCell label="지상·지하" value={`▵${modalEl.divGroundFloorCnt || '-'} ▿${modalEl.divUndgrndFloorCnt || '-'}`} />
              <GridCell label="적재하중" value={modalEl.liveLoad} show={s.liveLoad} />
              <GridCell label="최대정원" value={modalEl.ratedCap} show={s.ratedCap} />
              <GridCell label="기계실 여부" value={formattedMrYn} show={s.mrYn} />
            </DashboardCard>
          )}

          {hasInstallInfo && (
            <DashboardCard title="설치 및 검사 정보">
              <GridCell label="최초설치일" value={formatDate(modalEl.frstInstallationDe)} show={s.frstInstallationDe} />
              <GridCell label="설치일자" value={formatDate(modalEl.installationDe)} show={s.installationDe} />
              <GridCell label="최종검사결과" value={modalEl.lastResultNm} />
              {isValidVal(resmptDe) ? <GridCell label="운행 재개일" value={formatDate(resmptDe)} /> : <div className="opacity-0 pointer-events-none select-none" aria-hidden="true" />}
              {isValidVal(modalEl.pauseAblDe) ? <GridCell label="휴폐지일자" value={formatDate(modalEl.pauseAblDe)} /> : null}
              {isValidVal(modalEl.pauseAblDe) && (isValidVal(modalEl.pauseAbleResn) ? <GridCell label="휴폐지사유" value={modalEl.pauseAbleResn} /> : <div className="opacity-0 pointer-events-none select-none" aria-hidden="true" />)}
            </DashboardCard>
          )}

          {(hasMaintenanceData || modalEl.subcntrCpny) && (
            <DashboardCard title="유지관리 정보">
              <GridCell label="보수업체" value={modalEl.mntCpnyNm} show={s.mntCpnyNm} />
              <GridCell label="업체연락처" value={modalEl.mntCpnyTelno} show={s.mntCpnyTelno} />
              <GridCell label="관리주체" value={modalEl.partcpntNm} show={s.partcpntNm} />
              <GridCell label="주체연락처" value={modalEl.partcpntTelno} show={s.partcpntTelno} />
              {isValidVal(modalEl.subcntrCpny) && <GridCell label="하도급업체" value={modalEl.subcntrCpny} />}
            </DashboardCard>
          )}

          <div className="pt-0.5">
            <div className="flex items-center justify-between mb-0.5 px-0.5">
              <div className="flex items-center gap-1">
                <div className="w-1 h-3 bg-blue-500 rounded-full" />
                <h4 className="text-[10.5px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">검사 이력</h4>
              </div>
              {inspections.length > 0 && (
                <label className="flex items-center gap-1 cursor-pointer select-none" onClick={toggleHideRegularPass}>
                  <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${hideRegularPass ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                    {hideRegularPass && <svg viewBox="0 0 10 8" width="6" height="4" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span className="text-[9.5px] text-gray-500 font-bold">정기검사 합격 숨기기</span>
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
                  const isEmergency = record.inspctKind === '수시검사'; const isRegular = record.inspctKind === '정기검사';
                  const isFailed = record.psexamYn === '불합격'; const isPassed = record.psexamYn === '합격';
                  const isConditional = record.psexamYn && !isPassed && !isFailed;

                  let cardBg = 'bg-white dark:bg-gray-800 border-slate-200/40 dark:border-gray-700/60';
                  if (isFailed) cardBg = 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50';
                  else if (isEmergency) cardBg = 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/50';
                  else if (!isRegular) cardBg = 'bg-slate-100/70 dark:bg-slate-800/60 border-slate-200/40 dark:border-gray-700/50';

                  const resultChip = isFailed ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/60'
                    : isConditional ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/60'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/60';

                  const isExpanded = expandedInspectIndex === idx;

                  const targetDateStr = (record.inspctDt || '').replace(/[^0-9]/g, '');
                  const matched = safeList.find(s => s.inspctDe === targetDateStr) || 
                                  safeList.find(s => s.inspctDe?.startsWith(targetDateStr.slice(0,6))) ||
                                  safeList.find(s => s.inspctDe?.startsWith(targetDateStr.slice(0,4)) && s.dispWords === record.psexamYn);

                  return (
                    <div key={idx} className="flex flex-col">
                      <div
                        onClick={() => handleInspectRowClick(idx, record)}
                        className={`rounded-xl px-2.5 py-1.5 border text-xs flex flex-col gap-0.5 cursor-pointer hover:scale-[0.99] transition-all select-none ${cardBg}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <span className="px-1 py-0.5 rounded bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-gray-600 text-[10.5px] font-bold shrink-0">{record.inspctKind || '-'}</span>
                            <span className={`px-1.5 py-0.5 rounded font-normal text-[10.5px] shrink-0 whitespace-nowrap ${resultChip}`}>{record.psexamYn}</span>
                            <p className="text-slate-400/70 dark:text-gray-500/70 text-[9.5px] font-normal truncate flex-1 min-w-0 ml-0.5">{record.inspctInsttNm || '-'}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-normal text-[10.5px] text-slate-600 dark:text-gray-400 tracking-tight">{formatDate(record.inspctDt)}</span>
                            {isExpanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                          </div>
                        </div>
                        {(record.applcBeDt || record.applcEnDt) && (
                          <p className="text-slate-400 dark:text-gray-400 pl-1 text-[10.5px] font-normal mt-0 leading-tight">유효기간 {formatDate(record.applcBeDt)} ~ {formatDate(record.applcEnDt)}</p>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mx-1.5 -mt-1 mb-2 bg-slate-100/50 dark:bg-gray-900/60 border-x border-b border-slate-200/50 dark:border-gray-800 rounded-b-xl p-2.5 space-y-2 text-[11px] animate-fadeIn">
                          
                          {matched ? (
                            <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-2 border border-slate-200/30 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600 dark:text-gray-300">
                              <p className="truncate"><span className="text-slate-400 font-medium">제조업체:</span> <span className="font-bold text-gray-800 dark:text-gray-200">{matched.companyNm || '-'}</span></p>
                              <p className="truncate"><span className="text-slate-400 font-medium">승강기 형식:</span> <span className="font-bold text-gray-800 dark:text-gray-200">{matched.elvtrForm || '-'}-{matched.elvtrDetailForm || '-'}</span></p>
                              <p className="truncate"><span className="text-slate-400 font-medium">승강기 종류:</span> <span className="font-bold text-gray-800 dark:text-gray-200">{matched.elvtrKindNm || '-'}</span></p>
                              <p className="truncate"><span className="text-slate-400 font-medium">적재하중:</span> <span className="font-bold text-gray-800 dark:text-gray-200">{matched.liveLoad ? `${matched.liveLoad} kg` : '-'}</span></p>
                              <p className="truncate"><span className="text-slate-400 font-medium">정격속도:</span> <span className="font-bold text-gray-800 dark:text-gray-200">{matched.ratedSpeed ? `${Math.round(parseFloat(matched.ratedSpeed) * 60)} m/min` : '-'}</span></p>
                              <p className="truncate"><span className="text-slate-400 font-medium">운행층수:</span> <span className="font-bold text-gray-800 dark:text-gray-200">{matched.shuttleFloorCnt ? `${matched.shuttleFloorCnt}개 층` : '-'}</span></p>
                            </div>
                          ) : (
                            <div className="text-center text-slate-400 py-1 font-medium">당시 조회된 제원 기록이 없습니다.</div>
                          )}

                          {!isPassed && (
                            <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-2 border border-slate-200/30 space-y-1.5">
                              <div className="flex items-center gap-1 pb-1 border-b border-gray-100 dark:border-gray-700/60">
                                <FileText size={10} className="text-red-500" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">부적합 내역</span>
                              </div>
                              
                              {loadingFailDetails ? (
                                <div className="flex items-center justify-center py-2 gap-1 text-[10.5px] text-slate-400"><Loader2 size={10} className="animate-spin" /> 부적합 내역 추적 중...</div>
                              ) : failDetails.length === 0 ? (
                                <div className="text-center text-slate-400 py-2 font-medium">등록된 부적합 내역이 없습니다.</div>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin' }}>
                                  {failDetails.map((f, fIdx) => (
                                    <div key={fIdx} className="bg-rose-50/40 dark:bg-rose-950/10 border border-rose-100/40 dark:border-rose-900/40 rounded-md p-1.5 text-slate-700 dark:text-gray-300">
                                      <div className="font-bold text-gray-900 dark:text-gray-100 leading-tight">🛑 {f.failDesc}</div>
                                      {isValidVal(f.failDescInspector) && (
                                        <div className="mt-1 bg-white/60 dark:bg-gray-800/50 p-1 rounded border border-rose-100/20 text-[10.5px] font-medium text-slate-600 dark:text-gray-400 break-all">{f.failDescInspector}</div>
                                      )}
                                      <div className="mt-1 text-[9.5px] text-slate-400 leading-normal flex items-start gap-1 flex-wrap">
                                        <span className="bg-slate-100 dark:bg-gray-700 px-1 py-0.25 rounded font-black shrink-0">조항 {f.standardArticle || '-'}</span>
                                        <span className="font-normal break-words flex-1 whitespace-normal text-left">{f.standardTitle1}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {!hideRegularPass && filteredInspections.length > 4 && (
                  <button onClick={() => setShowAllInspect(!showAllInspect)} className="w-full py-1 text-[11px] font-bold text-blue-600 hover:bg-white dark:hover:bg-gray-800 border border-slate-200/40 rounded-lg transition-all mt-0.5">
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