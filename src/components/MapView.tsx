import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GeoGroup, ElevatorWithBadges } from '../types';
import { ensureKakaoReady } from '../utils/api';
import { formatDate, formatRatedSpeed, checkShuttleSection } from '../utils/elevatorHelpers';
import { Maximize, Minimize } from 'lucide-react';
import { removeBookmark } from '../utils/bookmarks';

interface MapViewProps {
  geoGroups: GeoGroup[];
  geocoding: boolean;
  totalElevators: number;
  onMarkerClick: (elevator: ElevatorWithBadges) => void;
  visible?: boolean;
  bookmarkedIds?: Set<string>;
  viewedIds?: Set<string>;
  onMapReady?: () => void;
  mapKey?: number;
  onBookmarkChange?: () => void;
  onShowBookmarkPicker?: (elevator: ElevatorWithBadges) => void;
  focusAddress?: string;
}

export default function MapView({
  geoGroups = [],
  geocoding,
  totalElevators,
  onMarkerClick,
  visible = true,
  bookmarkedIds = new Set(),
  viewedIds = new Set(),
  onMapReady,
  mapKey = 0,
  onBookmarkChange,
  onShowBookmarkPicker,
  focusAddress,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const customMarkersRef = useRef<any[]>([]);
  const hasSetBoundsRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const openedOverlayRef = useRef<any>(null);
  const openedGroupRef = useRef<GeoGroup | null>(null);
  const prevGeoGroupsRef = useRef<GeoGroup[]>([]);

  const prevBookmarkedKeyRef = useRef<string>('');
  const prevViewedKeyRef = useRef<string>('');
  const prevMapKeyRef = useRef<number>(0);

  const closeAllOverlays = useCallback(() => {
    overlaysRef.current.forEach(overlay => {
      if (overlay && typeof overlay.setMap === 'function') overlay.setMap(null);
    });
    openedOverlayRef.current = null;
    openedGroupRef.current = null;
  }, []);

  const reopenOverlay = useCallback(() => {
    if (openedOverlayRef.current && mapInstanceRef.current) {
      openedOverlayRef.current.setMap(mapInstanceRef.current);
    }
  }, []);

  useEffect(() => {
    if (visible && mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current.relayout();
        if (openedOverlayRef.current) {
          setTimeout(() => reopenOverlay(), 100);
        }
      }, 50);
    }
  }, [visible, reopenOverlay]);

  // Focus on specific address when focusAddress prop changes
  const focusAddressRef = useRef<string>('');
  const pendingFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusAddress) return;

    // Store pending focus if map or geoGroups not ready
    const targetGroup = geoGroups.find(g => g.address === focusAddress);
    if (!targetGroup) {
      pendingFocusRef.current = focusAddress;
      return;
    }

    if (!mapInstanceRef.current) {
      pendingFocusRef.current = focusAddress;
      return;
    }

    // Skip if already processed this exact focus address successfully
    if (focusAddressRef.current === focusAddress) return;

    // Mark as processed
    focusAddressRef.current = focusAddress;
    pendingFocusRef.current = null;

    const kakao = (window as any).kakao;
    const position = new kakao.maps.LatLng(targetGroup.lat, targetGroup.lng);
    mapInstanceRef.current.panTo(position);
    // Close existing overlay and open the target one
    closeAllOverlays();
    // Find and open the overlay for this group
    const overlayIndex = geoGroups.findIndex(g => g.address === focusAddress);
    if (overlayIndex !== -1 && overlaysRef.current[overlayIndex]) {
      overlaysRef.current[overlayIndex].setMap(mapInstanceRef.current);
      openedOverlayRef.current = overlaysRef.current[overlayIndex];
      openedGroupRef.current = targetGroup;
    }
  }, [focusAddress, geoGroups, closeAllOverlays]);

  // Process pending focus when map instance becomes available
  useEffect(() => {
    if (!mapInstanceRef.current || !pendingFocusRef.current) return;

    const focusAddr = pendingFocusRef.current;
    const targetGroup = geoGroups.find(g => g.address === focusAddr);
    if (!targetGroup) return;

    pendingFocusRef.current = null;
    focusAddressRef.current = focusAddr;

    const kakao = (window as any).kakao;
    const position = new kakao.maps.LatLng(targetGroup.lat, targetGroup.lng);
    mapInstanceRef.current.panTo(position);
    closeAllOverlays();
    const overlayIndex = geoGroups.findIndex(g => g.address === focusAddr);
    if (overlayIndex !== -1 && overlaysRef.current[overlayIndex]) {
      overlaysRef.current[overlayIndex].setMap(mapInstanceRef.current);
      openedOverlayRef.current = overlaysRef.current[overlayIndex];
      openedGroupRef.current = targetGroup;
    }
  }, [geoGroups, closeAllOverlays]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const geoGroupsKey = JSON.stringify(geoGroups.map(g => ({ address: g.address, lat: g.lat, lng: g.lng, count: g.elevators.length })));

  useEffect(() => {
    let isCurrent = true;

    async function renderMap() {
      if (!geoGroups || geoGroups.length === 0) {
        customMarkersRef.current.forEach(m => m.setMap(null));
        customMarkersRef.current = [];
        closeAllOverlays();
        return;
      }

      try {
        await ensureKakaoReady();
        if (!isCurrent) return;

        const kakao = (window as any).kakao;
        if (!kakao || !kakao.maps) return;

        const isNewMap = !mapInstanceRef.current && mapContainerRef.current;
        const prevKey = JSON.stringify(prevGeoGroupsRef.current.map(g => ({ address: g.address, lat: g.lat, lng: g.lng, count: g.elevators.length })));
        
        const bookmarkedKey = Array.from(bookmarkedIds).sort().join(',');
        const viewedKey = Array.from(viewedIds).sort().join(',');
        const mapKeyChanged = mapKey !== prevMapKeyRef.current;

        const geoGroupsChanged = geoGroupsKey !== prevKey;
        const bookmarksChanged = bookmarkedKey !== prevBookmarkedKeyRef.current;
        const viewedChanged = viewedKey !== prevViewedKeyRef.current;

        const shouldRedrawMarkers = geoGroupsChanged || bookmarksChanged || viewedChanged || mapKeyChanged;

        if (mapKeyChanged) {
          hasSetBoundsRef.current = false;
        }

        if (shouldRedrawMarkers) {
          customMarkersRef.current.forEach(m => m.setMap(null));
          customMarkersRef.current = [];
          
          overlaysRef.current.forEach(overlay => {
            if (overlay && typeof overlay.setMap === 'function') overlay.setMap(null);
          });
          overlaysRef.current = [];
          
          if (geoGroupsChanged) {
            openedOverlayRef.current = null;
            openedGroupRef.current = null;
          }
        }

        const bounds = new kakao.maps.LatLngBounds();
        geoGroups.forEach(group => {
          bounds.extend(new kakao.maps.LatLng(group.lat, group.lng));
        });

        if (isNewMap) {
          mapInstanceRef.current = new kakao.maps.Map(mapContainerRef.current, {
            center: new kakao.maps.LatLng(geoGroups[0].lat, geoGroups[0].lng),
            level: 3
          });
          mapInstanceRef.current.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
          mapInstanceRef.current.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
          if (onMapReady) onMapReady();
          // ★ 펜딩 포커스: overlay는 아직 생성되지 않았으므로 focusAddressRef만 설정
          // 실제 overlay 열기는 shouldRedrawMarkers 루프 이후에 처리
        }

        if (isNewMap && !hasSetBoundsRef.current) {
          mapInstanceRef.current.setBounds(bounds);
          setTimeout(() => {
            if (mapInstanceRef.current && isCurrent) {
              mapInstanceRef.current.relayout();
              mapInstanceRef.current.setBounds(bounds);
            }
          }, 150);
          hasSetBoundsRef.current = true;
        }

        if (shouldRedrawMarkers) {
          prevGeoGroupsRef.current = geoGroups;
          prevBookmarkedKeyRef.current = bookmarkedKey;
          prevViewedKeyRef.current = viewedKey;
          prevMapKeyRef.current = mapKey;

          geoGroups.forEach(group => {
            const markerPosition = new kakao.maps.LatLng(group.lat, group.lng);
            const elevatorsList = group.elevators || [];
            const allModels = elevatorsList.map(e => e.elvtrModel ? String(e.elvtrModel).trim() : '승강기');
            const uniqueModels = Array.from(new Set(allModels));
            const firstModelName = uniqueModels[0] || '승강기';
            
            const baseText = firstModelName.slice(0, 6);
            const markerLabel = uniqueModels.length > 1 ? `${baseText} 등` : baseText;

            const hasBookmarked = elevatorsList.some(e => bookmarkedIds.has(e.elevatorNo));
            const hasViewed = elevatorsList.some(e => viewedIds.has(e.elevatorNo));
            
            const primaryElevator = elevatorsList[0];
            const primaryManu = primaryElevator?.manufacturerName || '';
            
            let markerColorClass = 'bg-[#8B4513]';
            if (hasBookmarked) {
              markerColorClass = 'bg-yellow-500';
            } else if (hasViewed) {
              markerColorClass = 'bg-slate-400 dark:bg-gray-500';
            } else {
              if (primaryManu.includes('현대엘')) markerColorClass = 'bg-emerald-600';
              else if (primaryManu.includes('오티스엘')) markerColorClass = 'bg-indigo-600';
              else if (primaryManu.includes('티케이엘')) markerColorClass = 'bg-sky-500';
              else if (primaryManu.includes('미쓰비시') || primaryManu.includes('후지테크')) markerColorClass = 'bg-red-500';
            }

            const markerElement = document.createElement('div');
            markerElement.className = 'cursor-pointer transform hover:scale-110 transition-transform active:scale-[0.97]';
            if (hasBookmarked) {
              markerElement.innerHTML = `
                <div class="flex flex-col items-center relative">
                  <div class="bg-yellow-400 animate-ping rounded-full opacity-75 absolute w-8 h-8 -top-0.5"></div>
                  <div class="${markerColorClass} text-white text-[10.5px] font-bold px-2.5 py-0.5 rounded-full shadow-lg border-[3px] border-yellow-300 flex items-center justify-center min-w-[34px] h-7 whitespace-nowrap gap-0.5 tracking-tight relative z-10 scale-110">
                    <span class="text-[9px] font-bold">${markerLabel}</span>
                    <span class="text-[11px] font-black">${elevatorsList.length}</span>
                  </div>
                  <div class="w-1.5 h-1.5 ${markerColorClass} rotate-45 -mt-1 border-r-2 border-b-2 border-yellow-300 shadow-sm relative z-10"></div>
                </div>
              `;
            } else {
              markerElement.innerHTML = `
                <div class="flex flex-col items-center">
                  <div class="${markerColorClass} text-white text-[10.5px] font-bold px-2 py-0.5 rounded-full shadow-lg border-2 border-white flex items-center justify-center min-w-[30px] h-6 whitespace-nowrap gap-0.5 tracking-tight">
                    <span class="text-[9px] font-bold">${markerLabel}</span>
                    <span class="text-[11px] font-black">${elevatorsList.length}</span>
                  </div>
                  <div class="w-1 h-1 ${markerColorClass} rotate-45 -mt-0.5 border-r border-b border-white shadow-sm"></div>
                </div>
              `;
            }

            const customMarkerOverlay = new kakao.maps.CustomOverlay({
              position: markerPosition,
              content: markerElement,
              yAnchor: 1.0
            });

            customMarkerOverlay.setMap(mapInstanceRef.current);
            customMarkersRef.current.push(customMarkerOverlay);

            const bldgGroups: Record<string, ElevatorWithBadges[]> = {};
            elevatorsList.forEach((ev) => {
              const bName = ev.buldNm ? ev.buldNm.trim() : '건물명 미기재';
              if (!bldgGroups[bName]) bldgGroups[bName] = [];
              bldgGroups[bName].push(ev);
            });
            const bldgEntries = Object.entries(bldgGroups);
            const isMultiBuilding = bldgEntries.length > 1;

            const overlayContent = document.createElement('div');
            overlayContent.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-200/50 dark:border-gray-700/50 p-2.5 w-[calc(100vw-32px)] max-w-[285px] relative font-sans';

            const blockMapInteractions = (e: Event) => { e.stopPropagation(); };
            ['wheel', 'mousewheel', 'DOMMouseScroll', 'mousedown', 'touchstart', 'pointerdown', 'dblclick'].forEach(evt => {
              overlayContent.addEventListener(evt, blockMapInteractions, { passive: true });
            });

            const cleanAddress = (group.address || '').replace(/·/g, ' ').replace(/\s+/g, ' ').trim();

            overlayContent.innerHTML = `
              <div class="flex justify-between items-start mb-1.5 pr-5">
                <div class="min-w-0 flex-1">
                  <h4 class="text-[14px] font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1 truncate">
                    ${isMultiBuilding ? `🏢 복합 주소지 (건물 ${bldgEntries.length}곳)` : group.buildingName || '지정 건물'}
                  </h4>
                  <p class="text-[10.5px] text-slate-400 dark:text-gray-500 mt-0.5 font-normal truncate">${cleanAddress}</p>
                </div>
              </div>
              <div class="max-h-[195px] overflow-y-auto space-y-1.5 pr-0.5" style="scrollbar-width: thin; -webkit-overflow-scrolling: touch;">
                ${bldgEntries.map(([bName, evs]) => {
                  return `
                    <div class="space-y-1">
                      ${isMultiBuilding ? `
                        <div class="flex items-center gap-1.5 px-0.5 py-0 sticky top-0 bg-white dark:bg-gray-800 z-10">
                          <div class="w-0.5 h-2 bg-blue-500 rounded-full"></div>
                          <span class="text-[10px] font-semibold text-gray-600 dark:text-gray-400 truncate max-w-[170px]">${bName}</span>
                          <span class="text-[9px] font-bold text-blue-500 bg-blue-50/60 dark:bg-blue-950/40 px-1 rounded shrink-0">${evs.length}대</span>
                        </div>
                      ` : ''}
                      <div class="space-y-1">
                        ${evs.map((ev, idx) => {
                          const shuttle = checkShuttleSection(ev.shuttleSection);
                          const displaySpeed = formatRatedSpeed(ev.ratedSpeed);
                          const displayLoad = ev.liveLoad ? String(ev.liveLoad).replace(/kg|KG/gi, '').trim() + ' kg' : '';
                          const asignNo = (ev.elvtrAsignNo || '').trim().replace(/호기$|호$/, '');
                          const displayAsign = asignNo ? `${asignNo}호기` : `${idx + 1}호기`;

                          const isRowBookmarked = bookmarkedIds.has(ev.elevatorNo);
                          const isRowViewed = viewedIds.has(ev.elevatorNo);

                          const maxGround = ev.buildingMaxGround || 0;
                          const maxUnderground = ev.buildingMaxUnderground || 0;
                          
                          const currentGround = parseInt(ev.divGroundFloorCnt) || 0;
                          const currentUnderground = parseInt(ev.divUndgrndFloorCnt) || 0;
                          
                          const showHighestLowest = elevatorsList.length >= 2;
                          const isTopGround = showHighestLowest && maxGround > 0 && currentGround === maxGround;
                          const isDeepUnderground = showHighestLowest && maxUnderground > 0 && currentUnderground === maxUnderground;

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
                            ? 'bg-purple-50/40 text-purple-500 dark:text-purple-400 border-purple-100 dark:border-purple-900/30 font-bold text-[9.5px]'
                            : 'bg-slate-50 dark:bg-gray-700/50 text-slate-400 dark:text-gray-500 border-slate-200 dark:border-gray-600 font-normal text-[9.5px]';

                          const statusBadgeClass = ev.elvtrStts === '운행중' 
                            ? 'bg-emerald-50/60 text-emerald-600 dark:text-emerald-400 border-emerald-100/70 dark:border-emerald-900/30' 
                            : 'bg-amber-50/60 text-amber-600 dark:text-amber-400 border-amber-100/70 dark:border-amber-900/30';

                          const hasReplacement = ev.frstInstallationDe && ev.installationDe && ev.frstInstallationDe !== ev.installationDe;
                          const dateDisplayHtml = hasReplacement
                            ? `<span class="text-slate-700 dark:text-gray-300 font-black bg-slate-100/80 dark:bg-gray-700/40 px-1 py-0.25 rounded">교체 ${formatDate(ev.installationDe)}</span>`
                            : ev.installationDe ? `<span>설치 ${formatDate(ev.installationDe)}</span>` : '';

                          const topGroundHtml = isTopGround ? `<span class="bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200/60 text-[8.5px] font-bold rounded px-1 py-0 shrink-0">최고층</span>` : '';
                          const deepUndergroundHtml = isDeepUnderground ? `<span class="bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200/60 text-[8.5px] font-bold rounded px-1 py-0 shrink-0">최저층</span>` : '';
                          const specialSectionHtml = (!shuttle.valid && ev.shuttleSection) ? `<span class="bg-purple-50/60 dark:bg-purple-950/10 text-purple-500 dark:text-purple-400 border border-purple-100/60 text-[8.5px] font-bold rounded px-1 py-0 shrink-0">특이</span>` : '';

                          const bookmarkIconHtml = isRowBookmarked
                            ? `<button data-bookmark="${ev.elevatorNo}" data-bookmarked="true" class="p-1 rounded transition-all bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 shrink-0 focus:outline-none flex items-center justify-center" title="북마크 제거"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></button>`
                            : `<button data-bookmark="${ev.elevatorNo}" data-bookmarked="false" class="p-1 rounded transition-all bg-gray-100/50 text-gray-400 hover:bg-gray-200/50 hover:text-gray-600 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 shrink-0 focus:outline-none flex items-center justify-center" title="북마크 추가"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></button>`;

                          return `
                            <div data-id="${ev.elevatorNo}" class="${rowBgClass} ${rowOpacityClass} w-full text-left flex flex-col p-1.5 rounded-lg border border-transparent cursor-pointer transition-all group space-y-0.5 relative">
                              <div class="flex items-center justify-between gap-1.5 w-full">
                                <div class="flex items-center gap-1 min-w-0 flex-wrap flex-1">
                                  <span class="px-1 py-0 bg-slate-50 dark:bg-gray-700/60 text-slate-500 dark:text-gray-400 text-[9px] font-bold rounded border border-slate-200/40 dark:border-gray-600/40 shrink-0">${displayAsign}</span>
                                  <span class="text-[12px] font-bold text-slate-700 dark:text-gray-200 truncate max-w-[110px]">${ev.installationPlace || '위치 미기재'}</span>
                                  <span class="px-1 py-0 bg-slate-50/50 dark:bg-gray-700/40 text-slate-400 dark:text-gray-500 rounded text-[9.5px] border border-slate-200/30 dark:border-gray-600/30 font-normal shrink-0 tracking-tight">${ev.elevatorNo}</span>
                                  ${topGroundHtml}
                                  ${deepUndergroundHtml}
                                  ${specialSectionHtml}
                                </div>
                                <div class="shrink-0 flex items-center ml-auto z-10">
                                  ${bookmarkIconHtml}
                                </div>
                              </div>

                              <div class="space-y-0.5 w-full min-w-0">
                                ${(ev.manufacturerName || ev.elvtrModel) ? `
                                  <div class="flex items-center gap-1 min-w-0 text-[13px]">
                                    <span class="text-slate-800 dark:text-gray-200 font-black tracking-tight truncate max-w-[135px] inline-block shrink-0">${ev.manufacturerName}</span>
                                    ${ev.manufacturerName && ev.elvtrModel ? `<span class="text-slate-200 dark:text-gray-700 text-[10px] shrink-0 font-normal">|</span>` : ''}
                                    <span class="${modelColorClass} font-black tracking-tight truncate">${ev.elvtrModel}</span>
                                  </div>
                                ` : ''}
                                ${(ev.shuttleSection || ev.ratedSpeed || ev.liveLoad) ? `
                                  <div class="flex items-center gap-1 text-[10.5px] text-slate-400 dark:text-gray-500 font-medium min-w-0 flex-wrap">
                                    <span class="px-1 py-0 rounded border shrink-0 ${shuttleBadgeClass}">${ev.shuttleSection || '전층'} 운행</span>
                                    <span class="shrink-0">${displaySpeed}</span>
                                    ${displaySpeed && displayLoad ? `<span class="text-slate-200 dark:text-gray-700 font-normal shrink-0">•</span>` : ''}
                                    <span class="shrink-0">${displayLoad}</span>
                                  </div>
                                ` : ''}
                              </div>

                              <div class="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-50/60 dark:border-gray-700/40 w-full text-[10.5px] text-slate-400 dark:text-gray-500">
                                <span>${dateDisplayHtml}</span>
                                <span class="px-1.5 py-0 text-[9.5px] font-bold rounded border tracking-tight shrink-0 ${statusBadgeClass}">${ev.elvtrStts || '-'}</span>
                              </div>

                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors';
            closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

            const customOverlay = new kakao.maps.CustomOverlay({ 
              content: overlayContent, 
              position: markerPosition, 
              yAnchor: 1.15,
              zIndex: 50 
            });

            closeBtn.onclick = (e) => {
              e.stopPropagation();
              customOverlay.setMap(null);
              if (openedOverlayRef.current === customOverlay) {
                openedOverlayRef.current = null;
                openedGroupRef.current = null;
              }
            };
            overlayContent.appendChild(closeBtn);
            overlaysRef.current.push(customOverlay);

            markerElement.onclick = () => {
              closeAllOverlays();
              customOverlay.setMap(mapInstanceRef.current);
              openedOverlayRef.current = customOverlay;
              openedGroupRef.current = group;
            };

            overlayContent.addEventListener('click', async (e) => {
              const target = e.target as HTMLElement;
              
              const bookmarkBtn = target.closest('[data-bookmark]');
              if (bookmarkBtn) {
                e.stopPropagation();
                const elvNo = bookmarkBtn.getAttribute('data-bookmark');
                const isBookmarked = bookmarkBtn.getAttribute('data-bookmarked') === 'true';
                if (elvNo) {
                  if (isBookmarked) {
                    await removeBookmark(elvNo);
                    window.dispatchEvent(new Event('bookmarksUpdated'));
                    if (onBookmarkChange) onBookmarkChange();
                  } else {
                    const found = group.elevators.find(ev => ev.elevatorNo === elvNo);
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
                const found = group.elevators.find(ev => ev.elevatorNo === elvNo);
                if (found) {
                  const foundMaxGround = found.buildingMaxGround || 0;
                  const foundMaxUnderground = found.buildingMaxUnderground || 0;
                  // ★ 스코프 버그 완전 수리: 외부 루프의 group.elevators를 바라보도록 안전 캡슐화 완료
                  const isMultiElevator = group.elevators.length >= 2;
                  onMarkerClick({
                    ...found,
                    isTopGround: isMultiElevator && foundMaxGround > 0 && (parseInt(found.divGroundFloorCnt) || 0) === foundMaxGround,
                    isDeepUnderground: isMultiElevator && foundMaxUnderground > 0 && (parseInt(found.divUndgrndFloorCnt) || 0) === foundMaxUnderground,
                  });
                }
              }
            });

            if (openedGroupRef.current && openedGroupRef.current.address === group.address && openedGroupRef.current.buildingName === group.buildingName) {
              customOverlay.setMap(mapInstanceRef.current);
              openedOverlayRef.current = customOverlay;
            }
          });

          // ★ 펜딩 포커스 처리: overlay 생성 후 해당 overlay 열기
          if (pendingFocusRef.current && mapInstanceRef.current && isCurrent) {
            const focusAddr = pendingFocusRef.current;
            const targetIdx = geoGroups.findIndex(g => g.address === focusAddr);
            if (targetIdx !== -1 && overlaysRef.current[targetIdx]) {
              pendingFocusRef.current = null;
              focusAddressRef.current = focusAddr;
              const targetGroup = geoGroups[targetIdx];
              const position = new kakao.maps.LatLng(targetGroup.lat, targetGroup.lng);
              // 약간의 지연 후 panTo + overlay 열기
              setTimeout(() => {
                if (mapInstanceRef.current && isCurrent) {
                  mapInstanceRef.current.panTo(position);
                  overlaysRef.current[targetIdx].setMap(mapInstanceRef.current);
                  openedOverlayRef.current = overlaysRef.current[targetIdx];
                  openedGroupRef.current = targetGroup;
                }
              }, 150);
            }
          }
        }

      } catch (err) {
        console.error('[MapView] 렌더링 동기화 오류:', err);
      }
    }

    renderMap();
    return () => { isCurrent = false; };
  }, [geoGroupsKey, bookmarkedIds, viewedIds, closeAllOverlays, onMarkerClick, onMapReady, mapKey, onBookmarkChange, onShowBookmarkPicker]);

  return (
    <div ref={wrapperRef} className={`w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-2 shadow-sm relative ${isFullscreen ? 'fixed inset-0 z-50 rounded-none p-0 border-0 flex flex-col' : ''}`}>
      <div ref={mapContainerRef} className={`w-full rounded-xl bg-gray-50 dark:bg-gray-700 relative z-0 ${isFullscreen ? 'flex-1 rounded-none' : ''}`} style={isFullscreen ? { width: '100%', height: '100%' } : { width: '100%', height: '540px' }} />
      <button
        onClick={toggleFullscreen}
        className="absolute z-20 bg-white dark:bg-gray-700 rounded-lg shadow-md border border-gray-200 dark:border-gray-600 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors top-4 right-4"
        title={isFullscreen ? '전체화면 종료' : '전체화면'}
      >
        {isFullscreen ? <Minimize size={16} className="text-gray-700 dark:text-gray-300" /> : <Maximize size={16} className="text-gray-700 dark:text-gray-300" />}
      </button>
      {geocoding && geoGroups.length === 0 && (
        <div className="absolute inset-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl space-y-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">문이 열립니다</p>
        </div>
      )}
    </div>
  );
}