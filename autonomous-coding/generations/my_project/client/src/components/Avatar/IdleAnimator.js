/**
 * IdleAnimator: Manages subtle idle animations to make the avatar feel alive.
 * Handles blinking, breathing, micro-movements, and gaze shifts.
 */
export class IdleAnimator {
  constructor() {
    this.state = {
      blink: { phase: 'open', timer: 0, nextBlink: this._randomBetween(2500, 5000) },
      breathing: { phase: 0, amplitude: 2 },
      microShift: { x: 0, y: 0, timer: 0, nextShift: this._randomBetween(3000, 8000), targetX: 0, targetY: 0 },
      gazeShift: { x: 0, y: 0, timer: 0, nextGaze: this._randomBetween(4000, 10000), targetX: 0, targetY: 0 },
    };
    this.lastTime = performance.now();
    this.intensity = 1.0; // 0=suppressed, 1=full
    this.baseIntensity = 1.0; // set by setIntensityLevel
    this.isSpeaking = false;
  }

  /**
   * Update all animations. Call every frame with current timestamp.
   * Returns current animation state.
   */
  update(currentTime) {
    const delta = currentTime - this.lastTime;
    this.lastTime = currentTime;

    const i = this.intensity;

    this._updateBlink(delta);
    this._updateBreathing(delta);
    this._updateMicroShift(delta, i);
    this._updateGazeShift(delta, i);

    return {
      eyeOpenness: this._getEyeOpenness(),
      breathingOffset: Math.sin(this.state.breathing.phase) * this.state.breathing.amplitude * i,
      headX: this.state.microShift.x * i,
      headY: this.state.microShift.y * i,
      gazeX: this.state.gazeShift.x * i,
      gazeY: this.state.gazeShift.y * i,
    };
  }

  /** Suppress animations during speaking (to avoid conflict with lip-sync) */
  setSpeaking(isSpeaking) {
    this.intensity = isSpeaking ? 0.2 * this.baseIntensity : this.baseIntensity;
  }

  /**
   * Set the idle animation intensity from settings.
   * @param {number} level - 0 (subtle), 1 (medium), 2 (lively)
   */
  setIntensityLevel(level) {
    const levels = [0.3, 1.0, 1.8];
    this.baseIntensity = levels[level] ?? 1.0;
    if (!this.isSpeaking) {
      this.intensity = this.baseIntensity;
    }
  }

  _updateBlink(delta) {
    const b = this.state.blink;
    b.timer += delta;

    if (b.phase === 'open' && b.timer >= b.nextBlink) {
      b.phase = 'closing';
      b.timer = 0;
    } else if (b.phase === 'closing' && b.timer >= 60) {
      b.phase = 'closed';
      b.timer = 0;
    } else if (b.phase === 'closed' && b.timer >= 80) {
      b.phase = 'opening';
      b.timer = 0;
    } else if (b.phase === 'opening' && b.timer >= 60) {
      b.phase = 'open';
      b.timer = 0;
      b.nextBlink = this._randomBetween(2500, 5500);
    }
  }

  _getEyeOpenness() {
    const t = this.state.blink.timer;
    switch (this.state.blink.phase) {
      case 'open': return 1.0;
      case 'closing': return 1.0 - (t / 60);
      case 'closed': return 0.0;
      case 'opening': return t / 60;
      default: return 1.0;
    }
  }

  _updateBreathing(delta) {
    // ~0.2 Hz breathing (~12 breaths/min)
    this.state.breathing.phase += delta * 0.00126;
  }

  _updateMicroShift(delta, intensity) {
    const m = this.state.microShift;
    m.timer += delta;

    if (m.timer >= m.nextShift) {
      m.targetX = this._randomBetween(-2, 2) * intensity;
      m.targetY = this._randomBetween(-1, 1) * intensity;
      m.nextShift = this._randomBetween(3000, 8000);
      m.timer = 0;
    }

    // Smooth interpolation toward target
    m.x += (m.targetX - m.x) * 0.02;
    m.y += (m.targetY - m.y) * 0.02;
  }

  _updateGazeShift(delta, intensity) {
    const g = this.state.gazeShift;
    g.timer += delta;

    if (g.timer >= g.nextGaze) {
      g.targetX = this._randomBetween(-4, 4) * intensity;
      g.targetY = this._randomBetween(-3, 3) * intensity;
      g.nextGaze = this._randomBetween(4000, 10000);
      g.timer = 0;
    }

    // Quick snap for gaze (eyes move faster than head)
    g.x += (g.targetX - g.x) * 0.06;
    g.y += (g.targetY - g.y) * 0.06;
  }

  _randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }
}
