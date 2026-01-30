import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_TIMEOUT = 5 * 60 * 1000; // 5 minutes warning

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
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    resetTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
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
