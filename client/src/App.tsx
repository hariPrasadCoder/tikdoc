import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, ChevronUp, ChevronDown, Loader2, Pause, Play, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — add your YouTube video IDs here
// Upload your brain-rot videos to YouTube, then paste the video IDs below
// e.g. for https://www.youtube.com/watch?v=abc123  →  'abc123'
// ─────────────────────────────────────────────────────────────────────────────
const BRAIN_ROT_VIDEO_IDS: string[] = [
  // 'ADD_YOUR_VIDEO_ID_HERE',
  // 'ADD_YOUR_VIDEO_ID_HERE',
  // 'ADD_YOUR_VIDEO_ID_HERE',
];

const API_KEY_STORAGE_KEY = 'tikdoc_api_key';
const IDB_DB_NAME = 'tikdoc';
const IDB_STORE = 'feed';
const IDB_KEY = 'current';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB(data: any[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFromIDB(): Promise<any[] | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function clearIDB() {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── WAV helper ────────────────────────────────────────────────────────────────

function pcmBase64ToWavBlob(base64: string, sampleRate = 24000): Blob {
  const pcm = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const numChannels = 1, bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);
  const enc = (s: string, o: number) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  enc('RIFF', 0); v.setUint32(4, 36 + dataSize, true);
  enc('WAVE', 8); enc('fmt ', 12);
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true); v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true); enc('data', 36);
  v.setUint32(40, dataSize, true);
  new Uint8Array(buffer).set(pcm, 44);
  return new Blob([buffer], { type: 'audio/wav' });
}

// ── Slideshow ─────────────────────────────────────────────────────────────────

const Slideshow = ({ images, paused }: { images: string[]; paused: boolean }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => { setIndex(0); }, [images]);

  useEffect(() => {
    if (images.length <= 1 || paused) return;
    const id = setInterval(() => setIndex(prev => (prev + 1) % images.length), 5000);
    return () => clearInterval(id);
  }, [images, paused]);

  if (!images || images.length === 0) return <div className="absolute inset-0 bg-zinc-950" />;

  return (
    <AnimatePresence mode="wait">
      <motion.img
        key={index}
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        src={`data:image/jpeg;base64,${images[index]}`}
        className="absolute inset-0 w-full h-full object-contain z-0 bg-white"
      />
    </AnimatePresence>
  );
};

// ── BrainRotVideo ─────────────────────────────────────────────────────────────

const BrainRotVideo = ({ videoId }: { videoId: string }) => {
  if (!videoId) {
    return (
      <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
        <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">Add video IDs in config</p>
      </div>
    );
  }

  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&disablekb=1`;

  return (
    <iframe
      src={src}
      className="w-full h-full scale-[1.3] grayscale-[30%]"
      style={{ border: 'none', pointerEvents: 'none' }}
      allow="autoplay; encrypted-media"
      allowFullScreen={false}
    />
  );
};

// ── APIKeyScreen ──────────────────────────────────────────────────────────────

const APIKeyScreen = ({ onSave }: { onSave: (key: string) => void }) => {
  const [key, setKey] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
    onSave(trimmed);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-black to-red-950/40" />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 text-center mb-12"
      >
        <h1 className="text-9xl font-black italic tracking-tighter drop-shadow-[0_0_50px_rgba(255,255,255,0.15)] leading-none">
          TIKDOC
        </h1>
        <p className="text-zinc-600 font-bold uppercase tracking-[0.4em] mt-2 text-[10px] opacity-60">
          The Future of Boring Documentation
        </p>
      </motion.div>

      <form
        onSubmit={handleSave}
        className="z-10 bg-zinc-900/30 backdrop-blur-3xl p-16 rounded-[4rem] border border-white/5 flex flex-col items-center gap-10 w-full max-w-xl shadow-2xl"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
            <Key className="w-9 h-9 text-white" />
          </div>
          <div>
            <p className="text-2xl font-black italic uppercase tracking-tight">One-time setup</p>
            <p className="text-zinc-500 font-medium mt-1">Your Gemini API key — stored only in your browser.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Get one free at{' '}
              <span className="text-zinc-400 font-mono">aistudio.google.com</span>
            </p>
          </div>
        </div>

        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="AIza..."
          className="w-full py-5 px-8 rounded-full bg-white/5 border border-white/10 text-white font-mono text-sm placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-all"
        />

        <button
          type="submit"
          disabled={!key.trim()}
          className="w-full bg-white text-black py-6 rounded-full font-black text-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_50px_rgba(255,255,255,0.2)] disabled:opacity-20"
        >
          LET'S GO
        </button>
      </form>
    </div>
  );
};

// ── App ───────────────────────────────────────────────────────────────────────

const App = () => {
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem(API_KEY_STORAGE_KEY));
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speechPos, setSpeechPos] = useState({ charIndex: 0, charLength: 0 });
  const [paused, setPaused] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const wordTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const blobUrlRef = useRef<string | null>(null);
  const currentSpeakTextRef = useRef('');
  const currentSpeakDurationRef = useRef(0);
  const currentIndexRef = useRef(currentIndex);
  const feedRef = useRef(feed);

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { feedRef.current = feed; }, [feed]);

  // Load previous session from IndexedDB on mount
  useEffect(() => {
    loadFromIDB().then(saved => {
      if (saved && saved.length > 0) setFeed(saved);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (feed.length > 0) {
      setSpeechPos({ charIndex: 0, charLength: 0 });
      setPaused(false);
      speak(feed[currentIndex]?.script || '', feed[currentIndex]);
    }
  }, [currentIndex, feed]);

  const stopAudio = () => {
    wordTimersRef.current.forEach(t => clearTimeout(t));
    wordTimersRef.current = [];
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
  };

  const scheduleWordHighlights = (text: string, durationSec: number, offsetSec = 0) => {
    wordTimersRef.current.forEach(t => clearTimeout(t));
    const words = text.split(/\s+/);
    const msPerWord = (durationSec * 1000) / words.length;
    let charIndex = 0;
    wordTimersRef.current = words.flatMap((word, i) => {
      const ci = charIndex;
      const cl = word.length;
      charIndex += word.length + 1;
      const delay = i * msPerWord - offsetSec * 1000;
      if (delay < 0) { setSpeechPos({ charIndex: ci, charLength: cl }); return []; }
      return [setTimeout(() => setSpeechPos({ charIndex: ci, charLength: cl }), delay)];
    });
  };

  const speak = async (text: string, chunk: any) => {
    stopAudio();
    if (!text) return;
    try {
      let url: string;
      if (chunk?.audio && chunk?.audioMimeType) {
        const sampleRate = parseInt(chunk.audioMimeType.match(/rate=(\d+)/)?.[1] || '24000');
        url = URL.createObjectURL(pcmBase64ToWavBlob(chunk.audio, sampleRate));
      } else {
        const res = await axios.post('/tts', { text, voice: 'Puck' }, {
          headers: { 'x-api-key': apiKey }
        });
        const sampleRate = parseInt(res.data.mimeType.match(/rate=(\d+)/)?.[1] || '24000');
        url = URL.createObjectURL(pcmBase64ToWavBlob(res.data.audio, sampleRate));
      }
      blobUrlRef.current = url;

      const el = audioRef.current!;
      el.src = url;
      el.onloadedmetadata = () => {
        currentSpeakTextRef.current = text;
        currentSpeakDurationRef.current = el.duration;
        scheduleWordHighlights(text, el.duration);
      };
      el.onended = () => {
        const idx = currentIndexRef.current;
        const f = feedRef.current;
        if (idx < f.length - 1) setTimeout(() => setCurrentIndex(prev => prev + 1), 1500);
      };
      await el.play();
    } catch (err) {
      console.error('Audio failed:', err);
    }
  };

  const togglePause = () => {
    if (paused) {
      audioRef.current?.play();
      const offset = audioRef.current?.currentTime || 0;
      scheduleWordHighlights(currentSpeakTextRef.current, currentSpeakDurationRef.current, offset);
    } else {
      audioRef.current?.pause();
      wordTimersRef.current.forEach(t => clearTimeout(t));
      wordTimersRef.current = [];
    }
    setPaused(p => !p);
  };

  const goTo = (next: number) => {
    stopAudio();
    setCurrentIndex(next);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !apiKey) return;
    setLoading(true);

    const formData = new FormData();
    formData.append('doc', file);

    try {
      const res = await axios.post('/process', formData, {
        headers: { 'x-api-key': apiKey }
      });
      const chunks = res.data.chunks;
      await saveToIDB(chunks);
      setFeed(chunks);
      setCurrentIndex(0);
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.error || 'Something went wrong.';
      alert(`Failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    stopAudio();
    await clearIDB();
    setFeed([]);
    setCurrentIndex(0);
    setFile(null);
  };

  // ── API key screen ──────────────────────────────────────────────────────────
  if (!apiKey) {
    return <APIKeyScreen onSave={setApiKey} />;
  }

  // ── Upload screen ───────────────────────────────────────────────────────────
  if (feed.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-black to-red-950/40" />

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 text-center mb-12"
        >
          <h1 className="text-9xl font-black italic tracking-tighter drop-shadow-[0_0_50px_rgba(255,255,255,0.15)] leading-none">
            TIKDOC
          </h1>
          <p className="text-zinc-600 font-bold uppercase tracking-[0.4em] mt-2 text-[10px] opacity-60">
            The Future of Boring Documentation
          </p>
        </motion.div>

        <form
          onSubmit={handleUpload}
          className="z-10 bg-zinc-900/30 backdrop-blur-3xl p-16 rounded-[4rem] border border-white/5 flex flex-col items-center gap-12 w-full max-w-xl shadow-2xl"
        >
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10 relative">
              <div className="absolute inset-0 bg-white/10 blur-2xl rounded-full animate-pulse" />
              <Upload className="w-10 h-10 text-white relative" />
            </div>
            <div className="text-center">
              <p className="text-2xl font-black italic uppercase tracking-tight">Ready to rot?</p>
              <p className="text-zinc-500 font-medium">Drop your documents here.</p>
            </div>
          </div>

          <div className="w-full relative group">
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className="w-full py-5 px-8 rounded-full border border-white/10 bg-white/5 text-center group-hover:bg-white/10 transition-all">
              <span className="text-sm font-bold text-zinc-400">{file ? file.name : 'Select Document'}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !file}
            className="w-full bg-white text-black py-6 rounded-full font-black text-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_50px_rgba(255,255,255,0.2)] disabled:opacity-20 disabled:grayscale"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-4 italic">
                <Loader2 className="animate-spin w-8 h-8" />
                <span>PROCESSING...</span>
              </div>
            ) : (
              'TIME TO DOOM SCROLL'
            )}
          </button>
        </form>

        <button
          onClick={() => {
            localStorage.removeItem(API_KEY_STORAGE_KEY);
            setApiKey(null);
          }}
          className="z-10 mt-8 text-zinc-700 text-xs font-bold hover:text-zinc-400 transition-colors uppercase tracking-widest"
        >
          Change API key
        </button>

        <div className="absolute bottom-12 z-10 opacity-20 flex gap-12 font-black italic text-[10px] tracking-widest uppercase">
          <span>Neural Core v2.5</span>
          <span>Vision Engine x4</span>
          <span>Cinematic Synth v3</span>
        </div>
      </div>
    );
  }

  // ── Feed screen ─────────────────────────────────────────────────────────────
  const chunk = feed[currentIndex];
  const hook = chunk?.hook || '';
  const script = chunk?.script || '';
  const images: string[] = chunk?.images || [];
  const videoId = BRAIN_ROT_VIDEO_IDS[currentIndex % Math.max(BRAIN_ROT_VIDEO_IDS.length, 1)] || '';

  return (
    <div className="h-screen w-full bg-black flex items-center justify-center overflow-hidden touch-none font-sans">
      <audio ref={audioRef} style={{ display: 'none' }} />

      {/* Phone frame */}
      <div className="relative h-full max-w-[420px] w-full bg-black border-x border-white/5 overflow-hidden shadow-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ y: 600, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -600, opacity: 0 }}
            className="w-full h-full flex flex-col"
          >
            {/* Top half: diagram slideshow */}
            <div className="h-1/2 w-full relative bg-zinc-950 overflow-hidden border-b-2 border-white/10">
              <Slideshow images={images} paused={paused} />
              <div className="absolute top-0 left-0 right-0 z-20 px-4 pt-3 pb-6 bg-gradient-to-b from-black/70 to-transparent">
                <p className="text-center text-[11px] font-black uppercase tracking-widest text-white/80 leading-snug">
                  {hook}
                </p>
              </div>
            </div>

            {/* Bottom half: brain-rot video */}
            <div className="h-1/2 w-full relative overflow-hidden bg-black">
              <BrainRotVideo videoId={videoId} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

              {/* Subtitles */}
              <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black via-black/80 to-transparent pt-3 pb-8 px-4 pointer-events-none">
                <p className="text-center text-[13px] font-bold leading-snug">
                  <span className="text-white/50">{script.slice(0, speechPos.charIndex)}</span>
                  <span className="text-yellow-300 text-[15px] font-black">{script.slice(speechPos.charIndex, speechPos.charIndex + speechPos.charLength)}</span>
                  <span className="text-white/50">{script.slice(speechPos.charIndex + speechPos.charLength)}</span>
                </p>
              </div>

              <div className="absolute bottom-10 left-8 z-30 flex items-center gap-4 pointer-events-none">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-black font-black italic shrink-0">
                  TD
                </div>
                <div>
                  <p className="font-black text-white italic text-xl tracking-tighter uppercase">@tikdoc</p>
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">
                    CHAPTER {currentIndex + 1} / {feed.length}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-6 ml-4">
        <button
          onClick={() => goTo(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="p-4 bg-white/10 backdrop-blur-md text-white rounded-full border border-white/20 hover:bg-white hover:text-black transition-all disabled:opacity-30"
        >
          <ChevronUp className="w-7 h-7" />
        </button>

        <button
          onClick={togglePause}
          className="p-4 bg-white/10 backdrop-blur-md text-white rounded-full border border-white/20 hover:bg-white hover:text-black transition-all"
        >
          {paused ? <Play className="w-7 h-7" /> : <Pause className="w-7 h-7" />}
        </button>

        <button
          onClick={() => goTo(Math.min(feed.length - 1, currentIndex + 1))}
          disabled={currentIndex === feed.length - 1}
          className="p-4 bg-white/10 backdrop-blur-md text-white rounded-full border border-white/20 hover:bg-white hover:text-black transition-all disabled:opacity-30"
        >
          <ChevronDown className="w-7 h-7" />
        </button>

        <button
          onClick={handleReset}
          className="p-3 bg-white/5 backdrop-blur-md text-white/40 rounded-full border border-white/10 hover:bg-red-900/30 hover:text-white/80 transition-all text-xs font-bold uppercase tracking-widest"
          title="Upload new doc"
        >
          <Upload className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default App;
