import React, { useEffect, useState } from 'react';
import { X, Bell, Trash2, Building2, Cpu, Calendar, Wrench, ChevronRight } from 'lucide-react';
import { NotificationHistoryItem, getNotificationHistory, removeNotificationFromHistory, clearNotificationHistory, BookmarkChange } from '../utils/bookmarks';
import { formatElevatorNo } from '../utils/elevatorHelpers';

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

  const handleClearAll = () => {
    if (!window.confirm('모든 알림 내역을 삭제하시겠습니까?')) return;
    clearNotificationHistory();
    setNotifications([]);
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeNotificationFromHistory(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const totalPages = Math.ceil(notifications.length / NOTIFICATIONS_PER_PAGE);
  const startIndex = (currentPage - 1) * NOTIFICATIONS_PER_PAGE;
  const pageNotifications = notifications.slice(startIndex, startIndex + NOTIFICATIONS_PER_PAGE);

  const changeTypeIcon = (type: string) => {
    if (type === 'model') return <Cpu size={11} className="text-blue-500" />;
    if (type === 'installation') return <Calendar size={11} className="text-emerald-500" />;
    if (type === 'inspection') return <Wrench size={11} className="text-amber-500" />;
    return null;
  };

  const changeTypeLabel = (type: string) => {
    if (type === 'model') return '모델명 변경';
    if (type === 'installation') return '설치일자 변경';
    if (type === 'inspection') return '검사종류 변경';
    return '';
  };

  const handleClick = (notif: NotificationHistoryItem) => {
    if (onItemClick) {
      onItemClick(notif);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex flex-col" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/60" onClick={onClose} />
      <div className="relative mt-auto bg-white dark:bg-gray-900 rounded-t-3xl max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-amber-500" />
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">알림 내역</h3>
            {notifications.length > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs rounded-full font-bold">
                {notifications.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-[11px] font-semibold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded transition-colors"
              >
                전체 삭제
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 pb-8">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-400 dark:text-gray-500">알림 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {pageNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100/70 dark:border-gray-700 transition-all hover:border-gray-200 dark:hover:border-gray-600 group cursor-pointer"
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <Building2 size={11} className="text-blue-500 shrink-0" />
                      <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate">
                        {notif.building_name || formatElevatorNo(notif.elevator_no)}
                      </p>
                    </div>
                    <div className="pl-4.5 space-y-0.5">
                      <div className="flex items-center gap-1 text-[9px]">
                        {changeTypeIcon(notif.changeType)}
                        <span className="text-gray-500 dark:text-gray-400 font-medium">
                          {changeTypeLabel(notif.changeType)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] flex-wrap">
                        <span className="text-gray-400 dark:text-gray-500 line-through">{notif.oldValue}</span>
                        <span className="text-gray-400 dark:text-gray-600">→</span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">{notif.newValue}</span>
                      </div>
                      <p className="text-[9px] text-gray-400 dark:text-gray-500 font-normal">
                        {formatElevatorNo(notif.elevator_no)} · {notif.timestamp ? new Date(notif.timestamp).toLocaleString('ko-KR') : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-center">
                    <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" />
                    <button
                      onClick={(e) => handleDeleteItem(e, notif.id)}
                      className="shrink-0 p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all"
                      title="알림 삭제"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-4">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {'<'}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400 px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {'>'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
