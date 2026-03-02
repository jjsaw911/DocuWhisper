import { useEffect, useMemo, useState } from "react";

const SCRIBE_GENERATION_EVENT = "docuwhisper:scribe-generation-updated";

interface ScribeGenerationEventDetail {
  storageKey: string;
  count: number;
}

const getStorageKey = (userId?: string) =>
  userId ? `docuwhisper:scribe-generation:${userId}` : null;

const parseCount = (value: string | null): number => {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const persistCount = (storageKey: string, count: number) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, String(count));
  window.dispatchEvent(
    new CustomEvent<ScribeGenerationEventDetail>(SCRIBE_GENERATION_EVENT, {
      detail: { storageKey, count },
    })
  );
};

export const incrementScribeGeneration = (userId?: string) => {
  const storageKey = getStorageKey(userId);
  if (!storageKey || typeof window === "undefined") return;
  const current = parseCount(localStorage.getItem(storageKey));
  persistCount(storageKey, current + 1);
};

export const decrementScribeGeneration = (userId?: string) => {
  const storageKey = getStorageKey(userId);
  if (!storageKey || typeof window === "undefined") return;
  const current = parseCount(localStorage.getItem(storageKey));
  const next = Math.max(0, current - 1);
  persistCount(storageKey, next);
};

export const useScribeGenerationStatus = (userId?: string) => {
  const storageKey = useMemo(() => getStorageKey(userId), [userId]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setCount(0);
      return;
    }

    setCount(parseCount(localStorage.getItem(storageKey)));

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setCount(parseCount(event.newValue));
    };

    const handleCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ScribeGenerationEventDetail>;
      if (customEvent.detail.storageKey !== storageKey) return;
      setCount(customEvent.detail.count);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SCRIBE_GENERATION_EVENT, handleCustomEvent);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SCRIBE_GENERATION_EVENT, handleCustomEvent);
    };
  }, [storageKey]);

  return {
    pendingCount: count,
    isGenerating: count > 0,
  };
};
