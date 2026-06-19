import React, { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Elevator, FilterOptions } from '../types';

// 🎯 [완치 결합] elevatorHelpers.ts에 등록된 정품 포맷팅 함수들을 직접 이식하여 데이터 정합성을 100% 동기화합니다.
import { formatRatedSpeed, extractYear } from '../utils/elevatorHelpers';

interface Props {
  filters: FilterOptions;
  selected: Record<string, string[]>;
  onFilterChange: (key: string, values: string[]) => void;
  onClose: () => void;
  elevators: Elevator[];
  modelKeyword: string;
  onModelKeywordChange: (v: string) => void;
  minGroundFloor: string;
  onMinGroundFloorChange: (v: string) => void;
  minSpeed: string;
  onMinSpeedChange: (v: string) => void;
  hideEscalator: boolean;
  onHideEscalatorChange: (v: boolean) => void;
}

interface FilterSection {
  key: keyof FilterOptions;
  label: string;
  hasTextInput?: 'keyword' | 'number' | 'speed';
  isTree?: boolean;
}

const FILTER_SECTIONS: FilterSection[] = [
  { key: 'elvtrModel', label: '제조업체 및 모델명', hasTextInput: 'keyword', isTree: true },
  { key: 'divGroundFloorCnt', label: '지상층', hasTextInput: 'number' },
  { key: 'ratedSpeed', label: '정격 속도', hasTextInput: 'speed' },
  { key: 'installationYear', label: '설치 연도' },
  { key: 'liveLoad', label: '적재하중' },
  { key: 'elvtrDivNm', label: '승강기 구분' },
  { key: 'elvtrFormNm', label: '승강기 형식' },
  { key: 'elvtrKindNm', label: '승강기 종류' },
  { key: 'elvtrStts', label: '상태' },
  { key: 'lastResultNm', label: '검사 결과' },
];

const NUMERIC_SORT_KEYS = new Set([
  'divGroundFloorCnt',
  'ratedSpeed',
  'liveLoad',
  'installationYear',
]);

function parseLeadingNumber(str: string): number {
  const match = str.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

// 🎯 [정품 UX] 요구사항 반영: 체크박스 내부에 숫자가 표출되며, 선택 시 파란 배경에 흰 숫자가 영구 유지되는 컴포넌트
function CountCheckbox({ checked, count }: { checked: boolean; count: number }) {
  return (
    <div
      className={`min-w-[28px] h-5 rounded border text-[9.5px] font-bold flex items-center justify-center shrink-0 transition-colors tracking-tighter px-0.5 ${
        checked 
          ? 'bg-blue-600 border-blue-600 text-white shadow-xs' 
          : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
      }`}
    >
      {count}
    </div>
  );
}

export default function FilterSidebar({
  filters,
  selected,
  onFilterChange,
  onClose,
  elevators,
  modelKeyword,
  onModelKeywordChange,
  minGroundFloor,
  onMinGroundFloorChange,
  minSpeed,
  onMinSpeedChange,
  hideEscalator,
  onHideEscalatorChange,
}: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['elvtrModel']));

  // 🎯 [완치 엔진] 원본 데이터 배열을 훑으며 정품 포맷팅 결과물 값 그대로 카운팅 키를 일치시킵니다.
  const filterCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {
      divGroundFloorCnt: {},
      ratedSpeed: {},
      installationYear: {},
      liveLoad: {},
      elvtrDivNm: {},
      elvtrFormNm: {},
      elvtrKindNm: {},
      elvtrStts: {},
      lastResultNm: {},
      elvtrModel: {},
    };

    elevators.forEach((el: any) => {
      // 1. 일반 필드 카운팅
      const standardFields = ['elvtrDivNm', 'elvtrFormNm', 'elvtrKindNm', 'elvtrStts', 'lastResultNm', 'divGroundFloorCnt'];
      standardFields.forEach((f) => {
        const val = el[f]?.toString().trim();
        if (val) counts[f][val] = (counts[f][val] || 0) + 1;
      });

      // 2. [정격 속도 완치] helpers.ts 정품 formatRatedSpeed 통과 결과물로 카운팅 키를 통일하여 0대 해제
      if (el.ratedSpeed) {
        const displaySpeed = formatRatedSpeed(el.ratedSpeed);
        counts['ratedSpeed'][displaySpeed] = (counts['ratedSpeed'][displaySpeed] || 0) + 1;
      }

      // 3. [적재 하중 완치] 원본의 liveLoad 문자열 원형 그대로 카운팅 매핑하여 0대 해제
      if (el.liveLoad) {
        const loadVal = el.liveLoad.toString().trim();
        counts['liveLoad'][loadVal] = (counts['liveLoad'][loadVal] || 0) + 1;
      }

      // 4. [설치 연도 완치] 정품 extractYear 가동 결과물(4자리 순수 숫자 예: 2011)로 카운팅 매핑하여 0대 해제
      const year = extractYear(el.installationDe) || extractYear(el.frstInstallationDe);
      if (year) {
        counts['installationYear'][year] = (counts['installationYear'][year] || 0) + 1;
      }

      // 5. 모델명 카운팅
      if (el.elvtrModel) {
        const model = el.elvtrModel.trim();
        counts['elvtrModel'][model] = (counts['elvtrModel'][model] || 0) + 1;
      }
    });

    return counts;
  }, [elevators]);

  const mfrTree = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const el of elevators) {
      const mfr = el.manufacturerName?.trim();
      const model = el.elvtrModel?.trim();
      if (!mfr && !model) continue;
      const key = mfr || '기타';
      if (!map.has(key)) map.set(key, new Set());
      if (model) map.get(key)!.add(model);
    }
    const sorted = new Map<string, string[]>();
    const mfrNames = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'ko'));
    for (const mfr of mfrNames) {
      sorted.set(mfr, Array.from(map.get(mfr)!).sort((a, b) => a.localeCompare(b, 'ko')));
    }
    return sorted;
  }, [elevators]);

  const filteredMfrTree = useMemo(() => {
    if (!modelKeyword.trim()) return mfrTree;
    const kw = modelKeyword.toLowerCase();
    const result = new Map<string, string[]>();
    for (const [mfr, models] of mfrTree) {
      const matchingModels = models.filter((m) => m.toLowerCase().includes(kw));
      if (matchingModels.length > 0) {
        result.set(mfr, matchingModels);
      }
    }
    return result;
  }, [mfrTree, modelKeyword]);

  const toggleSection = (key: string) => {
    const next = new Set(expandedSections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedSections(next);
  };

  const toggleValue = (key: string, value: string) => {
    const current = selected[key] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onFilterChange(key, next);
  };

  const clearAll = () => {
    FILTER_SECTIONS.forEach(({ key }) => {
      onFilterChange(key, []);
    });
    onFilterChange('manufacturerName', []);
    onModelKeywordChange('');
    onMinGroundFloorChange('');
    onMinSpeedChange('');
    onHideEscalatorChange(true);
  };

  const getSortedValues = (key: keyof FilterOptions): string[] => {
    const values = filters[key];
    if (!values || values.length === 0) return [];

    if (NUMERIC_SORT_KEYS.has(key)) {
      return [...values].sort((a, b) => parseLeadingNumber(b) - parseLeadingNumber(a));
    }
    return [...values].sort((a, b) => a.localeCompare(b, 'ko'));
  };

  const renderTreeSection = () => {
    if (filteredMfrTree.size === 0) return null;
    const isExpanded = expandedSections.has('elvtrModel');
    const mfrSelected = selected['manufacturerName'] ?? [];
    const modelSelected = selected['elvtrModel'] ?? [];
    const totalSelected = mfrSelected.length + modelSelected.length;

    return (
      <div className="border-b border-gray-100 dark:border-gray-700/70">
        <button
          onClick={() => toggleSection('elvtrModel')}
          className={`w-full flex items-center justify-between px-3.5 py-3 transition-colors ${
            isExpanded ? 'bg-gray-50/80 dark:bg-gray-700/30' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/20'
          }`}
        >
          <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200">제조업체 및 모델명</span>
          <div className="flex items-center gap-1.5">
            {totalSelected > 0 && (
              <span className="text-[10px] bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-bold px-1.5 py-0.5 rounded-md">{totalSelected}</span>
            )}
            {isExpanded ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
          </div>
        </button>

        {isExpanded && (
          <div className="px-3.5 pt-2 pb-3 space-y-2 bg-white dark:bg-gray-800">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={modelKeyword}
                onChange={(e) => onModelKeywordChange(e.target.value)}
                placeholder="모델명 검색"
                className="w-full pl-7 pr-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: 'thin' }}>
              {Array.from(filteredMfrTree.entries()).map(([mfr, models]) => {
                const isMfrSelected = mfrSelected.includes(mfr);
                const mfrTotalCount = models.reduce((acc, m) => acc + (filterCounts['elvtrModel'][m] || 0), 0);

                return (
                  <div key={mfr} className="space-y-0.5">
                    {/* 🎯 화살표 접기 단추 완전 폐기 및 평면 단일 구조 리스트 고수 */}
                    <div className="flex items-center hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded transition-colors px-1">
                      <button
                        onClick={() => toggleValue('manufacturerName', mfr)}
                        className={`flex items-center gap-2 flex-1 py-1.5 text-[11px] text-left font-semibold transition-colors ${
                          isMfrSelected ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <CountCheckbox checked={isMfrSelected} count={mfrTotalCount} />
                        <span className="truncate">{mfr}</span>
                      </button>
                    </div>

                    <div className="ml-4 mt-0.5 mb-1 border-l border-gray-100 dark:border-gray-700 pl-2 space-y-0.5">
                      {models.map((model) => {
                        const isModelSelected = modelSelected.includes(model);
                        const modelCount = filterCounts['elvtrModel'][model] || 0;

                        return (
                          <button
                            key={model}
                            onClick={() => toggleValue('elvtrModel', model)}
                            className={`flex items-center gap-2 w-full py-1 px-1.5 rounded text-[10.5px] text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                              isModelSelected
                                ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/30 dark:bg-blue-950/10'
                                : 'text-gray-500 dark:text-gray-400 font-medium'
                            }`}
                          >
                            <CountCheckbox checked={isModelSelected} count={modelCount} />
                            <span className="truncate">{model}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // src/components/FilterSidebar.tsx 파일 맨 하단의 return (...) 시작 구역을 찾아 교체합니다.

  return (
    <div className="fixed inset-0 z-[250] flex" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative ml-auto bg-white dark:bg-gray-800 w-76 max-w-[85vw] h-screen flex flex-col shadow-2xl font-sans">
        
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0 bg-gray-50/50 dark:bg-gray-900/20">
          <h3 className="text-[13.5px] font-black text-gray-900 dark:text-gray-100">필터 검색옵션</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={clearAll}
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 active:scale-95 transition-all"
            >
              전체 초기화
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-200/60 dark:hover:bg-gray-700 transition-colors">
              <X size={15} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 py-1 bg-white dark:bg-gray-800" style={{ scrollbarWidth: 'thin' }}>
          
          {/* 🎯 [완치] 존재하지 않는 h-4.5를 파괴하고 표준 규격 우회 회로로 스위치 형태를 완벽 복구합니다. */}
          <div className="border-b border-gray-100 dark:border-gray-700/70 px-4 py-3 flex items-center justify-between gap-2 bg-white dark:bg-gray-800">
            <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200">
              에스컬레이터 · 무빙워크 숨김
            </span>
            <button
              type="button"
              onClick={() => onHideEscalatorChange(!hideEscalator)}
              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 focus:outline-none ${
                hideEscalator ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                  hideEscalator ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {renderTreeSection()}

          {FILTER_SECTIONS.filter(({ key, isTree }) => !isTree && key !== 'manufacturerName').map(({ key, label, hasTextInput }) => {
            const values = getSortedValues(key);
            if (!values || values.length === 0) return null;

            const isExpanded = expandedSections.has(key);
            const selectedCount = (selected[key] ?? []).length;

            return (
              <div key={key} className="border-b border-gray-100 dark:border-gray-700/70">
                <button
                  onClick={() => toggleSection(key)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 transition-colors ${
                    isExpanded ? 'bg-gray-50/80 dark:bg-gray-700/30' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/20'
                  }`}
                >
                  <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200">{label}</span>
                  <div className="flex items-center gap-1.5">
                    {selectedCount > 0 && (
                      <span className="text-[10px] bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-bold px-1.5 py-0.5 rounded-md">{selectedCount}</span>
                    )}
                    {isExpanded ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3.5 pt-2 pb-3 space-y-2 bg-white dark:bg-gray-800">
                    {hasTextInput === 'number' && (
                      <input
                        type="number"
                        value={minGroundFloor}
                        onChange={(e) => onMinGroundFloorChange(e.target.value)}
                        placeholder="최소 지상층"
                        min="0"
                        className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
                      />
                    )}
                    {hasTextInput === 'speed' && (
                      <input
                        type="number"
                        value={minSpeed}
                        onChange={(e) => onMinSpeedChange(e.target.value)}
                        placeholder="최소 정격 속도"
                        min="0"
                        step="0.1"
                        className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-[11px] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
                      />
                    )}

                    <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1" style={{ scrollbarWidth: 'thin' }}>
                      {values.map((value) => {
                        const isSelected = (selected[key] ?? []).includes(value);
                        const itemCount = filterCounts[key]?.[value] || 0;

                        return (
                          <button
                            key={value}
                            onClick={() => toggleValue(key, value)}
                            className={`flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-[11px] text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors ${
                              isSelected
                                ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/40 dark:bg-blue-950/15'
                                : 'text-gray-600 dark:text-gray-300 font-medium'
                            }`}
                          >
                            {/* 🎯 네모 상자 체크박스 대수 동적 바인딩 컴포넌트 호출 */}
                            <CountCheckbox checked={isSelected} count={itemCount} />
                            <span className="truncate">{value}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
