import React from 'react';
import { Search } from 'lucide-react';
import { SearchTab } from '../types';
import { formatElevatorNo } from '../utils/elevatorHelpers';

interface Props {
  tab: SearchTab;
  onTabChange: (tab: SearchTab) => void;
  elevatorNoQuery: string;
  onElevatorNoQueryChange: (q: string) => void;
  sido: string;
  onSidoChange: (s: string) => void;
  sigungu: string;
  onSigunguChange: (s: string) => void;
  building: string;
  onBuildingChange: (b: string) => void;
  onSearch: () => void;
  loading: boolean;
}

export default function SearchFormAdvanced({
  tab,
  onTabChange,
  elevatorNoQuery,
  onElevatorNoQueryChange,
  sido,
  onSidoChange,
  sigungu,
  onSigunguChange,
  building,
  onBuildingChange,
  onSearch,
  loading,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch();
  };

  return (
    <div className="bg-white dark:bg-gray-800 px-4 pt-4 pb-2.5 shadow-sm space-y-2 shrink-0">
      {/* 5) 옅은 외곽 박스를 완벽히 철거하고 높이 마진을 최소화한 슬림 텍스트 가이드 라인 */}
      {tab === 'mapSearch' ? (
        <div className="text-center py-0.5">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium tracking-tight">
            지도를 움직이면 승강기 설치 건물이 실시간으로 자동 스캔됩니다.
          </p>
        </div>
      ) : tab === 'elevatorNo' ? (
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">승강기 고유번호 (7자리)</label>
          <input
            type="text"
            value={formatElevatorNo(elevatorNoQuery)}
            onChange={(e) => {
              const onlyNums = e.target.value.replace(/[^0-9]/g, '');
              onElevatorNoQueryChange(onlyNums.slice(0, 7));
            }}
            onKeyDown={handleKeyDown}
            placeholder="예: 0000-001"
            maxLength={8}
            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="w-[20%] shrink-0">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">시/도</label>
              <input
                type="text"
                value={sido}
                onChange={(e) => onSidoChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="예: 경기"
                className="w-full px-2 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="w-[80%]">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">도로명주소</label>
              <input
                type="text"
                value={sigungu}
                onChange={(e) => onSigunguChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="예: 의정부시 신평화로 274"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">건물명</label>
            <input
              type="text"
              value={building}
              onChange={(e) => onBuildingChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="예: 영진빌딩"
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        </>
      )}

      {tab !== 'mapSearch' && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onSearch}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 0 018-8v8z" />
                </svg>
                검색 중
              </>
            ) : (
              <>
                <Search size={16} />
                검색
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}