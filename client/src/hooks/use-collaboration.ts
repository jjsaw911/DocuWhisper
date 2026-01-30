import { useState, useEffect, useRef, useCallback } from "react";

interface CollaboratorInfo {
  userId: string;
  userName: string;
  cursorPosition?: { field: string; position: number };
}

interface CollaborationState {
  isConnected: boolean;
  collaborators: CollaboratorInfo[];
  version: number;
}

interface CollaborationMessage {
  type: "join" | "leave" | "update" | "cursor" | "sync" | "presence";
  noteId: number;
  userId: string;
  userName?: string;
  data?: any;
  timestamp?: number;
}

interface UseCollaborationOptions {
  noteId: number;
  userId: string;
  userName: string;
  onRemoteUpdate?: (field: string, value: string) => void;
  initialContent?: string; // Initial soapNote content to seed room
  enabled?: boolean;
}

export function useCollaboration({
  noteId,
  userId,
  userName,
  onRemoteUpdate,
  initialContent,
  enabled = true,
}: UseCollaborationOptions) {
  const [state, setState] = useState<CollaborationState>({
    isConnected: false,
    collaborators: [],
    version: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!enabled || !noteId || noteId <= 0) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/collaborate`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[collaboration] Connected to WebSocket");
        reconnectAttemptsRef.current = 0;
        setState((prev) => ({ ...prev, isConnected: true }));

        // Join the note room with initial content if available
        ws.send(
          JSON.stringify({
            type: "join",
            noteId,
            userId,
            userName,
            initialContent: initialContent || undefined,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg: CollaborationMessage = JSON.parse(event.data);
          handleMessage(msg);
        } catch (error) {
          console.error("[collaboration] Error parsing message:", error);
        }
      };

      ws.onclose = () => {
        console.log("[collaboration] WebSocket closed");
        setState((prev) => ({ ...prev, isConnected: false, collaborators: [] }));

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`[collaboration] Reconnecting in ${delay}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        console.error("[collaboration] WebSocket error:", error);
      };
    } catch (error) {
      console.error("[collaboration] Failed to connect:", error);
    }
  }, [enabled, noteId, userId, userName, initialContent]);

  // Handle incoming messages
  const handleMessage = useCallback(
    (msg: CollaborationMessage) => {
      switch (msg.type) {
        case "sync":
          // Initial sync or resync - apply content from other collaborators
          if (msg.data) {
            // Apply any existing content from the room
            if (msg.data.content && onRemoteUpdate) {
              const content = msg.data.content;
              if (content.soapNote) {
                onRemoteUpdate("soapNote", content.soapNote);
              }
            }
            
            setState((prev) => ({
              ...prev,
              version: msg.data.version || 0,
              collaborators: msg.data.presence || [],
            }));
          }
          break;

        case "update":
          // Remote update from another user
          if (msg.data && msg.userId !== userId && onRemoteUpdate) {
            onRemoteUpdate(msg.data.field, msg.data.value);
            setState((prev) => ({
              ...prev,
              version: msg.data.version || prev.version,
            }));
          }
          break;

        case "cursor":
          // Cursor position update
          setState((prev) => ({
            ...prev,
            collaborators: prev.collaborators.map((c) =>
              c.userId === msg.userId
                ? { ...c, cursorPosition: msg.data }
                : c
            ),
          }));
          break;

        case "presence":
          // User joined or left
          if (msg.data?.action === "joined" && msg.userId !== userId) {
            setState((prev) => ({
              ...prev,
              collaborators: [
                ...prev.collaborators.filter((c) => c.userId !== msg.userId),
                {
                  userId: msg.userId,
                  userName: msg.userName || "Anonymous",
                },
              ],
            }));
          } else if (
            msg.data?.action === "left" ||
            msg.data?.action === "disconnected"
          ) {
            setState((prev) => ({
              ...prev,
              collaborators: prev.collaborators.filter(
                (c) => c.userId !== msg.userId
              ),
            }));
          }
          break;
      }
    },
    [userId, onRemoteUpdate]
  );

  // Send update to server
  const sendUpdate = useCallback(
    (field: string, value: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "update",
            noteId,
            userId,
            data: { field, value },
          })
        );
      }
    },
    [noteId, userId]
  );

  // Send cursor position
  const sendCursor = useCallback(
    (field: string, position: number) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "cursor",
            noteId,
            userId,
            data: { field, position },
          })
        );
      }
    },
    [noteId, userId]
  );

  // Leave room
  const leave = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "leave",
          noteId,
          userId,
        })
      );
    }
    wsRef.current?.close();
    wsRef.current = null;
  }, [noteId, userId]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      leave();
    };
  }, [connect, leave]);

  return {
    isConnected: state.isConnected,
    collaborators: state.collaborators,
    version: state.version,
    sendUpdate,
    sendCursor,
    leave,
  };
}

// Export types for components
export type { CollaboratorInfo };
