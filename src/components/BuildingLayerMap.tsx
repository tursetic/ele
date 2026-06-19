import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { ensureKakaoReady, fetchEleBuildings, EleBuildingFeature } from '../utils/api';
import { searchByAddress } from '../utils/api';
import { sortElevators, assignBadges, formatRatedSpeed, formatElevatorNo, checkShuttleSection, formatDate } from '../utils/elevatorHelpers';
import { Maximize, Minimize, Loader2, Navigation } from 'lucide-react';
import { ElevatorWithBadges, SettingsFields } from '../types';
import { removeBookmark } from '../utils/bookmarks';

interface BuildingLayerMapProps {
  onBuildingSelect: (elevators: ElevatorWithBadges[], forceOpenModal: boolean) => void;
  onLoadingStateChange: (loading: boolean) => void;
  visible: boolean;
  settings?: SettingsFields;
  bookmarkedIds?: Set<string>;
  viewedIds?: Set<string>;
  onBookmarkChange?: () => void;
  onShowBookmarkPicker?: (elevator: ElevatorWithBadges) => void;
}

function getBuildingTextKey(buldNm: string, address: string): string {
  const cleanBuld = (buldNm || '').trim().replace(/\s+/g, '');
  const cleanAddr = (address || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  return `${cleanBuld}_${cleanAddr}`;
}

export default function BuildingLayerMap({
  onBuildingSelect,
  onLoadingStateChange,
  visible,
  settings,
  bookmarkedIds = new Set(),
  viewedIds = new Set(),
  onBookmarkChange,
  onShowBookmarkPicker
}: BuildingLayerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const customMarkersRef = useRef<any[]>([]);
  const previewOverlaysRef = useRef<any[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const currentLocationOverlayRef = useRef<any>(null); 
  
  const elvToBuildingKeyMapRef = useRef<Map<string, string>>(new Map());
  const fetchedFeaturesRef = useRef<EleBuildingFeature[]>([]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [zoomTooHigh, setZoomTooHigh] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeOverlayBuldIdRef = useRef<string | null>(null);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cachedBoundsRef = useRef<{ xmin: number; ymin: number; xmax: number; ymax: number } | null>(null);
  const lastZoomLevelRef = useRef<number | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      if (currentLocationOverlayRef.current) currentLocationOverlayRef.current.setMap(null);
    };
  }, []);

  // 🎯 수정 전: visible만 감시하던 useEffect 구역을 찾아 아래 코드로 교체합니다.
  useEffect(() => {
    if (mapInstanceRef.current) {
      // 1. 지도의 크기 재배정 엔진 가동
      mapInstanceRef.current.relayout();
      
      // 2. 전체화면 전환 시 맵 중심점이 마커 밖으로 이탈하지 않도록 현재 중심 좌표 재고정
      const currentCenter = mapInstanceRef.current.getCenter();
      mapInstanceRef.current.setCenter(currentCenter);
    }
  }, [visible, isFullscreen]); // isFullscreen 상태 변화 감지 추가

  // 🎯 기존 toggleFullscreen 함수 블록을 완전히 지우고 아래 코드로 교체합니다.
  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
  
    // 1. 이미 전체화면 상태라면 안전하게 해제 프로세스 진행
    if (document.fullscreenElement || isFullscreen) {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
      return;
    }
  
    // 2. 전체화면 진입 시도 (모바일/iOS 샌드박스 가드 탑재)
    if (wrapperRef.current.requestFullscreen) {
      wrapperRef.current.requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
        })
        .catch(() => {
          // 🎯 [모바일 핵심 가드] 네이티브 전체화면이 거절당하면 즉시 CSS 페이크 전체화면 모드로 우회 구동합니다.
          setIsFullscreen(true);
        });
    } else {
      // requestFullscreen 명세 자체가 아예 존재하지 않는 iOS/아이폰 브라우저 대응
      setIsFullscreen(true);
    }
  };

  const { bookmarkedMgtKeys, viewedMgtKeys, bookmarkedTextKeys, viewedTextKeys } = useMemo(() => {
    const bMgt = new Set<string>();
    const vMgt = new Set<string>();
    const bText = new Set<string>();
    const vText = new Set<string>();
    
    const cleanBookmarkedIds = new Set(Array.from(bookmarkedIds).map(id => id.toString().trim()));
    const cleanViewedIds = new Set(Array.from(viewedIds).map(id => id.toString().trim()));

    try {
      const stored = localStorage.getItem('elevatorViewHistory');
      if (stored) {
        const history = JSON.parse(stored) as any[];
        history.forEach((entry) => {
          if (!entry) return;
          const targetData = entry.elevatorData || entry.elevator || entry;
          const m1 = targetData.buldMgtNo1;
          const m2 = targetData.buldMgtNo2;
          const elvNo = entry.elevatorNo || targetData.elevatorNo;
          
          const buldNm = targetData.buldNm || entry.buldNm || '';
          const addr = targetData.address1 || targetData.address2 || entry.query || '';

          if (elvNo) {
            const cleanNo = elvNo.toString().trim();
            if (m1 && m2) {
              const mgtKey = `${m1.toString().trim()}_${m2.toString().trim()}`;
              if (cleanBookmarkedIds.has(cleanNo)) bMgt.add(mgtKey);
              if (cleanViewedIds.has(cleanNo)) vMgt.add(mgtKey);
            }
            if (buldNm && addr) {
              const textKey = getBuildingTextKey(buldNm, addr);
              if (cleanBookmarkedIds.has(cleanNo)) bText.add(textKey);
              if (cleanViewedIds.has(cleanNo)) vText.add(textKey);
            }
          }
        });
      }

      elvToBuildingKeyMapRef.current.forEach((mgtKey, elvNo) => {
        if (cleanBookmarkedIds.has(elvNo)) bMgt.add(mgtKey);
        if (cleanViewedIds.has(elvNo)) vMgt.add(mgtKey);
      });

    } catch (e) {
      console.error(e);
    }

    return { 
      bookmarkedMgtKeys: bMgt, viewedMgtKeys: vMgt,
      bookmarkedTextKeys: bText, viewedTextKeys: vText 
    };
  }, [bookmarkedIds, viewedIds, visible]);

  const renderBuildingMarkers = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || fetchedFeaturesRef.current.length === 0) return;

    customMarkersRef.current.forEach(m => m.setMap(null));
    customMarkersRef.current = [];

    const level = map.getLevel();
    const coordinateGroups: Record<string, EleBuildingFeature[]> = {};

    fetchedFeaturesRef.current.forEach((feat) => {
      if (!feat?.geometry?.coordinates) return;
      const coordKey = `${feat.geometry.coordinates[0].toFixed(6)}_${feat.geometry.coordinates[1].toFixed(6)}`;
      if (!coordinateGroups[coordKey]) coordinateGroups[coordKey] = [];
      coordinateGroups[coordKey].push(feat);
    });

    Object.values(coordinateGroups).forEach((groupFeatures) => {
      const isShared = groupFeatures.length > 1;

      groupFeatures.forEach((feat, index) => {
        let lng = feat.geometry.coordinates[0];
        let lat = feat.geometry.coordinates[1];

        if (isShared) {
          const angle = (index * 2 * Math.PI) / groupFeatures.length;
          const radius = 0.00016 * Math.sqrt(index + 1);
          lng += radius * Math.cos(angle);
          lat += radius * Math.sin(angle) * 0.78;
        }

        const markerPosition = new kakao.maps.LatLng(lat, lng);
        const buildingNameRaw = feat.properties.BULD_NM ? feat.properties.BULD_NM.trim() : '';
        const buildingAddressRaw = feat.properties.ADDRESS ? feat.properties.ADDRESS.trim() : '';
        const buildingId = `${buildingNameRaw}_${buildingAddressRaw}`;

        const m1 = feat.properties.BULD_MGT_NO1 ? feat.properties.BULD_MGT_NO1.toString().trim() : '';
        const m2 = feat.properties.BULD_MGT_NO2 ? feat.properties.BULD_MGT_NO2.toString().trim() : '';
        const currentMgtKey = `${m1}_${m2}`;
        const currentTextKey = getBuildingTextKey(buildingNameRaw, buildingAddressRaw);

        const isBuldBookmarked = bookmarkedMgtKeys.has(currentMgtKey) || bookmarkedTextKeys.has(currentTextKey);
        const isBuldViewed = viewedMgtKeys.has(currentMgtKey) || viewedTextKeys.has(currentTextKey);

        let markerColorClass = 'bg-blue-600 border-white text-white';
        if (isBuldBookmarked) {
          markerColorClass = 'bg-yellow-500 border-yellow-300 text-white';
        } else if (isBuldViewed) {
          markerColorClass = 'bg-slate-400 dark:bg-gray-500 border-white text-white';
        }

        const markerElement = document.createElement('div');
        markerElement.className = 'cursor-pointer transform hover:scale-110 transition-transform active:scale-95';
        
        if (level >= 3) {
          markerElement.innerHTML = `
            <div class="${markerColorClass} text-[10px] font-black w-5 h-5 rounded-full shadow-md border flex items-center justify-center tracking-tight">
              ${feat.properties.ELVTR_CNT}
            </div>
          `;
        } else {
          markerElement.innerHTML = `
            <div class="flex flex-col items-center">
              <div class="${markerColorClass} text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-md border flex items-center justify-center min-w-[28px] h-5 whitespace-nowrap gap-0.5 tracking-tight">
                <span class="max-w-[65px] truncate text-[9px] font-bold">${feat.properties.BULD_NM}</span>
                <span class="bg-white text-blue-600 font-black px-0.5 rounded-sm text-[9.5px] h-3.5 flex items-center justify-center min-w-[11px]">${feat.properties.ELVTR_CNT}</span>
              </div>
              <div class="w-1 h-1 ${markerColorClass.split(' ')[0]} rotate-45 -mt-0.5 shadow-sm"></div>
            </div>
          `;
        }

        const customMarkerOverlay = new kakao.maps.CustomOverlay({
          position: markerPosition,
          content: markerElement,
          yAnchor: level >= 3 ? 0.5 : 1.0,
        });

        markerElement.onclick = async (e) => {
          e.stopPropagation();
          closeAllPreviews();
          onLoadingStateChange(true);

          const addrRaw = feat.properties.ADDRESS || '';
          const addrParts = addrRaw.split(/\s+/).filter(Boolean);
          const sidoParam = addrParts[0] || undefined;
          const sigunguParam = addrParts[1] || undefined;
          const requestedRows = feat.properties.ELVTR_CNT ? feat.properties.ELVTR_CNT + 20 : 100;

          try {
            const res = await searchByAddress({
              sido: sidoParam,
              sigungu: sigunguParam,
              buldNm: buildingNameRaw,
              pageNo: 1,
              ...({ numOfRows: requestedRows.toString() } as any)
            });
            
            if (res.items && res.items.length > 0) {
              const targetM1 = (feat.properties.BULD_MGT_NO1 || '').toString().trim();
              const targetM2 = (feat.properties.BULD_MGT_NO2 || '').toString().trim();

              res.items.forEach((item: any) => {
                const itemM1 = (item.buldMgtNo1 || '').toString().trim();
                const itemM2 = (item.buldMgtNo2 || '').toString().trim();
                const itemNo = item.elevatorNo ? item.elevatorNo.toString().trim() : '';
                if (itemM1 && itemM2 && itemNo) {
                  elvToBuildingKeyMapRef.current.set(itemNo, `${itemM1}_${itemM2}`);
                }
              });

              const filteredItems = res.items.filter((item: any) => {
                const itemM1 = (item.buldMgtNo1 || '').toString().trim();
                const itemM2 = (item.buldMgtNo2 || '').toString().trim();
                if (!itemM1 && !itemM2) {
                  return (item.buldNm || '').trim() === buildingNameRaw;
                }
                return itemM1 === targetM1 && itemM2 === targetM2;
              });

              if (filteredItems.length > 0) {
                const sorted = sortElevators(filteredItems);
                const withBadges = assignBadges(sorted);
                
                const gMax = Math.max(...withBadges.map(ev => parseInt(ev.divGroundFloorCnt, 10) || 0));
                const uMax = Math.max(...withBadges.map(ev => parseInt(ev.divUndgrndFloorCnt, 10) || 0));
                
                const enhanced: ElevatorWithBadges[] = withBadges.map(ev => ({
                  ...ev,
                  buildingMaxGround: gMax,
                  buildingMaxUnderground: uMax,
                }));

                activeOverlayBuldIdRef.current = buildingId;

                const rowsHtml = enhanced.map((ev, idx) => {
                  const shuttle = checkShuttleSection(ev.shuttleSection);
                  const displaySpeed = formatRatedSpeed(ev.ratedSpeed);
                  const displayLoad = ev.liveLoad ? String(ev.liveLoad).replace(/kg/gi, '').trim() + ' kg' : '';
                  const asignNo = (ev.elvtrAsignNo || '').trim().replace(/호기$|호$/, '');
                  const displayAsign = asignNo ? `${asignNo}호기` : `${idx + 1}호기`;
                  const displayAsignWithPlace = ev.installationPlace 
                    ? `${displayAsign} (${ev.installationPlace.trim()})` 
                    : displayAsign;

                  const isOriginalMulti = enhanced.length >= 2;
                  const isTopGround = isOriginalMulti && gMax > 0 && (parseInt(ev.divGroundFloorCnt, 10) || 0) === gMax;
                  const isDeepUnderground = isOriginalMulti && uMax > 0 && (parseInt(ev.divUndgrndFloorCnt, 10) || 0) === uMax;

                  const cleanRowNo = ev.elevatorNo ? ev.elevatorNo.toString().trim() : '';
                  const isRowBookmarked = bookmarkedIds.has(cleanRowNo);
                  const isRowViewed = viewedIds.has(cleanRowNo);

                  const rowBgClass = isRowBookmarked
                    ? 'bg-yellow-100/20 dark:bg-yellow-800/10 border-l-4 border-l-yellow-500'
                    : isRowViewed
                    ? 'bg-slate-50/30 dark:bg-slate-900/5 border-l-2 border-l-slate-200/50 dark:border-l-gray-700'
                    : 'bg-white dark:bg-gray-800 border-l-2 border-l-slate-200/40 dark:border-l-gray-700/40';
                    
                  const rowOpacityClass = isRowViewed && !isRowBookmarked ? 'opacity-55' : '';

                  let modelColorClass = 'text-[#8B4513] dark:text-[#EAA850]';
                  const manu = ev.manufacturerName || '';
                  if (manu.includes('현대엘')) modelColorClass = 'text-emerald-600 dark:text-emerald-400';
                  else if (manu.includes('오티스엘')) modelColorClass = 'text-indigo-600 dark:text-indigo-400';
                  else if (manu.includes('티케이엘')) modelColorClass = 'text-sky-500 dark:text-sky-400';
                  else if (manu.includes('미쓰비시') || manu.includes('후지테크')) modelColorClass = 'text-red-500 dark:text-red-400';

                  const shuttleBadgeClass = !shuttle.valid
                    ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50 font-bold text-[9.5px]'
                    : 'bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-700/40 font-normal text-[9.5px]';

                  const statusBadgeClass = ev.elvtrStts === '운행중' 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50' 
                    : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50';

                  const standardizedBadgeClass = 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium border border-slate-200/40 dark:border-gray-600/40 text-[9.5px] shrink-0';

                  const topGroundHtml = isTopGround ? `<span class="bg-amber-50/40 dark:bg-amber-950/10 text-amber-600/90 dark:text-amber-500/80 border border-amber-200/30 text-[8.5px] font-normal rounded px-1 shrink-0 whitespace-nowrap">최고층</span>` : '';
                  const deepUndergroundHtml = isDeepUnderground ? `<span class="bg-slate-100 dark:bg-gray-800 text-slate-500 text-[8.5px] font-normal rounded px-1 shrink-0 whitespace-nowrap">최저층</span>` : '';
                  const specialSectionHtml = (!shuttle.valid && ev.shuttleSection) ? `<span class="bg-purple-50/60 dark:bg-purple-950/10 text-purple-500 dark:text-purple-400 border border-purple-100/60 text-[8.5px] font-bold rounded px-1 py-0 shrink-0 whitespace-nowrap">특이</span>` : '';

                  const hasReplacement = ev.frstInstallationDe && ev.installationDe && ev.frstInstallationDe !== ev.installationDe;
                  let dateDisplayHtml = '';
                  if (hasReplacement) {
                    dateDisplayHtml = `
                      <div class="flex flex-col gap-0 leading-none">
                        <span class="text-slate-600 dark:text-gray-400 text-[11px] font-semibold leading-tight">교체 ${formatDate(ev.installationDe)}</span>
                        <span class="text-slate-400 dark:text-gray-500 text-[9.5px] font-medium leading-tight">최초설치 ${formatDate(ev.frstInstallationDe)}</span>
                      </div>
                    `;
                  } else if (ev.installationDe) {
                    dateDisplayHtml = `
                      <div class="flex flex-col gap-0 leading-none">
                        <span class="text-slate-600 dark:text-gray-400 text-[11px] font-medium leading-tight">설치 ${formatDate(ev.installationDe)}</span>
                      </div>
                    `;
                  }

                  const kindBadgeHtml = ev.elvtrKindNm
                    ? `<span class="bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded border border-slate-200/40 dark:border-gray-600/40 text-[9.5px] font-bold shrink-0 self-center">${ev.elvtrKindNm}</span>`
                    : '';

                  const bookmarkIconHtml = isRowBookmarked
                    ? `<button data-bookmark="${ev.elevatorNo}" data-bookmarked="true" class="p-1 rounded transition-all bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 shrink-0 focus:outline-none flex items-center justify-center" title="북마크 제거"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></button>`
                    : `<button data-bookmark="${ev.elevatorNo}" data-bookmarked="false" class="p-1 rounded transition-all bg-gray-100/50 text-gray-400 hover:bg-200/50 hover:text-gray-600 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 shrink-0 focus:outline-none flex items-center justify-center" title="북마크 추가"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></button>`;

                  const statusBadgeHtml = (!settings || settings.elvtrStts) && ev.elvtrStts
                    ? `<span class="px-1.5 py-0.25 text-[10.5px] font-bold rounded border tracking-tight ${statusBadgeClass}">${ev.elvtrStts}</span>`
                    : '';

                  return `
                    <div data-id="${ev.elevatorNo}" class="${rowBgClass} ${rowOpacityClass} w-full text-left flex flex-col p-1.5 rounded-lg border border-transparent cursor-pointer transition-all space-y-0.5 relative">
                      <div class="flex items-center justify-between gap-1.5 w-full">
                        <div class="flex items-center gap-1 min-w-0 overflow-hidden flex-1">
                          <span class="px-1.5 py-0.25 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 text-[9.5px] font-bold rounded border border-slate-200/40 dark:border-gray-600/40 shrink-0 whitespace-nowrap">${displayAsignWithPlace}</span>
                          <span class="${standardizedBadgeClass}">${formatElevatorNo(ev.elevatorNo)}</span>
                          ${topGroundHtml}
                          ${deepUndergroundHtml}
                          ${specialSectionHtml}
                        </div>
                        <div class="shrink-0 flex items-center ml-auto z-10">
                          ${bookmarkIconHtml}
                        </div>
                      </div>
                      <div class="space-y-0.5 w-full min-w-0">
                        <div class="flex items-center gap-1 min-w-0 text-[13px] mt-0.5">
                          <span class="text-slate-900 dark:text-gray-100 font-black tracking-tight shrink-0">${ev.manufacturerName || '제조사 미기재'}</span>
                          ${ev.manufacturerName && ev.elvtrModel ? `<span class="text-slate-200 dark:text-gray-700 text-[10px] shrink-0 font-normal">|</span>` : ''}
                          <span class="${modelColorClass} font-black tracking-tight truncate">${ev.elvtrModel || '모델명 미기재'}</span>
                        </div>
                        <div class="flex items-center gap-1 text-[10.5px] text-slate-400 dark:text-gray-500 font-medium min-w-0 flex-wrap">
                          <span class="px-1.5 py-0.25 rounded border text-[9.5px] font-bold ${shuttleBadgeClass}">${ev.shuttleSection || '전층'} 운행</span>
                          <span class="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium">${displaySpeed}</span>
                          <span class="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium">${displayLoad}</span>
                        </div>
                      </div>
                      <div class="flex items-center justify-between gap-2 pt-1 mt-1 border-t border-slate-100 dark:border-gray-700/40 text-[11px]">
                        <div class="flex items-center gap-1.5">
                          ${dateDisplayHtml}
                          ${kindBadgeHtml}
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          ${statusBadgeHtml}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('');

                const overlayContent = document.createElement('div');
                overlayContent.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-200/50 dark:border-gray-700/50 p-2.5 w-[calc(100vw-32px)] max-w-[265px] relative font-sans text-left z-[100]';

                ['wheel', 'mousewheel', 'mousedown', 'touchstart', 'pointerdown', 'dblclick'].forEach(evt => {
                  overlayContent.addEventListener(evt, (ev) => ev.stopPropagation(), { passive: true });
                });

                const cleanAddress = (feat.properties.ADDRESS || '').trim();

                overlayContent.innerHTML = `
                  <div class="flex justify-between items-start mb-1.5 pr-5">
                    <div class="min-w-0 flex-1">
                      <h4 class="text-[13.5px] font-bold text-gray-800 dark:text-gray-100 truncate">${feat.properties.BULD_NM}</h4>
                      <p class="text-[10.5px] text-slate-400 dark:text-gray-400 mt-0.5 font-normal truncate">${cleanAddress}</p>
                    </div>
                  </div>
                  <div class="max-h-[195px] overflow-y-auto overflow-x-hidden space-y-1 pr-0.5" style="scrollbar-width: thin; -webkit-overflow-scrolling: touch;">
                    <div class="space-y-1">
                      ${rowsHtml}
                    </div>
                  </div>
                `;

                const closeBtn = document.createElement('button');
                closeBtn.className = 'absolute top-2.5 right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none';
                closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

                const previewOverlay = new kakao.maps.CustomOverlay({ 
                  content: overlayContent, 
                  position: markerPosition, 
                  yAnchor: 1.12,
                  zIndex: 60 
                });

                closeBtn.onclick = (ev) => {
                  ev.stopPropagation();
                  previewOverlay.setMap(null);
                  if (activeOverlayBuldIdRef.current === buildingId) {
                    activeOverlayBuldIdRef.current = null;
                  }
                };
                overlayContent.appendChild(closeBtn);

                overlayContent.addEventListener('click', async (ev) => {
                  const target = ev.target as HTMLElement;
                  
                  const bookmarkBtn = target.closest('[data-bookmark]');
                  if (bookmarkBtn) {
                    ev.stopPropagation();
                    const elvNo = bookmarkBtn.getAttribute('data-bookmark');
                    const isBookmarked = bookmarkBtn.getAttribute('data-bookmarked') === 'true';
                    if (elvNo) {
                      if (isBookmarked) {
                        await removeBookmark(elvNo);
                        window.dispatchEvent(new Event('bookmarksUpdated'));
                        if (onBookmarkChange) onBookmarkChange();
                      } else {
                        const found = enhanced.find(item => item.elevatorNo === elvNo);
                        if (found && onShowBookmarkPicker) {
                          onShowBookmarkPicker(found);
                        }
                      }
                    }
                    return;
                  }

                  const rowClickable = target.closest('[data-id]');
                  if (rowClickable) {
                    const elvNo = rowClickable.getAttribute('data-id');
                    const found = enhanced.find(item => item.elevatorNo === elvNo);
                    if (found) {
                      onBuildingSelect([found], true);
                    }
                  }
                });

                previewOverlay.setMap(mapInstanceRef.current);
                previewOverlaysRef.current.push(previewOverlay);
              }
            }
          } catch (err) {
            console.error(err);
          } finally {
            onLoadingStateChange(false);
          }
        };

        customMarkerOverlay.setMap(map);
        customMarkersRef.current.push(customMarkerOverlay);
      });
    });
  }, [bookmarkedMgtKeys, viewedMgtKeys, bookmarkedTextKeys, viewedTextKeys, bookmarkedIds, viewedIds, onBookmarkChange, onShowBookmarkPicker, onBuildingSelect, onLoadingStateChange, settings]);

  useEffect(() => {
    if (mapInstanceRef.current && fetchedFeaturesRef.current.length > 0) {
      renderBuildingMarkers();
    }
  }, [bookmarkedMgtKeys, viewedMgtKeys, renderBuildingMarkers]);

  const handleMoveToCurrentLocation = () => {
    if (!mapInstanceRef.current) return;
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const kakao = (window as any).kakao;
          const currentLoc = new kakao.maps.LatLng(lat, lng);
          
          mapInstanceRef.current.panTo(currentLoc);

          if (currentLocationOverlayRef.current) {
            currentLocationOverlayRef.current.setMap(null);
          }

          const myLocElement = document.createElement('div');
          myLocElement.className = 'relative flex h-4 w-4 items-center justify-center';
          myLocElement.innerHTML = `
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-600 border-2 border-white shadow-md"></span>
          `;

          const myLocOverlay = new kakao.maps.CustomOverlay({
            position: currentLoc,
            content: myLocElement,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 99
          });

          myLocOverlay.setMap(mapInstanceRef.current);
          currentLocationOverlayRef.current = myLocOverlay;
        },
        (err) => {
          console.error('[Geolocation Error]', err);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  };

  const closeAllPreviews = () => {
    previewOverlaysRef.current.forEach(ov => {
      if (ov && typeof ov.setMap === 'function') ov.setMap(null);
    });
    previewOverlaysRef.current = [];
    activeOverlayBuldIdRef.current = null;
  };

  useEffect(() => {
    async function initMap() {
      await ensureKakaoReady();
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      const kakao = (window as any).kakao;

      const savedLat = localStorage.getItem('brelev_last_lat');
      const savedLng = localStorage.getItem('brelev_last_lng');
      const savedZoom = localStorage.getItem('brelev_last_zoom');

      const options = {
        center: savedLat && savedLng 
          ? new kakao.maps.LatLng(parseFloat(savedLat), parseFloat(savedLng))
          : new kakao.maps.LatLng(37.5665, 126.9780),
        level: savedZoom ? parseInt(savedZoom, 10) : 3,
      };
      
      const map = new kakao.maps.Map(mapContainerRef.current, options);
      map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
      map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      mapInstanceRef.current = map;

      kakao.maps.event.addListener(map, 'idle', () => {
        abortControllerRef.current?.abort();
        setScanning(true);

        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

        debounceTimeoutRef.current = setTimeout(async () => {
          const controller = new AbortController();
          abortControllerRef.current = controller;

          const center = map.getCenter();
          localStorage.setItem('brelev_last_lat', center.getLat().toString());
          localStorage.setItem('brelev_last_lng', center.getLng().toString());
          localStorage.setItem('brelev_last_zoom', map.getLevel().toString());

          const level = map.getLevel();
          
          if (lastZoomLevelRef.current !== null && lastZoomLevelRef.current !== level) {
            closeAllPreviews();
            cachedBoundsRef.current = null; 
          }
          lastZoomLevelRef.current = level;

          if (level > 8) {
            setZoomTooHigh(true);
            setScanning(false);
            customMarkersRef.current.forEach(m => m.setMap(null));
            customMarkersRef.current = [];
            closeAllPreviews();
            return;
          }
          setZoomTooHigh(false);

          const bounds = map.getBounds();
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();

          const currentXmin = sw.getLng();
          const currentYmin = sw.getLat();
          const currentXmax = ne.getLng();
          const currentYmax = ne.getLat();

          if (
            cachedBoundsRef.current &&
            currentXmin >= cachedBoundsRef.current.xmin &&
            currentXmax <= cachedBoundsRef.current.xmax &&
            currentYmin >= cachedBoundsRef.current.ymin &&
            currentYmax <= cachedBoundsRef.current.ymax
          ) {
            setScanning(false);
            return;
          }

          const latMargin = (currentYmax - currentYmin) * 0.3;
          const lngMargin = (currentXmax - currentXmin) * 0.3;

          const expandedBounds = {
            xmin: currentXmin - lngMargin,
            ymin: currentYmin - latMargin,
            xmax: currentXmax + lngMargin,
            ymax: currentYmax + latMargin,
          };
          
          const layerType = level >= 5 ? 'limit' : 'q';

          try {
            const features = await fetchEleBuildings(expandedBounds, layerType, controller.signal);
            
            cachedBoundsRef.current = expandedBounds;
            fetchedFeaturesRef.current = features;
            renderBuildingMarkers();

            if (!activeOverlayBuldIdRef.current) {
              closeAllPreviews();
            }

            setScanning(false);

          } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.error('스캔 실패:', err);
            setScanning(false);
          }
        }, 500);
      });
    }

    initMap();
  }, [renderBuildingMarkers]);

  return (
    <div ref={wrapperRef} className={`w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-2 shadow-sm relative ${isFullscreen ? 'fixed inset-0 z-50 rounded-none p-0 border-0 flex flex-col' : ''}`}>
      <div ref={mapContainerRef} className={`w-full rounded-xl bg-gray-50 dark:bg-gray-700 relative z-0 ${isFullscreen ? 'flex-1 rounded-none' : ''}`} style={isFullscreen ? { width: '100%', height: '100%' } : { width: '100%', height: '540px' }} />
      
      {zoomTooHigh && (
        <div className="absolute inset-0 bg-gray-900/5 backdrop-blur-[0.5px] z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 dark:bg-gray-800/95 shadow-xl border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 pointer-events-auto active:scale-95 transition-transform">
            🔍 지도를 조금 더 확대하면 승강기가 표시됩니다.
          </div>
        </div>
      )}

      <button
        onClick={toggleFullscreen}
        className="absolute z-20 bg-white dark:bg-gray-700 rounded-lg shadow-md border border-gray-200 dark:border-gray-600 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors top-4 left-4 focus:outline-none flex items-center justify-center"
      >
        {isFullscreen ? <Minimize size={16} className="text-gray-700 dark:text-gray-300" /> : <Maximize size={16} className="text-gray-700 dark:text-gray-300" />}
      </button>

      {scanning && !zoomTooHigh && (
        <div className="absolute top-4 left-[60px] z-20 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 shadow-sm">
          <Loader2 size={12} className="animate-spin text-blue-500" />
          <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">반경 승강기 스캔 중...</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleMoveToCurrentLocation}
        className="absolute z-20 bg-white dark:bg-gray-700 rounded-lg shadow-md border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 active:scale-95 transition-all bottom-4 right-4 focus:outline-none flex items-center justify-center w-8 h-8"
        title="현재 위치로 이동"
      >
        <Navigation size={15} className="text-blue-600 dark:text-blue-400 fill-current" />
      </button>
    </div>
  );
}
