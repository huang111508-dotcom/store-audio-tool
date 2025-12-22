import { GoogleGenAI, Modality, Type } from "@google/genai";
import { VibeType, Track, Language } from "../types";
import { decodeBase64Audio } from "../utils/audio";

// Helper to ensure we have a key
const getAI = (apiKey: string) => {
    if (!apiKey) {
        throw new Error("API Key is missing.");
    }
    return new GoogleGenAI({ apiKey });
};

/**
 * Generates an intro voiceover for the store playlist.
 */
export const generateIntroAudio = async (
    apiKey: string,
    storeName: string,
    vibe: VibeType,
    trackNames: string[],
    ctx: AudioContext,
    language: Language
): Promise<AudioBuffer> => {
    const ai = getAI(apiKey);

    const langPrompt = language === 'zh' ? 'Mandarin Chinese' : 'English';

    // 1. Generate the Script
    const scriptPrompt = `
    You are a professional radio host for a store called "${storeName}".
    The store vibe is ${vibe}.
    The playlist includes songs like: ${trackNames.slice(0, 3).join(', ')} and others.
    Write a very short, welcoming intro script (max 20 words) in ${langPrompt} welcoming customers and introducing the music.
    Do not include any sound effects or stage directions, just the spoken text.
    `;

    const textResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: scriptPrompt,
    });
    
    const script = textResponse.text || `Welcome to ${storeName}, enjoy the music.`;

    // 2. Convert Script to Speech
    const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: script }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Fenrir' is deep, 'Kore' is calm
                },
            },
        },
    });

    const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("Failed to generate TTS audio data.");
    }

    return await decodeBase64Audio(base64Audio, ctx);
};

/**
 * Sorts the tracks based on a desired vibe using Gemini.
 */
export const sortTracksSmartly = async (apiKey: string, tracks: Track[], vibe: VibeType): Promise<Track[]> => {
    const ai = getAI(apiKey);
    
    const trackList = tracks.map((t, index) => ({ index, name: t.name }));
    
    const prompt = `
    I have a list of songs. I need to order them to create a perfect "${vibe}" progression.
    Return a JSON object with a single property "order" which is an array of indices.
    
    Songs:
    ${JSON.stringify(trackList)}
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    order: {
                        type: Type.ARRAY,
                        items: { type: Type.INTEGER }
                    }
                }
            }
        }
    });

    const result = JSON.parse(response.text || "{}");
    const newOrderIndices: number[] = result.order || [];

    // Map back to track objects
    const sortedTracks: Track[] = [];
    const usedIndices = new Set<number>();

    // Add in the AI suggested order
    newOrderIndices.forEach(index => {
        if (index >= 0 && index < tracks.length) {
            sortedTracks.push(tracks[index]);
            usedIndices.add(index);
        }
    });

    // Add any leftovers (fallback)
    tracks.forEach((t, i) => {
        if (!usedIndices.has(i)) {
            sortedTracks.push(t);
        }
    });

    return sortedTracks;
};