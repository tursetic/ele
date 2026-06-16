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
    const displayAsign = asignNo ? `${asignNo}호기` : '승강기';
    const displayAsignWithPlace = el.installationPlace 
      ? `${displayAsign} (${el.installationPlace.trim()})` 
      : displayAsign;

    // 🎨 다크 모드 특이 운행 배지 고대비 보정 유지
    const shuttleBadgeClass = !shuttle.valid
      ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50 font-bold text-[9.5px]'
      : 'bg-slate-50 dark:bg-gray-700/50 text-slate-600 dark:text-gray-300 border-slate-200 dark:border-gray-600 font-normal text-[9.5px]';

    // ✨ [디자인 개선] 이미 조회한 단독 카드는 은은한 실버-블루 보더 포인트와 정밀 투명도 밸런스로 복합 헤더와의 시각적 구분을 명확화 (다크 모드 희뿌연 배경 제거 완료)
    const rowBgClass = isBookmarked
      ? 'bg-yellow-100/20 dark:bg-yellow-800/10 border-yellow-500/40'
      : isViewed
      ? 'bg-white dark:bg-gray-800 border-l-4 border-l-slate-300 dark:border-l-gray-600 border-y-slate-200/60 border-r-slate-200/60 dark:border-y-gray-800 dark:border-r-gray-800 opacity-75'
      : 'bg-white dark:bg-gray-800 border-slate-200/70 dark:border-gray-700/50';

    return (
      // 🎯 [초밀착] 단독 카드 상하 외곽 박스 패딩 컴팩트 최소화 (py-2, px-2.5)
      <div
        onClick={() => onSelect(el)}
        className={`border rounded-xl px-2.5 py-2 ${rowBgClass} hover:shadow-md transition-all cursor-pointer flex flex-col gap-0 relative group`}
      >
        {/* 상단 라인: 건물명 및 주소 */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[13.5px] font-black text-gray-900 dark:text-gray-100 truncate tracking-tight">{buildingName}</h3>
            {/* 🎯 [초밀착] 건물명과 주소 사이 간격을 극도로 밀착 (mt-0.5) */}
            <div className="text-[11px] text-slate-400 dark:text-gray-400 mt-0.5 truncate font-medium">
              {address}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 z-10" onClick={(e) => e.stopPropagation()}>
            <BookmarkButton elevator={el} bookmarkedIds={bookmarkedIds} />
          </div>
        </div>

        {/* 제원 영역: 🎯 [초밀착] 마진 조임 및 세로 간격 최소화 */}
        <div className="mt-1 pt-1 border-t border-slate-100 dark:border-gray-700/40 flex flex-col gap-0">
          <div className="flex items-baseline gap-1.5 flex-wrap text-[14.5px]">
            <span className="text-slate-900 dark:text-gray-100 font-black tracking-tight shrink-0">{el.manufacturerName || '제조사 미기재'}</span>
            <span className="text-slate-200 dark:text-gray-700 text-xs font-normal shrink-0">|</span>
            <span className={`${modelColorClass} font-black tracking-tight truncate flex-1`}>{el.elvtrModel || '모델명 미기재'}</span>
          </div>

          {/* 🎯 [초밀착] 제조업체 줄과 운행구간 줄 사이 간격 mt-0 완치 밀착 */}
          <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap mt-0">
            <span className={`px-1.5 py-0.25 rounded border text-[9.5px] font-bold ${shuttleBadgeClass}`}>{el.shuttleSection || '전층'} 운행</span>
            <span className="bg-slate-50 dark:bg-gray-700/60 text-slate-600 dark:text-gray-300 px-1.5 py-0.25 rounded font-medium">{formatRatedSpeed(el.ratedSpeed)}</span>
            <span className="bg-slate-50 dark:bg-gray-700/60 text-slate-600 dark:text-gray-300 px-1.5 py-0.25 rounded font-medium">{el.liveLoad ? `${String(el.liveLoad).replace(/kg/gi, '').trim()} kg` : '-'}</span>
            <span className="px-1.5 py-0.25 bg-slate-50/50 dark:bg-gray-800/40 text-slate-400 dark:text-gray-500 rounded text-[9px] border border-slate-200/30 dark:border-gray-700/30 font-normal shrink-0 tracking-tight ml-auto">{el.elevatorNo}</span>
          </div>
        </div>

        {/* 하단선 및 배지 마감구역: 🎯 [초밀착] 상하 여백 압축 */}
        <div className="flex items-center justify-between gap-2 pt-1 mt-1 border-t border-slate-100 dark:border-gray-700/40 text-[11px]">
          <div className="text-[11.5px] text-slate-400 dark:text-gray-500 font-normal">
            {hasReplacement ? <span className="text-slate-600 dark:text-gray-300 font-black bg-slate-100/80 dark:bg-gray-700/40 px-1 py-0.25 rounded">교체 {formatDate(el.installationDe)}</span> : el.installationDe ? <span>설치 {formatDate(el.installationDe)}</span> : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {settings.elvtrKindNm && el.elvtrKindNm && <span className="px-1 py-0.25 text-[10.5px] font-normal bg-slate-50/40 dark:bg-gray-700/40 border border-slate-200/40 dark:border-gray-600/30 text-slate-400 dark:text-gray-500 rounded">{el.elvtrKindNm}</span>}
            {settings.elvtrStts && el.elvtrStts && <span className={`px-1.5 py-0.25 text-[10.5px] font-bold rounded border tracking-tight ${statusBadgeClass}`}>{el.elvtrStts}</span>}
          </div>
        </div>
      </div>
    );
  }

  // 2) 복합 카드 레이아웃 브랜치 (elevators.length > 1)
  const isGroupBookmarked = elevators.some(e => bookmarkedIds.has(e.elevatorNo));
  
  // 🎯 [정품 로직 수술 복원] 원래 있던 1대 이상 기조회 여부 판별 연산 장치 완벽 부활
  const isGroupViewed = elevators.some(e => viewedIds.has(e.elevatorNo));

  // ✨ [디자인 개선] 라이트 모드에서 단독 모달 조회 상태와 겹쳐 혼동을 유발하던 배경색을 명확히 독립 명도로 격리 분리
  const groupHeaderBg = isGroupBookmarked
    ? 'bg-yellow-500/10 dark:bg-yellow-900/20 border-yellow-500/20'
    : isGroupViewed
    ? 'bg-slate-100 dark:bg-gray-800 border-l-4 border-l-slate-400 dark:border-l-gray-500'
    : 'bg-slate-100 dark:bg-gray-800';

  return (
    // 🎯 [초밀착] 복합 카드 외곽 프레임 간격 최소 압축
    <div className="border border-slate-200/60 dark:border-gray-700 rounded-xl overflow-hidden shadow-xs flex flex-col bg-white dark:bg-gray-900">
      {/* 복합 카드 상단 헤더 */}
      <div className={`px-2.5 py-1.5 border-b border-slate-200/60 dark:border-gray-700 flex items-start justify-between gap-2 ${groupHeaderBg}`}>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-black text-gray-900 dark:text-gray-100 truncate tracking-tight">{buildingName}</h3>
          {/* 🎯 [초밀착] 복합 카드 헤더 내 건물명-주소 간격 극대 밀착 (mt-0.5) */}
          <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5 truncate font-medium">
            {address}
          </div>
        </div>
        
        {/* 🎯 [정품 디자인 복원] 유저가 직접 만드신 정품 '총 X대 + 화살표' 우측 피드 배지 인터페이스 무결성 복구 */}
        <div className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 shrink-0 font-bold text-[11px] mt-0.5">
          <span>총 {elevators.length}대</span>
          <ChevronRight size={14} />
        </div>
      </div>

      {/* 내부 소속 승강기 리스트 패키징: 🎯 [초밀착] 목록 정렬 밀착 가속도 전개 */}
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

          // 🎨 다크 모드 특이 운행 배지 고대비 보정 유지
          const shuttleBadgeClass = !shuttle.valid
            ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50 font-bold text-[9.5px]'
            : 'bg-slate-50 dark:bg-gray-700/50 text-slate-600 dark:text-gray-300 border-slate-200 dark:border-gray-600 font-normal text-[9.5px]';

          // ✨ [디자인 개선] 복합 리스트 내부에서도 이미 조회된 항목은 좌측 보더 인디케이터 포인트 및 투명도 최적화 처리 (다크 모드 희뿌연 배경 제거 완료)
          const itemBgClass = isBookmarked
            ? 'bg-yellow-100/10 dark:bg-yellow-800/5'
            : isViewed
            ? 'bg-white dark:bg-gray-800 border-l-4 border-l-slate-300 dark:border-l-gray-600 opacity-75'
            : 'bg-white dark:bg-gray-800';

          return (
            // 🎯 [초밀착 완치] 목록 스크롤 가독성을 위해 개별 아이템 행 상하 여백 초밀착 패딩 압축 완료 (py-1.5, px-2)
            <div
              key={el.elevatorNo}
              onClick={() => onSelect(el)}
              className={`px-2 py-1.5 rounded-lg flex flex-col gap-0 border border-transparent hover:bg-slate-50/80 dark:hover:bg-gray-800/40 cursor-pointer transition-colors relative group ${itemBgClass}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                  <span className="px-1.5 py-0.25 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 text-[9.5px] font-bold rounded border border-slate-200/40 dark:border-gray-600/40 shrink-0">{displayAsignWithPlace}</span>
                  <span className="px-1.5 py-0.25 bg-slate-50/50 dark:bg-gray-800/40 text-slate-400 dark:text-gray-500 rounded text-[9px] border border-slate-200/30 dark:border-gray-700/30 font-normal shrink-0 tracking-tight">{el.elevatorNo}</span>
                  {el.isTopGround && <span className="bg-slate-100 dark:bg-gray-800 text-slate-500 text-[8.5px] font-bold rounded px-1 shrink-0">최고층</span>}
                  {el.isDeepUnderground && <span className="bg-slate-100 dark:bg-gray-800 text-slate-500 text-[8.5px] font-bold rounded px-1 shrink-0">최저층</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0 z-10" onClick={(e) => e.stopPropagation()}>
                  <BookmarkButton elevator={el} bookmarkedIds={bookmarkedIds} />
                </div>
              </div>

              {/* 🎯 [초밀착] 제조업체 표기선 마진 조임 상하 밀착 */}
              <div className="flex items-baseline gap-1.5 flex-wrap text-[14.5px] mt-0.5">
                <span className="text-slate-900 dark:text-gray-100 font-black tracking-tight shrink-0">{el.manufacturerName || '제조사 미기재'}</span>
                <span className="text-slate-200 dark:text-gray-700 text-xs font-normal shrink-0">|</span>
                <span className={`${modelColorClass} font-black tracking-tight truncate flex-1`}>{el.elvtrModel || '모델명 미기재'}</span>
              </div>

              {/* 🎯 [초밀착] 제조업체 줄과 운행구간 줄 사이 간격 타이포그래피 밀착 처리 (mt-0) */}
              <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap mt-0">
                <span className={`px-1.5 py-0.25 rounded border text-[9.5px] font-bold ${shuttleBadgeClass}`}>{el.shuttleSection || '전층'} 운행</span>
                <span className="bg-slate-50 dark:bg-gray-700/60 text-slate-600 dark:text-gray-300 px-1.5 py-0.25 rounded font-medium">{formatRatedSpeed(el.ratedSpeed)}</span>
                <span className="bg-slate-50 dark:bg-gray-700/60 text-slate-600 dark:text-gray-300 px-1.5 py-0.25 rounded font-medium">{el.liveLoad ? `${String(el.liveLoad).replace(/kg/gi, '').trim()} kg` : '-'}</span>
              </div>

              {/* 하단 설치일 경계선 마감 패딩 초밀착 */}
              <div className="flex items-center justify-between gap-2 pt-0.5 mt-0.5 border-t border-slate-100 dark:border-gray-700/40 text-[11px]">
                <div className="text-[11.5px] text-slate-400 dark:text-gray-500 font-normal">
                  {hasReplacement ? <span className="text-slate-600 dark:text-gray-300 font-black bg-slate-100/80 dark:bg-gray-700/40 px-1 py-0.25 rounded">교체 {formatDate(el.installationDe)}</span> : el.installationDe ? <span>설치 {formatDate(el.installationDe)}</span> : null}
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