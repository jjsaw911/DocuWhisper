import { useEffect, useMemo, useState } from "react";

const SCRIBE_GENERATION_EVENT = "docuwhisper:scribe-generation-updated";
const DEFAULT_LABEL = "Generating note...";
const STALE_GENERATION_MS = 10 * 60 * 1000;

export interface ScribeGenerationItem {
  id: string;
  label: string;
  startedAt: number;
}

interface ScribeGenerationEventDetail {
  storageKey: string;
  items: ScribeGenerationItem[];
}

const getStorageKey = (userId?: string) =>
  userId ? `docuwhisper:scribe-generation:${userId}` : null;

const parseItems = (value: string | null): ScribeGenerationItem[] => {
  if (!value) return [];

  // Backward compatibility: previous versions stored count as a number string.
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    const count = Math.max(0, Math.floor(numericValue));
    return Array.from({ length: count }, (_, index) => ({
      id: `legacy-${index}`,
      label: DEFAULT_LABEL,
      startedAt: 0,
    }));
  }

  try {
    const parsed = JSON.parse(value) as { items?: unknown };
    if (!parsed || !Array.isArray(parsed.items)) return [];
    return parsed.items
      .filter((item): item is { id: string; label?: string } => {
        return typeof item === "object" && item !== null && "id" in item && typeof (item as any).id === "string";
      })
      .map((item) => ({
        id: item.id,
        label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : DEFAULT_LABEL,
        startedAt: typeof (item as any).startedAt === "number" ? (item as any).startedAt : 0,
      }));
  } catch {
    return [];
  }
};

const pruneStaleItems = (items: ScribeGenerationItem[]) => {
  const now = Date.now();
  return items.filter((item) => item.startedAt > 0 && now - item.startedAt <= STALE_GENERATION_MS);
};

const persistItems = (storageKey: string, items: ScribeGenerationItem[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify({ items }));
  window.dispatchEvent(
    new CustomEvent<ScribeGenerationEventDetail>(SCRIBE_GENERATION_EVENT, {
      detail: { storageKey, items },
    })
  );
};

const createItemId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const startScribeGeneration = (userId?: string, label?: string) => {
  const storageKey = getStorageKey(userId);
  if (!storageKey || typeof window === "undefined") return "";

  const current = pruneStaleItems(parseItems(localStorage.getItem(storageKey)));
  const id = createItemId();
  const next = [
    ...current,
    {
      id,
      label: label && label.trim() ? label.trim() : DEFAULT_LABEL,
      startedAt: Date.now(),
    },
  ];

  persistItems(storageKey, next);
  return id;
};

export const finishScribeGeneration = (userId?: string, id?: string) => {
  const storageKey = getStorageKey(userId);
  if (!storageKey || typeof window === "undefined") return;

  const current = pruneStaleItems(parseItems(localStorage.getItem(storageKey)));
  const next = id
    ? current.filter((item) => item.id !== id)
    : current.slice(0, Math.max(0, current.length - 1));

  persistItems(storageKey, next);
};

// Backwards-compatible helpers used in existing code paths.
export const incrementScribeGeneration = (userId?: string) => {
  startScribeGeneration(userId);
};

export const decrementScribeGeneration = (userId?: string) => {
  finishScribeGeneration(userId);
};

export const useScribeGenerationStatus = (userId?: string) => {
  const storageKey = useMemo(() => getStorageKey(userId), [userId]);
  const [items, setItems] = useState<ScribeGenerationItem[]>([]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setItems([]);
      return;
    }

    const initialItems = pruneStaleItems(parseItems(localStorage.getItem(storageKey)));
    setItems(initialItems);
    persistItems(storageKey, initialItems);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      const nextItems = pruneStaleItems(parseItems(event.newValue));
      setItems(nextItems);
    };

    const handleCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ScribeGenerationEventDetail>;
      if (customEvent.detail.storageKey !== storageKey) return;
      const nextItems = pruneStaleItems(customEvent.detail.items);
      setItems(nextItems);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SCRIBE_GENERATION_EVENT, handleCustomEvent);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SCRIBE_GENERATION_EVENT, handleCustomEvent);
    };
  }, [storageKey]);

  return {
    pendingItems: items,
    pendingCount: items.length,
    currentLabel: items[0]?.label ?? DEFAULT_LABEL,
    isGenerating: items.length > 0,
  };
};
