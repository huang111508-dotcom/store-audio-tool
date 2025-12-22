export interface Track {
  id: string;
  file: File | null; // Null if it's a generated audio buffer (like TTS)
  buffer?: AudioBuffer; // Used for AI generated tracks or pre-decoded content
  name: string;
  duration: number; // in seconds
  type: 'music' | 'voiceover';
}

export enum VibeType {
  ENERGETIC = 'Energetic & Upbeat',
  RELAXED = 'Relaxed & Chill',
  LUXURY = 'Luxury & Elegant',
  GYM = 'High Intensity / Gym',
  FOCUS = 'Work & Focus'
}

export interface ProcessingState {
  status: 'idle' | 'analyzing' | 'generating_tts' | 'decoding' | 'merging' | 'completed' | 'error';
  message: string;
  progress: number; // 0 to 100
}

export type Language = 'en' | 'zh';