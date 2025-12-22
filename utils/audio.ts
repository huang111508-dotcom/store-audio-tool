/**
 * Decodes an AudioBuffer from a Blob/File using the Web Audio API.
 */
export const decodeAudio = async (file: File | Blob, ctx: AudioContext): Promise<AudioBuffer> => {
  const arrayBuffer = await file.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
};

/**
 * Extracts Left and Right channel data as Int16Array for MP3 encoding.
 * Lamejs requires Int16 samples (range [-32768, 32767]).
 * Handles Mono to Stereo duplication automatically.
 */
export const extractPCM16 = (buffer: AudioBuffer): { left: Int16Array, right: Int16Array } => {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  
  const leftFloat = buffer.getChannelData(0);
  const rightFloat = numChannels > 1 ? buffer.getChannelData(1) : leftFloat; // Duplicate left if mono

  const left = new Int16Array(length);
  const right = new Int16Array(length);

  for (let i = 0; i < length; i++) {
    // Clamp and convert Left
    let s = Math.max(-1, Math.min(1, leftFloat[i]));
    left[i] = s < 0 ? s * 32768 : s * 32767;

    // Clamp and convert Right
    s = Math.max(-1, Math.min(1, rightFloat[i]));
    right[i] = s < 0 ? s * 32768 : s * 32767;
  }
  
  return { left, right };
};

/**
 * Helper to get a human readable time string
 */
export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Base64 helper for Gemini response decoding
 */
export const decodeBase64Audio = async (base64String: string, ctx: AudioContext): Promise<AudioBuffer> => {
    const binaryString = window.atob(base64String);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return await ctx.decodeAudioData(bytes.buffer);
}