import type { FileSource } from "../store/fileStore";

const DB_NAME = "json-modifier-db";
const STORE_NAME = "files";
const DB_VERSION = 1;
const MAX_CACHE_BYTES = 200 * 1024 * 1024;

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadCachedFiles(): Promise<FileSource[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as FileSource[]);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheFile(file: FileSource) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const payload = { ...file, cachedAt: Date.now() };
    tx.objectStore(STORE_NAME).put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function enforceCacheLimit() {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = (request.result as Array<FileSource & { cachedAt?: number }>) ?? [];
      const total = items.reduce((sum, item) => sum + (item.size ?? 0), 0);
      if (total <= MAX_CACHE_BYTES) {
        resolve();
        return;
      }
      const sorted = items
        .slice()
        .sort((a, b) => (a.cachedAt ?? 0) - (b.cachedAt ?? 0));
      let remaining = total;
      sorted.forEach((item) => {
        if (remaining <= MAX_CACHE_BYTES) return;
        store.delete(item.id);
        remaining -= item.size ?? 0;
      });
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function removeFileFromCache(fileId: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(fileId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

