import { createContext, useContext, useState, ReactNode } from "react";

interface RecordingContextType {
  isRecording: boolean;
  audioLevel: number[];
  setIsRecording: (recording: boolean) => void;
  setAudioLevel: (levels: number[]) => void;
}

const RecordingContext = createContext<RecordingContextType | null>(null);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number[]>([0, 0, 0, 0, 0]);

  return (
    <RecordingContext.Provider value={{ isRecording, audioLevel, setIsRecording, setAudioLevel }}>
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const context = useContext(RecordingContext);
  if (!context) {
    return { isRecording: false, audioLevel: [0, 0, 0, 0, 0], setIsRecording: () => {}, setAudioLevel: () => {} };
  }
  return context;
}
