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

function SingleCard({ el, settings, onSelect, bookmarkedIds, viewedIds }: { el: ElevatorWithBadges; settings: SettingsFields; onSelect: (e: ElevatorWithBadges) => void; bookmarkedIds?: Set<string>; viewedIds?: Set<string> }) {
  const shuttle = checkShuttleSection(el.shuttleSection);
  const hasReplacement = el.frstInstallationDe && el.installationDe && el.frstInstallationDe !== el.installationDe;
  const statusBadgeClass = getStatusBadgeClass(el.elvtrStts || '');
  const isBookmarked = bookmarkedIds?.has(el.elevatorNo);
  const isViewed = viewedIds?.has(el.elevatorNo);

  const shuttleBadgeClass = !shuttle.valid
    ? 'bg-purple-50/40 text-purple-500 dark:text-purple-400 border-purple-100 dark:border-purple-900/30 font-bold text-[10.5px]'
    : 'bg-slate-50/60 dark:bg-gray-800 text-slate-400 dark:text-gray-500 border-slate-100 dark:border-gray-700 font-normal text-[10.5px]';

  const cardBgClass = isBookmarked
    ? 'bg-yellow-50/40 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800/40'
    : isViewed
    ? 'bg-slate-50/30 dark:bg-slate-900/20 border-slate-200/50 dark:border-slate-800/60'
    : 'bg-white dark:bg-gray-800 border-slate-200/60 dark:border-gray-700/60';

  const opacityClass = isViewed && !isBookmarked ? 'opacity-75' : '';
  const modelColorClass = getModelColorClass(el.manufacturerName);

  return (
    <div
      onClick={() => onSelect(el)}
      className={`${cardBgClass} ${opacityClass} rounded-xl border px-3.5 py-2 cursor-pointer hover:shadow-sm transition-all group`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="font-semibold text-slate-800 dark:text-gray-100 text-[15.5px] tracking-tight truncate">{el.buldNm || '건물명 없음'}</span>
          {!shuttle.valid && el.shuttleSection && (
            <span className="px-1.5 py-0.25 bg-purple-50/80 dark:bg-purple-950/40 text-purple-500 dark:text-purple-400 border border-purple-100/70 text-[9.5px] font-bold rounded shrink-0">특이</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <BookmarkButton elevator={el} size={13} />
          <ChevronRight size={15} className="text-slate-300 dark:text-gray-600 shrink-0 group-hover:text-blue-500 transition-colors" />
        </div>
      </div>

      <p className="text-[11.5px] text-slate-400 dark:text-gray-500 mt-0.5 font-normal truncate">
        {`${el.address1 || ''} ${el.address2 || ''}`.trim()}
      </p>

      <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[11.5px] font-normal text-slate-400 dark:text-gray-500">
        <span className="px-1 py-0.25 bg-slate-50/50 dark:bg-gray-700/40 text-slate-500 dark:text-gray-400 rounded border border-slate-200/40 dark:border-gray-600/40 font-medium tracking-tight">{el.elevatorNo}</span>
        {el.elvtrAsignNo && (
          <span className="px-1 py-0.25 bg-slate-50/50 dark:bg-gray-700/40 text-slate-500 dark:text-gray-400 rounded border border-slate-200/40 dark:border-gray-600/40 font-medium truncate max-w-[200px]">
            {el.elvtrAsignNo.trim().replace(/호기$|호$/, '')}호기{el.installationPlace ? ` (${el.installationPlace.trim()})` : ''}
          </span>
        )}
      </div>

      {(el.manufacturerName || el.elvtrModel || el.ratedSpeed || el.liveLoad) && (
        <div className="mt-1.5 pt-1 border-t border-slate-100/70 dark:border-gray-700/50 space-y-0.5">
          {(el.manufacturerName || el.elvtrModel) && (
            <div className="flex items-center gap-1 min-w-0 text-[14.5px]">
              {/* 유저 지정 규칙: 단독 카드 제조사명 고정 폭 135px 수평 동기화 */}
              <span className="text-slate-800 dark:text-gray-200 font-black tracking-tight truncate max-w-[135px] inline-block shrink-0">{el.manufacturerName}</span>
              {el.manufacturerName && el.elvtrModel && <span className="text-slate-200 dark:text-gray-700 text-xs shrink-0 font-normal">|</span>}
              <span className={`${modelColorClass} font-black tracking-tight truncate flex-1`}>{el.elvtrModel}</span>
            </div>
          )}
          {(el.shuttleSection || el.ratedSpeed || el.liveLoad) && (
            <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 dark:text-gray-500 font-medium min-w-0 flex-wrap">
              {el.shuttleSection && <span className={`px-1 py-0.25 rounded text-[10px] border shrink-0 ${shuttleBadgeClass}`}>{el.shuttleSection} 운행</span>}
              <span className="shrink-0">{formatRatedSpeed(el.ratedSpeed)}</span>
              {el.ratedSpeed && el.liveLoad && <span className="text-slate-200 dark:text-gray-700 font-normal shrink-0">•</span>}
              <span className="shrink-0">{el.liveLoad}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-1.5 pt-1 border-t border-slate-100/70 dark:border-gray-700/50">
        <div className="text-[11.5px] text-slate-400 dark:text-gray-500 font-normal">
          {hasReplacement ? (
            <span className="text-slate-700 dark:text-gray-300 font-black bg-slate-100/80 dark:bg-gray-700/40 px-1 py-0.25 rounded">교체 {formatDate(el.installationDe)}</span>
          ) : el.installationDe ? (
            <span>설치 {formatDate(el.installationDe)}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {settings.elvtrKindNm && el.elvtrKindNm && <span className="px-1 py-0.25 text-[10.5px] font-normal bg-slate-50/40 dark:bg-gray-700/40 border border-slate-200/40 dark:border-gray-600/30 text-slate-400 dark:text-gray-500 rounded">{el.elvtrKindNm}</span>}
          {settings.elvtrStts && el.elvtrStts && <span className={`px-1.5 py-0.25 text-[10.5px] font-bold rounded border tracking-tight ${statusBadgeClass}`}>{el.elvtrStts}</span>}
        </div>
      </div>
    </div>
  );
}

function GroupCard({ buildingName, address, elevators, settings, onSelect, bookmarkedIds, viewedIds }: Props) {
  const maxGround = elevators[0]?.buildingMaxGround || 0;
  const maxUnderground = elevators[0]?.buildingMaxUnderground || 0;

  const hasBookmarked = elevators.some((e) => bookmarkedIds?.has(e.elevatorNo));
  const isAnyRowViewed = elevators.some((e) => viewedIds?.has(e.elevatorNo));

  const cardBgClass = hasBookmarked
    ? 'bg-yellow-50/30 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800/40 shadow-[0_1px_3px_rgba(0,0,0,0.01)]'
    : 'bg-white dark:bg-gray-800 border-slate-200/70 dark:border-gray-700/60 shadow-[0_1px_3px_rgba(0,0,0,0.01)]';

  const headerOpacityClass = isAnyRowViewed ? 'opacity-70' : '';
  const cleanAddress = (address || '').replace(/·/g, ' ').replace(/\s+/g, ' ').trim();

  return (
    <div className={`${cardBgClass} rounded-xl border overflow-hidden hover:shadow-sm transition-all`}>
      <div className={`px-3 py-1.5 bg-slate-50/50 dark:bg-gray-700/40 border-b border-slate-100 dark:border-gray-600/60 ${headerOpacityClass} transition-opacity`}>
        <div className="flex flex-col gap-0.5 w-full">
          <div className="flex items-center justify-between gap-3 w-full">
            <span className="font-semibold text-slate-800 dark:text-gray-100 text-[15.5px] tracking-tight truncate flex-1">{buildingName || '건물명 없음'}</span>
            <span className="shrink-0 px-1.5 py-0.25 bg-white/80 dark:bg-gray-600/60 border border-slate-200/40 dark:border-gray-600 text-slate-500 dark:text-gray-400 text-[10.5px] font-semibold rounded shadow-none">총 {elevators.length}대</span>
          </div>
          
          <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 dark:text-gray-500 font-normal w-full min-w-0">
            {(maxGround > 0 || maxUnderground > 0) && (
              <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                {maxGround > 0 && <span className="px-1 py-0.25 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200/60 text-[9px] font-bold rounded">↑{maxGround}F</span>}
                {maxUnderground > 0 && <span className="px-1 py-0.25 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200/60 text-[9px] font-bold rounded">↓{maxUnderground}F</span>}
              </div>
            )}
            <p className="truncate flex-1 font-normal text-slate-400 dark:text-gray-500">{cleanAddress}</p>
          </div>
        </div>
      </div>

      {/* ★ 해결 완료: 간섭을 일으키던 divide-y 클래스를 완전히 파괴하고 순수 flex 구조로 리디렉션 */}
      <div className="flex flex-col">
        {elevators.map((el, idx) => {
          const shuttle = checkShuttleSection(el.shuttleSection);
          const hasReplacement = el.frstInstallationDe && el.installationDe && el.frstInstallationDe !== el.installationDe;
          const statusBadgeClass = getStatusBadgeClass(el.elvtrStts || '');

          const isTopGround = maxGround > 0 && (parseInt(el.divGroundFloorCnt, 10) || 0) === maxGround;
          const isDeepUnderground = maxUnderground > 0 && (parseInt(el.divUndgrndFloorCnt, 10) || 0) === maxUnderground;
          
          const isBookmarked = bookmarkedIds?.has(el.elevatorNo);
          const isViewed = viewedIds?.has(el.elevatorNo);

          const asignNo = (el.elvtrAsignNo || '').trim().replace(/호기$|호$/, '');
          const displayAsign = asignNo ? `${asignNo}호기` : `${idx + 1}호기`;

          const shuttleBadgeClass = !shuttle.valid
            ? 'bg-purple-50/40 text-purple-500 dark:text-purple-400 border-purple-100 dark:border-purple-900/30 font-bold text-[10.5px]'
            : 'bg-slate-50 dark:bg-gray-700/50 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-gray-600 font-normal text-[10.5px]';

          // ★ 해결 완료: border-color 초기화 간섭을 파괴했으므로 이제 1호기부터 막차까지 완벽하게 동일 명도의 왼쪽 바가 균일하게 고정 출력됩니다!
          const rowBgClass = isBookmarked
            ? 'bg-yellow-100/20 dark:bg-yellow-800/10 border-l-4 border-l-yellow-500'
            : isViewed
            ? 'bg-slate-50/30 dark:bg-slate-900/5 border-l-4 border-l-slate-200 dark:border-l-gray-600'
            : 'bg-white dark:bg-gray-800 border-l-4 border-l-slate-200 dark:border-l-gray-700/60';
            
          const rowOpacityClass = isViewed && !isBookmarked ? 'opacity-55' : '';
          const modelColorClass = getModelColorClass(el.manufacturerName);

          // divide-y 대신 간섭 없는 명확한 개별 inline-top-border 주입 연산
          const borderTopClass = idx > 0 ? 'border-t border-t-slate-100/60 dark:border-t-gray-700/60' : '';

          return (
            <div 
              key={`${el.elevatorNo}-${el.installationPlace}`} 
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                onSelect(el);
              }} 
              className={`${rowBgClass} ${rowOpacityClass} ${borderTopClass} px-3 py-2 cursor-pointer hover:bg-slate-50/40 dark:hover:bg-gray-700/20 active:bg-slate-100/30 dark:active:bg-gray-600/20 transition-all flex flex-col space-y-0.5 group`}
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="px-1 py-0.25 bg-slate-50 dark:bg-gray-700/60 text-slate-600 dark:text-gray-300 text-[10px] font-bold rounded border border-slate-200/40 dark:border-gray-600 shrink-0">{displayAsign}</span>
                  <span className="text-[13px] font-bold text-slate-700 dark:text-gray-200 truncate max-w-[140px]">{el.installationPlace || '위치 미기재'}</span>
                  <span className="px-1 py-0.25 bg-slate-50/50 dark:bg-gray-700/40 text-slate-400 dark:text-gray-500 rounded text-[10.5px] border border-slate-200/30 dark:border-gray-600/30 font-normal shrink-0 tracking-tight">{el.elevatorNo}</span>
                  
                  {isTopGround && <span className="bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200/60 text-[9px] font-bold rounded px-1 py-0.25 shadow-none shrink-0">최고층</span>}
                  {isDeepUnderground && <span className="bg-gray-100/60 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400 text-[8px] font-medium rounded px-0.5 py-0.25 shadow-none shrink-0">최저층</span>}
                  {!shuttle.valid && el.shuttleSection && <span className="bg-purple-50/60 dark:bg-purple-950/10 text-purple-500 dark:text-purple-400 border border-purple-100/60 text-[9px] font-bold rounded px-1 py-0.25 shadow-none shrink-0">특이</span>}
                </div>

                <div className="shrink-0 flex items-center">
                  <BookmarkButton elevator={el} size={11} />
                </div>
              </div>

              <div className="space-y-0.5">
                {(el.manufacturerName || el.elvtrModel) && (
                  <div className="flex items-center gap-1.5 min-w-0 text-[14.5px]">
                    {/* 유저 지정 규칙: 복합 카드 제조업체명 고정 폭 135px 완벽 동기화 */}
                    <span className="text-slate-800 dark:text-gray-200 font-black tracking-tight truncate max-w-[135px] inline-block shrink-0">{el.manufacturerName}</span>
                    {el.manufacturerName && el.elvtrModel && <span className="text-slate-200 dark:text-gray-700 text-xs shrink-0 font-normal">|</span>}
                    <span className={`${modelColorClass} font-black tracking-tight truncate flex-1`}>{el.elvtrModel}</span>
                  </div>
                )}
                {(el.shuttleSection || el.ratedSpeed || el.liveLoad) && (
                  <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 dark:text-gray-500 font-medium min-w-0 flex-wrap">
                    <span className={`px-1 py-0.25 rounded text-[10px] border shrink-0 ${shuttleBadgeClass}`}>{el.shuttleSection || '전층'} 운행</span>
                    <span className="shrink-0">{el.ratedSpeed ? formatRatedSpeed(el.ratedSpeed) : '속도 미기재'}</span>
                    {el.ratedSpeed && el.liveLoad && <span className="text-slate-200 dark:text-gray-700 font-normal shrink-0">•</span>}
                    <span className="shrink-0">{el.liveLoad || '하중 미기재'}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-50/60 dark:border-gray-700/40">
                <div className="text-[11.5px] text-slate-400 dark:text-gray-500 font-normal">
                  {hasReplacement ? <span className="text-slate-700 dark:text-gray-300 font-black bg-slate-100/80 dark:bg-gray-700/40 px-1 py-0.25 rounded">교체 {formatDate(el.installationDe)}</span> : el.installationDe ? <span>설치 {formatDate(el.installationDe)}</span> : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {settings.elvtrKindNm && el.elvtrKindNm && <span className="px-1 py-0.25 text-[10.5px] font-normal bg-slate-50/40 dark:bg-gray-700/40 border border-slate-200/40 dark:border-gray-600/30 text-slate-400 dark:text-gray-500 rounded">{el.elvtrKindNm}</span>}
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

export default function ElevatorCard({ buildingName, address, elevators, settings, onSelect, bookmarkedIds, viewedIds }: Props) {
  if (elevators.length === 1) {
    return <SingleCard el={elevators[0]} settings={settings} onSelect={onSelect} bookmarkedIds={bookmarkedIds} viewedIds={viewedIds} />;
  }
  return <GroupCard buildingName={buildingName} address={address} elevators={elevators} settings={settings} onSelect={onSelect} bookmarkedIds={bookmarkedIds} viewedIds={viewedIds} />;
}