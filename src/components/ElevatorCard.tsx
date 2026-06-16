import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ElevatorWithBadges, SettingsFields } from '../types';
import { checkShuttleSection, formatDate, formatRatedSpeed, getStatusBadgeClass } from '../utils/elevatorHelpers';
import BookmarkButton from './BookmarkButton';

/* ─── [PERMANENT CORE DESIGN RULES - NEVER DELETE] ───
   1. 시각 피로도를 낮추기 위해 주소, 승강기 번호, 속도 등은 반드시 'font-normal' 또는 'font-medium'을 유지합니다.
   2. 제조업체 및 모델명은 고속 스크롤 시 시인성을 위해 'font-black text-[14.5px]' 규격을 영구 유지합니다.
   3. 복합 카드(GroupCard) 헤더는 단독 카드 및 읽음 상태(isViewed)의 백그라운드 틴트와 
      동일한 Hue 영역에서 충돌하지 않도록 투명도를 제거한 독립 명도 레이아웃을 영구 유지합니다.
   ────────────────────────────────────────────────── */

interface Props {
  buildingName: string;
  address: string;
  elevators: ElevatorWithBadges[];
  settings: SettingsFields;
  onSelect: (elevator: ElevatorWithBadges) => void;
  bookmarkedIds?: Set<string>;
  viewedIds?: Set<string>;
}

function getModelColorClass(manufacturerName?: string): string {
  const name = manufacturerName || '';
  if (name.includes('현대엘')) return 'text-emerald-600 dark:text-emerald-400';
  if (name.includes('오티스엘')) return 'text-indigo-600 dark:text-indigo-400';
  if (name.includes('티케이엘')) return 'text-sky-500 dark:text-sky-400';
  if (name.includes('미쓰비시') || name.includes('후지테크')) return 'text-red-500 dark:text-red-400';
  return 'text-[#8B4513] dark:text-[#EAA850]';
}

export default function ElevatorCard({
  buildingName,
  address,
  elevators,
  settings,
  onSelect,
  bookmarkedIds = new Set(),
  viewedIds = new Set()
}: Props) {
  if (!elevators || elevators.length === 0) return null;

  const isMulti = elevators.length > 1;

  // 🎯 [완치 2번] 다크 모드 눈부심 완전 차단: 저대비 명도로 배지 컬러셋 전면 다운 그레이드 조정
  const standardizedBadgeClass = 'bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium border-0 text-[10.5px]';

  // 🎯 [완치 3번] 최고층 배지 은은한 극강의 미세 틴트 적용 (무채색 베이스에 혈색만 주입)
  const topGroundBadgeHtml = <span className="bg-amber-50/40 dark:bg-amber-950/10 text-amber-600/90 dark:text-amber-500/80 border border-amber-200/30 text-[8.5px] font-bold rounded px-1 shrink-0">최고층</span>;
  const deepUndergroundBadgeHtml = <span className="bg-slate-100 dark:bg-gray-800 text-slate-500 text-[8.5px] font-bold rounded px-1 shrink-0">최저층</span>;

  // 1) 단독 카드 레이아웃 브랜치 (elevators.length === 1)
  if (!isMulti) {
    const el = elevators[0];
    const isBookmarked = bookmarkedIds.has(el.elevatorNo);
    const isViewed = viewedIds.has(el.elevatorNo);
    const shuttle = checkShuttleSection(el.shuttleSection);
    const statusBadgeClass = getStatusBadgeClass(el.elvtrStts || '');
    const modelColorClass = getModelColorClass(el.manufacturerName);
    const hasReplacement = el.frstInstallationDe && el.installationDe && el.frstInstallationDe !== el.installationDe;

    const asignNo = (el.elvtrAsignNo || '').trim().replace(/호기$|호$/, '');
    const displayAsign = asignNo ? `${asignNo}호기` : '1호기';
    const displayAsignWithPlace = el.installationPlace 
      ? `${displayAsign} (${el.installationPlace.trim()})` 
      : displayAsign;

    const shuttleBadgeClass = !shuttle.valid
      ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50 font-bold text-[9.5px]'
      : 'bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-700/40 font-normal text-[9.5px]';

    const rowBgClass = isBookmarked
      ? 'bg-yellow-100/20 dark:bg-yellow-800/10 border-yellow-500/40 shadow-sm'
      : isViewed
      ? 'bg-white dark:bg-gray-800 border-l-4 border-l-slate-300 dark:border-l-gray-600 border-y-slate-200 border-r-slate-200 dark:border-y-gray-800 dark:border-r-gray-800 opacity-70 shadow-xs'
      : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700/50 shadow-sm';

    // 🎯 [완치 1번 단독 플러그] 단독 건물 내 승강기의 지상/지하 층수 코드 분출 가드 수식
    const gFloor = parseInt(el.divGroundFloorCnt, 10) || 0;
    const uFloor = parseInt(el.divUndgrndFloorCnt, 10) || 0;

    return (
      <div
        onClick={() => onSelect(el)}
        className={`border rounded-xl px-2.5 py-2 ${rowBgClass} hover:shadow-md transition-all cursor-pointer flex flex-col gap-0 relative group`}
      >
        {/* 상단 라인: 건물명 및 주소 (mt-0 gap-0 분량 초밀착 정렬) */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 flex flex-col gap-0">
            {/* 🎯 [완치 1번] 엉터리 레이아웃 철거 후 건물명 오른쪽에 미니멀 층수 배지 자동 링킹 */}
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <h3 className="text-[13.5px] font-black text-gray-900 dark:text-gray-100 truncate tracking-tight">{buildingName}</h3>
              <div className="text-[11px] text-slate-400 dark:text-gray-500 font-bold tracking-tight flex items-center gap-1 shrink-0">
                {gFloor > 0 && <span>▵{gFloor}</span>}
                {uFloor > 0 && <span>▿{uFloor}</span>}
              </div>
            </div>
            <div className="text-[11px] text-slate-400 dark:text-gray-400 mt-0 truncate font-medium">
              {address}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <BookmarkButton elevator={el} bookmarkedIds={bookmarkedIds} />
          </div>
        </div>

        {/* 호기 / 승강기 번호 배지 라인 */}
        <div className="mt-1.5 pt-1 border-t border-slate-100 dark:border-gray-700/40 flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.25 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 text-[9.5px] font-bold rounded border border-slate-200/40 dark:border-gray-600/40 shrink-0">
            {displayAsignWithPlace}
          </span>
          <span className={standardizedBadgeClass}>
            {el.elevatorNo}
          </span>
        </div>

        {/* 제원 제어 영역 */}
        <div className="mt-1 flex flex-col gap-0">
          <div className="flex items-baseline gap-1.5 flex-wrap text-[14.5px]">
            <span className="text-slate-900 dark:text-gray-100 font-black tracking-tight shrink-0">{el.manufacturerName || '제조사 미기재'}</span>
            <span className="text-slate-200 dark:text-gray-700 text-xs font-normal shrink-0">|</span>
            <span className={`${modelColorClass} font-black tracking-tight truncate flex-1`}>{el.elvtrModel || '모델명 미기재'}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap mt-0.5">
            <span className={`px-1.5 py-0.25 rounded border text-[9.5px] font-bold ${shuttleBadgeClass}`}>{el.shuttleSection || '전층'} 운행</span>
            <span className="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium">{formatRatedSpeed(el.ratedSpeed)}</span>
            <span className="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium">{el.liveLoad ? `${String(el.liveLoad).replace(/kg/gi, '').trim()} kg` : '-'}</span>
          </div>
        </div>

        {/* 하단선 및 배지 마감구역 */}
        <div className="flex items-center justify-between gap-2 pt-1 mt-1 border-t border-slate-100 dark:border-gray-700/40 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-slate-400 dark:text-gray-500 font-normal">
              {hasReplacement ? <span className="text-slate-600 dark:text-gray-400 font-black bg-slate-100/80 dark:bg-gray-700/40 px-1 py-0.25 rounded">교체 {formatDate(el.installationDe)}</span> : el.installationDe ? <span>설치 {formatDate(el.installationDe)}</span> : null}
            </span>
            {settings.elvtrKindNm && el.elvtrKindNm && (
              <span className={standardizedBadgeClass}>
                {el.elvtrKindNm}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {settings.elvtrStts && el.elvtrStts && <span className={`px-1.5 py-0.25 text-[10.5px] font-bold rounded border tracking-tight ${statusBadgeClass}`}>{el.elvtrStts}</span>}
          </div>
        </div>
      </div>
    );
  }

  // 2) 복합 카드 레이아웃 브랜치 (elevators.length > 1)
  const isGroupBookmarked = elevators.some(e => bookmarkedIds.has(e.elevatorNo));
  const isGroupViewed = elevators.some(e => viewedIds.has(e.elevatorNo));

  // 복합 건물 소속 승강기들의 최대 빌딩 층수 역추적 가공 연산회로
  const maxGroundFloor = Math.max(...elevators.map(e => parseInt(e.divGroundFloorCnt, 10) || 0));
  const maxUndergroundFloor = Math.max(...elevators.map(e => parseInt(e.divUndgrndFloorCnt, 10) || 0));

  const groupHeaderBg = isGroupBookmarked
    ? 'bg-yellow-500/10 dark:bg-yellow-900/20 border-yellow-500/20 shadow-xs'
    : isGroupViewed
    ? 'bg-slate-100 dark:bg-gray-800 border-l-4 border-l-slate-400 dark:border-l-gray-500 opacity-70 backdrop-blur-xs shadow-xs'
    : 'bg-slate-100 dark:bg-gray-800';

  return (
    <div className="border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm flex flex-col bg-white dark:bg-gray-900">
      {/* 복합 카드 상단 헤더 구역 */}
      <div className={`px-2.5 py-1.5 border-b border-slate-200 dark:border-gray-700 flex items-start justify-between gap-2 ${groupHeaderBg}`}>
        <div className="min-w-0 flex-1 flex flex-col gap-0">
          {/* 🎯 [완치 1번] 복합 빌딩 카드에서도 불필요한 바 선을 파괴하고, 주소창과 겹치지 않게 제목 타이틀 옆구리에 기호식으로 초밀착 이식 */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <h3 className="text-[13.5px] font-black text-gray-900 dark:text-gray-100 truncate tracking-tight">{buildingName}</h3>
            <div className="text-[11px] text-slate-400 dark:text-gray-500 font-bold tracking-tight flex items-center gap-1 shrink-0">
              {maxGroundFloor > 0 && <span>▵{maxGroundFloor}</span>}
              {maxUndergroundFloor > 0 && <span>▿{maxUndergroundFloor}</span>}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-0 truncate font-medium">
            {address}
          </div>
        </div>
        
        <div className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 shrink-0 font-bold text-[11px] mt-0.5">
          <span>총 {elevators.length}대</span>
          <ChevronRight size={14} />
        </div>
      </div>

      {/* 내부 소속 승강기 로우 리스트 구역 */}
      <div className="bg-white dark:bg-gray-900 p-0.5 space-y-0.5">
        {elevators.map((el, idx) => {
          const isBookmarked = bookmarkedIds.has(el.elevatorNo);
          const isViewed = viewedIds.has(el.elevatorNo);
          const shuttle = checkShuttleSection(el.shuttleSection);
          const statusBadgeClass = getStatusBadgeClass(el.elvtrStts || '');
          const modelColorClass = getModelColorClass(el.manufacturerName);
          const hasReplacement = el.frstInstallationDe && el.installationDe && el.frstInstallationDe !== el.installationDe;

          const asignNo = (el.elvtrAsignNo || '').trim().replace(/호기$|호$/, '');
          const displayAsign = asignNo ? `${asignNo}호기` : `${idx + 1}호기`;
          const displayAsignWithPlace = el.installationPlace 
            ? `${displayAsign} (${el.installationPlace.trim()})` 
            : displayAsign;

          const shuttleBadgeClass = !shuttle.valid
            ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50 font-bold text-[9.5px]'
            : 'bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-700/40 font-normal text-[9.5px]';

          const itemBgClass = isBookmarked
            ? 'bg-yellow-100/10 dark:bg-yellow-800/5'
            : isViewed
            ? 'bg-white dark:bg-gray-800 border-l-4 border-l-slate-300 dark:border-l-gray-600 opacity-70'
            : 'bg-white dark:bg-gray-900';

          return (
            <div
              key={el.elevatorNo}
              onClick={() => onSelect(el)}
              className={`px-2 py-1.5 rounded-lg flex flex-col gap-0 border border-transparent hover:bg-slate-50/80 dark:hover:bg-gray-800/40 cursor-pointer transition-colors relative group ${itemBgClass}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                  <span className="px-1.5 py-0.25 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 text-[9.5px] font-bold rounded border border-slate-200/40 dark:border-gray-600/40 shrink-0">{displayAsignWithPlace}</span>
                  <span className={standardizedBadgeClass}>
                    {el.elevatorNo}
                  </span>
                  {/* 🎯 [완치 3번] 보정 완료된 초미세 오렌지 틴트 귤빛 배지 매핑 결합 */}
                  {el.isTopGround && topGroundBadgeHtml}
                  {el.isDeepUnderground && deepUndergroundBadgeHtml}
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <BookmarkButton elevator={el} bookmarkedIds={bookmarkedIds} />
                </div>
              </div>

              <div className="flex items-baseline gap-1.5 flex-wrap text-[14.5px] mt-0.5">
                <span className="text-slate-900 dark:text-gray-100 font-black tracking-tight shrink-0">{el.manufacturerName || '제조사 미기재'}</span>
                <span className="text-slate-200 dark:text-gray-700 text-xs font-normal shrink-0">|</span>
                <span className={`${modelColorClass} font-black tracking-tight truncate flex-1`}>{el.elvtrModel || '모델명 미기재'}</span>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap mt-0">
                <span className={`px-1.5 py-0.25 rounded border text-[9.5px] font-bold ${shuttleBadgeClass}`}>{el.shuttleSection || '전층'} 운행</span>
                <span className="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium">{formatRatedSpeed(el.ratedSpeed)}</span>
                <span className="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium">{el.liveLoad ? `${String(el.liveLoad).replace(/kg/gi, '').trim()} kg` : '-'}</span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5 mt-0.5 border-t border-slate-100 dark:border-gray-700/40 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] text-slate-400 dark:text-gray-500 font-normal">
                    {hasReplacement ? <span className="text-slate-600 dark:text-gray-300 font-black bg-slate-100/80 dark:bg-gray-700/40 px-1 py-0.25 rounded">교체 {formatDate(el.installationDe)}</span> : el.installationDe ? <span>설치 {formatDate(el.installationDe)}</span> : null}
                  </span>
                  {settings.elvtrKindNm && el.elvtrKindNm && (
                    <span className={standardizedBadgeClass}>
                      {el.elvtrKindNm}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {settings.elvtrStts && el.elvtrStts && <span className={`px-1.5 py-0.25 text-[10.5px] font-bold rounded border tracking-tight ${statusBadgeClass}`}>{el.elvtrStts}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}