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

const Slideshow = ({ images }: { images: string[] }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (images.length <= 1) return;
    const id = setInterval(() => setIndex(prev => (prev + 1) % images.length), 5000);
    return () => clearInterval(id);
  }, [images]);

  if (!images || images.length === 0) return <div className="absolute inset-0 bg-zinc-950" />;

  return (
    <AnimatePresence mode="wait">
      <motion.img
        key={index}
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        src={`data:image/png;base64,${images[index]}`}
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

const App = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speechPos, setSpeechPos] = useState({ charIndex: 0, charLength: 0 });
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const synth = window.speechSynthesis;

  useEffect(() => {
    if (feed.length > 0) {
      setSpeechPos({ charIndex: 0, charLength: 0 });
      setPaused(false);
      speak(getField(feed[currentIndex], 'script', 'Script') || '');
    }
  }, [currentIndex, feed]);

  const speak = (text: string) => {
    synth.cancel();
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.3;
    utterance.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name === 'word') {
        const rest = text.slice(e.charIndex);
        const nextSpace = rest.search(/\s/);
        const charLength = e.charLength || (nextSpace === -1 ? rest.length : nextSpace);
        setSpeechPos({ charIndex: e.charIndex, charLength });
      }
    };
    utterance.onend = () => {
      if (currentIndex < feed.length - 1) {
        setTimeout(() => setCurrentIndex(prev => prev + 1), 1500);
      }
    };
    synth.speak(utterance);
  };

  const togglePause = () => {
    if (paused) {
      synth.resume();
      videoRef.current?.play();
    } else {
      synth.pause();
      videoRef.current?.pause();
    }
    setPaused(p => !p);
  };

  const goTo = (next: number) => {
    synth.cancel();
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
              <p className="text-zinc-500 font-medium">Drop your technical PDF or Markdown here.</p>
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
              <Slideshow images={images} />

              {/* Hook text — top strip */}
              <div className="absolute top-0 left-0 right-0 z-20 px-4 pt-3 pb-6 bg-gradient-to-b from-black/70 to-transparent">
                <p className="text-center text-[11px] font-black uppercase tracking-widest text-white/80 leading-snug">
                  {hook}
                </p>
              </div>

              {/* Subtitles */}
              <SubtitleBar script={script} charIndex={speechPos.charIndex} charLength={speechPos.charLength} />
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
