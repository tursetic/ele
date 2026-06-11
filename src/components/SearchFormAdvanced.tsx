import React from 'react';
import { Search, Hash, MapPin, Layers } from 'lucide-react';
import { SearchTab } from '../types';

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
    <div className="bg-white dark:bg-gray-800 px-4 pt-4 pb-3 shadow-sm space-y-2">
      {/* Tab Switcher */}
      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-2">
        <button
          onClick={() => onTabChange('elevatorNo')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'elevatorNo'
              ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Hash size={14} />
          고유번호 검색
        </button>
        <button
          onClick={() => onTabChange('address')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'address'
              ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <MapPin size={14} />
          도로명 주소 검색
        </button>
        <button
          onClick={() => onTabChange('buildingLayer')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'buildingLayer'
              ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Layers size={14} />
          건물 레이어
        </button>
      </div>

      {/* 3. 렌더링 스위칭 조건문 분기구역 (건물 레이어 가이드 설명란 추가) */}
      {tab === 'buildingLayer' ? (
        <div className="py-3 text-center bg-slate-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">지도를 움직이면 현재 반경의 승강기 설치 건물들이 실시간으로 자동 스캔됩니다.</p>
        </div>
      ) : tab === 'elevatorNo' ? (
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">승강기 고유번호 (7자리)</label>
          <input
            type="text"
            value={elevatorNoQuery}
            onChange={(e) => onElevatorNoQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="예: 1234567"
            maxLength={7}
            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
      ) : (
        <>
          {/* Row 1: Sido (20%) + 도로명주소 mapped to sigungu API param (80%) */}
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

          {/* Row 2: Building */}
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

      {/* 4. 맨 하단 검색 버튼 구역 (건물 레이어 탭일 때 버튼 숨기기 가두기 완화) */}
      {tab !== 'buildingLayer' && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={onSearch}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-1.5"
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