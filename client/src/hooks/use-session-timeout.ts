import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_TIMEOUT = 5 * 60 * 1000; // 5 minutes warning

// Custom event name for app activity (transcription, recording, etc.)
export const APP_ACTIVITY_EVENT = 'docuwhisper:activity';

// Helper function to dispatch activity event from anywhere in the app
export function dispatchActivityEvent() {
  window.dispatchEvent(new CustomEvent(APP_ACTIVITY_EVENT));
}

export function useSessionTimeout() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const hasWarnedRef = useRef(false);

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

  const resetTimer = useCallback(() => {
    hasWarnedRef.current = false;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
    }

    warningRef.current = setTimeout(showWarning, INACTIVITY_TIMEOUT - WARNING_BEFORE_TIMEOUT);
    timeoutRef.current = setTimeout(() => {
      toast({
        title: 'Session Expired',
        description: 'You have been logged out due to inactivity.',
        variant: 'destructive',
      });
      logout();
    }, INACTIVITY_TIMEOUT);
  }, [logout, showWarning, toast]);

  useEffect(() => {
    // Standard user interaction events
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetTimer();
    };

    // Listen for standard DOM events
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Also listen for custom app activity events (transcription, recording, etc.)
    window.addEventListener(APP_ACTIVITY_EVENT, handleActivity);

    resetTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      window.removeEventListener(APP_ACTIVITY_EVENT, handleActivity);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningRef.current) {
        clearTimeout(warningRef.current);
      }
    };
  }, [resetTimer]);

  return { resetTimer };
}
