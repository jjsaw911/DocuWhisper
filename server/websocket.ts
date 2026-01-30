import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

// Types for collaboration messages
interface CollaborationMessage {
  type: "join" | "leave" | "update" | "cursor" | "sync" | "presence";
  noteId: number;
  userId: string;
  userName?: string;
  data?: any;
  timestamp?: number;
}

interface ActiveEditor {
  ws: WebSocket;
  userId: string;
  userName: string;
  cursorPosition?: { field: string; position: number };
  lastActivity: number;
}

interface NoteRoom {
  noteId: number;
  editors: Map<string, ActiveEditor>;
  content: {
    soapNote: string;
    title: string;
    patientName: string;
  };
  version: number;
}

// Store active rooms (notes being edited)
const rooms = new Map<number, NoteRoom>();

// Map websockets to their user info
const wsToUser = new Map<WebSocket, { userId: string; noteId: number }>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server, 
    path: "/ws/collaborate" 
  });

  console.log("[websocket] WebSocket server initialized on /ws/collaborate");

  wss.on("connection", (ws: WebSocket) => {
    console.log("[websocket] New connection");

    ws.on("message", (message: Buffer) => {
      try {
        const msg: CollaborationMessage = JSON.parse(message.toString());
        handleMessage(ws, msg, wss);
      } catch (error) {
        console.error("[websocket] Error parsing message:", error);
      }
    });

    ws.on("close", () => {
      handleDisconnect(ws, wss);
    });

    ws.on("error", (error) => {
      console.error("[websocket] WebSocket error:", error);
    });

    // Send heartbeat
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on("close", () => {
      clearInterval(pingInterval);
    });
  });

  return wss;
}

function handleMessage(ws: WebSocket, msg: CollaborationMessage, wss: WebSocketServer) {
  switch (msg.type) {
    case "join":
      handleJoin(ws, msg);
      break;
    case "leave":
      handleLeave(ws, msg);
      break;
    case "update":
      handleUpdate(ws, msg);
      break;
    case "cursor":
      handleCursor(ws, msg);
      break;
    case "sync":
      handleSync(ws, msg);
      break;
  }
}

function handleJoin(ws: WebSocket, msg: CollaborationMessage) {
  const { noteId, userId, userName = "Anonymous", initialContent } = msg as any;
  
  console.log(`[websocket] User ${userId} joining note ${noteId}`);

  // Create room if doesn't exist
  const isNewRoom = !rooms.has(noteId);
  if (isNewRoom) {
    rooms.set(noteId, {
      noteId,
      editors: new Map(),
      content: {
        soapNote: "",
        title: "",
        patientName: "",
      },
      version: 0,
    });
  }

  const room = rooms.get(noteId)!;

  // Seed room content from first joiner if they have initial content
  if (initialContent && room.content.soapNote === "") {
    room.content.soapNote = initialContent;
    console.log(`[websocket] Seeded room ${noteId} with initial content`);
  }

  // Add editor to room
  const editor: ActiveEditor = {
    ws,
    userId,
    userName,
    lastActivity: Date.now(),
  };
  room.editors.set(userId, editor);

  // Track ws to user mapping
  wsToUser.set(ws, { userId, noteId });

  // Send current state to joining user
  const presence = Array.from(room.editors.values())
    .filter((e) => e.userId !== userId)
    .map((e) => ({
      userId: e.userId,
      userName: e.userName,
      cursorPosition: e.cursorPosition,
    }));

  ws.send(
    JSON.stringify({
      type: "sync",
      noteId,
      data: {
        content: room.content,
        version: room.version,
        presence,
      },
    })
  );

  // Notify others of new editor
  broadcastToRoom(room, userId, {
    type: "presence",
    noteId,
    userId,
    userName,
    data: { action: "joined" },
  });
}

function handleLeave(ws: WebSocket, msg: CollaborationMessage) {
  const { noteId, userId } = msg;
  
  const room = rooms.get(noteId);
  if (!room) return;

  room.editors.delete(userId);
  wsToUser.delete(ws);

  // Notify others
  broadcastToRoom(room, userId, {
    type: "presence",
    noteId,
    userId,
    data: { action: "left" },
  });

  // Clean up empty rooms
  if (room.editors.size === 0) {
    rooms.delete(noteId);
    console.log(`[websocket] Room ${noteId} closed (no editors)`);
  }
}

function handleUpdate(ws: WebSocket, msg: CollaborationMessage) {
  const { noteId, userId, data } = msg;
  
  const room = rooms.get(noteId);
  if (!room) return;

  const editor = room.editors.get(userId);
  if (editor) {
    editor.lastActivity = Date.now();
  }

  // Apply the update
  if (data.field && typeof data.value === "string") {
    const field = data.field as keyof typeof room.content;
    if (field in room.content) {
      room.content[field] = data.value;
      room.version++;
    }
  }

  // Broadcast update to other editors
  broadcastToRoom(room, userId, {
    type: "update",
    noteId,
    userId,
    data: {
      field: data.field,
      value: data.value,
      version: room.version,
    },
    timestamp: Date.now(),
  });
}

function handleCursor(ws: WebSocket, msg: CollaborationMessage) {
  const { noteId, userId, data } = msg;
  
  const room = rooms.get(noteId);
  if (!room) return;

  const editor = room.editors.get(userId);
  if (editor) {
    editor.cursorPosition = data;
    editor.lastActivity = Date.now();
  }

  // Broadcast cursor position to other editors
  broadcastToRoom(room, userId, {
    type: "cursor",
    noteId,
    userId,
    userName: editor?.userName,
    data,
  });
}

function handleSync(ws: WebSocket, msg: CollaborationMessage) {
  const { noteId, userId, data } = msg;
  
  const room = rooms.get(noteId);
  if (!room) return;

  // If data contains content, update room state
  if (data.content) {
    Object.assign(room.content, data.content);
    room.version++;
  }

  // Send current state back
  ws.send(
    JSON.stringify({
      type: "sync",
      noteId,
      data: {
        content: room.content,
        version: room.version,
      },
    })
  );
}

function handleDisconnect(ws: WebSocket, wss: WebSocketServer) {
  const userInfo = wsToUser.get(ws);
  if (!userInfo) return;

  const { userId, noteId } = userInfo;
  console.log(`[websocket] User ${userId} disconnected from note ${noteId}`);

  const room = rooms.get(noteId);
  if (room) {
    room.editors.delete(userId);

    // Notify others
    broadcastToRoom(room, userId, {
      type: "presence",
      noteId,
      userId,
      data: { action: "disconnected" },
    });

    // Clean up empty rooms
    if (room.editors.size === 0) {
      rooms.delete(noteId);
      console.log(`[websocket] Room ${noteId} closed (no editors)`);
    }
  }

  wsToUser.delete(ws);
}

function broadcastToRoom(room: NoteRoom, excludeUserId: string, message: any) {
  const messageStr = JSON.stringify(message);
  
  const entries = Array.from(room.editors.entries());
  for (const entry of entries) {
    const userId = entry[0];
    const editor = entry[1];
    if (userId !== excludeUserId && editor.ws.readyState === WebSocket.OPEN) {
      editor.ws.send(messageStr);
    }
  }
}

// Export room info for debugging
export function getRoomInfo() {
  const info: any[] = [];
  const roomEntries = Array.from(rooms.entries());
  for (const entry of roomEntries) {
    const noteId = entry[0];
    const room = entry[1];
    info.push({
      noteId,
      editorCount: room.editors.size,
      editors: Array.from(room.editors.values()).map((e: ActiveEditor) => ({
        userId: e.userId,
        userName: e.userName,
        lastActivity: e.lastActivity,
      })),
      version: room.version,
    });
  }
  return info;
}
