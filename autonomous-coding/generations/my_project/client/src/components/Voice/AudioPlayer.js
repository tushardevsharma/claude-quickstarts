/**
 * AudioPlayer: Manages TTS audio playback using Web Audio API.
 * Supports browser speech synthesis (fallback) and binary audio chunks (ElevenLabs).
 * Drives lip-sync via AnalyserNode.
 */
export class AudioPlayer {
  constructor({ onStart, onEnd, onMouthOpenness, volume = 0.8 }) {
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onMouthOpenness = onMouthOpenness;
    this.volume = volume;

    this.audioContext = null;
    this.gainNode = null;
    this.analyser = null;
    this.dataArray = null;

    this.utteranceQueue = []; // Browser TTS queue
    this.isSpeaking = false;
    this.smoothedEnergy = 0;
    this.rafId = null;
    this.currentUtterance = null;
    this.currentSource = null;
  }

  /**
   * Initialize Web Audio context (must be called after user gesture).
   */
  initAudioContext() {
    if (this.audioContext) return;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.volume;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }

  setVolume(vol) {
    this.volume = vol;
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(vol, this.audioContext.currentTime, 0.1);
    }
  }

  /**
   * Speak text using browser's built-in speech synthesis.
   * This is the fallback when ElevenLabs is not configured.
   */
  speakBrowser(text, rate = 1.0) {
    if (!window.speechSynthesis) {
      console.warn('[AudioPlayer] Speech synthesis not supported');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.volume = this.volume;

    // Try to pick a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((v) => v.name.includes('Samantha')) ||
      voices.find((v) => v.name.includes('Google US English')) ||
      voices.find((v) => v.lang === 'en-US' && !v.name.includes('(')) ||
      voices.find((v) => v.lang.startsWith('en'));

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => {
      this.isSpeaking = true;
      if (this.onStart) this.onStart();
      this._startLipSyncFromBrowser();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this._stopLipSync();
      if (this.onEnd) this.onEnd();
    };

    utterance.onerror = (err) => {
      console.error('[AudioPlayer] Browser TTS error:', err.error);
      this.isSpeaking = false;
      this._stopLipSync();
      if (this.onEnd) this.onEnd();
    };

    this.currentUtterance = utterance;
    this.utteranceQueue.push(utterance);
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Play binary audio (MP3/PCM) from a fetch response.
   */
  async playAudioBuffer(arrayBuffer) {
    if (!this.audioContext) this.initAudioContext();

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      // Connect analyser for lip-sync
      source.connect(this.analyser);

      this.currentSource = source;

      source.onended = () => {
        this.isSpeaking = false;
        this._stopLipSync();
        if (this.onEnd) this.onEnd();
      };

      source.start();
      this.isSpeaking = true;
      if (this.onStart) this.onStart();
      this._startLipSyncFromAnalyser();
    } catch (err) {
      console.error('[AudioPlayer] Audio buffer error:', err.message);
      if (this.onEnd) this.onEnd();
    }
  }

  /**
   * Simulate lip-sync for browser TTS (we can't analyse browser TTS audio directly).
   * Uses a randomized pattern to simulate natural mouth movement.
   */
  _startLipSyncFromBrowser() {
    const animate = () => {
      if (!this.isSpeaking) {
        if (this.onMouthOpenness) this.onMouthOpenness(0);
        return;
      }
      // Simulate varying mouth openness with some randomness
      const t = Date.now() / 1000;
      const base = 0.3 + Math.sin(t * 8) * 0.15 + Math.sin(t * 13) * 0.1;
      const noise = (Math.random() - 0.5) * 0.1;
      const openness = Math.max(0.05, Math.min(0.8, base + noise));

      this.smoothedEnergy = this.smoothedEnergy * 0.6 + openness * 0.4;
      if (this.onMouthOpenness) this.onMouthOpenness(this.smoothedEnergy);

      this.rafId = requestAnimationFrame(animate);
    };
    this.rafId = requestAnimationFrame(animate);
  }

  /**
   * Real lip-sync from Web Audio analyser.
   */
  _startLipSyncFromAnalyser() {
    const animate = () => {
      if (!this.isSpeaking || !this.analyser) {
        if (this.onMouthOpenness) this.onMouthOpenness(0);
        return;
      }

      this.analyser.getByteFrequencyData(this.dataArray);
      const speechBins = Array.from(this.dataArray.slice(4, 50));
      const energy = speechBins.reduce((a, b) => a + b, 0) / speechBins.length / 255;
      this.smoothedEnergy = this.smoothedEnergy * 0.65 + energy * 0.35;
      const openness = Math.min(this.smoothedEnergy * 2.8, 1.0);

      if (this.onMouthOpenness) this.onMouthOpenness(openness);
      this.rafId = requestAnimationFrame(animate);
    };
    this.rafId = requestAnimationFrame(animate);
  }

  _stopLipSync() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.onMouthOpenness) this.onMouthOpenness(0);
    this.smoothedEnergy = 0;
  }

  /**
   * Fade out and stop audio (for interrupts).
   */
  fadeOut(durationMs = 100) {
    // Stop browser TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Fade out Web Audio
    if (this.gainNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

      setTimeout(() => {
        if (this.currentSource) {
          try { this.currentSource.stop(); } catch {}
          this.currentSource = null;
        }
        // Restore gain
        this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
      }, durationMs + 20);
    }

    this.isSpeaking = false;
    this.utteranceQueue = [];
    this._stopLipSync();
  }

  /**
   * Hard stop (no fade).
   */
  stop() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (this.currentSource) {
      try { this.currentSource.stop(); } catch {}
      this.currentSource = null;
    }

    this.isSpeaking = false;
    this.utteranceQueue = [];
    this._stopLipSync();
  }
}
