import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { GeoGroup, ElevatorWithBadges, SettingsFields } from '../types';
import { ensureKakaoReady } from '../utils/api';
import { formatDate, formatRatedSpeed, formatElevatorNo, checkShuttleSection } from '../utils/elevatorHelpers';
import { Maximize, Minimize } from 'lucide-react';
import { removeBookmark } from '../utils/bookmarks';
import { MapState } from '../App';

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
  settings?: SettingsFields;
  restoreMode?: boolean;
}

export interface MapViewRef {
  getMapState: () => MapState | null;
  setMapState: (state: MapState) => void;
}

const MapView = forwardRef<MapViewRef, MapViewProps>(({
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
  settings,
  restoreMode = false,
}, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const templatesRef = useRef<any[]>([]); // overlays 위임 관리
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

  // ★ [지도 상태 보존] 외부에서 getMapState/setMapState 호출 가능하도록 노출
  useImperativeHandle(ref, () => ({
    getMapState: (): MapState | null => {
      if (!mapInstanceRef.current) return null;
      const center = mapInstanceRef.current.getCenter();
      return {
        center: { lat: center.getLat(), lng: center.getLng() },
        level: mapInstanceRef.current.getLevel(),
        openedOverlayAddress: openedGroupRef.current?.address || null,
      };
    },
    setMapState: (state: MapState) => {
      if (!mapInstanceRef.current) return;
      const kakao = (window as any).kakao;
      mapInstanceRef.current.setLevel(state.level);
      mapInstanceRef.current.setCenter(new kakao.maps.LatLng(state.center.lat, state.center.lng));
      if (state.openedOverlayAddress) {
        const groupIndex = geoGroups.findIndex(g => g.address === state.openedOverlayAddress);
        if (groupIndex !== -1 && overlaysRef.current[groupIndex]) {
          overlaysRef.current[groupIndex].setMap(mapInstanceRef.current);
          openedOverlayRef.current = overlaysRef.current[groupIndex];
          openedGroupRef.current = geoGroups[groupIndex];
        }
      }
    },
  }), [geoGroups]);

  // 🎯 [최적화 코어] 화면 내부 마커의 노출 한계선을 원본 순서 기준 300개로 변경하여 대량 로드 성능 보장
  const updateMarkerVisibility = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !customMarkersRef.current || customMarkersRef.current.length === 0) return;

    const bounds = map.getBounds();
    let insideBoundsCount = 0;
    const MAX_VISIBLE_MARKERS = 300;

    customMarkersRef.current.forEach((markerOverlay) => {
      if (!markerOverlay) return;
      const markerPosition = markerOverlay.getPosition();

      if (bounds.contain(markerPosition)) {
        if (insideBoundsCount < MAX_VISIBLE_MARKERS) {
          markerOverlay.setMap(map);
          insideBoundsCount++;
        } else {
          markerOverlay.setMap(null);
        }
      } else {
        markerOverlay.setMap(null);
      }
    });
  }, []);

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

  const focusAddressRef = useRef<string>('');
  const pendingFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusAddress) return;

    const targetGroup = geoGroups.find(g => g.address === focusAddress);
    if (!targetGroup) {
      pendingFocusRef.current = focusAddress;
      return;
    }

    if (!mapInstanceRef.current) {
      pendingFocusRef.current = focusAddress;
      return;
    }

    if (focusAddressRef.current === focusAddress) return;

    focusAddressRef.current = focusAddress;
    pendingFocusRef.current = null;

    const kakao = (window as any).kakao;
    const position = new kakao.maps.LatLng(targetGroup.lat, targetGroup.lng);
    mapInstanceRef.current.panTo(position);
    closeAllOverlays();
    const overlayIndex = geoGroups.findIndex(g => g.address === focusAddress);
    if (overlayIndex !== -1 && overlaysRef.current[overlayIndex]) {
      overlaysRef.current[overlayIndex].setMap(mapInstanceRef.current);
      openedOverlayRef.current = overlaysRef.current[overlayIndex];
      openedGroupRef.current = targetGroup;
    }
  }, [focusAddress, geoGroups, closeAllOverlays]);

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
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          const centerLat = (sw.getLat() + ne.getLat()) / 2;
          const centerLng = (sw.getLng() + ne.getLng()) / 2;
          const initialCenter = new kakao.maps.LatLng(centerLat, centerLng);

          mapInstanceRef.current = new kakao.maps.Map(mapContainerRef.current, {
            center: initialCenter,
            level: 6
          });
          
          mapInstanceRef.current.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
          mapInstanceRef.current.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
          if (onMapReady) onMapReady();
          
          kakao.maps.event.addListener(mapInstanceRef.current, 'idle', () => {
            updateMarkerVisibility();
          });
        }

        if (isNewMap && !restoreMode) {
          setTimeout(() => {
            if (mapInstanceRef.current && isCurrent) {
              mapInstanceRef.current.relayout();
              mapInstanceRef.current.setBounds(bounds);
            }
          }, 150);
        } else if (!isNewMap && geoGroupsChanged && !restoreMode) {
          setTimeout(() => {
            if (mapInstanceRef.current && isCurrent) {
              mapInstanceRef.current.relayout();
              mapInstanceRef.current.setBounds(bounds);
            }
          }, 50);
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
            overlayContent.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-200/50 dark:border-gray-700/50 p-2.5 w-[calc(100vw-32px)] max-w-[275px] relative font-sans';

            const blockMapInteractions = (e: Event) => { e.stopPropagation(); };
            ['wheel', 'mousewheel', 'DOMMouseScroll', 'mousedown', 'touchstart', 'pointerdown', 'dblclick'].forEach(evt => {
              overlayContent.addEventListener(evt, blockMapInteractions, { passive: true });
            });

            // 🎯 [완치] group.address(address1)에 갇혀있던 설계 한계를 깨고, 원본 데이터의 address2까지 유실 없이 결합합니다.
            const primaryEv = elevatorsList[0];
            const fullAddr = primaryEv 
              ? `${primaryEv.address1 || ''}${primaryEv.address2 ? ` ${primaryEv.address2}` : ''}` 
              : group.address || '';
            const cleanAddress = fullAddr.replace(/·/g, ' ').replace(/\s+/g, ' ').trim();

            // 🎯 [완치 통합 가두리] ElevatorCard v25 이식 및 번호 배지 동기화 마감
            const rowsHtml = bldgEntries.map(([bName, evs]) => {
              const buildingSectionHeader = isMultiBuilding ? `
                <div class="flex items-center gap-1.5 px-0.5 py-0 sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <div class="w-0.5 h-2 bg-blue-500 rounded-full"></div>
                  <span class="text-[10px] font-semibold text-gray-600 dark:text-gray-400 truncate max-w-[170px]">${bName}</span>
                  <span class="text-[9px] font-bold text-blue-500 bg-blue-50/60 dark:bg-blue-950/40 px-1 rounded shrink-0">${evs.length}대</span>
                </div>
              ` : '';

              const listRows = evs.map((ev, idx) => {
                const shuttle = checkShuttleSection(ev.shuttleSection);
                const displaySpeed = formatRatedSpeed(ev.ratedSpeed);
                const displayLoad = ev.liveLoad ? String(ev.liveLoad).replace(/kg|KG/gi, '').trim() + ' kg' : '';
                const asignNo = (ev.elvtrAsignNo || '').trim().replace(/호기$|호$/, '');
                const displayAsign = asignNo ? `${asignNo}호기` : `${idx + 1}호기`;
                const displayAsignWithPlace = ev.installationPlace 
                  ? `${displayAsign} (${ev.installationPlace.trim()})` 
                  : displayAsign;

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
                else if (manu.includes('미쓰비시') || primaryManu.includes('후지테크')) modelColorClass = 'text-red-500 dark:text-red-400';

                const shuttleBadgeClass = !shuttle.valid
                  ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50 font-bold text-[9.5px]'
                  : 'bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-700/40 font-normal text-[9.5px]';

                const statusBadgeClass = ev.elvtrStts === '운행중' 
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50' 
                  : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50';

                // 🎯 [완치 1] 호기 배지 레이아웃 테두리팩 형태로 번호 배지 디자인 일원화 (font-medium 지정)
                const standardizedBadgeClass = 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium border border-slate-200/40 dark:border-gray-600/40 text-[9.5px] shrink-0';

                // 🎯 [완치 2] 최고층/최저층 배지에 whitespace-nowrap을 주입하여 가로 폭 개행 현상을 원천 방어합니다.
                const topGroundHtml = isTopGround ? `<span class="bg-amber-50/40 dark:bg-amber-950/10 text-amber-600/90 dark:text-amber-500/80 border border-amber-200/30 text-[8.5px] font-normal rounded px-1 shrink-0 whitespace-nowrap">최고층</span>` : '';
                const deepUndergroundHtml = isDeepUnderground ? `<span class="bg-slate-100 dark:bg-gray-800 text-slate-500 text-[8.5px] font-normal rounded px-1 shrink-0 whitespace-nowrap">최저층</span>` : '';
                const specialSectionHtml = (!shuttle.valid && ev.shuttleSection) ? `<span class="bg-purple-50/60 dark:bg-purple-950/10 text-purple-500 dark:text-purple-400 border border-purple-100/60 text-[8.5px] font-bold rounded px-1 py-0 shrink-0">특이</span>` : '';

                // 🎯 [완치 3] 최초설치일 분리형 2줄 레이아웃 연산 가드 적용
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

                // 🎯 [완치 4] 승강기 종류 배지 스타일 통일화 (font-bold)
                const kindBadgeHtml = (!settings || settings.elvtrKindNm) && ev.elvtrKindNm
                  ? `<span class="bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded border border-slate-200/40 dark:border-gray-600/40 text-[9.5px] font-bold shrink-0 self-center">${ev.elvtrKindNm}</span>`
                  : '';

                const bookmarkIconHtml = isRowBookmarked
                  ? `<button data-bookmark="${ev.elevatorNo}" data-bookmarked="true" class="p-1 rounded transition-all bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 shrink-0 focus:outline-none flex items-center justify-center" title="북마크 제거"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></button>`
                  : `<button data-bookmark="${ev.elevatorNo}" data-bookmarked="false" class="p-1 rounded transition-all bg-gray-100/50 text-gray-400 hover:bg-gray-200/50 hover:text-gray-600 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 shrink-0 focus:outline-none flex items-center justify-center" title="북마크 추가"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></button>`;

                const statusBadgeHtml = (!settings || settings.elvtrStts) && ev.elvtrStts
                  ? `<span class="px-1.5 py-0.25 text-[10.5px] font-bold rounded border tracking-tight ${statusBadgeClass}">${ev.elvtrStts}</span>`
                  : '';

                return `
                  <div data-id="${ev.elevatorNo}" class="${rowBgClass} ${rowOpacityClass} w-full text-left flex flex-col p-1.5 rounded-lg border border-transparent cursor-pointer transition-all group space-y-0.5 relative">
                    <div class="flex items-center justify-between gap-1.5 w-full">
                      <div class="flex items-center gap-1 min-w-0 overflow-hidden">
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
                      ${(ev.manufacturerName || ev.elvtrModel) ? `
                        <div class="flex items-center gap-1 min-w-0 text-[13px] mt-0.5">
                          <span class="text-slate-900 dark:text-gray-100 font-black tracking-tight shrink-0">${ev.manufacturerName}</span>
                          ${ev.manufacturerName && ev.elvtrModel ? `<span class="text-slate-200 dark:text-gray-700 text-[10px] shrink-0 font-normal">|</span>` : ''}
                          <span class="${modelColorClass} font-black tracking-tight truncate">${ev.elvtrModel}</span>
                        </div>
                      ` : ''}
                      ${(ev.shuttleSection || ev.ratedSpeed || ev.liveLoad) ? `
                        <div class="flex items-center gap-1 text-[10.5px] text-slate-400 dark:text-gray-500 font-medium min-w-0 flex-wrap">
                          <span class="px-1.5 py-0.25 rounded border text-[9.5px] font-bold ${shuttleBadgeClass}">${ev.shuttleSection || '전층'} 운행</span>
                          <span class="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium">${displaySpeed}</span>
                          <span class="bg-slate-50 dark:bg-gray-800/60 text-slate-600 dark:text-gray-400 px-1.5 py-0.25 rounded font-medium">${displayLoad}</span>
                        </div>
                      ` : ''}
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

              return `
                <div class="space-y-1">
                  ${buildingSectionHeader}
                  <div class="space-y-1">
                    ${listRows}
                  </div>
                </div>
              `;
            }).join('');

            overlayContent.innerHTML = `
              <div class="flex justify-between items-start mb-1.5 pr-5">
                <div class="min-w-0 flex-1">
                  <h4 class="text-[14px] font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1 truncate">
                    ${isMultiBuilding ? `🏢 복합 주소지 (건물 ${bldgEntries.length}곳)` : group.buildingName || '지정 건물'}
                  </h4>
                  <p class="text-[10.5px] text-slate-400 dark:text-gray-400 mt-0.5 font-normal truncate">${cleanAddress}</p>
                </div>
              </div>
              <div class="max-h-[195px] overflow-y-auto overflow-x-hidden space-y-1 pr-0.5" style="scrollbar-width: thin; -webkit-overflow-scrolling: touch;">
                ${rowsHtml}
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

          updateMarkerVisibility();

          if (pendingFocusRef.current && mapInstanceRef.current && isCurrent) {
            const focusAddr = pendingFocusRef.current;
            const targetIdx = geoGroups.findIndex(g => g.address === focusAddr);
            if (targetIdx !== -1 && overlaysRef.current[targetIdx]) {
              pendingFocusRef.current = null;
              focusAddressRef.current = focusAddr;
              const targetGroup = geoGroups[targetIdx];
              const position = new kakao.maps.LatLng(targetGroup.lat, targetGroup.lng);
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
  }, [geoGroupsKey, bookmarkedIds, viewedIds, closeAllOverlays, onMarkerClick, onMapReady, mapKey, onBookmarkChange, onShowBookmarkPicker, settings]);

  return (
    <div ref={wrapperRef} className={`w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-2 shadow-sm relative ${isFullscreen ? 'fixed inset-0 z-50 rounded-none p-0 border-0 flex flex-col' : ''}`}>
      <div ref={mapContainerRef} className={`w-full rounded-xl bg-gray-50 dark:bg-gray-700 relative z-0 ${isFullscreen ? 'flex-1 rounded-none' : ''}`} style={isFullscreen ? { width: '100%', height: '100%' } : { width: '100%', height: '540px' }} />
      <button
        onClick={toggleFullscreen}
        className="absolute z-20 bg-white dark:bg-gray-700 rounded-lg shadow-md border border-gray-200 dark:border-gray-600 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors top-4 left-4"
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
});

export default MapView;