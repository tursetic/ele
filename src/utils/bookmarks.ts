import { Bookmark, BookmarkFolder, ElevatorWithBadges } from '../types';

const STORAGE_KEY = 'brelev_local_bookmarks_v1';
const FOLDERS_KEY = 'brelev_bookmark_folders_v1';
const NOTIFIED_KEY = 'brelev_notified_changes_v1';
const CHANGES_HISTORY_KEY = 'brelev_changes_history_v1';

export interface BookmarkChange {
  elevator_no: string;
  building_name: string | null;
  changeType: 'model' | 'installation' | 'inspection';
  oldValue: string;
  newValue: string;
  timestamp?: number;
}

const readLocalRaw = (): Bookmark[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('로컬 북마크 읽기 실패:', e);
    return [];
  }
};

const writeLocalRaw = (bookmarks: Bookmark[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    window.dispatchEvent(new Event('bookmarksUpdated'));
  } catch (e) {
    console.error('로컬 북마크 쓰기 실패:', e);
  }
};

const readFoldersRaw = (): BookmarkFolder[] => {
  try {
    const data = localStorage.getItem(FOLDERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const writeFoldersRaw = (folders: BookmarkFolder[]): void => {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    window.dispatchEvent(new Event('bookmarksUpdated'));
  } catch {}
};

const getNotifiedSet = (): Set<string> => {
  try {
    const data = localStorage.getItem(NOTIFIED_KEY);
    return data ? new Set(JSON.parse(data)) : new Set();
  } catch {
    return new Set();
  }
};

const saveNotifiedSet = (set: Set<string>): void => {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set]));
  } catch {}
};

// ── Folder CRUD ──

export async function getFolders(): Promise<BookmarkFolder[]> {
  return readFoldersRaw();
}

export async function createFolder(name: string): Promise<BookmarkFolder> {
  const folders = readFoldersRaw();
  const folder: BookmarkFolder = {
    id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name,
    active: true,
    created_at: new Date().toISOString(),
  };
  writeFoldersRaw([...folders, folder]);
  return folder;
}

export async function updateFolder(folderId: string, updates: Partial<Pick<BookmarkFolder, 'name' | 'active'>>): Promise<void> {
  const folders = readFoldersRaw();
  const idx = folders.findIndex(f => f.id === folderId);
  if (idx !== -1) {
    folders[idx] = { ...folders[idx], ...updates };
    writeFoldersRaw(folders);
  }
}

export async function deleteFolder(folderId: string): Promise<void> {
  const folders = readFoldersRaw().filter(f => f.id !== folderId);
  writeFoldersRaw(folders);
  // Move bookmarks in this folder to no folder
  const bookmarks = readLocalRaw();
  bookmarks.forEach(b => {
    if (b.folder_id === folderId) b.folder_id = null;
  });
  writeLocalRaw(bookmarks);
}

// ── Bookmark CRUD ──

export async function getBookmarks(): Promise<Bookmark[]> {
  return readLocalRaw();
}

export async function addBookmark(elevator: ElevatorWithBadges, folderId?: string | null): Promise<Bookmark> {
  if (!elevator || !elevator.elevatorNo) {
    throw new Error('Invalid elevator data');
  }

  const bookmarks = readLocalRaw();
  const isExist = bookmarks.some(b => b.elevator_no === elevator.elevatorNo);

  if (isExist) {
    throw new Error('Already bookmarked');
  }

  const newBookmark: Bookmark = {
    id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    elevator_no: elevator.elevatorNo,
    building_name: elevator.buldNm || null,
    address: `${elevator.address1}${elevator.address2 ? ` ${elevator.address2}` : ''}`.trim() || null,
    elevator_data: elevator as any,
    created_at: new Date().toISOString(),
    folder_id: folderId || null,
  };

  writeLocalRaw([...bookmarks, newBookmark]);
  return newBookmark;
}

export async function removeBookmark(elevatorNo: string): Promise<void> {
  const bookmarks = readLocalRaw();
  const updated = bookmarks.filter(b => b.elevator_no !== elevatorNo);
  writeLocalRaw(updated);
}

export async function isBookmarked(elevatorNo: string): Promise<boolean> {
  const bookmarks = readLocalRaw();
  return bookmarks.some(b => b.elevator_no === elevatorNo);
}

export async function moveBookmark(elevatorNo: string, folderId: string | null): Promise<void> {
  const bookmarks = readLocalRaw();
  const idx = bookmarks.findIndex(b => b.elevator_no === elevatorNo);
  if (idx !== -1) {
    bookmarks[idx].folder_id = folderId;
    writeLocalRaw(bookmarks);
  }
}

export async function getBookmarkedElevatorNos(): Promise<Set<string>> {
  const bookmarks = readLocalRaw();
  const folders = readFoldersRaw();
  const inactiveFolderIds = new Set(folders.filter(f => !f.active).map(f => f.id));
  // Only include bookmarks that are in active folders (or no folder)
  return new Set(
    bookmarks
      .filter(b => !b.folder_id || !inactiveFolderIds.has(b.folder_id))
      .map(b => b.elevator_no)
  );
}

export function detectBookmarkChanges(currentData: ElevatorWithBadges): BookmarkChange[] {
  const bookmarks = readLocalRaw();
  const bookmark = bookmarks.find(b => b.elevator_no === currentData.elevatorNo);
  if (!bookmark || !bookmark.elevator_data) return [];

  const changes: BookmarkChange[] = [];
  const stored = bookmark.elevator_data as ElevatorWithBadges;
  const notifiedSet = getNotifiedSet();

  const changeKeySuffix = (type: string, new_val: string) =>
    `${currentData.elevatorNo}:${type}:${new_val}`;

  // 1. 모델명 변경 감지
  if (stored.elvtrModel !== currentData.elvtrModel) {
    const key = changeKeySuffix('model', currentData.elvtrModel || '');
    if (!notifiedSet.has(key)) {
      changes.push({
        elevator_no: currentData.elevatorNo,
        building_name: bookmark.building_name,
        changeType: 'model',
        oldValue: stored.elvtrModel || '미기재',
        newValue: currentData.elvtrModel || '미기재',
      });
    }
  }

  // 2. 설치일자 변경 감지
  if (stored.installationDe !== currentData.installationDe) {
    const key = changeKeySuffix('installation', currentData.installationDe || '');
    if (!notifiedSet.has(key)) {
      changes.push({
        elevator_no: currentData.elevatorNo,
        building_name: bookmark.building_name,
        changeType: 'installation',
        oldValue: stored.installationDe || '미기재',
        newValue: currentData.installationDe || '미기재',
      });
    }
  }

  // 3. 최종검사종류 변경 감지 (검사종류명 또는 검사 날짜가 변경되었을 때 모두 감지하도록 수정)
  const isNowSpecial = ['설치', '수시'].includes(currentData.lastInspctKind || '');
  if (isNowSpecial && (stored.lastInspctKind !== currentData.lastInspctKind || stored.lastInspctDe !== currentData.lastInspctDe)) {
    const key = changeKeySuffix('inspection', currentData.lastInspctKind || '');
    if (!notifiedSet.has(key)) {
      changes.push({
        elevator_no: currentData.elevatorNo,
        building_name: bookmark.building_name,
        changeType: 'inspection',
        oldValue: stored.lastInspctKind || '없음',
        newValue: currentData.lastInspctKind || '미기재',
      });
    }
  }

  // 한 번에 여러 개가 바뀌었을 경우 한 알림으로 병합(combined) 처리
  if (changes.length > 1) {
    const combined: BookmarkChange = {
      elevator_no: currentData.elevatorNo,
      building_name: bookmark.building_name,
      changeType: 'combined' as any,
      oldValue: '',
      newValue: '',
      timestamp: Date.now(),
      details: changes.map(c => ({
        field: c.changeType,
        oldVal: c.oldValue,
        newVal: c.newValue
      })) as any
    };
    return [combined];
  }

  return changes;
}

export function markChangeNotified(changes: BookmarkChange[]): void {
  const notifiedSet = getNotifiedSet();
  changes.forEach((c) => {
    if (c.changeType === ('combined' as any) && (c as any).details) {
      (c as any).details.forEach((d: any) => {
        const key = `${c.elevator_no}:${d.field}:${d.newVal}`;
        notifiedSet.add(key);
      });
    } else {
      const key = `${c.elevator_no}:${c.changeType}:${c.newValue}`;
      notifiedSet.add(key);
    }
  });
  saveNotifiedSet(notifiedSet);
}

export function updateBookmarkData(elevator: ElevatorWithBadges): void {
  const bookmarks = readLocalRaw();
  const idx = bookmarks.findIndex(b => b.elevator_no === elevator.elevatorNo);
  if (idx !== -1) {
    bookmarks[idx].elevator_data = elevator as any;
    bookmarks[idx].building_name = elevator.buldNm || bookmarks[idx].building_name;
    writeLocalRaw(bookmarks);
  }
}

let pendingGlobalChanges: BookmarkChange[] = [];
const changeListeners: Set<(changes: BookmarkChange[]) => void> = new Set();

export function setGlobalChanges(changes: BookmarkChange[]): void {
  pendingGlobalChanges = changes;
  changeListeners.forEach(fn => fn([...pendingGlobalChanges]));
  if (changes.length > 0) {
    window.dispatchEvent(new CustomEvent('bookmarkChangesDetected', { detail: changes }));
    // Also persist to notification history
    addNotificationsToHistory(changes);
  }
}

export function getGlobalChanges(): BookmarkChange[] {
  return [...pendingGlobalChanges];
}

export function clearGlobalChanges(): void {
  pendingGlobalChanges = [];
  changeListeners.forEach(fn => fn([]));
}

export function subscribeToChanges(fn: (changes: BookmarkChange[]) => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function getAllBookmarkChanges(): BookmarkChange[] {
  return [...pendingGlobalChanges];
}

// ── Notification History ──

export interface NotificationHistoryItem extends BookmarkChange {
  id: string;
  dismissedAt?: number;
}

const readHistoryRaw = (): NotificationHistoryItem[] => {
  try {
    const data = localStorage.getItem(CHANGES_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const writeHistoryRaw = (items: NotificationHistoryItem[]): void => {
  try {
    localStorage.setItem(CHANGES_HISTORY_KEY, JSON.stringify(items));
  } catch {}
};

export function getNotificationHistory(): NotificationHistoryItem[] {
  return readHistoryRaw();
}

export function addNotificationToHistory(change: BookmarkChange): NotificationHistoryItem {
  const history = readHistoryRaw();
  const item: NotificationHistoryItem = {
    ...change,
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: change.timestamp || Date.now(),
  };
  history.unshift(item);
  writeHistoryRaw(history);
  window.dispatchEvent(new CustomEvent('notificationHistoryUpdated'));
  return item;
}

export function addNotificationsToHistory(changes: BookmarkChange[]): NotificationHistoryItem[] {
  const history = readHistoryRaw();
  const items: NotificationHistoryItem[] = changes.map(change => ({
    ...change,
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: change.timestamp || Date.now(),
  }));
  history.unshift(...items);
  writeHistoryRaw(history);
  window.dispatchEvent(new CustomEvent('notificationHistoryUpdated'));
  return items;
}

export function removeNotificationFromHistory(id: string): void {
  const history = readHistoryRaw().filter(h => h.id !== id);
  writeHistoryRaw(history);
  window.dispatchEvent(new CustomEvent('notificationHistoryUpdated'));
}

export function clearNotificationHistory(): void {
  writeHistoryRaw([]);
  window.dispatchEvent(new CustomEvent('notificationHistoryUpdated'));
}
