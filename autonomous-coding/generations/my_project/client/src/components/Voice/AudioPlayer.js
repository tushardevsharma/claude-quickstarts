/**
 * AudioPlayer: Manages TTS audio playback using Web Audio API.
 * Supports browser speech synthesis (fallback) and binary audio chunks (ElevenLabs).
 * Drives lip-sync via AnalyserNode.
 * Implements a queue for gapless audio chunk overlap (#100).
 *
 * Bug fixes:
 *  - Bug 1: onEnd only fires when queue empty AND responseComplete=true (#101)
 *  - Bug 2: isPlayingAudio reset on decodeAudioData error (#102)
 *  - Bug 5: fadeOut captures currentSource at scheduling time (#105)
 *  - Bug 8: speakBrowser onEnd only fires after last utterance AND responseComplete (#108)
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

    // Gapless audio queue — #100
    this.audioBufferQueue = [];
    this.isPlayingAudio = false;

    // Bug 1 & 8: responseComplete flag — onEnd only fires when this is true AND queue empty
    this.responseComplete = false;
  }

  /**
   * Initialize Web Audio context (must be called after user gesture).
   * Automatically resumes suspended context — #83
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
   * Signal that the full response has been sent — no more audio buffers are coming.
   * Bug 1 & 8 fix: onEnd only fires when both the queue is empty AND this is called.
   * If the queue is already empty when this is called, fire onEnd immediately.
   */
  markResponseComplete() {
    this.responseComplete = true;
    // If nothing is playing and no buffers or utterances pending, fire onEnd now
    if (
      !this.isPlayingAudio &&
      this.audioBufferQueue.length === 0 &&
      this.utteranceQueue.length === 0 &&
      !this.isSpeaking
    ) {
      if (this.onEnd) this.onEnd();
    }
  }

  /**
   * Speak text using browser's built-in speech synthesis.
   * This is the fallback when ElevenLabs is not configured.
   * Bug 8 fix: onEnd only fires after the LAST utterance AND responseComplete=true.
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
      // Only fire onStart and lip-sync if not already speaking (first utterance)
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        if (this.onStart) this.onStart();
        this._startLipSyncFromBrowser();
      }
    };

    utterance.onend = () => {
      // Remove this utterance from the queue
      const idx = this.utteranceQueue.indexOf(utterance);
      if (idx !== -1) this.utteranceQueue.splice(idx, 1);

      // Only finalize when no more utterances are pending
      if (this.utteranceQueue.length === 0) {
        this.isSpeaking = false;
        this._stopLipSync();
        // Bug 8 fix: only call onEnd when responseComplete=true (all sentences sent)
        if (this.responseComplete && this.onEnd) this.onEnd();
      }
      // else: more utterances still in queue — keep speaking state active
    };

    utterance.onerror = (err) => {
      console.error('[AudioPlayer] Browser TTS error:', err.error);
      // Remove this utterance from the queue
      const idx = this.utteranceQueue.indexOf(utterance);
      if (idx !== -1) this.utteranceQueue.splice(idx, 1);

      if (this.utteranceQueue.length === 0) {
        this.isSpeaking = false;
        this._stopLipSync();
        if (this.responseComplete && this.onEnd) this.onEnd();
      }
    };

    this.currentUtterance = utterance;
    this.utteranceQueue.push(utterance);
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Decode and queue audio buffer for gapless sequential playback.
   * TTS for sentence N+1 begins synthesizing before sentence N finishes — #100.
   * AudioContext is auto-resumed if suspended — #83.
   */
  async playAudioBuffer(arrayBuffer) {
    if (!this.audioContext) this.initAudioContext();

    try {
      // Resume suspended AudioContext (#83 — browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Enqueue decoded buffer — gapless queue (#100)
      this.audioBufferQueue.push(audioBuffer);

      // Start playing if not already in progress
      if (!this.isPlayingAudio) {
        this._playNextBuffer();
      }
    } catch (err) {
      console.error('[AudioPlayer] Audio buffer error:', err.message);
      // Bug 2 fix: reset isPlayingAudio so subsequent calls are not silently dropped
      this.isPlayingAudio = false;
      if (this.onEnd) this.onEnd();
    }
  }

  /**
   * Play the next decoded buffer from the queue.
   * Called recursively via source.onended for seamless chaining.
   * Bug 1 fix: only calls onEnd when queue is empty AND responseComplete=true.
   */
  _playNextBuffer() {
    if (this.audioBufferQueue.length === 0) {
      this.isPlayingAudio = false;
      this.isSpeaking = false;
      this._stopLipSync();
      // Bug 1 fix: only fire onEnd if the full response has been delivered
      if (this.responseComplete && this.onEnd) this.onEnd();
      return;
    }

    this.isPlayingAudio = true;
    const audioBuffer = this.audioBufferQueue.shift();

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);
    source.connect(this.analyser);

    this.currentSource = source;

    source.onended = () => {
      this._stopLipSync();
      // Chain immediately to next buffer for gapless playback
      this._playNextBuffer();
    };

    source.start();

    if (!this.isSpeaking) {
      this.isSpeaking = true;
      if (this.onStart) this.onStart();
    }
    this._startLipSyncFromAnalyser();
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
   * Fade out and stop audio (for interrupts). #95 — 100ms fade
   * Bug 5 fix: capture currentSource in a local variable at scheduling time.
   */
  fadeOut(durationMs = 100) {
    // Stop browser TTS
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Clear queue so no more buffers play after fade
    this.audioBufferQueue = [];
    this.isPlayingAudio = false;

    // Reset responseComplete for next generation — Bug 1/8 fix
    this.responseComplete = false;

    // Bug 5 fix: capture currentSource at scheduling time (not inside callback)
    const sourceToStop = this.currentSource;

    // Fade out Web Audio
    if (this.gainNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

      setTimeout(() => {
        // Bug 5 fix: use captured sourceToStop, not this.currentSource
        if (sourceToStop) {
          try { sourceToStop.stop(); } catch {}
        }
        // Restore gain
        if (this.gainNode && this.audioContext) {
          this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
        }
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

    // Clear audio queue
    this.audioBufferQueue = [];
    this.isPlayingAudio = false;

    // Reset responseComplete for next generation — Bug 1/8 fix
    this.responseComplete = false;

    this.isSpeaking = false;
    this.utteranceQueue = [];
    this._stopLipSync();
  }
}
