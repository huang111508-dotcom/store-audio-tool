/**
 * Decodes an AudioBuffer from a Blob/File using the Web Audio API.
 */
export const decodeAudio = async (file: File | Blob, ctx: AudioContext): Promise<AudioBuffer> => {
  const arrayBuffer = await file.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
};

/**
 * Merges multiple AudioBuffers into a single AudioBuffer sequentially.
 */
export const mergeBuffers = (buffers: AudioBuffer[], ctx: AudioContext): AudioBuffer => {
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  
  // Use the sample rate of the first buffer, or default to context rate
  // Note: Robust apps should resample, but for this demo we assume consistency or context handling
  const sampleRate = buffers[0]?.sampleRate || ctx.sampleRate;
  const numberOfChannels = Math.max(...buffers.map(b => b.numberOfChannels));
  
  const output = ctx.createBuffer(numberOfChannels, totalLength, sampleRate);
  
  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      // If source has fewer channels, we duplicate the mono channel or fill silence
      const outputData = output.getChannelData(channel);
      if (channel < buffer.numberOfChannels) {
        outputData.set(buffer.getChannelData(channel), offset);
      } else {
        // If the track is mono but output is stereo, copy channel 0 to channel 1
        if (buffer.numberOfChannels === 1) {
             outputData.set(buffer.getChannelData(0), offset);
        }
      }
    }
    offset += buffer.length;
  }
  
  return output;
};

/**
 * Encodes an AudioBuffer to a WAV Blob.
 * This is a manual implementation of writing WAV headers to avoid heavy dependencies.
 */
export const bufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // Write WAV Header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this encoder)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // Write Interleaved Data
  for (i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      // bit shift to 16-bit integer
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0; 
      view.setInt16(44 + offset, sample, true); 
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArr], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
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