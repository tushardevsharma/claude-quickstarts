/**
 * LipSyncEngine: Drives mouth animation from audio energy analysis.
 * Uses Web Audio API's AnalyserNode to detect speech frequencies in real-time.
 */
export class LipSyncEngine {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.smoothedEnergy = 0;
    this.isActive = false;
  }

  /**
   * Connect an audio source (MediaElementSource or BufferSource) to the analyser.
   */
  connect(source) {
    source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    this.isActive = true;
  }

  /**
   * Disconnect and reset.
   */
  disconnect() {
    try {
      this.analyser.disconnect();
    } catch {}
    this.isActive = false;
    this.smoothedEnergy = 0;
  }

  /**
   * Get mouth openness 0-1 based on current audio energy.
   * Call this every animation frame while speaking.
   */
  getMouthOpenness() {
    if (!this.isActive) return 0;

    this.analyser.getByteFrequencyData(this.dataArray);

    // Focus on speech frequencies: bins 5-50 correspond to ~300-3000 Hz at fftSize=256, 44100Hz
    const speechBins = this.dataArray.slice(4, 50);
    const energy =
      speechBins.reduce((a, b) => a + b, 0) / speechBins.length / 255;

    // Exponential moving average smoothing
    this.smoothedEnergy = this.smoothedEnergy * 0.65 + energy * 0.35;

    return Math.min(this.smoothedEnergy * 2.8, 1.0);
  }

  /**
   * Map mouth openness (0-1) to a mouth shape index.
   * Returns: 0=closed, 1=slight, 2=medium, 3=wide
   */
  getMouthShape(openness) {
    if (openness < 0.08) return 0; // closed
    if (openness < 0.25) return 1; // slightly open
    if (openness < 0.55) return 2; // medium open
    return 3; // wide open
  }
}
