import React, { useEffect, useRef, useState } from 'react';
import { ensureKakaoReady, fetchEleBuildings, EleBuildingFeature } from '../utils/api';
import { searchByAddress } from '../utils/api';
import { sortElevators, assignBadges, formatRatedSpeed, checkShuttleSection, formatDate } from '../utils/elevatorHelpers';
import { Maximize, Minimize, Loader2 } from 'lucide-react';
import { ElevatorWithBadges } from '../types';
import { removeBookmark } from '../utils/bookmarks';

interface BuildingLayerMapProps {
  onBuildingSelect: (elevators: ElevatorWithBadges[], forceOpenModal: boolean) => void;
  onLoadingStateChange: (loading: boolean) => void;
}

export default function BuildingLayerMap({ onBuildingSelect, onLoadingStateChange }: BuildingLayerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const customMarkersRef = useRef<any[]>([]);
  const previewOverlaysRef = useRef<any[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [zoomTooHigh, setZoomTooHigh] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
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

  const closeAllPreviews = () => {
    previewOverlaysRef.current.forEach(ov => {
      if (ov && typeof ov.setMap === 'function') ov.setMap(null);
    });
    previewOverlaysRef.current = [];
  };

  useEffect(() => {
    async function initMap() {
      await ensureKakaoReady();
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      const kakao = (window as any).kakao;
      const options = {
        center: new kakao.maps.LatLng(37.5665, 126.9780),
        level: 3,
      };
      
      const map = new kakao.maps.Map(mapContainerRef.current, options);
      map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
      map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      mapInstanceRef.current = map;

      // 지도 조작 시 기존 오픈되어있던 호기별 프리뷰 박스 일제 소멸 처리
      kakao.maps.event.addListener(map, 'dragstart', closeAllPreviews);
      kakao.maps.event.addListener(map, 'zoom_start', closeAllPreviews);

      kakao.maps.event.addListener(map, 'idle', async () => {
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const level = map.getLevel();
        if (level > 4) {
          setZoomTooHigh(true);
          setScanning(false);
          customMarkersRef.current.forEach(m => m.setMap(null));
          customMarkersRef.current = [];
          closeAllPreviews();
          return;
        }
        setZoomTooHigh(false);
        setScanning(true);

        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        const boundsParams = {
          xmin: sw.getLng(),
          ymin: sw.getLat(),
          xmax: ne.getLng(),
          ymax: ne.getLat(),
        };

        try {
          const features = await fetchEleBuildings(boundsParams, controller.signal);
          
          customMarkersRef.current.forEach(m => m.setMap(null));
          customMarkersRef.current = [];

          features.forEach((feat: EleBuildingFeature) => {
            const lng = feat.geometry.coordinates[0];
            const lat = feat.geometry.coordinates[1];
            const markerPosition = new kakao.maps.LatLng(lat, lng);

            const markerElement = document.createElement('div');
            markerElement.className = 'cursor-pointer transform hover:scale-110 transition-transform active:scale-95';
            
            if (level >= 3) {
              markerElement.innerHTML = `
                <div class="bg-blue-600 text-white text-[10px] font-black w-5 h-5 rounded-full shadow-md border border-white flex items-center justify-center tracking-tight">
                  ${feat.properties.ELVTR_CNT}
                </div>
              `;
            } else {
              markerElement.innerHTML = `
                <div class="flex flex-col items-center">
                  <div class="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-md border border-white flex items-center justify-center min-w-[28px] h-5 whitespace-nowrap gap-0.5 tracking-tight">
                    <span class="max-w-[65px] truncate text-[9px] font-bold">${feat.properties.BULD_NM}</span>
                    <span class="bg-white text-blue-600 font-black px-0.5 rounded-sm text-[9.5px] h-3.5 flex items-center justify-center min-w-[11px]">${feat.properties.ELVTR_CNT}</span>
                  </div>
                  <div class="w-1 h-1 bg-blue-600 rotate-45 -mt-0.5 shadow-sm"></div>
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

              // 🎯 효율적 주소 가두기 파싱 기틀 성립: 앞 2단어 슬라이싱 분리 수입
              const addrRaw = feat.properties.ADDRESS || '';
              const addrParts = addrRaw.split(/\s+/).filter(Boolean);
              const sidoParam = addrParts[0] || undefined;
              const sigunguParam = addrParts[1] || undefined;

              // 🎯 대량 설치 빌딩 리스트 가드: 대수 누락 차단 버퍼 연산 적용
              const requestedRows = feat.properties.ELVTR_CNT ? feat.properties.ELVTR_CNT + 20 : 100;

              try {
                const res = await searchByAddress({
                  sido: sidoParam,
                  sigungu: sigunguParam,
                  buldNm: feat.properties.BULD_NM.trim(),
                  pageNo: 1,
                  // 공공데이터 요청 개수를 유동 버퍼 스케일로 우회 오버라이드 바인딩
                  ...({ numOfRows: requestedRows.toString() } as any)
                });
                
                if (res.items.length > 0) {
                  const sorted = sortElevators(res.items);
                  const withBadges = assignBadges(sorted);
                  
                  const gMax = Math.max(...withBadges.map(ev => parseInt(ev.divGroundFloorCnt, 10) || 0));
                  const uMax = Math.max(...withBadges.map(ev => parseInt(ev.divUndgrndFloorCnt, 10) || 0));
                  
                  const enhanced: ElevatorWithBadges[] = withBadges.map(ev => ({
                    ...ev,
                    buildingMaxGround: gMax,
                    buildingMaxUnderground: uMax,
                    isTopGround: gMax > 0 && (parseInt(ev.divGroundFloorCnt, 10) || 0) === gMax,
                    isDeepUnderground: uMax > 0 && (parseInt(ev.divUndgrndFloorCnt, 10) || 0) === uMax,
                  }));

                  // 🎯 [요청 핵심 로직] 1대면 다이렉트 모달행, 2대 이상이면 인라인 프리뷰 박스 렌더링 분기 시동
                  if (feat.properties.ELVTR_CNT === 1) {
                    onBuildingSelect(enhanced, true);
                  } else {
                    // MapView 패밀리룩을 온전히 수입한 고밀도 인라인 프리뷰 오버레이 빌드 개시
                    const overlayContent = document.createElement('div');
                    overlayContent.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-200/50 dark:border-gray-700/50 p-2.5 w-[calc(100vw-32px)] max-w-[285px] relative font-sans text-left z-[100]';

                    ['wheel', 'mousewheel', 'mousedown', 'touchstart', 'pointerdown', 'dblclick'].forEach(evt => {
                      overlayContent.addEventListener(evt, (ev) => ev.stopPropagation(), { passive: true });
                    });

                    const cleanAddress = (feat.properties.ADDRESS || '').trim();

                    overlayContent.innerHTML = `
                      <div class="flex justify-between items-start mb-1.5 pr-5">
                        <div class="min-w-0 flex-1">
                          <h4 class="text-[13.5px] font-bold text-gray-800 dark:text-gray-100 truncate">${feat.properties.BULD_NM}</h4>
                          <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5 truncate font-normal">${cleanAddress}</p>
                        </div>
                      </div>
                      <div class="max-h-[185px] overflow-y-auto space-y-1 pr-0.5" style="scrollbar-width: thin; -webkit-overflow-scrolling: touch;">
                        <div class="space-y-1">
                          ${enhanced.map((ev, idx) => {
                            const shuttle = checkShuttleSection(ev.shuttleSection);
                            const displaySpeed = formatRatedSpeed(ev.ratedSpeed);
                            const displayLoad = ev.liveLoad ? String(ev.liveLoad).replace(/kg/gi, '').trim() + ' kg' : '';
                            const asignNo = (ev.elvtrAsignNo || '').trim().replace(/호기$|호$/, '');
                            const displayAsign = asignNo ? `${asignNo}호기` : `${idx + 1}호기`;

                            const isTopGround = gMax > 0 && (parseInt(ev.divGroundFloorCnt, 10) || 0) === gMax;
                            const isDeepUnderground = uMax > 0 && (parseInt(ev.divUndgrndFloorCnt, 10) || 0) === uMax;

                            let modelColorClass = 'text-[#8B4513] dark:text-[#EAA850]';
                            const manu = ev.manufacturerName || '';
                            if (manu.includes('현대엘')) modelColorClass = 'text-emerald-600 dark:text-emerald-400';
                            else if (manu.includes('오티스엘')) modelColorClass = 'text-indigo-600 dark:text-indigo-400';
                            else if (manu.includes('티케이엘')) modelColorClass = 'text-sky-500 dark:text-sky-400';

                            const statusBadgeClass = ev.elvtrStts === '운행중' 
                              ? 'bg-emerald-50/60 text-emerald-600 dark:text-emerald-400 border-emerald-100/70' 
                              : 'bg-amber-50/60 text-amber-600 dark:text-amber-400 border-amber-100/70';

                            const hasReplacement = ev.frstInstallationDe && ev.installationDe && ev.frstInstallationDe !== ev.installationDe;
                            const dateDisplayHtml = hasReplacement
                              ? `<span class="text-slate-700 dark:text-gray-300 font-bold bg-slate-100/80 px-1 py-0.25 rounded">교체 ${formatDate(ev.installationDe)}</span>`
                              : ev.installationDe ? `<span>설치 ${formatDate(ev.installationDe)}</span>` : '';

                            return `
                              <div data-id="${ev.elevatorNo}" class="bg-white dark:bg-gray-800 border-l-2 border-l-slate-200/40 w-full text-left flex flex-col p-1.5 rounded-lg border border-transparent cursor-pointer transition-all hover:bg-slate-50/60 dark:hover:bg-slate-700/40 space-y-0.5 relative">
                                <div class="flex items-center justify-between gap-1.5 w-full">
                                  <div class="flex items-center gap-1 min-w-0 flex-wrap flex-1">
                                    <span class="px-1 py-0 bg-slate-50 dark:bg-gray-700/60 text-slate-500 dark:text-gray-400 text-[9px] font-bold rounded border border-slate-200/40 shrink-0">${displayAsign}</span>
                                    <span class="text-[11.5px] font-bold text-slate-700 dark:text-gray-200 truncate max-w-[110px]">${ev.installationPlace || '위치 미기재'}</span>
                                    <span class="px-1 py-0 bg-slate-50/50 text-slate-400 rounded text-[9px] font-normal shrink-0 tracking-tight">${ev.elevatorNo}</span>
                                    ${isTopGround ? `<span class="bg-slate-50 text-slate-600 border border-slate-200/60 text-[8px] font-bold rounded px-1 shrink-0">최고층</span>` : ''}
                                    ${isDeepUnderground ? `<span class="bg-slate-50 text-slate-600 border border-slate-200/60 text-[8px] font-bold rounded px-1 shrink-0">최저층</span>` : ''}
                                  </div>
                                </div>
                                <div class="space-y-0.5 w-full min-w-0">
                                  <div class="flex items-center gap-1 min-w-0 text-[12px]">
                                    <span class="text-slate-800 dark:text-gray-200 font-bold tracking-tight truncate max-w-[130px] shrink-0">${ev.manufacturerName}</span>
                                    <span class="${modelColorClass} font-bold tracking-tight truncate">${ev.elvtrModel}</span>
                                  </div>
                                  <div class="flex items-center gap-1 text-[10px] text-slate-400 font-medium min-w-0 flex-wrap">
                                    <span class="px-1 py-0 rounded border shrink-0 bg-slate-50 text-slate-400 font-normal text-[9px]">${ev.shuttleSection || '전층'} 운행</span>
                                    <span class="shrink-0">${displaySpeed}</span>
                                    <span class="shrink-0">${displayLoad}</span>
                                  </div>
                                </div>
                                <div class="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-50 text-[10px] text-slate-400">
                                  <span>${dateDisplayHtml}</span>
                                  <span class="px-1 py-0 text-[9px] font-bold rounded border tracking-tight shrink-0 ${statusBadgeClass}">${ev.elvtrStts || '-'}</span>
                                </div>
                              </div>
                            `;
                          }).join('')}
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
                    };
                    overlayContent.appendChild(closeBtn);

                    overlayContent.addEventListener('click', (ev) => {
                      const target = ev.target as HTMLElement;
                      const rowClickable = target.closest('[data-id]');
                      if (rowClickable) {
                        const elvNo = rowClickable.getAttribute('data-id');
                        const found = enhanced.find(item => item.elevatorNo === elvNo);
                        if (found) {
                          // 프리뷰 리스트 행 클릭 시 최종 타겟팅되어 상세 모달 연동망 작동
                          onBuildingSelect([found], true);
                        }
                      }
                    });

                    previewOverlay.setMap(mapInstanceRef.current);
                    previewOverlaysRef.current.push(previewOverlay);
                  }
                } else {
                  alert('공공데이터 포털에 등록된 상세 승강기 정보가 존재하지 않습니다.');
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
        } catch (err: any) {
          if (err.name !== 'AbortError') console.error('[건물 레이어] 스캔 실패:', err);
        } finally {
          setScanning(false);
        }
      });
    }

    initMap();
  }, [onBuildingSelect, onLoadingStateChange]);

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
        className="absolute z-20 bg-white dark:bg-gray-700 rounded-lg shadow-md border border-gray-200 dark:border-gray-600 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors top-4 right-4"
      >
        {isFullscreen ? <Minimize size={16} className="text-gray-700 dark:text-gray-300" /> : <Maximize size={16} className="text-gray-700 dark:text-gray-300" />}
      </button>
      {scanning && !zoomTooHigh && (
        <div className="absolute top-4 left-4 z-20 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 shadow-sm">
          <Loader2 size={12} className="animate-spin text-blue-500" />
          <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">반경 승강기 스캔 중...</span>
        </div>
      )}
    </div>
  );
}