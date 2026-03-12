import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, ChevronUp, ChevronDown, Loader2, Pause, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// ── helpers ──────────────────────────────────────────────────────────────────

function getField(chunk: any, ...keys: string[]) {
  for (const k of keys) if (chunk[k] !== undefined && chunk[k] !== null) return chunk[k];
  return undefined;
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

// ── SubtitleBar ───────────────────────────────────────────────────────────────
// Shows full script with current word highlighted

const SubtitleBar = ({ script, charIndex, charLength }: { script: string; charIndex: number; charLength: number }) => {
  if (!script) return null;
  const before = script.slice(0, charIndex);
  const current = script.slice(charIndex, charIndex + charLength);
  const after = script.slice(charIndex + charLength);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black via-black/80 to-transparent pt-8 pb-3 px-4">
      <p className="text-center text-[13px] font-bold leading-snug">
        <span className="text-white/50">{before}</span>
        <span className="text-yellow-300 text-[15px] font-black">{current}</span>
        <span className="text-white/50">{after}</span>
      </p>
    </div>
  );
};

// ── App ───────────────────────────────────────────────────────────────────────

// Build a WAV blob from raw L16 PCM base64
function pcmBase64ToWavBlob(base64: string, sampleRate = 24000): Blob {
  const pcm = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const numChannels = 1, bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
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

const isDemo = window.location.pathname === '/demo';

const App = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speechPos, setSpeechPos] = useState({ charIndex: 0, charLength: 0 });
  const [paused, setPaused] = useState(false);
  const [demoReady, setDemoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wordTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const blobUrlRef = useRef<string | null>(null);
  const currentSpeakTextRef = useRef('');
  const currentSpeakDurationRef = useRef(0);
  const currentIndexRef = useRef(currentIndex);
  const feedRef = useRef(feed);

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { feedRef.current = feed; }, [feed]);

  // Auto-load demo feed on /demo route
  useEffect(() => {
    if (!isDemo) return;
    axios.get('http://localhost:5005/demo-feed').then(res => {
      setFeed(res.data);
      setCurrentIndex(0);
    });
  }, []);

  useEffect(() => {
    if (feed.length > 0 && (!isDemo || demoReady)) {
      setSpeechPos({ charIndex: 0, charLength: 0 });
      setPaused(false);
      speak(getField(feed[currentIndex], 'script', 'Script') || '', feed[currentIndex]);
    }
  }, [currentIndex, feed, demoReady]);

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
      const ci = charIndex; const cl = word.length;
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
        const res = await axios.post('http://localhost:5005/tts', { text, voice: 'Puck' });
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
      console.error('TTS failed:', err);
    }
  };

  const togglePause = () => {
    if (paused) {
      audioRef.current?.play();
      videoRef.current?.play();
      const offset = audioRef.current?.currentTime || 0;
      scheduleWordHighlights(currentSpeakTextRef.current, currentSpeakDurationRef.current, offset);
    } else {
      audioRef.current?.pause();
      videoRef.current?.pause();
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
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('doc', file);
    try {
      await axios.post('http://localhost:5005/upload-doc', formData);
      const res = await axios.get('http://localhost:5005/feed');
      setFeed(res.data);
      setCurrentIndex(0);
    } catch (err) {
      console.error(err);
      alert('AI Brain Rot Failed.');
    } finally {
      setLoading(false);
    }
  };

  // ── Upload screen ───────────────────────────────────────────────────────────
  if (feed.length === 0) {
    if (isDemo) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <Loader2 className="animate-spin w-10 h-10 text-white/40" />
        </div>
      );
    }
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
          <p className="text-zinc-500 font-bold uppercase tracking-[0.3em] mt-3 text-xs">
            A Flax App
          </p>
          <p className="text-zinc-600 font-bold uppercase tracking-[0.4em] mt-1 text-[10px] opacity-60">
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
  const hook = getField(chunk, 'hook', 'Rage-Bait Hook', 'rage_bait_hook') || '';
  const script = getField(chunk, 'script', 'Script') || '';
  const images: string[] = chunk.images || [];

  return (
    <div className="h-screen w-full bg-black flex items-center justify-center overflow-hidden touch-none font-sans">
      <audio ref={audioRef} style={{ display: 'none' }} />
      {isDemo && !demoReady && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black cursor-pointer"
          onClick={() => setDemoReady(true)}
        >
          <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 shadow-[0_0_60px_rgba(255,255,255,0.2)]">
            <Play className="w-9 h-9 text-black ml-1" />
          </div>
          <p className="text-white font-black italic text-2xl uppercase tracking-tight">Tap to start</p>
          <p className="text-white/30 text-xs font-bold uppercase tracking-widest mt-2">TikDoc Demo</p>
        </div>
      )}
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
            {/* Top half: diagram slideshow + hook + rolling captions */}
            <div className="h-1/2 w-full relative bg-zinc-950 overflow-hidden border-b-2 border-white/10">
              <Slideshow images={images} paused={paused} />

              {/* Hook text — top strip */}
              <div className="absolute top-0 left-0 right-0 z-20 px-4 pt-3 pb-6 bg-gradient-to-b from-black/70 to-transparent">
                <p className="text-center text-[11px] font-black uppercase tracking-widest text-white/80 leading-snug">
                  {hook}
                </p>
              </div>

            </div>

            {/* Bottom half: brain rot video */}
            <div className="h-1/2 w-full relative overflow-hidden bg-black">
              <video
                ref={videoRef}
                key={chunk.id + '-rot'}
                src={chunk.brainRotVideo}
                autoPlay
                loop
                muted
                playsInline
                onLoadedData={e => {
                  if (chunk.startTime) (e.target as HTMLVideoElement).currentTime = chunk.startTime;
                }}
                className="w-full h-full object-cover grayscale-[30%]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              {/* Subtitles — top of brain rot video */}
              <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black via-black/80 to-transparent pt-3 pb-8 px-4">
                <p className="text-center text-[13px] font-bold leading-snug">
                  <span className="text-white/50">{script.slice(0, speechPos.charIndex)}</span>
                  <span className="text-yellow-300 text-[15px] font-black">{script.slice(speechPos.charIndex, speechPos.charIndex + speechPos.charLength)}</span>
                  <span className="text-white/50">{script.slice(speechPos.charIndex + speechPos.charLength)}</span>
                </p>
              </div>
              <div className="absolute bottom-10 left-8 z-30 flex items-center gap-4">
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

      {/* Controls — outside the phone frame */}
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
      </div>
    </div>
  );
};

export default App;
