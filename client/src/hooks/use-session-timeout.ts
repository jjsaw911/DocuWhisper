import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_TIMEOUT = 5 * 60 * 1000; // 5 minutes warning
const STAY_SIGNED_IN_STORAGE_KEY = "docuwhisper:stay-signed-in";
const STAY_SIGNED_IN_EVENT = "docuwhisper:stay-signed-in-updated";

// Custom event name for app activity (transcription, recording, etc.)
export const APP_ACTIVITY_EVENT = 'docuwhisper:activity';

export function isStaySignedInEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STAY_SIGNED_IN_STORAGE_KEY) === "true";
}

export function setStaySignedInPreference(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STAY_SIGNED_IN_STORAGE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(
    new CustomEvent(STAY_SIGNED_IN_EVENT, {
      detail: { enabled },
    })
  );
}

// Helper function to dispatch activity event from anywhere in the app
export function dispatchActivityEvent() {
  window.dispatchEvent(new CustomEvent(APP_ACTIVITY_EVENT));
}

export function useSessionTimeout() {
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const hasWarnedRef = useRef(false);
  const staySignedInRef = useRef(false);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'GET', credentials: 'include' });
    } catch (error) {
      console.error('Logout error:', error);
    }
    window.location.href = '/';
  }, []);

  const showWarning = useCallback(() => {
    if (!hasWarnedRef.current) {
      hasWarnedRef.current = true;
      toast({
        title: 'Session Expiring Soon',
        description: 'Your session will expire in 5 minutes due to inactivity. Move your mouse or press a key to stay logged in.',
        variant: 'default',
        duration: 10000,
      });
    }
  }, [toast]);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
      warningRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (staySignedInRef.current) {
      clearTimer();
      return;
    }

    hasWarnedRef.current = false;
    
    clearTimer();

    warningRef.current = setTimeout(showWarning, INACTIVITY_TIMEOUT - WARNING_BEFORE_TIMEOUT);
    timeoutRef.current = setTimeout(() => {
      toast({
        title: 'Session Expired',
        description: 'You have been logged out due to inactivity.',
        variant: 'destructive',
      });
      logout();
    }, INACTIVITY_TIMEOUT);
  }, [clearTimer, logout, showWarning, toast]);

  useEffect(() => {
    staySignedInRef.current = isStaySignedInEnabled();

    // Standard user interaction events
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetTimer();
    };

    const handleStaySignedInChange = (enabled: boolean) => {
      staySignedInRef.current = enabled;
      hasWarnedRef.current = false;
      if (enabled) {
        clearTimer();
      } else {
        resetTimer();
      }
    };

    const handleCustomStaySignedInUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled?: boolean }>;
      handleStaySignedInChange(customEvent.detail?.enabled === true);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STAY_SIGNED_IN_STORAGE_KEY) return;
      handleStaySignedInChange(event.newValue === "true");
    };

    // Listen for standard DOM events
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Also listen for custom app activity events (transcription, recording, etc.)
    window.addEventListener(APP_ACTIVITY_EVENT, handleActivity);
    window.addEventListener(STAY_SIGNED_IN_EVENT, handleCustomStaySignedInUpdate);
    window.addEventListener("storage", handleStorage);

    resetTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      window.removeEventListener(APP_ACTIVITY_EVENT, handleActivity);
      window.removeEventListener(STAY_SIGNED_IN_EVENT, handleCustomStaySignedInUpdate);
      window.removeEventListener("storage", handleStorage);
      clearTimer();
    };
  }, [clearTimer, resetTimer]);

  return { resetTimer };
}
