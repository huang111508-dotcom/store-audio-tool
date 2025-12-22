/**
 * Decodes an AudioBuffer from a Blob/File using the Web Audio API.
 */
export const decodeAudio = async (file: File | Blob, ctx: AudioContext): Promise<AudioBuffer> => {
  const arrayBuffer = await file.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
};

/**
 * Helper to write string to dataview for WAV header
 */
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Creates a WAV file header.
 */
export const createWavHeader = (sampleRate: number, numChannels: number, dataLength: number): ArrayBuffer => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length minus RIFF identifier length and file description length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * numChannels * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, dataLength, true);

    return header;
};

/**
 * Converts an AudioBuffer to a 16-bit PCM Uint8Array (Stereo).
 * This allows us to process tracks one by one and release the AudioBuffer memory,
 * preventing memory crashes with large files.
 */
export const audioBufferToWavPCM = (buffer: AudioBuffer): Uint8Array => {
  const numChannels = 2; // Always output stereo for consistency
  const length = buffer.length;
  // 16-bit samples = 2 bytes per sample per channel
  const result = new Uint8Array(length * numChannels * 2); 
  const view = new DataView(result.buffer);
  
  // Handle mono to stereo upmixing if needed
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  
  let offset = 0;
  for (let i = 0; i < length; i++) {
      // Interleave: Left, Right, Left, Right...
      for (let channel = 0; channel < numChannels; channel++) {
          const sample = channel === 0 ? left[i] : right[i];
          
          // Clamp [-1, 1]
          let s = Math.max(-1, Math.min(1, sample));
          // Convert float to 16-bit PCM
          // s < 0 ? s * 0x8000 : s * 0x7FFF
          s = s < 0 ? s * 32768 : s * 32767;
          
          view.setInt16(offset, s | 0, true);
          offset += 2;
      }
  }
  
  return result;
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