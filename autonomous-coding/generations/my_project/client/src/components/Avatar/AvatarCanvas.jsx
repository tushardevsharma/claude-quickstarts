import { useRef, useEffect } from 'react';
import { IdleAnimator } from './IdleAnimator.js';
import { STATES } from '../../context/PipelineContext.jsx';

// Color palette
const PAL = {
  skin: '#F5CBA7',
  skinLight: '#FDDBB4',
  skinShade: '#E8B080',
  hair: '#2C1810',
  hairLight: '#4A2C17',
  eyeIris: '#3A5FA0',
  eyeWhite: '#F8F8F8',
  eyebrow: '#2C1810',
  lip: '#C47066',
  lipDark: '#A45850',
  cheek: 'rgba(220, 110, 90, 0.18)',
  neck: '#F0C090',
  shoulderColor: '#6C5CE7',
  shoulderDark: '#5A4CC8',
};

/**
 * Draw the full avatar face onto the canvas.
 */
function drawAvatar(ctx, W, H, anim, avatarState, mouthOpenness) {
  const cx = W / 2;

  ctx.clearRect(0, 0, W, H);

  // Apply idle head micro-movement
  const hx = anim.headX || 0;
  const hy = anim.headY || 0;
  ctx.save();
  ctx.translate(hx, hy);

  // ─── Background ───────────────────────────────────────────────────────────
  const bg = ctx.createRadialGradient(cx, H * 0.4, W * 0.05, cx, H * 0.5, W * 0.9);
  bg.addColorStop(0, '#1e1b3a');
  bg.addColorStop(0.5, '#13112a');
  bg.addColorStop(1, '#0a0918');
  ctx.fillStyle = bg;
  ctx.fillRect(-hx, -hy, W, H);

  // Ambient glow behind avatar
  const glow = ctx.createRadialGradient(cx, H * 0.42, 0, cx, H * 0.42, W * 0.5);
  glow.addColorStop(0, 'rgba(100, 80, 230, 0.18)');
  glow.addColorStop(1, 'rgba(100, 80, 230, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-hx, -hy, W, H);

  // ─── Proportions ─────────────────────────────────────────────────────────
  // Face positioned in upper-center of canvas
  const faceW = W * 0.40;
  const faceH = H * 0.42;
  const faceX = cx;
  const faceY = H * 0.44; // Center of face at 44% height (leaves room for hair at top)

  const breathY = (anim.breathingOffset || 0) * 0.15;

  // ─── Layer 1: Back of hair (behind face) ─────────────────────────────────
  ctx.fillStyle = PAL.hair;
  ctx.beginPath();
  ctx.ellipse(faceX, faceY - faceH * 0.45, faceW * 1.08, faceH * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  // ─── Layer 2: Shoulders & neck ────────────────────────────────────────────
  // Neck
  ctx.fillStyle = PAL.neck;
  ctx.beginPath();
  ctx.ellipse(faceX, faceY + faceH * 0.55 + breathY, faceW * 0.18, faceH * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoulders
  const sY = H * 0.88 + breathY;
  ctx.fillStyle = PAL.shoulderColor;
  ctx.beginPath();
  ctx.ellipse(faceX, sY, W * 0.52, H * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.shoulderDark;
  ctx.beginPath();
  ctx.ellipse(faceX, sY - H * 0.03, W * 0.50, H * 0.16, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // ─── Layer 3: Face base ───────────────────────────────────────────────────
  // Face shadow
  ctx.fillStyle = PAL.skinShade;
  ctx.beginPath();
  ctx.ellipse(faceX + 2, faceY + 3, faceW, faceH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Face gradient
  const faceGrad = ctx.createRadialGradient(
    faceX - faceW * 0.25, faceY - faceH * 0.25, faceW * 0.05,
    faceX, faceY, faceW * 1.1
  );
  faceGrad.addColorStop(0, PAL.skinLight);
  faceGrad.addColorStop(0.55, PAL.skin);
  faceGrad.addColorStop(1, PAL.skinShade);
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(faceX, faceY, faceW, faceH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cheek blush
  ctx.fillStyle = PAL.cheek;
  ctx.beginPath();
  ctx.ellipse(faceX - faceW * 0.58, faceY + faceH * 0.08, faceW * 0.22, faceH * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(faceX + faceW * 0.58, faceY + faceH * 0.08, faceW * 0.22, faceH * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();

  // ─── Layer 4: Eyes ────────────────────────────────────────────────────────
  const eyeY = faceY - faceH * 0.10;
  const eyeOffX = faceW * 0.40;
  const eyeOpenness = anim.eyeOpenness ?? 1.0;
  const gazeX = anim.gazeX || 0;
  const gazeY = anim.gazeY || 0;

  // Eye width modifier based on state
  let eyeWMod = 1.0;
  if (avatarState === STATES.LISTENING) eyeWMod = 1.12;
  if (avatarState === STATES.THINKING) eyeWMod = 0.88;

  const eyeRX = faceW * 0.155 * eyeWMod;
  const eyeRY = faceH * 0.095 * eyeOpenness;

  drawEye(ctx, faceX - eyeOffX, eyeY, eyeRX, eyeRY, gazeX, gazeY);
  drawEye(ctx, faceX + eyeOffX, eyeY, eyeRX, eyeRY, gazeX, gazeY);

  // ─── Eyebrows ─────────────────────────────────────────────────────────────
  const browY = eyeY - faceH * 0.14;
  const browW = faceW * 0.20;
  const browThick = Math.max(H * 0.012, 2.5);
  const furrow = avatarState === STATES.THINKING ? 2.5 : 0;
  const lift = avatarState === STATES.LISTENING ? -3 : 0;

  ctx.strokeStyle = PAL.eyebrow;
  ctx.lineWidth = browThick;
  ctx.lineCap = 'round';

  // Left brow
  ctx.beginPath();
  ctx.moveTo(faceX - eyeOffX - browW * 0.65, browY + furrow + lift);
  ctx.quadraticCurveTo(faceX - eyeOffX, browY - browThick * 0.5 + lift, faceX - eyeOffX + browW * 0.5, browY + lift);
  ctx.stroke();

  // Right brow
  ctx.beginPath();
  ctx.moveTo(faceX + eyeOffX - browW * 0.5, browY + lift);
  ctx.quadraticCurveTo(faceX + eyeOffX, browY - browThick * 0.5 + lift, faceX + eyeOffX + browW * 0.65, browY + furrow + lift);
  ctx.stroke();

  // ─── Nose ─────────────────────────────────────────────────────────────────
  const noseY = faceY + faceH * 0.06;
  ctx.strokeStyle = 'rgba(160, 100, 70, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(faceX - faceW * 0.04, noseY - faceH * 0.05);
  ctx.lineTo(faceX - faceW * 0.065, noseY + faceH * 0.09);
  ctx.quadraticCurveTo(faceX, noseY + faceH * 0.12, faceX + faceW * 0.065, noseY + faceH * 0.09);
  ctx.lineTo(faceX + faceW * 0.04, noseY - faceH * 0.05);
  ctx.stroke();

  // ─── Layer 5: Mouth ───────────────────────────────────────────────────────
  const mouthY = faceY + faceH * 0.30;
  drawMouth(ctx, faceX, mouthY, faceW, faceH, mouthOpenness, avatarState);

  // ─── Layer 6: Front hair (top of head cap, drawn over face top) ───────────
  drawFrontHair(ctx, faceX, faceY, faceW, faceH);

  // ─── State glow ring ─────────────────────────────────────────────────────
  drawStateGlow(ctx, cx, H, W, avatarState);

  ctx.restore();
}

function drawEye(ctx, x, y, rX, rY, gazeX, gazeY) {
  if (rY < 1) {
    // Closed: draw a curved line
    ctx.strokeStyle = PAL.eyebrow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - rX * 0.85, y);
    ctx.quadraticCurveTo(x, y + 2, x + rX * 0.85, y);
    ctx.stroke();
    return;
  }

  // Eye white
  ctx.fillStyle = PAL.eyeWhite;
  ctx.beginPath();
  ctx.ellipse(x, y, rX, Math.max(rY, 1.5), 0, 0, Math.PI * 2);
  ctx.fill();

  // Iris
  const irisR = Math.min(rX * 0.65, rY);
  const px = x + gazeX * 0.25;
  const py = y + gazeY * 0.2;

  const irisGrad = ctx.createRadialGradient(px - irisR * 0.25, py - irisR * 0.25, 0, px, py, irisR);
  irisGrad.addColorStop(0, '#5878C0');
  irisGrad.addColorStop(0.4, PAL.eyeIris);
  irisGrad.addColorStop(1, '#1C2E60');
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.ellipse(px, py, irisR, Math.min(irisR, rY * 0.9), 0, 0, Math.PI * 2);
  ctx.fill();

  // Pupil
  ctx.fillStyle = '#0c0c14';
  ctx.beginPath();
  ctx.ellipse(px, py, irisR * 0.44, Math.min(irisR * 0.44, rY * 0.7), 0, 0, Math.PI * 2);
  ctx.fill();

  // Catchlight
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(px - irisR * 0.28, py - irisR * 0.28, irisR * 0.18, irisR * 0.13, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Top eyelid shadow
  const lidGrad = ctx.createLinearGradient(x, y - rY, x, y);
  lidGrad.addColorStop(0, 'rgba(0,0,0,0.22)');
  lidGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lidGrad;
  ctx.beginPath();
  ctx.ellipse(x, y, rX, Math.max(rY, 1.5), 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // Lashes
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.2;
  for (let i = -4; i <= 4; i++) {
    const lx = x + (i / 4) * rX * 0.85;
    const ly = y - rY;
    ctx.beginPath();
    ctx.moveTo(lx, ly + 1);
    ctx.lineTo(lx + i * 0.4, ly - 3.5);
    ctx.stroke();
  }
}

function drawMouth(ctx, x, y, faceW, faceH, openness, state) {
  const mW = faceW * 0.34;
  const lipH = faceH * 0.055;
  const smiling = state !== STATES.LISTENING ? 0.4 : 0;

  if (openness < 0.07) {
    // Closed mouth with slight smile
    ctx.fillStyle = PAL.lip;
    ctx.beginPath();
    ctx.moveTo(x - mW * 0.58, y);
    ctx.quadraticCurveTo(x - mW * 0.25, y - lipH * 0.5, x, y - lipH * 0.3);
    ctx.quadraticCurveTo(x + mW * 0.25, y - lipH * 0.5, x + mW * 0.58, y);
    ctx.quadraticCurveTo(x, y + lipH * (0.6 + smiling), x - mW * 0.58, y);
    ctx.fill();

    ctx.strokeStyle = PAL.lipDark;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - mW * 0.58, y);
    ctx.quadraticCurveTo(x, y + lipH * smiling, x + mW * 0.58, y);
    ctx.stroke();
    return;
  }

  const openH = lipH * 2 + openness * faceH * 0.14;

  // Mouth cavity
  ctx.fillStyle = '#160808';
  ctx.beginPath();
  ctx.ellipse(x, y + openH * 0.32, mW * 0.44, openH * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();

  // Teeth
  if (openness > 0.18) {
    ctx.fillStyle = 'rgba(248, 245, 238, 0.92)';
    ctx.beginPath();
    ctx.ellipse(x, y + openH * 0.12, mW * 0.34, openH * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Upper lip
  ctx.fillStyle = PAL.lip;
  ctx.beginPath();
  ctx.moveTo(x - mW * 0.58, y);
  ctx.quadraticCurveTo(x - mW * 0.22, y - lipH * 1.6, x, y - lipH * 0.9);
  ctx.quadraticCurveTo(x + mW * 0.22, y - lipH * 1.6, x + mW * 0.58, y);
  ctx.quadraticCurveTo(x, y + lipH * 0.5, x - mW * 0.58, y);
  ctx.fill();

  // Lower lip
  ctx.fillStyle = PAL.lip;
  ctx.beginPath();
  ctx.moveTo(x - mW * 0.55, y + openH * 0.05);
  ctx.quadraticCurveTo(x, y + openH * 0.96, x + mW * 0.55, y + openH * 0.05);
  ctx.quadraticCurveTo(x, y + openH + lipH * 0.4, x - mW * 0.55, y + openH * 0.05);
  ctx.fill();

  ctx.strokeStyle = PAL.lipDark;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x - mW * 0.58, y);
  ctx.quadraticCurveTo(x, y + openH * 0.88, x + mW * 0.58, y);
  ctx.stroke();
}

/**
 * Draw front hair (top cap only) - appears OVER the face for the hairline.
 */
function drawFrontHair(ctx, faceX, faceY, faceW, faceH) {
  // Only draw hair from the top down to about 15% above face center (hairline level)
  const hairlineY = faceY - faceH * 0.65; // Where hairline meets forehead
  const hairTopY = faceY - faceH * 0.92;  // Top of head
  const sideX = faceW * 0.95;             // How wide hair extends at ear level

  const hairGrad = ctx.createLinearGradient(faceX - faceW, hairTopY, faceX + faceW, hairTopY + faceH * 0.3);
  hairGrad.addColorStop(0, PAL.hairLight);
  hairGrad.addColorStop(0.4, PAL.hair);
  hairGrad.addColorStop(1, PAL.hair);

  ctx.fillStyle = hairGrad;
  ctx.beginPath();
  // Start at left ear/side
  ctx.moveTo(faceX - sideX, hairlineY + faceH * 0.12);
  // Up the left side
  ctx.quadraticCurveTo(faceX - faceW * 1.0, hairTopY + faceH * 0.1, faceX - faceW * 0.65, hairTopY);
  // Across the top
  ctx.quadraticCurveTo(faceX, hairTopY - faceH * 0.22, faceX + faceW * 0.65, hairTopY);
  // Down the right side
  ctx.quadraticCurveTo(faceX + faceW * 1.0, hairTopY + faceH * 0.1, faceX + sideX, hairlineY + faceH * 0.12);
  // Hairline across forehead (curved)
  ctx.quadraticCurveTo(faceX + faceW * 0.5, hairlineY + faceH * 0.04, faceX, hairlineY);
  ctx.quadraticCurveTo(faceX - faceW * 0.5, hairlineY + faceH * 0.04, faceX - sideX, hairlineY + faceH * 0.12);
  ctx.closePath();
  ctx.fill();

  // Hair highlight strand
  ctx.strokeStyle = PAL.hairLight;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(faceX - faceW * 0.12, hairTopY - faceH * 0.18);
  ctx.quadraticCurveTo(faceX - faceW * 0.05, hairlineY - faceH * 0.08, faceX + faceW * 0.18, hairlineY - faceH * 0.04);
  ctx.stroke();
}

function drawStateGlow(ctx, cx, H, W, state) {
  const colors = {
    [STATES.LISTENING]: 'rgba(59,130,246,0.14)',
    [STATES.THINKING]: 'rgba(245,158,11,0.11)',
    [STATES.SPEAKING]: 'rgba(16,185,129,0.13)',
    [STATES.ERROR]: 'rgba(239,68,68,0.13)',
  };
  const color = colors[state];
  if (!color) return;

  const g = ctx.createRadialGradient(cx, H * 0.4, 0, cx, H * 0.5, W * 0.65);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── AvatarCanvas component ────────────────────────────────────────────────────

export default function AvatarCanvas({ avatarState, mouthOpenness = 0 }) {
  const canvasRef = useRef(null);
  const animatorRef = useRef(new IdleAnimator());
  const rafRef = useRef(null);
  const mouthRef = useRef(mouthOpenness);

  useEffect(() => {
    mouthRef.current = mouthOpenness;
  }, [mouthOpenness]);

  useEffect(() => {
    animatorRef.current.setSpeaking(avatarState === STATES.SPEAKING);
  }, [avatarState]);

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const loop = (time) => {
      const W = canvas.width;
      const H = canvas.height;
      if (W > 0 && H > 0) {
        const ctx = canvas.getContext('2d');
        const anim = animatorRef.current.update(time);
        drawAvatar(ctx, W, H, anim, avatarState, mouthRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [avatarState]);

  // Resize observer — keep canvas dimensions in sync with CSS size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
      }
    });

    obs.observe(canvas);

    // Set initial size immediately
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
    }

    return () => obs.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
    />
  );
}
