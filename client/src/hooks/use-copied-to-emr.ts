import { useCallback, useEffect, useMemo, useState } from "react";

const COPIED_TO_EMR_EVENT = "docuwhisper:copied-to-emr-updated";

type CopiedToEmrMap = Record<number, boolean>;

type CopiedToEmrEventDetail = {
  storageKey: string;
  copiedMap: CopiedToEmrMap;
};

const parseCopiedMap = (raw: string | null): CopiedToEmrMap => {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: CopiedToEmrMap = {};

    for (const [key, value] of Object.entries(parsed)) {
      const noteId = Number(key);
      if (Number.isInteger(noteId) && value === true) {
        normalized[noteId] = true;
      }
    }

    return normalized;
  } catch {
    return {};
  }
};

const persistCopiedMap = (storageKey: string, copiedMap: CopiedToEmrMap) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(storageKey, JSON.stringify(copiedMap));
  window.dispatchEvent(
    new CustomEvent<CopiedToEmrEventDetail>(COPIED_TO_EMR_EVENT, {
      detail: { storageKey, copiedMap },
    })
  );
};

export function useCopiedToEmr(userId?: string | null) {
  const storageKey = useMemo(
    () => (userId ? `docuwhisper:copied-to-emr:${userId}` : null),
    [userId]
  );
  const [copiedToEmrByNoteId, setCopiedToEmrByNoteId] = useState<CopiedToEmrMap>({});

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setCopiedToEmrByNoteId({});
      return;
    }

    setCopiedToEmrByNoteId(parseCopiedMap(localStorage.getItem(storageKey)));
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setCopiedToEmrByNoteId(parseCopiedMap(event.newValue));
    };

    const handleCopiedToEmrUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<CopiedToEmrEventDetail>;
      if (customEvent.detail?.storageKey !== storageKey) return;
      setCopiedToEmrByNoteId(customEvent.detail.copiedMap);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(COPIED_TO_EMR_EVENT, handleCopiedToEmrUpdate);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(COPIED_TO_EMR_EVENT, handleCopiedToEmrUpdate);
    };
  }, [storageKey]);

  const setNoteCopiedToEmr = useCallback(
    (noteId: number, isCopied: boolean) => {
      if (!storageKey || typeof window === "undefined") return;

      setCopiedToEmrByNoteId((prev) => {
        const next = { ...prev };
        if (isCopied) {
          next[noteId] = true;
        } else {
          delete next[noteId];
        }

        persistCopiedMap(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const isNoteCopiedToEmr = useCallback(
    (noteId: number) => copiedToEmrByNoteId[noteId] === true,
    [copiedToEmrByNoteId]
  );

  const pruneCopiedToEmrForNotes = useCallback(
    (noteIds: number[]) => {
      if (!storageKey || typeof window === "undefined" || noteIds.length === 0) return;

      const validNoteIds = new Set(noteIds);
      setCopiedToEmrByNoteId((prev) => {
        let changed = false;
        const next: CopiedToEmrMap = {};

        for (const [noteId, copied] of Object.entries(prev)) {
          const numericNoteId = Number(noteId);
          if (copied && validNoteIds.has(numericNoteId)) {
            next[numericNoteId] = true;
          } else {
            changed = true;
          }
        }

        if (changed) {
          persistCopiedMap(storageKey, next);
          return next;
        }

        return prev;
      });
    },
    [storageKey]
  );

  return {
    copiedToEmrByNoteId,
    isNoteCopiedToEmr,
    setNoteCopiedToEmr,
    pruneCopiedToEmrForNotes,
  };
}
