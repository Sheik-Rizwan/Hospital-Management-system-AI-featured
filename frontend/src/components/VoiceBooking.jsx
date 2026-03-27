import React, { useState, useRef, useEffect, useCallback } from 'react';
import { API_BASE, getAuthHeaders } from '../utils/api';

/**
 * VoiceBooking — Multilingual voice-driven appointment booking.
 * Supports English, Hindi, Telugu, Kannada.
 * Flow: Language select  Mic record  STT  AI turn  TTS playback  repeat until booked.
 */

const LANGUAGES = [
  { code: 'en', label: 'English',  native: 'English',  flag: '', webSpeech: 'en-IN' },
  { code: 'hi', label: 'Hindi',    native: 'हिन्दी',  flag: '', webSpeech: 'hi-IN' },
  { code: 'te', label: 'Telugu',   native: 'తెలుగు',  flag: '', webSpeech: 'te-IN' },
  { code: 'kn', label: 'Kannada',  native: 'ಕನ್ನಡ',  flag: '', webSpeech: 'kn-IN' },
];

const STATUS_LABELS = {
  idle:        { text: 'Press mic to speak',      color: '#6b7280', pulse: false },
  recording:   { text: 'Listening…',              color: '#ef4444', pulse: true  },
  processing:  { text: 'Processing your speech…', color: '#f59e0b', pulse: true  },
  thinking:    { text: 'AI is thinking…',          color: '#3b82f6', pulse: true  },
  speaking:    { text: 'Playing response…',        color: '#10b981', pulse: true  },
  confirmed:   { text: 'Booking confirmed! ',   color: '#10b981', pulse: false },
  error:       { text: 'Something went wrong',    color: '#ef4444', pulse: false },
};

const VoiceBooking = ({ onClose, onSuccess }) => {
  const [language, setLanguage] = useState('en');
  const [messages, setMessages] = useState([]);          // [{role, content}]
  const [status, setStatus] = useState('idle');
  const [booking, setBooking] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [transcript, setTranscript] = useState('');      // last user transcript
  const [useWebSpeech, setUseWebSpeech] = useState(false); // toggle STT mode

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const audioRef         = useRef(null);
  const messagesEndRef   = useRef(null);
  const streamRef        = useRef(null);

  // Auto-scroll conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Token helper
  const authToken = () =>
    sessionStorage.getItem('patient_token') || sessionStorage.getItem('token') || '';

  // ─── STT: browser MediaRecorder  backend Sarvam ───────────────────────────

  const startRecording = async () => {
    setErrorMsg('');
    setStatus('recording');
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer audio/webm (Chrome), fall back gracefully
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => handleAudioReady();
      mediaRecorderRef.current = mr;
      mr.start(250); // collect chunks every 250ms
    } catch (err) {
      setStatus('error');
      setErrorMsg('Microphone access denied. Please allow microphone access and try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const handleAudioReady = async () => {
    setStatus('processing');
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

    try {
      const form = new FormData();
      form.append('audio', blob, `voice_${Date.now()}.webm`);
      form.append('language_code', language);

      const res = await fetch(`${API_BASE}/patient/voice/booking/stt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken()}` },
        body: form,
      });
      const data = await res.json();

      if (!data.success || !data.transcript) {
        throw new Error(data.error || 'Could not understand. Please try again.');
      }

      const userText = data.transcript;
      setTranscript(userText);
      await sendConversationTurn(userText);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Transcription failed. Please try again.');
    }
  };

  // ─── Optional: Web Speech API (browser-native, for quick testing) ───────────

  const startWebSpeech = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setErrorMsg('Web Speech API not supported. Switch to backend STT mode.');
      return;
    }
    setStatus('recording');
    setErrorMsg('');

    const lang = LANGUAGES.find(l => l.code === language);
    const recognition = new SR();
    recognition.lang            = lang?.webSpeech || 'en-IN';
    recognition.continuous      = false;
    recognition.interimResults  = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (e) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      await sendConversationTurn(text);
    };
    recognition.onerror = () => {
      setStatus('error');
      setErrorMsg('Speech recognition error. Please try again.');
    };
    recognition.onend = () => {
      if (status === 'recording') setStatus('idle');
    };
    recognition.start();
  };

  // ─── AI Conversation Turn ────────────────────────────────────────────────────

  const sendConversationTurn = useCallback(async (userText) => {
    setStatus('thinking');

    const userMsg = { role: 'user', content: userText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      const res = await fetch(`${API_BASE}/patient/voice/booking/turn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify({
          messages: updatedMessages,
          language_code: language,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'AI processing failed');

      const aiMsg = { role: 'assistant', content: data.reply_text };
      setMessages(prev => [...prev, aiMsg]);

      if (data.booking_confirmed) {
        setBooking(data.appointment_data);
        setStatus('confirmed');
        if (onSuccess) onSuccess(data.appointment_data);
      }

      // Play TTS response
      await playTTS(data.reply_text, data.booking_confirmed);

    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to get AI response.');
    }
  }, [messages, language, onSuccess]);

  // ─── TTS Playback ─────────────────────────────────────────────────────────

  const playTTS = async (text, isConfirmed = false) => {
    setStatus('speaking');
    try {
      const res = await fetch(`${API_BASE}/patient/voice/booking/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken()}`,
        },
        body: JSON.stringify({ text, language_code: language }),
      });

      if (!res.ok) {
        // TTS failed — just show text, don't block
        setStatus(isConfirmed ? 'confirmed' : 'idle');
        return;
      }

      const audioBlobTts = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlobTts);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl);
          setStatus(isConfirmed ? 'confirmed' : 'idle');
        };
        await audioRef.current.play();
      } else {
        setStatus(isConfirmed ? 'confirmed' : 'idle');
      }
    } catch {
      setStatus(isConfirmed ? 'confirmed' : 'idle');
    }
  };

  // ─── Mic toggle (hold or click) ──────────────────────────────────────────────

  const handleMicClick = () => {
    if (status === 'recording') {
      if (useWebSpeech) return; // web speech stops on its own
      stopRecording();
    } else if (status === 'idle' || status === 'error') {
      if (useWebSpeech) startWebSpeech();
      else startRecording();
    }
  };

  const handleStopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setStatus('idle');
  };

  const isBlocked = ['processing', 'thinking'].includes(status);
  const statusInfo = STATUS_LABELS[status] || STATUS_LABELS.idle;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>️</span>
            <div>
              <h2 style={styles.headerTitle}>Voice Booking</h2>
              <p style={styles.headerSub}>Speak to book your appointment</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} style={styles.closeBtn}></button>
          )}
        </div>

        {/* Language Selector */}
        <div style={styles.langSection}>
          <p style={styles.langLabel}>Select Language</p>
          <div style={styles.langRow}>
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => { setLanguage(lang.code); setMessages([]); setStatus('idle'); setBooking(null); }}
                style={{
                  ...styles.langBtn,
                  ...(language === lang.code ? styles.langBtnActive : {}),
                }}
              >
                <span>{lang.flag}</span>
                <span style={styles.langNative}>{lang.native}</span>
                <span style={styles.langEnglish}>{lang.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation Area */}
        <div style={styles.chatArea}>
          {messages.length === 0 ? (
            <div style={styles.emptyChat}>
              <span style={styles.emptyChatIcon}></span>
              <p style={styles.emptyChatText}>
                {language === 'hi' ? 'बोलना शुरू करें — जैसे "मुझे डॉक्टर से appointment चाहिए"' :
                 language === 'te' ? 'మాట్లాడటం ప్రారంభించండి — "నాకు అపాయింట్‌మెంట్ కావాలి"' :
                 language === 'kn' ? 'ಮಾತನಾಡಿ — "ನನಗೆ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬೇಕು"' :
                 'Start speaking — say "I want to book an appointment with a doctor"'}
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  ...styles.msgRow,
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {msg.role === 'assistant' && (
                  <div style={styles.botAvatar}></div>
                )}
                <div
                  style={{
                    ...styles.bubble,
                    ...(msg.role === 'user' ? styles.bubbleUser : styles.bubbleBot),
                  }}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div style={styles.userAvatar}></div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Booking Confirmation Card */}
        {booking && (
          <div style={styles.confirmCard}>
            <div style={styles.confirmHeader}> Appointment Booked!</div>
            <div style={styles.confirmGrid}>
              {booking.doctor_name && <><span style={styles.confirmLabel}>Doctor</span><span style={styles.confirmValue}>{booking.doctor_name}</span></>}
              {booking.date && <><span style={styles.confirmLabel}>Date</span><span style={styles.confirmValue}>{booking.date}</span></>}
              {booking.start_time && <><span style={styles.confirmLabel}>Time</span><span style={styles.confirmValue}>{booking.start_time}</span></>}
              {booking.appointment_id && <><span style={styles.confirmLabel}>ID</span><span style={styles.confirmValue}>{booking.appointment_id}</span></>}
            </div>
            <p style={styles.confirmNote}>Pending doctor approval. You will be notified once confirmed.</p>
          </div>
        )}

        {/* Error Message */}
        {errorMsg && (
          <div style={styles.errorBanner}>
            ️ {errorMsg}
            <button onClick={() => { setErrorMsg(''); setStatus('idle'); }} style={styles.errorDismiss}></button>
          </div>
        )}

        {/* Status Bar */}
        <div style={styles.statusBar}>
          <span style={{ ...styles.statusDot, backgroundColor: statusInfo.color, animation: statusInfo.pulse ? 'pulse 1s infinite' : 'none' }} />
          <span style={styles.statusText}>{statusInfo.text}</span>
          {transcript && status !== 'idle' && (
            <span style={styles.transcriptPreview}>"{transcript}"</span>
          )}
        </div>

        {/* Controls */}
        <div style={styles.controls}>
          {/* Web Speech Toggle */}
          <button
            onClick={() => setUseWebSpeech(v => !v)}
            title={useWebSpeech ? 'Using browser STT (switch to backend)' : 'Using backend STT (switch to browser)'}
            style={{
              ...styles.toggleBtn,
              ...(useWebSpeech ? styles.toggleBtnActive : {}),
            }}
          >
            {useWebSpeech ? '' : '️'}
          </button>

          {/* Stop speaking button */}
          {status === 'speaking' && (
            <button onClick={handleStopSpeaking} style={styles.stopBtn}>
              ⏹ Stop
            </button>
          )}

          {/* Main Mic Button */}
          <button
            onClick={handleMicClick}
            disabled={isBlocked || status === 'confirmed' || status === 'speaking'}
            title={status === 'recording' ? 'Click to stop' : 'Click to speak'}
            style={{
              ...styles.micBtn,
              ...(status === 'recording' ? styles.micBtnRecording : {}),
              ...(isBlocked || status === 'confirmed' || status === 'speaking' ? styles.micBtnDisabled : {}),
            }}
          >
            {status === 'recording' ? '⏹' :
             status === 'processing' || status === 'thinking' ? '' :
             status === 'confirmed' ? '' : ''}
          </button>

          {/* Clear / Reset */}
          {messages.length > 0 && status !== 'confirmed' && (
            <button
              onClick={() => { setMessages([]); setStatus('idle'); setTranscript(''); setErrorMsg(''); }}
              title="Clear conversation and start over"
              style={styles.clearBtn}
            >
              
            </button>
          )}
        </div>

        {/* Hint */}
        <p style={styles.hint}>
          {useWebSpeech
            ? ' Browser STT — no upload needed, English often best'
            : '️ Backend STT — supports Kannada, Telugu, Hindi, English clearly'}
        </p>

        {/* Hidden audio player */}
        <audio ref={audioRef} style={{ display: 'none' }} />
      </div>

      {/* CSS keyframe for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 0 16px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
};

// ─── Inline Styles ────────────────────────────────────────────────────────────
// Uses CSS variables from the project's theme where possible, with safe fallbacks

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  },
  container: {
    background: 'var(--color-surface, #1e1f2e)',
    border: '1px solid var(--color-border, #2d2f45)',
    borderRadius: '20px',
    width: '100%', maxWidth: '560px',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
  },
  header: {
    background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
    padding: '20px 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  headerIcon: { fontSize: '32px' },
  headerTitle: { margin: 0, color: '#fff', fontSize: '20px', fontWeight: 700 },
  headerSub: { margin: '2px 0 0', color: 'rgba(255,255,255,0.75)', fontSize: '13px' },
  closeBtn: {
    background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
    borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '16px',
  },
  langSection: {
    padding: '16px 24px 12px',
    borderBottom: '1px solid var(--color-border, #2d2f45)',
  },
  langLabel: { margin: '0 0 10px', fontSize: '12px', color: 'var(--color-muted-foreground, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  langRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  langBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '2px', padding: '8px 14px',
    background: 'var(--color-card, #252740)',
    border: '1.5px solid var(--color-border, #2d2f45)',
    borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s',
    minWidth: '76px',
  },
  langBtnActive: {
    border: '1.5px solid #3b82f6',
    background: 'rgba(59,130,246,0.15)',
    boxShadow: '0 0 0 3px rgba(59,130,246,0.2)',
  },
  langNative: { fontSize: '14px', fontWeight: 600, color: 'var(--color-foreground, #e2e8f0)' },
  langEnglish: { fontSize: '10px', color: 'var(--color-muted-foreground, #9ca3af)' },
  chatArea: {
    flex: 1, overflowY: 'auto', padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: '12px',
    minHeight: '180px', maxHeight: '280px',
  },
  emptyChat: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', paddingTop: '20px' },
  emptyChatIcon: { fontSize: '40px' },
  emptyChatText: { color: 'var(--color-muted-foreground, #9ca3af)', fontSize: '13px', textAlign: 'center', maxWidth: '300px', lineHeight: 1.5 },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: '8px' },
  botAvatar: { fontSize: '22px', flexShrink: 0 },
  userAvatar: { fontSize: '20px', flexShrink: 0 },
  bubble: {
    maxWidth: '75%', padding: '10px 14px', borderRadius: '16px',
    fontSize: '14px', lineHeight: 1.55,
  },
  bubbleUser: {
    background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
    color: '#fff', borderBottomRightRadius: '4px',
  },
  bubbleBot: {
    background: 'var(--color-card, #252740)',
    color: 'var(--color-foreground, #e2e8f0)',
    border: '1px solid var(--color-border, #2d2f45)',
    borderBottomLeftRadius: '4px',
  },
  confirmCard: {
    margin: '0 20px 4px',
    background: 'rgba(16,185,129,0.1)',
    border: '1.5px solid rgba(16,185,129,0.4)',
    borderRadius: '12px', padding: '14px 18px',
  },
  confirmHeader: { color: '#10b981', fontWeight: 700, marginBottom: '10px', fontSize: '15px' },
  confirmGrid: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', marginBottom: '8px' },
  confirmLabel: { color: '#6b7280', fontSize: '12px' },
  confirmValue: { color: 'var(--color-foreground, #e2e8f0)', fontSize: '13px', fontWeight: 500 },
  confirmNote: { color: '#6b7280', fontSize: '12px', margin: 0 },
  errorBanner: {
    margin: '0 20px 4px',
    background: 'rgba(239,68,68,0.1)',
    border: '1.5px solid rgba(239,68,68,0.35)',
    borderRadius: '10px', padding: '10px 14px',
    color: '#ef4444', fontSize: '13px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
  },
  errorDismiss: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', flexShrink: 0 },
  statusBar: {
    padding: '10px 24px',
    borderTop: '1px solid var(--color-border, #2d2f45)',
    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
  },
  statusDot: {
    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
    transition: 'background-color 0.3s',
  },
  statusText: { fontSize: '13px', color: 'var(--color-muted-foreground, #9ca3af)' },
  transcriptPreview: {
    fontSize: '12px', color: 'var(--color-muted-foreground, #9ca3af)',
    fontStyle: 'italic', marginLeft: '4px',
    maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  controls: {
    padding: '16px 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
  },
  micBtn: {
    width: '72px', height: '72px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
    border: 'none', cursor: 'pointer', fontSize: '28px',
    boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
    transition: 'transform 0.15s, box-shadow 0.15s',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  micBtnRecording: {
    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
    animation: 'micPulse 1.2s infinite',
    transform: 'scale(1.1)',
  },
  micBtnDisabled: {
    opacity: 0.45, cursor: 'not-allowed',
    animation: 'none', transform: 'none',
  },
  stopBtn: {
    padding: '8px 16px', borderRadius: '8px',
    background: 'rgba(239,68,68,0.15)',
    border: '1.5px solid rgba(239,68,68,0.4)',
    color: '#ef4444', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
  },
  toggleBtn: {
    width: '40px', height: '40px', borderRadius: '50%',
    background: 'var(--color-card, #252740)',
    border: '1.5px solid var(--color-border, #2d2f45)',
    cursor: 'pointer', fontSize: '18px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'border-color 0.2s',
  },
  toggleBtnActive: {
    borderColor: '#3b82f6',
    background: 'rgba(59,130,246,0.12)',
  },
  clearBtn: {
    width: '40px', height: '40px', borderRadius: '50%',
    background: 'var(--color-card, #252740)',
    border: '1.5px solid var(--color-border, #2d2f45)',
    cursor: 'pointer', fontSize: '18px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  hint: {
    textAlign: 'center', fontSize: '11px',
    color: 'var(--color-muted-foreground, #9ca3af)',
    padding: '0 24px 16px', margin: 0,
  },
};

export default VoiceBooking;
