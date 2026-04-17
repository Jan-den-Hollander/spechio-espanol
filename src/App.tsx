/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GuidaSection } from './GuidaInstructions';
import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Mic, MicOff, Volume2, Sparkles, Camera, CameraOff, ChevronRight, 
  RotateCcw, Settings, MessageSquare, Trophy, Save, Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// 'error' voor de foutbubbel in het gespreksveld
interface Message {
  role: 'user' | 'model' | 'error';
  es: string;
  it: string;
  score?: number;
  heard?: string;
}

const SYSTEM_PROMPT = `Sei Carmen, una simpatica partner di conversazione in spagnolo — come uno specchio magico che parla.
REGOLE: UNA frase breve in spagnolo per turno (max 12 parole). Termina sempre con una domanda. Usa spagnolo naturale e moderno. Parla in modo caldo e incoraggiante. Correggi gli errori gentilmente con ✏️
Rispondi SOLO con JSON valido, senza spiegazioni o Markdown: {"es":"frase in spagnolo","it":"traduzione italiana"}`;

export default function App() {
  const [isCamOn, setIsCamOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [level, setLevel] = useState('A2');
  const [topic, setTopic] = useState('vita quotidiana');
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('Pronto · Listo');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [customKey, setCustomKey] = useState(localStorage.getItem('specchio_spagnolo_api_key') || '');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showFlags = windowWidth >= 480;

  const getAI = () => new GoogleGenAI({ apiKey: customKey || process.env.GEMINI_API_KEY || "" });

  const saveCustomKey = (key: string) => {
    localStorage.setItem('specchio_spagnolo_api_key', key);
    setCustomKey(key);
    setShowKeyModal(false);
    setStatus('Chiave API salvata! · ¡Guardado!');
  };

  const prevMessagesLength = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessagesLength.current || isThinking) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, isThinking]);

  // Safari-fix: AudioContext initialiseren of hervatten tijdens een klik
  const ensureAudioContext = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    } else if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const toggleCam = async () => {
    if (isCamOn) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsCamOn(false);
      setStatus('Specchio spento · Espejo apagado');
    } else {
      try {
        setStatus('Avvio fotocamera...');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("No camera support");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setTimeout(() => videoRef.current?.play().catch(console.error), 100);
        }
        streamRef.current = stream;
        setIsCamOn(true);
        setStatus('Specchio attivo! ✨ · ¡Espejo activo!');
      } catch {
        setStatus('Accesso fotocamera negato · Acceso denegado');
        setIsCamOn(false);
      }
    }
  };

  // Spaanse stem (Aoede) — geen instructietekst, alleen de tekst zelf
  const speakIt = async (text: string) => {
    if (!text) return;
    setIsSpeaking(true);
    setStatus('Lo specchio parla... · El espejo habla...');
    try {
      const aiInstance = getAI();
      const response = await aiInstance.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" }
            }
          }
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const int16Data = new Int16Array(bytes.buffer);
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) float32Data[i] = int16Data[i] / 32768.0;
        const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
        audioBuffer.getChannelData(0).set(float32Data);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => { setIsSpeaking(false); setStatus('Premi 🎤 per rispondere · Pulsa 🎤 para responder'); };
        source.start();
      } else throw new Error("No audio");
    } catch {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES'; utterance.rate = 0.85;
      utterance.onend = () => { setIsSpeaking(false); setStatus('Premi 🎤 per rispondere · Pulsa 🎤 para responder'); };
      window.speechSynthesis.speak(utterance);
      setStatus('Voce del browser utilizzata (fallback)');
    }
  };

  // Safari-fix: ensureAudioContext bij de microfoonklik
  const startRecording = () => {
    ensureAudioContext();
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { setStatus('Riconoscimento vocale non supportato'); return; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(_) {} }
      recognitionRef.current = new SR();
      recognitionRef.current.lang = 'es-ES';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onstart = () => { setIsRecording(true); setStatus('Ascolto... · Escuchando...'); };
      recognitionRef.current.onresult = (e: any) => { setIsRecording(false); processHeard(e.results[0][0].transcript); };
      recognitionRef.current.onerror = () => { setIsRecording(false); setStatus('Errore microfono.'); };
      recognitionRef.current.onend = () => setIsRecording(false);
      recognitionRef.current.start();
    } catch { setStatus('Impossibile avviare il microfono.'); setIsRecording(false); }
  };

  const stopRecording = () => { recognitionRef.current?.stop(); setIsRecording(false); };

  const processHeard = async (heard: string) => {
    if (!heard.trim()) return;
    const lastModelMsg = messages.filter(m => m.role === 'model').pop();
    let currentScore = 0;
    if (lastModelMsg) {
      const sim = calculateSimilarity(lastModelMsg.es, heard);
      if (sim > 0.7) currentScore = 2; else if (sim > 0.4) currentScore = 1;
      setScore(prev => prev + currentScore);
    }
    const userMsg: Message = { role: 'user', es: heard, it: '', heard, score: currentScore };
    setMessages(prev => [...prev, userMsg]);
    generateAIResponse([...messages, userMsg]);
  };

  const calculateSimilarity = (s1: string, s2: string) => {
    const a = s1.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()¿¡]/g, "");
    const b = s2.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()¿¡]/g, "");
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;
    return 0.5;
  };

  // Timeout + automatische retry + foutbubbel
  const generateAIResponse = async (history: Message[], retryCount = 0) => {
    setIsThinking(true);
    setStatus(retryCount > 0
      ? 'Ancora un tentativo... · Intentando de nuevo...'
      : 'Lo specchio pensa... · El espejo piensa...'
    );

    const systemPrompt = `${SYSTEM_PROMPT}\nLivello: ${level}. Argomento attuale: ${topic}.`;

    const contents = history
      .filter(m => m.role !== 'error')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.role === 'user'
          ? m.es
          : JSON.stringify({ es: m.es, it: m.it }) }]
      }));

    try {
      const aiInstance = getAI();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 12000)
      );

      const responsePromise = aiInstance.models.generateContent({
        model: retryCount > 0 ? "gemini-2.0-flash" : "gemini-2.5-flash",
        contents: contents.length > 0
          ? contents
          : [{ role: 'user', parts: [{ text: 'Inizia la conversazione con un saluto caloroso in spagnolo e una domanda.' }] }],
        config: { systemInstruction: systemPrompt, responseMimeType: "application/json" },
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);
      const data = JSON.parse(response.text || "{}");
      const aiMsg: Message = {
        role: 'model',
        es: data.es || "¡Hola! ¿Cómo estás?",
        it: data.it || "Ciao! Come stai?",
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsThinking(false);
      speakIt(aiMsg.es);

    } catch {
      if (retryCount === 0) {
        setStatus('Connessione lenta, riprovo...');
        setTimeout(() => generateAIResponse(history, 1), 2000);
        return;
      }
      setIsThinking(false);
      setStatus('Server sovraccarico · Servidor ocupado');
      const errorMsg: Message = { role: 'error', es: '', it: '' };
      setMessages(prev => [...prev, errorMsg]);
    }
  };

  // Safari-fix: ensureAudioContext ook bij Nuova Conversazione
  const startNewConversation = () => {
    ensureAudioContext();
    setMessages([]);
    setScore(0);
    generateAIResponse([]);
  };

  const downloadTranscript = () => {
    if (!messages.length) return;
    const text = messages
      .filter(m => m.role !== 'error')
      .map(m => `[${m.role === 'user' ? 'TU' : 'CARMEN'}]\nES: ${m.es}\nIT: ${m.it || '-'}\n`)
      .join('\n---\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'conversazione-spagnolo.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Spaanse accentkleur: warm rood #c0392b / #e74c3c
  return (
    <div className="min-h-screen w-full bg-[#080810] text-[#f5f0e8] font-sans selection:bg-[#c0392b]/30 flex flex-col pb-8">
      <div className="flex flex-col max-w-md mx-auto w-full px-4 pt-4 relative z-10">

        <header className="text-center pb-4">
          <motion.h1 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            className="font-serif text-3xl font-light tracking-widest text-[#e87a6a] drop-shadow-[0_0_20px_rgba(192,57,43,0.4)]">
            Specchio Español
          </motion.h1>
          <a href="#guida"
            className="text-[0.55rem] tracking-[0.15em] uppercase opacity-40 hover:opacity-80 transition-opacity mt-1 block"
            style={{ color: 'inherit' }}>
            Come iniziare · Cómo empezar · How to start ↓
          </a>
          <p className="text-[0.6rem] tracking-[0.2em] uppercase text-[#c0392b]/50 mt-1">
            Carmen · Madrid · Español
          </p>
        </header>

        {/* Mirror + Flanking Flags */}
        <div className="relative flex items-center justify-center mb-5">

          {showFlags && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
              className="flex flex-col items-center gap-1 mr-5 select-none">
              <span className="text-4xl drop-shadow-lg">🇮🇹</span>
              <span className="text-[0.5rem] tracking-widest uppercase text-[#c0392b]/40">Italiano</span>
            </motion.div>
          )}

          <div className="relative w-full max-w-[200px] aspect-[3/4]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#8b1a0a] via-[#c0392b] to-[#6b0e05] rounded-[50%_50%_46%_46%_/_28%_28%_72%_72%] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
              <div className="w-full h-full bg-[#180808] rounded-[47%_47%_44%_44%_/_26%_26%_74%_74%] overflow-hidden relative">
                <video ref={videoRef} autoPlay playsInline muted
                  className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-1000 ${isCamOn ? 'opacity-100' : 'opacity-0'}`} />
                <AnimatePresence>
                  {!isCamOn && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                      <Sparkles className="w-8 h-8 text-[#c0392b] mb-2 animate-pulse" />
                      <small className="text-[#c0392b]/60 text-[0.6rem] uppercase tracking-wider leading-relaxed">Specchio spento<br/>Espejo apagado</small>
                    </motion.div>
                  )}
                </AnimatePresence>
                {isSpeaking && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                    {[0, 0.15, 0.3].map((d, i) => (
                      <div key={i} className="w-1 h-3 bg-[#e87a6a]/80 rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button type="button" onClick={(e) => { e.preventDefault(); toggleCam(); }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#080810] border border-[#c0392b]/30 px-3 py-1.5 rounded-full text-[0.55rem] tracking-widest uppercase text-[#e87a6a]/80 flex flex-col items-center gap-0.5 z-20 w-[130px] text-center">
              <div className="flex items-center gap-1.5">
                {isCamOn ? <CameraOff size={10} /> : <Camera size={10} />}
                <span>{isCamOn ? 'Spegni Specchio' : 'Accendi Specchio'}</span>
              </div>
              <span className="text-[0.45rem] opacity-60">{isCamOn ? 'Apagar espejo' : 'Encender espejo'}</span>
            </button>
          </div>

          {showFlags && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
              className="flex flex-col items-center gap-1 ml-5 select-none">
              <span className="text-4xl drop-shadow-lg">🇪🇸</span>
              <span className="text-[0.5rem] tracking-widest uppercase text-[#c0392b]/40">Español</span>
            </motion.div>
          )}
        </div>

        {/* Settings */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="space-y-1">
            <label className="text-[0.55rem] uppercase tracking-widest text-[#c0392b]/50 ml-1 flex items-center gap-1"><Settings size={8} /> Livello · Nivel</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)}
              className="w-full bg-[#c0392b]/5 border border-[#c0392b]/20 rounded-lg px-2 py-2 text-[0.7rem] outline-none text-[#e87a6a]">
              <option value="A1">A1 - Principiante</option>
              <option value="A2">A2 - Elementare</option>
              <option value="B1">B1 - Intermedio</option>
              <option value="B2">B2 - Avanzato</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[0.55rem] uppercase tracking-widest text-[#c0392b]/50 ml-1 flex items-center gap-1"><MessageSquare size={8} /> Argomento · Tema</label>
            <select value={topic} onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-[#c0392b]/5 border border-[#c0392b]/20 rounded-lg px-2 py-2 text-[0.7rem] outline-none text-[#e87a6a]">
              <option value="vita quotidiana">Vita Quotidiana</option>
              <option value="ristorante">Ristorante</option>
              <option value="viaggi">Viaggi</option>
              <option value="famiglia">Famiglia</option>
              <option value="lavoro">Lavoro</option>
              <option value="cultura">Cultura Spagnola</option>
              <option value="gastronomia">Gastronomia</option>
            </select>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-center gap-6 mb-2">
          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => messages.length > 0 && speakIt(messages[messages.length-1].es)}
              className="w-10 h-10 rounded-full bg-[#c0392b]/10 border border-[#c0392b]/20 flex items-center justify-center text-[#e87a6a]">
              <Volume2 size={16} />
            </button>
            <span className="text-[0.5rem] uppercase tracking-widest text-[#c0392b]/60 text-center leading-tight">Riascolta<br/><span className="text-[#c0392b]/40">Repetir</span></span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={isRecording ? stopRecording : startRecording}
              className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl ${isRecording ? 'bg-red-500/20 border-2 border-red-500 animate-pulse' : 'bg-gradient-to-br from-[#c0392b] to-[#6b0e05]'}`}>
              {isRecording ? <MicOff size={24} className="text-red-500" /> : <Mic size={24} className="text-white" />}
            </button>
            <span className={`text-[0.55rem] uppercase tracking-widest font-bold text-center leading-tight ${isRecording ? 'text-red-500' : 'text-[#e87a6a]'}`}>
              {isRecording ? <>Ascolto...<br/><span className="opacity-60">Escucho</span></> : <>Rispondi<br/><span className="opacity-60">Responder</span></>}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => generateAIResponse(messages)}
              className="w-10 h-10 rounded-full bg-[#c0392b]/10 border border-[#c0392b]/20 flex items-center justify-center text-[#e87a6a]">
              <ChevronRight size={16} />
            </button>
            <span className="text-[0.5rem] uppercase tracking-widest text-[#c0392b]/60 text-center leading-tight">Salta<br/><span className="text-[#c0392b]/40">Saltar</span></span>
          </div>
        </div>

        <div className="text-center mb-3">
          <p className="text-[0.65rem] text-[#e87a6a]/60 min-h-[1em] italic font-medium">{status}</p>
        </div>

        {/* Chat */}
        <div className="w-full h-[35vh] min-h-[250px] bg-black/30 border border-[#c0392b]/10 rounded-xl overflow-y-auto p-3 space-y-3 scrollbar-thin mb-4">

          {messages.map((msg, i) => {

            // Tweetalige foutbubbel (Spaans + Italiaans)
            if (msg.role === 'error') {
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-start">
                  <div className="w-full px-3 py-3 rounded-xl rounded-bl-none text-[0.72rem] leading-relaxed bg-amber-900/20 border border-amber-500/30 space-y-2">

                    <p className="text-amber-300 font-semibold text-[0.75rem]">
                      ⚠️ El espejo está momentáneamente saturado
                    </p>

                    <p className="text-amber-200/70">
                      🕐 El servidor gratuito está más ocupado durante el día y a última hora de la noche
                      (cuando los gamers americanos están en línea). Los mejores momentos para practicar:
                      temprano por la mañana o entre las 13:00 y las 15:00.
                    </p>

                    <p className="text-amber-200/70">
                      🎤 ¡No hay problema! Pulsa el micrófono para leer una frase en voz alta
                      y el altavoz 🔊 para escucharla de nuevo.
                      ¡Puedes practicar igual mientras esperas!
                    </p>

                    <p className="text-amber-200/50 text-[0.65rem] italic">
                      🇮🇹 Nessun problema! Clicca sul microfono per leggere una frase
                      ad alta voce e sull'altoparlante per riascoltarla.
                      Puoi esercitarti lo stesso!
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setMessages(prev => prev.filter((_, idx) => idx !== i));
                        generateAIResponse(messages.filter(m => m.role !== 'error'));
                      }}
                      className="mt-1 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[0.6rem] uppercase tracking-widest hover:bg-amber-500/30 transition-colors"
                    >
                      ↻ Intentar de nuevo · Riprova
                    </button>

                  </div>
                </motion.div>
              );
            }

            return (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] px-3 py-2 rounded-xl text-[0.8rem] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-white/5 border border-white/10 rounded-br-none italic text-white/80'
                    : 'bg-gradient-to-br from-[#c0392b]/10 to-[#c0392b]/5 border border-[#c0392b]/20 rounded-bl-none'
                }`}>
                  {msg.role === 'model' ? (
                    <>
                      <span className="font-serif italic text-base text-[#e87a6a] block mb-0.5">{msg.es}</span>
                      <span className="text-[0.65rem] text-white/40 block leading-tight">{msg.it}</span>
                    </>
                  ) : (
                    <>
                      <span>{msg.es}</span>
                      {msg.score !== undefined && (
                        <div className={`mt-1.5 text-[0.55rem] font-bold uppercase px-1.5 py-0.5 rounded-sm inline-block ${
                          msg.score === 2 ? 'bg-green-500/10 text-green-400'
                          : msg.score === 1 ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-red-500/10 text-red-400'
                        }`}>
                          {msg.score === 2 ? '✓ ¡Muy bien!' : msg.score === 1 ? '~ ¡Casi!' : '↻ Inténtalo de nuevo'}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}

          {isThinking && (
            <div className="flex gap-1.5 p-2 bg-[#c0392b]/5 border border-[#c0392b]/10 rounded-xl rounded-bl-none w-12">
              <div className="w-1 h-1 bg-[#e87a6a] rounded-full animate-bounce" />
              <div className="w-1 h-1 bg-[#e87a6a] rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1 h-1 bg-[#e87a6a] rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Bottom */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[#c0392b]/10 pb-3">
            <div className="flex items-center gap-1.5 text-[#c0392b]/60 text-[0.6rem] uppercase tracking-widest"><Trophy size={12} /> Punteggio · Puntuación</div>
            <div className="text-[#e87a6a] font-bold text-lg">⭐ {score}</div>
          </div>

          <button type="button" onClick={startNewConversation}
            className="w-full py-3 border border-[#c0392b]/30 bg-[#c0392b]/5 rounded-xl text-[0.7rem] tracking-[0.2em] uppercase text-[#e87a6a] hover:bg-[#c0392b]/10 flex flex-col items-center justify-center gap-1">
            <div className="flex items-center gap-2"><RotateCcw size={14} /> Nuova Conversazione</div>
            <span className="text-[0.55rem] opacity-60">Nueva conversación</span>
          </button>

          <div className="flex gap-2">
            <button type="button" onClick={downloadTranscript}
              className="flex-1 py-2 border border-[#c0392b]/10 rounded-lg text-[0.6rem] tracking-widest uppercase text-[#c0392b]/60 hover:text-[#e87a6a] flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1"><Save size={12} /> Salva</div>
              <span className="text-[0.45rem] opacity-60">Guardar</span>
            </button>
            <button type="button" onClick={() => setShowKeyModal(true)}
              className="px-4 py-2 border border-[#c0392b]/10 rounded-lg text-[0.6rem] text-[#c0392b]/60 hover:text-[#e87a6a] flex flex-col items-center gap-0.5">
              <Key size={12} />
              <span className="text-[0.45rem] opacity-60 uppercase tracking-widest">API</span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showKeyModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#1a0808] border border-[#c0392b]/30 p-6 rounded-2xl w-full max-w-xs shadow-2xl">
              <h2 className="font-serif text-xl text-[#e87a6a] mb-1 text-center">Gemini API Key</h2>
              <p className="text-[0.6rem] text-[#c0392b]/60 text-center mb-3">Chiave separata per app · Clave separada por app</p>
              <input type="password" defaultValue={customKey} id="keyInput" className="w-full bg-black/40 border border-[#c0392b]/20 rounded-lg px-4 py-2.5 text-sm mb-4 outline-none text-white" />
              <div className="flex gap-2">
                <button onClick={() => setShowKeyModal(false)} className="flex-1 py-2 text-xs text-[#c0392b]/50 border border-transparent rounded-lg">Annulla</button>
                <button onClick={() => { saveCustomKey((document.getElementById('keyInput') as HTMLInputElement).value); }}
                  className="flex-1 py-2 bg-gradient-to-r from-[#c0392b] to-[#6b0e05] rounded-lg text-white text-xs font-bold">Salva</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <GuidaSection accentColor="#c0392b" />
      <div style={{
        textAlign: 'center',
        padding: '1.5rem 1rem 2rem',
        fontSize: '0.72rem',
        lineHeight: 1.8,
        color: 'white',
        opacity: 0.85,
      }}>
        🇮🇹 Questa app è gratuita. Se la usi spesso, ti consigliamo di creare la tua chiave API personale — è facile e gratuita su aistudio.google.com.<br /><br />
        🇳🇱 Deze app is gratis. Gebruik je hem regelmatig, maak dan je eigen API-sleutel aan — eenvoudig en gratis via aistudio.google.com.<br /><br />
        🇬🇧 This app is free to use. If you use it regularly, we recommend creating your own API key — quick and free at aistudio.google.com.
      </div>
    </div>
  );
}
