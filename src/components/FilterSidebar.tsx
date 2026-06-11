import React, { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, Search, ChevronRight } from 'lucide-react';
import { Elevator, FilterOptions } from '../types';

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

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'
      }`}
    >
      {checked && (
        <svg viewBox="0 0 10 8" width="5" height="4" fill="none">
          <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [collapsedMfrs, setCollapsedMfrs] = useState<Set<string>>(new Set());

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

  const toggleMfr = (mfr: string) => {
    const next = new Set(collapsedMfrs);
    if (next.has(mfr)) next.delete(mfr);
    else next.add(mfr);
    setCollapsedMfrs(next);
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
      <div className="border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => toggleSection('elvtrModel')}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">제조업체 및 모델명</span>
          <div className="flex items-center gap-1.5">
            {totalSelected > 0 && (
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">{totalSelected}</span>
            )}
            {isExpanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
          </div>
        </button>

        {isExpanded && (
          <div className="px-3 pb-2 space-y-1.5">
            <div className="relative">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={modelKeyword}
                onChange={(e) => onModelKeywordChange(e.target.value)}
                placeholder="모델명 검색"
                className="w-full pl-6 pr-2 py-1 bg-gray-50 dark:bg-gray-700 border-0 rounded text-[11px] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {Array.from(filteredMfrTree.entries()).map(([mfr, models]) => {
                const isMfrExpanded = !collapsedMfrs.has(mfr);
                const isMfrSelected = mfrSelected.includes(mfr);

                return (
                  <div key={mfr}>
                    <div className="flex items-center">
                      <button
                        onClick={() => toggleMfr(mfr)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                      >
                        <ChevronRight
                          size={10}
                          className={`text-gray-400 transition-transform ${isMfrExpanded ? 'rotate-90' : ''}`}
                        />
                      </button>
                      <button
                        onClick={() => toggleValue('manufacturerName', mfr)}
                        className={`flex items-center gap-1.5 flex-1 py-0.5 pr-1 text-[11px] text-left transition-colors ${
                          isMfrSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <Checkbox checked={isMfrSelected} />
                        <span className="truncate">{mfr}</span>
                        <span className="text-[9px] text-gray-400">({models.length})</span>
                      </button>
                    </div>

                    {isMfrExpanded && (
                      <div className="ml-5 space-y-0.5">
                        {models.map((model) => {
                          const isModelSelected = modelSelected.includes(model);
                          return (
                            <button
                              key={model}
                              onClick={() => toggleValue('elvtrModel', model)}
                              className={`flex items-center gap-1.5 w-full py-0.5 pr-1 text-[10px] text-left transition-colors ${
                                isModelSelected
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-gray-500 dark:text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              <Checkbox checked={isModelSelected} />
                              <span className="truncate">{model}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative ml-auto bg-white dark:bg-gray-800 w-72 max-w-[85vw] h-screen flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">필터</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={clearAll}
              className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
            >
              초기화
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <X size={14} className="text-gray-400" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 py-1">
          <div className="border-b border-gray-100 dark:border-gray-700">
            <button
              onClick={() => onHideEscalatorChange(!hideEscalator)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">에스컬레이터 숨기기</span>
              <div
                className={`w-7 h-4 rounded-full transition-colors relative shrink-0 ${
                  hideEscalator ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                    hideEscalator ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </button>
          </div>

          {renderTreeSection()}

          {FILTER_SECTIONS.filter(({ key, isTree }) => !isTree && key !== 'manufacturerName').map(({ key, label, hasTextInput }) => {
            const values = getSortedValues(key);
            if (!values || values.length === 0) return null;

            const isExpanded = expandedSections.has(key);
            const selectedCount = (selected[key] ?? []).length;

            return (
              <div key={key} className="border-b border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => toggleSection(key)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">{label}</span>
                  <div className="flex items-center gap-1.5">
                    {selectedCount > 0 && (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">{selectedCount}</span>
                    )}
                    {isExpanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-2 space-y-1.5">
                    {hasTextInput === 'number' && (
                      <input
                        type="number"
                        value={minGroundFloor}
                        onChange={(e) => onMinGroundFloorChange(e.target.value)}
                        placeholder="최소 지상층"
                        min="0"
                        className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-700 border-0 rounded text-[11px] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                    {hasTextInput === 'speed' && (
                      <input
                        type="number"
                        value={minSpeed}
                        onChange={(e) => onMinSpeedChange(e.target.value)}
                        placeholder="최소 속도 (m/min)"
                        min="0"
                        step="0.1"
                        className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-700 border-0 rounded text-[11px] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}

                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                      {values.map((value) => {
                        const isSelected = (selected[key] ?? []).includes(value);
                        return (
                          <button
                            key={value}
                            onClick={() => toggleValue(key, value)}
                            className={`flex items-center gap-1.5 w-full py-0.5 text-[11px] text-left transition-colors ${
                              isSelected
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 dark:text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            <Checkbox checked={isSelected} />
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
