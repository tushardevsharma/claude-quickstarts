import { useEffect, useRef, useCallback, useState } from 'react';
import { usePipeline, STATES } from '../../context/PipelineContext.jsx';

/**
 * MicrophoneManager: Handles microphone input with Voice Activity Detection.
 * Uses browser's Web Speech API for STT, with potential for Deepgram upgrade.
 */
export default function MicrophoneManager({ enabled, onTranscript, onStateChange, onPermissionDenied }) {
  const { setListening, setIdle, avatarState, interrupt } = usePipeline();
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const restartTimerRef = useRef(null);
  const isSpeakingRef = useRef(false);

  // Track avatar speaking state for barge-in detection
  useEffect(() => {
    isSpeakingRef.current = avatarState === STATES.SPEAKING;
  }, [avatarState]);

  const startRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setError('Speech recognition not supported in this browser. Please use Chrome.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      if (onStateChange) onStateChange('ready');
    };

    recognition.onspeechstart = () => {
      // Barge-in detection: if avatar is speaking and user starts speaking, interrupt
      if (isSpeakingRef.current) {
        interrupt();
      }
      setListening();
      if (onStateChange) onStateChange('listening');
    };

    recognition.onspeechend = () => {
      if (onStateChange) onStateChange('processing');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        if (onTranscript) onTranscript(finalTranscript.trim(), true);
      } else if (interimTranscript.trim()) {
        if (onTranscript) onTranscript(interimTranscript.trim(), false);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        // Normal - just restart
        return;
      }
      if (event.error === 'not-allowed') {
        const errMsg = 'Microphone permission denied. Please allow microphone access in your browser settings.';
        setError(errMsg);
        setIsListening(false);
        if (onStateChange) onStateChange('error');
        // Notify parent with message so it can persist the error after unmount
        if (onPermissionDenied) onPermissionDenied(errMsg);
        return;
      }
      console.warn('[Mic] Recognition error:', event.error);
    };

    recognition.onend = () => {
      // Auto-restart if still enabled
      if (enabled) {
        restartTimerRef.current = setTimeout(() => {
          if (enabled && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {}
          }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.error('[Mic] Failed to start recognition:', err.message);
    }
  }, [enabled, interrupt, setListening, onTranscript, onStateChange, onPermissionDenied]);

  const stopRecognition = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch {}
    }
    setIsListening(false);
    if (onStateChange) onStateChange('idle');
  }, [onStateChange]);

  useEffect(() => {
    if (enabled) {
      startRecognition();
    } else {
      stopRecognition();
    }

    return () => stopRecognition();
  }, [enabled]);

  return (
    <>
      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50 animate-fade-in">
          {error}
        </div>
      )}
    </>
  );
}
