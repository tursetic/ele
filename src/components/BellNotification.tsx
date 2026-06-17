import React, { useEffect, useState } from 'react';
import { X, Bell, Trash2, Building2, ChevronRight } from 'lucide-react';
import { NotificationHistoryItem, getNotificationHistory, removeNotificationFromHistory, clearNotificationHistory, BookmarkChange } from '../utils/bookmarks';
import { formatElevatorNo, formatDate } from '../utils/elevatorHelpers';

interface Props {
  onClose: () => void;
  onItemClick?: (change: BookmarkChange) => void;
}

const NOTIFICATIONS_PER_PAGE = 10;

export default function BellNotification({ onClose, onItemClick }: Props) {
  const [notifications, setNotifications] = useState<NotificationHistoryItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setNotifications(getNotificationHistory());
    const handleUpdate = () => setNotifications(getNotificationHistory());
    window.addEventListener('notificationHistoryUpdated', handleUpdate);
    return () => window.removeEventListener('notificationHistoryUpdated', handleUpdate);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const hadPushState = !history.state?.bellOpen;
    if (hadPushState) history.pushState({ bellOpen: true }, '');
    const onPopState = () => onClose();
    window.addEventListener('popstate', onPopState);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
      if (hadPushState && history.state?.bellOpen) {
        history.replaceState(history.state._prev || {}, '');
      }
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeNotificationFromHistory(id);
  };

  const handleClearAll = () => {
    if (!window.confirm('전체 알림 내역을 삭제하시겠습니까?')) return;
    clearNotificationHistory();
  };

  const handleClick = (notif: NotificationHistoryItem) => {
    if (onItemClick) {
      onItemClick(notif);
    }
    onClose();
  };

  const totalPages = Math.ceil(notifications.length / NOTIFICATIONS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * NOTIFICATIONS_PER_PAGE;
  const pageNotifications = notifications.slice(startIndex, startIndex + NOTIFICATIONS_PER_PAGE);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/60" onClick={onClose} />
      <div className="relative mt-auto bg-white dark:bg-gray-900 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-blue-600" />
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">알림 내역</h3>
            {notifications.length > 0 && (
              <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full font-bold">
                {notifications.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {notifications.length > 0 && (
              <button onClick={handleClearAll} className="text-xs font-semibold text-red-500 hover:text-red-700">
                전체 삭제
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 pb-8">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
              <Bell size={32} className="stroke-[1.5] mb-2" />
              <p className="text-xs font-medium">새로운 알림 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {pageNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className="flex flex-col gap-2 px-3.5 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 transition-all hover:border-gray-200 dark:hover:border-gray-600 group cursor-pointer relative"
                >
                  <div className="flex items-start justify-between gap-2 w-full">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <Building2 size={13} className="text-blue-500 shrink-0" />
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                        {notif.building_name || '북마크 등록 건물'}
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-gray-500 font-medium shrink-0">
                        ({formatElevatorNo(notif.elevator_no)})
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteItem(e, notif.id)}
                      className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all focus:outline-none"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div className="space-y-1.5 pl-4.5">
                    {notif.changeType === ('combined' as any) && (notif as any).details ? (
                      <div className="space-y-1 bg-white dark:bg-gray-900/40 p-2 rounded-lg border border-gray-100 dark:border-gray-800 text-[11px]">
                        {(notif as any).details.map((d: any, dIdx: number) => (
                          <div key={dIdx} className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-500 dark:text-gray-400 min-w-[50px] inline-block">
                              {d.field === 'model' ? '모델명' : d.field === 'installation' ? '설치일자' : '검사종류'}
                            </span>
                            <span className="text-slate-400 line-through">{d.field === 'installation' ? formatDate(d.oldVal) : d.oldVal}</span>
                            <span className="text-slate-300 dark:text-gray-600">→</span>
                            <span className="text-blue-600 dark:text-blue-400 font-bold">{d.field === 'installation' ? formatDate(d.newVal) : d.newVal}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[11px] bg-white dark:bg-gray-900/40 p-2 rounded-lg border border-gray-100 dark:border-gray-800 flex-wrap">
                        <span className="font-semibold text-gray-500 dark:text-gray-400">
                          {notif.changeType === 'model' ? '모델명' : notif.changeType === 'installation' ? '설치일자' : '검사종류'}
                        </span>
                        <span className="text-slate-400 line-through">
                          {notif.changeType === 'installation' ? formatDate(notif.oldValue) : notif.oldValue}
                        </span>
                        <span className="text-slate-300 dark:text-gray-600">→</span>
                        <span className="text-blue-600 dark:text-blue-400 font-bold">
                          {notif.changeType === 'installation' ? formatDate(notif.newValue) : notif.newValue}
                        </span>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-normal pt-0.5">
                      {new Date(notif.timestamp).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}