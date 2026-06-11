import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark as BookmarkIcon, Folder, FolderPlus } from 'lucide-react';
import { ElevatorWithBadges, BookmarkFolder } from '../types';
import { addBookmark, removeBookmark, isBookmarked, getFolders, createFolder } from '../utils/bookmarks';

interface Props {
  elevator: ElevatorWithBadges;
  size?: number;
  onBookmarkChange?: (isBookmarked: boolean) => void;
}

export default function BookmarkButton({ elevator, size = 16, onBookmarkChange }: Props) {
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    isBookmarked(elevator.elevatorNo)
      .then((result) => {
        if (mounted) setBookmarked(result);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [elevator.elevatorNo]);

  useEffect(() => {
    if (showFolderPicker) {
      getFolders().then(setFolders).catch(() => {});
    }
  }, [showFolderPicker]);

  useEffect(() => {
    if (!showFolderPicker) {
      setPopupPosition(null);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopupPosition({
        top: rect.top - 8,
        left: rect.right - 140,
      });
    }
  }, [showFolderPicker]);

  // Close on click outside (check both trigger and popup refs)
  useEffect(() => {
    if (!showFolderPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = triggerRef.current?.contains(target);
      const clickedPopup = popupRef.current?.contains(target);
      if (!clickedTrigger && !clickedPopup) {
        setShowFolderPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFolderPicker]);

  // Close on scroll
  useEffect(() => {
    if (!showFolderPicker) return;
    const handleScroll = () => setShowFolderPicker(false);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [showFolderPicker]);

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setLoading(true);
    try {
      await removeBookmark(elevator.elevatorNo);
      setBookmarked(false);
      onBookmarkChange?.(false);
    } catch (err) {
      console.error('Bookmark action failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToFolder = async (folderId: string | null) => {
    setLoading(true);
    try {
      await addBookmark(elevator, folderId);
      setBookmarked(true);
      onBookmarkChange?.(true);
    } catch (err) {
      console.error('Bookmark action failed:', err);
    } finally {
      setLoading(false);
      setShowFolderPicker(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folder = await createFolder(name);
    setFolders(prev => [...prev, folder]);
    setNewFolderName('');
  };

  if (bookmarked) {
    return (
      <button
        onClick={handleRemove}
        disabled={loading}
        className={`p-1.5 rounded-lg transition-all bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 ${loading ? 'opacity-50 cursor-wait' : ''}`}
        title="북마크 제거"
      >
        <BookmarkIcon size={size} fill="currentColor" />
      </button>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          ref={triggerRef}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setShowFolderPicker(!showFolderPicker);
          }}
          disabled={loading}
          className={`p-1.5 rounded-lg transition-all bg-gray-100/50 text-gray-400 hover:bg-gray-200/50 hover:text-gray-600 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 ${loading ? 'opacity-50 cursor-wait' : ''}`}
          title="북마크 추가"
        >
          <BookmarkIcon size={size} fill="none" />
        </button>
      </div>

      {showFolderPicker && popupPosition && createPortal(
        <div
          ref={popupRef}
          className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[140px] z-[9999]"
          style={{ top: Math.max(8, popupPosition.top), left: Math.max(8, Math.min(popupPosition.left, window.innerWidth - 148)) }}
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); handleAddToFolder(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <BookmarkIcon size={11} />
            폴더 없음
          </button>
          {folders.map(f => (
            <button
              key={f.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); handleAddToFolder(f.id); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Folder size={11} className={f.active ? 'text-yellow-500' : 'text-gray-400'} fill={f.active ? 'currentColor' : 'none'} />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
          <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1 px-2">
            <div className="flex gap-1">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    e.preventDefault();
                    handleCreateFolder();
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="새 폴더"
                className="flex-1 min-w-0 px-1.5 py-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-[10px] text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateFolder();
                }}
                className="p-1 text-blue-500 hover:text-blue-600 shrink-0"
                title="폴더 생성"
              >
                <FolderPlus size={11} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
