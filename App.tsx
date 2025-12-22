import React, { useState, useRef, useEffect } from 'react';
import { Upload, Music, ArrowUp, ArrowDown, X, Play, Download, Wand2, Radio, Loader2, Globe, Key, Settings, ZapOff } from 'lucide-react';
import { Track, VibeType, ProcessingState, Language } from './types';
import { decodeAudio, createWavHeader, audioBufferToWavPCM } from './utils/audio';
import { generateIntroAudio, sortTracksSmartly } from './services/geminiService';
import { translations } from './utils/i18n';

const App: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [storeName, setStoreName] = useState('My Store');
  const [selectedVibe, setSelectedVibe] = useState<VibeType>(VibeType.RELAXED);
  const [processing, setProcessing] = useState<ProcessingState>({ status: 'idle', message: '', progress: 0 });
  const [mergedBlob, setMergedBlob] = useState<Blob | null>(null);
  const [lang, setLang] = useState<Language>('zh'); 
  const [apiKey, setApiKey] = useState('');
  
  const t = translations[lang];

  // Ref for AudioContext
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  // Load API Key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem('gemini_api_key', newKey);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newTracks: Track[] = [];
    (Array.from(files) as File[]).forEach(file => {
      if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        newTracks.push({
          id: Math.random().toString(36).substr(2, 9),
          file: file,
          name: file.name,
          duration: 0, 
          type: 'music'
        });
      }
    });

    setTracks(prev => [...prev, ...newTracks]);
  };

  const removeTrack = (id: string) => {
    setTracks(prev => prev.filter(t => t.id !== id));
  };

  const moveTrack = (index: number, direction: 'up' | 'down') => {
    const newTracks = [...tracks];
    if (direction === 'up' && index > 0) {
      [newTracks[index], newTracks[index - 1]] = [newTracks[index - 1], newTracks[index]];
    } else if (direction === 'down' && index < newTracks.length - 1) {
      [newTracks[index], newTracks[index + 1]] = [newTracks[index + 1], newTracks[index]];
    }
    setTracks(newTracks);
  };

  const handleSmartSort = async () => {
    if (!apiKey) {
        alert(t.apiKeyMissing);
        return;
    }
    if (tracks.length < 2) return;
    setProcessing({ status: 'analyzing', message: t.statusAnalyzing, progress: 10 });
    try {
      const sorted = await sortTracksSmartly(apiKey, tracks, selectedVibe);
      setTracks(sorted);
      setProcessing({ status: 'idle', message: '', progress: 0 });
    } catch (e: any) {
      console.error(e);
      setProcessing({ status: 'error', message: t.statusSortError + e.message, progress: 0 });
    }
  };

  const handleAddIntro = async () => {
    if (!apiKey) {
        alert(t.apiKeyMissing);
        return;
    }
    setProcessing({ status: 'generating_tts', message: t.statusGenTTS, progress: 20 });
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();

        const trackNames = tracks.filter(t => t.type === 'music').map(t => t.name);
        const buffer = await generateIntroAudio(apiKey, storeName, selectedVibe, trackNames, ctx, lang);
        
        const introTrack: Track = {
            id: 'intro-' + Date.now(),
            file: null,
            buffer: buffer,
            name: t.aiIntroName(storeName),
            duration: buffer.duration,
            type: 'voiceover'
        };

        setTracks(prev => [introTrack, ...prev]);
        setProcessing({ status: 'idle', message: '', progress: 0 });

    } catch (e: any) {
        setProcessing({ status: 'error', message: t.statusTTSError + e.message, progress: 0 });
    }
  };

  const processMerge = async () => {
    if (tracks.length === 0) return;
    
    setProcessing({ status: 'decoding', message: t.statusDecoding, progress: 0 });
    setMergedBlob(null);

    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();

      // We will store the PCM byte chunks here, NOT the full AudioBuffers
      const chunks: Uint8Array[] = [];
      let totalDataLength = 0;
      
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        setProcessing({ 
            status: 'decoding', 
            message: t.processingTrack(i + 1, tracks.length, track.name), 
            progress: (i / tracks.length) * 80 
        });

        // Small delay to allow UI to update and GC to run
        await new Promise(r => setTimeout(r, 50));

        let buffer: AudioBuffer | null = null;

        if (track.buffer) {
            buffer = track.buffer;
        } else if (track.file) {
            buffer = await decodeAudio(track.file, ctx);
        }

        if (buffer) {
            // Convert to 16-bit PCM bytes immediately
            const pcmChunk = audioBufferToWavPCM(buffer);
            chunks.push(pcmChunk);
            totalDataLength += pcmChunk.length;
            
            // Allow buffer to be garbage collected (by losing reference in next loop iteration)
            buffer = null; 
        }
      }

      setProcessing({ status: 'merging', message: t.statusEncoding, progress: 90 });
      await new Promise(r => setTimeout(r, 100));

      // Create WAV Header
      // numChannels = 2 (stereo) as enforced by audioBufferToWavPCM
      const header = createWavHeader(ctx.sampleRate, 2, totalDataLength);
      
      // Combine header and chunks into a Blob
      const wavBlob = new Blob([header, ...chunks], { type: 'audio/wav' });
      setMergedBlob(wavBlob);
      
      setProcessing({ status: 'completed', message: t.statusReady, progress: 100 });

    } catch (e: any) {
      console.error(e);
      setProcessing({ status: 'error', message: t.statusError + " (" + (e.message || "Unknown error") + ")", progress: 0 });
    }
  };

  const toggleLanguage = () => {
    setLang(prev => prev === 'en' ? 'zh' : 'en');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-black text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
              {t.title}
            </h1>
            <p className="text-gray-400 mt-1">{t.subtitle}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center">
            <button 
                onClick={toggleLanguage}
                className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 py-2 px-3 rounded-full border border-gray-700 transition-colors"
            >
                <Globe size={14} />
                <span>{lang === 'en' ? '中文' : 'English'}</span>
            </button>
            <div className="flex items-center gap-2 text-sm text-green-400 bg-gray-900 py-2 px-4 rounded-full border border-gray-800">
                <ZapOff size={16} />
                <span>{t.secureMode}</span>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Settings & Upload */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Store Config */}
            <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 backdrop-blur-sm space-y-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings size={20} className="text-gray-300" /> {t.aiDirector}
              </h2>
              
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">{t.storeName}</label>
                <input 
                  type="text" 
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">{t.targetVibe}</label>
                <select 
                  value={selectedVibe}
                  onChange={(e) => setSelectedVibe(e.target.value as VibeType)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.values(VibeType).map(v => (
                    <option key={v} value={v}>{t.vibes[v]}</option>
                  ))}
                </select>
              </div>

              <div className="h-px bg-gray-800 my-2"></div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">{t.apiKeyLabel}</label>
                <div className="relative">
                  <input 
                    type="password" 
                    value={apiKey}
                    onChange={handleApiKeyChange}
                    placeholder={t.apiKeyPlaceholder}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
                  />
                  <Key size={14} className="absolute left-3 top-2.5 text-gray-500" />
                </div>
                <p className="text-[10px] text-gray-500 mt-1">{t.apiKeyHelp}</p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                  <button 
                      onClick={handleAddIntro}
                      disabled={!apiKey || (processing.status !== 'idle' && processing.status !== 'completed')}
                      className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-semibold transition-colors border ${!apiKey ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed opacity-60' : 'bg-indigo-900/30 border-indigo-700 text-indigo-200 hover:bg-indigo-900/50'}`}
                  >
                      <Radio size={14} /> {t.genIntro}
                  </button>
                  <button 
                      onClick={handleSmartSort}
                      disabled={!apiKey || tracks.length < 2 || (processing.status !== 'idle' && processing.status !== 'completed')}
                      className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-semibold transition-colors border ${!apiKey || tracks.length < 2 ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed opacity-60' : 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-200'}`}
                  >
                      <Wand2 size={14} /> {t.smartSort}
                  </button>
              </div>
            </div>

            {/* Uploader */}
            <div className="relative group">
                <input 
                    type="file" 
                    multiple 
                    accept="audio/*,video/*" 
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="bg-gray-900 border-2 border-dashed border-gray-700 group-hover:border-indigo-500 group-hover:bg-gray-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300">
                    <div className="bg-gray-800 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
                        <Upload size={24} className="text-gray-400 group-hover:text-indigo-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-300">{t.dragDrop}</p>
                    <p className="text-xs text-gray-600 mt-1">{t.supports}</p>
                </div>
            </div>

          </div>

          {/* Right Column: Playlist */}
          <div className="lg:col-span-2 flex flex-col bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-850">
                <h3 className="font-semibold text-gray-200 flex items-center gap-2">
                    <Music size={18} /> {t.queue} ({tracks.length})
                </h3>
                {tracks.length > 0 && (
                    <button 
                        onClick={() => setTracks([])}
                        className="text-xs text-red-400 hover:text-red-300"
                    >
                        {t.clearAll}
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[500px] p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                {tracks.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-gray-600">
                        <p>{t.noTracks}</p>
                    </div>
                ) : (
                    tracks.map((track, idx) => (
                        <div key={track.id} className="group flex items-center gap-3 p-3 rounded-lg bg-gray-800/40 hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-all">
                            <span className="text-gray-500 text-xs w-6 text-center">{idx + 1}</span>
                            
                            <div className="bg-gray-700 p-2 rounded text-indigo-300">
                                {track.type === 'voiceover' ? <Radio size={16} className="text-pink-400" /> : <Music size={16} />}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-200 truncate">{track.name}</p>
                                <p className="text-xs text-gray-500">{track.type === 'voiceover' ? t.aiGenerated : t.localFile}</p>
                            </div>

                            <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => moveTrack(idx, 'up')} disabled={idx === 0} className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"><ArrowUp size={14}/></button>
                                <button onClick={() => moveTrack(idx, 'down')} disabled={idx === tracks.length - 1} className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"><ArrowDown size={14}/></button>
                                <button onClick={() => removeTrack(track.id)} className="p-1 hover:bg-red-900/50 text-red-400 rounded ml-2"><X size={14}/></button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer Action */}
            <div className="p-4 border-t border-gray-800 bg-gray-850">
                {processing.status !== 'idle' && processing.status !== 'completed' && processing.status !== 'error' ? (
                     <div className="w-full bg-gray-800 rounded-full h-12 flex items-center px-6 relative overflow-hidden">
                        <div 
                            className="absolute left-0 top-0 bottom-0 bg-indigo-900/50 transition-all duration-300" 
                            style={{width: `${processing.progress}%`}}
                        />
                        <Loader2 className="animate-spin mr-3 text-indigo-400" size={20} />
                        <span className="text-sm font-medium relative z-10">{processing.message}</span>
                     </div>
                ) : processing.status === 'completed' && mergedBlob ? (
                    <div className="flex gap-4">
                         <a 
                            href={URL.createObjectURL(mergedBlob)}
                            download={`storecast_mix_${new Date().toISOString().slice(0,10)}.wav`}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-lg h-12 flex items-center justify-center gap-2 font-semibold shadow-lg shadow-green-900/20 transition-all hover:scale-[1.02]"
                        >
                            <Download size={18} /> {t.download}
                        </a>
                        <button 
                            onClick={() => { setProcessing({status: 'idle', message: '', progress: 0}); setMergedBlob(null); }}
                            className="px-6 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium"
                        >
                            {t.reset}
                        </button>
                    </div>
                ) : (
                    <button 
                        onClick={processMerge}
                        disabled={tracks.length === 0}
                        className="w-full bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg h-12 flex items-center justify-center gap-2 font-bold shadow-lg shadow-indigo-900/20 transition-all hover:scale-[1.02]"
                    >
                        <Play size={18} fill="currentColor" /> {t.mergeExport}
                    </button>
                )}
                
                {processing.status === 'error' && (
                    <div className="mt-2 text-red-400 text-sm text-center bg-red-900/20 py-2 rounded">
                        {processing.message}
                    </div>
                )}
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-gray-600">
             <p>{t.processingLocally}</p>
        </div>
      </div>
    </div>
  );
}

export default App;