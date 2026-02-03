"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────
type Flavor = "blueberry" | "mango";
type GameState = "start" | "playing" | "gameover";
type PowerUpType = "magnet" | "freeze" | "star" | "cherry";
type ThemeKey = "sunrise" | "daytime" | "sunset" | "aurora";

interface Scoop {
  id: number;
  x: number;
  y: number;
  flavor: Flavor;
  speed: number;
  wobble: number;
  wobbleSpeed: number;
  rotation: number;
  golden: boolean;
}

interface PowerUp {
  id: number;
  x: number;
  y: number;
  type: PowerUpType;
  speed: number;
  wobble: number;
  wobbleSpeed: number;
  pulse: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: "sparkle" | "splat" | "score" | "trail";
}

interface TrailDot {
  id: number;
  x: number;
  y: number;
  life: number;
}

interface ActivePowerUp {
  type: PowerUpType;
  remaining: number;
  duration: number;
}

// ─── Constants ───────────────────────────────────────────────────────
const SKATER_WIDTH = 60;
const SKATER_HEIGHT = 60;
const SCOOP_SIZE = 40;
const CATCH_RADIUS = 55;
const INITIAL_SPAWN_INTERVAL = 1200;
const MIN_SPAWN_INTERVAL = 400;
const INITIAL_SPEED = 2;
const MAX_SPEED = 7;
const LIVES = 10;
const POWERUP_SPAWN_INTERVAL = 9000; // ~9 seconds
const GOLDEN_SPAWN_INTERVAL_MIN = 20000;
const GOLDEN_SPAWN_INTERVAL_MAX = 30000;
const MAGNET_RANGE = 180;

const BLUEBERRY_COLORS = ["#8b6cc1", "#a78bfa", "#c4b5fd", "#7c3aed"];
const MANGO_COLORS = ["#f59e0b", "#fbbf24", "#fcd34d", "#f97316"];

const POWERUP_COLORS: Record<PowerUpType, { glow: string; fill: string; icon: string }> = {
  magnet: { glow: "rgba(168, 85, 247, 0.6)", fill: "#a855f7", icon: "🧲" },
  freeze: { glow: "rgba(56, 189, 248, 0.6)", fill: "#38bdf8", icon: "❄️" },
  star: { glow: "rgba(250, 204, 21, 0.6)", fill: "#facc15", icon: "⭐" },
  cherry: { glow: "rgba(239, 68, 68, 0.6)", fill: "#ef4444", icon: "🍒" },
};

interface ThemeColors {
  bg: [string, string, string, string];
  rink: [string, string, string];
}

const THEMES: Record<ThemeKey, ThemeColors> = {
  sunrise: {
    bg: ["#2d1028", "#5c2d50", "#c2546b", "#f4a261"],
    rink: ["rgba(255, 200, 180, 0.05)", "rgba(255, 200, 180, 0.12)", "rgba(255, 200, 180, 0.08)"],
  },
  daytime: {
    bg: ["#1a0a3e", "#2d1b69", "#4a2080", "#1a0a3e"],
    rink: ["rgba(180, 210, 255, 0.05)", "rgba(180, 210, 255, 0.12)", "rgba(180, 210, 255, 0.08)"],
  },
  sunset: {
    bg: ["#1a0520", "#6b2040", "#c44e20", "#4a1060"],
    rink: ["rgba(255, 160, 100, 0.05)", "rgba(255, 160, 100, 0.12)", "rgba(255, 160, 100, 0.08)"],
  },
  aurora: {
    bg: ["#050818", "#0a1628", "#081020", "#050818"],
    rink: ["rgba(100, 255, 200, 0.04)", "rgba(100, 255, 200, 0.10)", "rgba(100, 200, 255, 0.06)"],
  },
};

function getThemeKey(score: number): ThemeKey {
  if (score <= 50) return "sunrise";
  if (score <= 150) return "daytime";
  if (score <= 300) return "sunset";
  return "aurora";
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ra = (pa >> 16) & 0xff, ga = (pa >> 8) & 0xff, ba2 = pa & 0xff;
  const rb = (pb >> 16) & 0xff, gb = (pb >> 8) & 0xff, bb = pb & 0xff;
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba2 + (bb - ba2) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

// ─── Component ───────────────────────────────────────────────────────
export default function IceCreamSkateParty() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>("start");
  const [gameState, setGameState] = useState<GameState>("start");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [highScore, setHighScore] = useState(0);
  const [showComboPopup, setShowComboPopup] = useState(false);
  const [activePowerUps, setActivePowerUps] = useState<ActivePowerUp[]>([]);

  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const bestComboRef = useRef(0);
  const livesRef = useRef(LIVES);
  const highScoreRef = useRef(0);

  const skaterRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, width: SKATER_WIDTH });
  const scoopsRef = useRef<Scoop[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const activePowerUpsRef = useRef<ActivePowerUp[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const trailRef = useRef<TrailDot[]>([]);
  const nextIdRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const lastPowerUpSpawnRef = useRef(0);
  const lastGoldenSpawnRef = useRef(0);
  const nextGoldenIntervalRef = useRef(0);
  const elapsedRef = useRef(0);
  const animFrameRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<{ id: number; startX: number; startY: number; lastX: number; lastY: number } | null>(null);
  const shakeRef = useRef({ x: 0, y: 0, intensity: 0 });
  const themeTransitionRef = useRef({ current: "sunrise" as ThemeKey, target: "sunrise" as ThemeKey, t: 1 });
  const auroraPhaseRef = useRef(0);

  // ─── Helpers ─────────────────────────────────────────────────────
  const getId = () => nextIdRef.current++;

  const hasPowerUp = (type: PowerUpType): boolean => {
    return activePowerUpsRef.current.some(p => p.type === type);
  };

  const spawnParticles = (x: number, y: number, flavor: Flavor | "golden", type: "sparkle" | "splat") => {
    const colors = flavor === "golden" ? ["#fcd34d", "#fbbf24", "#f59e0b", "#ffffff"] :
      flavor === "blueberry" ? BLUEBERRY_COLORS : MANGO_COLORS;
    const count = type === "splat" ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = type === "splat" ? 1 + Math.random() * 3 : 2 + Math.random() * 4;
      particlesRef.current.push({
        id: getId(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: type === "splat" ? Math.abs(Math.sin(angle)) * -speed * 0.3 : Math.sin(angle) * speed - 2,
        life: 1,
        maxLife: 0.5 + Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: type === "splat" ? 3 + Math.random() * 5 : 2 + Math.random() * 4,
        type,
      });
    }
  };

  const spawnScoreParticle = (x: number, y: number, points: number) => {
    particlesRef.current.push({
      id: getId(),
      x,
      y,
      vx: 0,
      vy: -2,
      life: 1,
      maxLife: 1,
      color: points >= 50 ? "#fcd34d" : "#ffffff",
      size: points >= 50 ? 24 : 18,
      type: "score",
    });
  };

  const getDifficulty = () => {
    const t = Math.min(elapsedRef.current / 120, 1);
    return {
      spawnInterval: INITIAL_SPAWN_INTERVAL - t * (INITIAL_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL),
      speed: INITIAL_SPEED + t * (MAX_SPEED - INITIAL_SPEED),
    };
  };

  const triggerShake = (intensity: number) => {
    shakeRef.current.intensity = intensity;
  };

  // ─── Game Loop ───────────────────────────────────────────────────
  const gameLoop = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const loop = (now: number) => {
      if (gameStateRef.current !== "playing") return;

      const W = canvas.width;
      const H = canvas.height;

      // Use a fixed-ish dt approach
      const dt = 1 / 60;
      elapsedRef.current += dt;

      const { spawnInterval, speed } = getDifficulty();

      // ── Input ──
      const skater = skaterRef.current;
      const moveSpeed = 800 * dt; // FAST movement

      if (keysRef.current.has("ArrowLeft") || keysRef.current.has("a")) {
        skater.targetX -= moveSpeed;
      }
      if (keysRef.current.has("ArrowRight") || keysRef.current.has("d")) {
        skater.targetX += moveSpeed;
      }
      if (keysRef.current.has("ArrowUp") || keysRef.current.has("w")) {
        skater.targetY -= moveSpeed;
      }
      if (keysRef.current.has("ArrowDown") || keysRef.current.has("s")) {
        skater.targetY += moveSpeed;
      }

      // Clamp to rink bounds
      skater.targetX = Math.max(SKATER_WIDTH / 2, Math.min(W - SKATER_WIDTH / 2, skater.targetX));
      skater.targetY = Math.max(SKATER_HEIGHT / 2 + 40, Math.min(H - SKATER_HEIGHT / 2 - 10, skater.targetY));

      // Snappy interpolation
      skater.x += (skater.targetX - skater.x) * 0.3;
      skater.y += (skater.targetY - skater.y) * 0.3;

      // ── Trail ──
      const dx2 = skater.targetX - skater.x;
      const dy2 = skater.targetY - skater.y;
      if (Math.sqrt(dx2 * dx2 + dy2 * dy2) > 2) {
        trailRef.current.push({ id: getId(), x: skater.x, y: skater.y + 20, life: 1 });
      }
      trailRef.current = trailRef.current.filter(t => {
        t.life -= dt * 3;
        return t.life > 0;
      });

      // ── Update active power-ups ──
      activePowerUpsRef.current = activePowerUpsRef.current.filter(p => {
        p.remaining -= dt;
        return p.remaining > 0;
      });
      setActivePowerUps([...activePowerUpsRef.current]);

      // ── Spawn scoops ──
      if (now - lastSpawnRef.current > spawnInterval) {
        lastSpawnRef.current = now;
        const flavor: Flavor = Math.random() > 0.5 ? "blueberry" : "mango";
        scoopsRef.current.push({
          id: getId(),
          x: SCOOP_SIZE + Math.random() * (W - SCOOP_SIZE * 2),
          y: -SCOOP_SIZE,
          flavor,
          speed: speed * (0.8 + Math.random() * 0.4),
          wobble: 0,
          wobbleSpeed: 2 + Math.random() * 3,
          rotation: Math.random() * Math.PI * 2,
          golden: false,
        });
      }

      // ── Spawn golden scoops ──
      if (now - lastGoldenSpawnRef.current > nextGoldenIntervalRef.current) {
        lastGoldenSpawnRef.current = now;
        nextGoldenIntervalRef.current = GOLDEN_SPAWN_INTERVAL_MIN + Math.random() * (GOLDEN_SPAWN_INTERVAL_MAX - GOLDEN_SPAWN_INTERVAL_MIN);
        scoopsRef.current.push({
          id: getId(),
          x: SCOOP_SIZE + Math.random() * (W - SCOOP_SIZE * 2),
          y: -SCOOP_SIZE,
          flavor: "mango",
          speed: speed * 1.4,
          wobble: 0,
          wobbleSpeed: 3 + Math.random() * 2,
          rotation: Math.random() * Math.PI * 2,
          golden: true,
        });
      }

      // ── Spawn power-ups ──
      if (now - lastPowerUpSpawnRef.current > POWERUP_SPAWN_INTERVAL) {
        lastPowerUpSpawnRef.current = now;
        const types: PowerUpType[] = ["magnet", "freeze", "star", "cherry"];
        const type = types[Math.floor(Math.random() * types.length)];
        powerUpsRef.current.push({
          id: getId(),
          x: SCOOP_SIZE + Math.random() * (W - SCOOP_SIZE * 2),
          y: -SCOOP_SIZE,
          type,
          speed: speed * 0.7,
          wobble: 0,
          wobbleSpeed: 2 + Math.random() * 2,
          pulse: 0,
        });
      }

      // ── Freeze effect on scoop speed ──
      const freezeActive = hasPowerUp("freeze");
      const speedMultiplier = freezeActive ? 0.5 : 1;

      // ── Update scoops ──
      const caughtScoops: Scoop[] = [];
      const missedScoops: Scoop[] = [];

      scoopsRef.current = scoopsRef.current.filter(scoop => {
        scoop.y += scoop.speed * 60 * dt * speedMultiplier;
        scoop.wobble += scoop.wobbleSpeed * dt;
        scoop.rotation += dt * 2;

        // Magnet pull
        if (hasPowerUp("magnet")) {
          const mdx = skater.x - (scoop.x + Math.sin(scoop.wobble) * 15);
          const mdy = skater.y - scoop.y;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mdist < MAGNET_RANGE && mdist > 0) {
            const pull = (1 - mdist / MAGNET_RANGE) * 300 * dt;
            scoop.x += (mdx / mdist) * pull;
            scoop.y += (mdy / mdist) * pull;
          }
        }

        const dx = scoop.x + Math.sin(scoop.wobble) * 15 - skater.x;
        const dy = scoop.y - skater.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CATCH_RADIUS) {
          caughtScoops.push(scoop);
          return false;
        }

        if (scoop.y > H + SCOOP_SIZE) {
          missedScoops.push(scoop);
          return false;
        }

        return true;
      });

      // ── Update power-ups ──
      const caughtPowerUps: PowerUp[] = [];
      powerUpsRef.current = powerUpsRef.current.filter(pu => {
        pu.y += pu.speed * 60 * dt * speedMultiplier;
        pu.wobble += pu.wobbleSpeed * dt;
        pu.pulse += dt * 4;

        const dx = pu.x + Math.sin(pu.wobble) * 10 - skater.x;
        const dy = pu.y - skater.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CATCH_RADIUS + 10) {
          caughtPowerUps.push(pu);
          return false;
        }

        if (pu.y > H + SCOOP_SIZE) {
          return false; // power-ups don't cost lives
        }

        return true;
      });

      // ── Handle power-up catches ──
      for (const pu of caughtPowerUps) {
        if (pu.type === "cherry") {
          livesRef.current = Math.min(livesRef.current + 1, LIVES);
          setLives(livesRef.current);
        } else {
          const durations: Record<PowerUpType, number> = { magnet: 5, freeze: 3, star: 5, cherry: 0 };
          // Remove existing of same type, add fresh
          activePowerUpsRef.current = activePowerUpsRef.current.filter(p => p.type !== pu.type);
          activePowerUpsRef.current.push({ type: pu.type, remaining: durations[pu.type], duration: durations[pu.type] });
        }
        // Particles for power-up catch
        const colors = [POWERUP_COLORS[pu.type].fill, "#ffffff", POWERUP_COLORS[pu.type].fill];
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI * 2 * i) / 10;
          const spd = 2 + Math.random() * 3;
          particlesRef.current.push({
            id: getId(), x: pu.x, y: pu.y,
            vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 1,
            life: 1, maxLife: 0.6,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: 3 + Math.random() * 3, type: "sparkle",
          });
        }
        spawnScoreParticle(pu.x, pu.y - 20, 0);
      }

      // ── Handle catches ──
      for (const scoop of caughtScoops) {
        comboRef.current++;
        const multiplier = Math.min(Math.floor(comboRef.current / 5) + 1, 5);
        const starMultiplier = hasPowerUp("star") ? 2 : 1;
        const goldenMultiplier = scoop.golden ? 10 : 1;
        const points = 10 * multiplier * starMultiplier * goldenMultiplier;
        scoreRef.current += points;
        if (comboRef.current > bestComboRef.current) bestComboRef.current = comboRef.current;

        spawnParticles(scoop.x, scoop.y, scoop.golden ? "golden" : scoop.flavor, "sparkle");
        spawnScoreParticle(scoop.x, scoop.y - 20, points);

        if (comboRef.current > 0 && comboRef.current % 5 === 0) {
          setShowComboPopup(true);
          triggerShake(4);
          setTimeout(() => setShowComboPopup(false), 800);
        }

        setScore(scoreRef.current);
        setCombo(comboRef.current);
        setBestCombo(bestComboRef.current);
      }

      // ── Handle misses ──
      for (const scoop of missedScoops) {
        comboRef.current = 0;
        livesRef.current--;
        spawnParticles(scoop.x, H - 20, scoop.flavor, "splat");
        setCombo(0);
        setLives(livesRef.current);

        if (livesRef.current <= 0) {
          gameStateRef.current = "gameover";
          if (scoreRef.current > highScoreRef.current) {
            highScoreRef.current = scoreRef.current;
            setHighScore(scoreRef.current);
            try { localStorage.setItem("icsp-highscore", String(scoreRef.current)); } catch {}
          }
          setGameState("gameover");
          return;
        }
      }

      // ── Update particles (cap count for perf) ──
      if (particlesRef.current.length > 200) {
        particlesRef.current = particlesRef.current.slice(-150);
      }
      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.type === "splat") p.vy += 5 * dt;
        if (p.type === "score") p.vy = -1.5;
        p.life -= dt / p.maxLife;
        return p.life > 0;
      });

      // ── Screen shake decay ──
      const shake = shakeRef.current;
      if (shake.intensity > 0.1) {
        shake.x = (Math.random() - 0.5) * shake.intensity;
        shake.y = (Math.random() - 0.5) * shake.intensity;
        shake.intensity *= 0.9;
      } else {
        shake.x = 0;
        shake.y = 0;
        shake.intensity = 0;
      }

      // ── Theme transitions ──
      const targetTheme = getThemeKey(scoreRef.current);
      const tt = themeTransitionRef.current;
      if (tt.target !== targetTheme) {
        tt.current = tt.target;
        tt.target = targetTheme;
        tt.t = 0;
      }
      if (tt.t < 1) {
        tt.t = Math.min(tt.t + dt * 0.3, 1); // smooth ~3s transition
      }

      const fromTheme = THEMES[tt.current];
      const toTheme = THEMES[tt.target];
      const tBlend = tt.t;

      // ── Draw ──
      ctx.save();
      ctx.translate(shake.x, shake.y);

      // Background gradient with theme blend
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, lerpColor(fromTheme.bg[0], toTheme.bg[0], tBlend));
      bgGrad.addColorStop(0.4, lerpColor(fromTheme.bg[1], toTheme.bg[1], tBlend));
      bgGrad.addColorStop(0.7, lerpColor(fromTheme.bg[2], toTheme.bg[2], tBlend));
      bgGrad.addColorStop(1, lerpColor(fromTheme.bg[3], toTheme.bg[3], tBlend));
      ctx.fillStyle = bgGrad;
      ctx.fillRect(-10, -10, W + 20, H + 20);

      // Aurora effect for aurora theme
      if (tt.target === "aurora" || tt.current === "aurora") {
        const auroraAlpha = tt.target === "aurora" ? tBlend * 0.3 : (1 - tBlend) * 0.3;
        auroraPhaseRef.current += dt * 0.5;
        const phase = auroraPhaseRef.current;
        for (let i = 0; i < 5; i++) {
          const xOff = Math.sin(phase + i * 1.2) * W * 0.3;
          const yOff = H * 0.1 + Math.cos(phase * 0.7 + i) * H * 0.1;
          const grad = ctx.createRadialGradient(W / 2 + xOff, yOff, 0, W / 2 + xOff, yOff, W * 0.4);
          const hue = i % 2 === 0 ? "rgba(100, 255, 180," : "rgba(150, 100, 255,";
          grad.addColorStop(0, `${hue} ${auroraAlpha})`);
          grad.addColorStop(1, `${hue} 0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);
        }
      }

      // Rink surface
      const rinkGrad = ctx.createLinearGradient(0, H * 0.6, 0, H);
      rinkGrad.addColorStop(0, "rgba(180, 210, 255, 0.05)");
      rinkGrad.addColorStop(0.5, "rgba(180, 210, 255, 0.12)");
      rinkGrad.addColorStop(1, "rgba(180, 210, 255, 0.08)");
      ctx.fillStyle = rinkGrad;
      ctx.fillRect(0, H * 0.6, W, H * 0.4);

      // Ice scratches
      ctx.strokeStyle = "rgba(200, 220, 255, 0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 15; i++) {
        const sx = (i * W / 15 + elapsedRef.current * 5) % W;
        ctx.beginPath();
        ctx.moveTo(sx, H * 0.65);
        ctx.lineTo(sx + 40, H);
        ctx.stroke();
      }

      // Rink border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.6);
      ctx.lineTo(W, H * 0.6);
      ctx.stroke();

      // ── Draw trail ──
      for (const dot of trailRef.current) {
        ctx.globalAlpha = dot.life * 0.3;
        ctx.fillStyle = "rgba(200, 220, 255, 0.5)";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 3 * dot.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Draw scoops ──
      for (const scoop of scoopsRef.current) {
        const sx = scoop.x + Math.sin(scoop.wobble) * 15;
        const sy = scoop.y;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(scoop.rotation);

        if (scoop.golden) {
          // Golden glow
          ctx.shadowColor = "rgba(255, 215, 0, 0.8)";
          ctx.shadowBlur = 25 + Math.sin(elapsedRef.current * 6) * 8;

          const goldGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, SCOOP_SIZE / 2);
          goldGrad.addColorStop(0, "#fff8dc");
          goldGrad.addColorStop(0.4, "#ffd700");
          goldGrad.addColorStop(0.8, "#daa520");
          goldGrad.addColorStop(1, "#b8860b");
          ctx.fillStyle = goldGrad;
          ctx.beginPath();
          ctx.arc(0, 0, SCOOP_SIZE / 2, 0, Math.PI * 2);
          ctx.fill();

          // Star sparkle overlay
          ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.sin(elapsedRef.current * 8) * 0.2})`;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (Math.PI * 2 * i) / 5 - Math.PI / 2 + elapsedRef.current * 3;
            const r1 = SCOOP_SIZE / 2.5;
            const r2 = SCOOP_SIZE / 6;
            ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
            const a2 = a + Math.PI / 5;
            ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          // Normal scoop
          const glowColor = scoop.flavor === "blueberry" ? "rgba(167, 139, 250, 0.4)" : "rgba(251, 191, 36, 0.4)";
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 15;

          const scoopGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, SCOOP_SIZE / 2);
          if (scoop.flavor === "blueberry") {
            scoopGrad.addColorStop(0, "#c4b5fd");
            scoopGrad.addColorStop(0.5, "#8b6cc1");
            scoopGrad.addColorStop(1, "#5b3a9e");
          } else {
            scoopGrad.addColorStop(0, "#fcd34d");
            scoopGrad.addColorStop(0.5, "#f59e0b");
            scoopGrad.addColorStop(1, "#d97706");
          }
          ctx.fillStyle = scoopGrad;
          ctx.beginPath();
          ctx.arc(0, 0, SCOOP_SIZE / 2, 0, Math.PI * 2);
          ctx.fill();

          // Highlight
          ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
          ctx.beginPath();
          ctx.arc(-5, -5, SCOOP_SIZE / 5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Cone base
        ctx.shadowBlur = 0;
        ctx.fillStyle = scoop.golden ? "#c8a020" : "#d4a057";
        ctx.beginPath();
        ctx.moveTo(-10, SCOOP_SIZE / 2 - 5);
        ctx.lineTo(10, SCOOP_SIZE / 2 - 5);
        ctx.lineTo(2, SCOOP_SIZE / 2 + 10);
        ctx.lineTo(-2, SCOOP_SIZE / 2 + 10);
        ctx.fill();

        // Waffle pattern
        ctx.strokeStyle = scoop.golden ? "#a08010" : "#c28a3e";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-6, SCOOP_SIZE / 2 - 2);
        ctx.lineTo(0, SCOOP_SIZE / 2 + 8);
        ctx.moveTo(6, SCOOP_SIZE / 2 - 2);
        ctx.lineTo(0, SCOOP_SIZE / 2 + 8);
        ctx.stroke();

        ctx.restore();

        // Sparkle trail (golden gets more)
        const trailChance = scoop.golden ? 0.3 : 0.6;
        if (Math.random() > trailChance) {
          const colors = scoop.golden ? ["#ffd700", "#ffffff", "#fcd34d"] :
            scoop.flavor === "blueberry" ? BLUEBERRY_COLORS : MANGO_COLORS;
          particlesRef.current.push({
            id: getId(),
            x: sx + (Math.random() - 0.5) * 20,
            y: sy - SCOOP_SIZE / 2,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -0.5 - Math.random(),
            life: 1,
            maxLife: scoop.golden ? 0.6 : 0.4,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: 1.5 + Math.random() * 2,
            type: "trail",
          });
        }
      }

      // ── Draw power-ups ──
      for (const pu of powerUpsRef.current) {
        const px = pu.x + Math.sin(pu.wobble) * 10;
        const py = pu.y;
        const pInfo = POWERUP_COLORS[pu.type];
        const pulseSize = 1 + Math.sin(pu.pulse) * 0.15;

        ctx.save();
        ctx.translate(px, py);
        ctx.scale(pulseSize, pulseSize);

        // Outer glow ring
        ctx.shadowColor = pInfo.glow;
        ctx.shadowBlur = 20 + Math.sin(pu.pulse) * 8;

        // Hexagonal shape
        ctx.fillStyle = pInfo.fill;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const r = SCOOP_SIZE / 2 + 2;
          if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
          else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();

        // Inner lighter fill
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const r = SCOOP_SIZE / 3;
          if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
          else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();

        // Glowing border
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const r = SCOOP_SIZE / 2 + 2;
          if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
          else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.stroke();

        // Icon
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.font = "20px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pInfo.icon, 0, 1);

        ctx.restore();
      }

      // ── Draw particles ──
      for (const p of particlesRef.current) {
        ctx.globalAlpha = Math.max(0, p.life);
        if (p.type === "score") {
          ctx.font = `bold ${p.size}px Fredoka, sans-serif`;
          ctx.fillStyle = p.color;
          ctx.textAlign = "center";
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          const txt = p.size >= 24 ? `✨+${Math.round(p.size >= 24 ? 100 : 10)}` : `+10`;
          ctx.fillText(txt, p.x, p.y);
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.type === "sparkle" ? 8 : 4;
          if (p.type === "sparkle" || p.type === "trail") {
            ctx.beginPath();
            const s = p.size * p.life;
            for (let i = 0; i < 4; i++) {
              const angle = (Math.PI / 2) * i;
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x + Math.cos(angle) * s, p.y + Math.sin(angle) * s);
            }
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(p.x, p.y, s * 0.4, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
      }
      ctx.globalAlpha = 1;

      // ── Draw skater ──
      const sk = skaterRef.current;

      // Skater shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.beginPath();
      ctx.ellipse(sk.x, sk.y + 28, 25, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(sk.x, sk.y);

      // Star power-up golden glow
      if (hasPowerUp("star")) {
        ctx.shadowColor = "rgba(255, 215, 0, 0.7)";
        ctx.shadowBlur = 30 + Math.sin(elapsedRef.current * 5) * 10;
        ctx.fillStyle = "rgba(255, 215, 0, 0.08)";
        ctx.beginPath();
        ctx.arc(0, 0, 45, 0, Math.PI * 2);
        ctx.fill();
      }

      // Magnet power-up purple aura
      if (hasPowerUp("magnet")) {
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.2 + Math.sin(elapsedRef.current * 4) * 0.1})`;
        ctx.lineWidth = 2;
        const magR = MAGNET_RANGE * (0.3 + Math.sin(elapsedRef.current * 3) * 0.05);
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, magR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Body glow
      ctx.shadowColor = hasPowerUp("star") ? "rgba(255, 215, 0, 0.7)" : "rgba(167, 139, 250, 0.5)";
      ctx.shadowBlur = 20;

      // Skate blades
      ctx.fillStyle = "#c0c0c0";
      ctx.fillRect(-18, 22, 14, 2);
      ctx.fillRect(4, 22, 14, 2);
      ctx.fillStyle = "#e0e0e0";
      ctx.fillRect(-18, 21, 14, 1);
      ctx.fillRect(4, 21, 14, 1);

      // Boots
      ctx.fillStyle = "#4a2080";
      ctx.beginPath();
      ctx.roundRect(-16, 14, 12, 10, 3);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(4, 14, 12, 10, 3);
      ctx.fill();

      // Legs
      ctx.fillStyle = "#6d4c9e";
      ctx.fillRect(-12, 4, 6, 12);
      ctx.fillRect(6, 4, 6, 12);

      // Body / Torso
      const bodyGrad = ctx.createLinearGradient(0, -15, 0, 8);
      if (hasPowerUp("star")) {
        bodyGrad.addColorStop(0, "#ffd700");
        bodyGrad.addColorStop(1, "#daa520");
      } else {
        bodyGrad.addColorStop(0, "#f59e0b");
        bodyGrad.addColorStop(1, "#d97706");
      }
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(-14, -12, 28, 20, 8);
      ctx.fill();

      // Stripe on shirt
      ctx.fillStyle = hasPowerUp("star") ? "#ffe66d" : "#fbbf24";
      ctx.fillRect(-12, -4, 24, 4);

      // Arms
      const armWave = Math.sin(elapsedRef.current * 6) * 0.3;
      ctx.save();
      ctx.translate(-14, -6);
      ctx.rotate(-0.5 + armWave);
      ctx.fillStyle = hasPowerUp("star") ? "#ffd700" : "#f59e0b";
      ctx.fillRect(-2, 0, 5, 14);
      ctx.fillStyle = "#fcd9a0";
      ctx.beginPath();
      ctx.arc(0, 15, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(14, -6);
      ctx.rotate(0.5 - armWave);
      ctx.fillStyle = hasPowerUp("star") ? "#ffd700" : "#f59e0b";
      ctx.fillRect(-3, 0, 5, 14);
      ctx.fillStyle = "#fcd9a0";
      ctx.beginPath();
      ctx.arc(0, 15, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Head
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fcd9a0";
      ctx.beginPath();
      ctx.arc(0, -22, 12, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = "#5b3a9e";
      ctx.beginPath();
      ctx.arc(0, -26, 12, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-8, -25, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(8, -25, 5, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = "#1a0a3e";
      ctx.beginPath();
      ctx.arc(-4, -22, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(4, -22, 2, 0, Math.PI * 2);
      ctx.fill();

      // Eye sparkles
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(-3, -23, 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(5, -23, 0.8, 0, Math.PI * 2);
      ctx.fill();

      // Smile
      ctx.strokeStyle = "#c87040";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -19, 4, 0.1, Math.PI - 0.1);
      ctx.stroke();

      // Rosy cheeks
      ctx.fillStyle = "rgba(255, 150, 150, 0.3)";
      ctx.beginPath();
      ctx.arc(-8, -19, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(8, -19, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // ── Draw lives ──
      ctx.font = "20px Fredoka, sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      const heartsStr = "❤️".repeat(livesRef.current) + "🖤".repeat(Math.max(0, LIVES - livesRef.current));
      ctx.fillText(heartsStr, 16, 80);

      // ── Freeze overlay ──
      if (freezeActive) {
        ctx.fillStyle = "rgba(56, 189, 248, 0.05)";
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore(); // end shake transform

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  // ─── Start / Restart ───────────────────────────────────────────────
  const startGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset state
    scoreRef.current = 0;
    comboRef.current = 0;
    bestComboRef.current = 0;
    livesRef.current = LIVES;
    elapsedRef.current = 0;
    lastSpawnRef.current = performance.now();
    lastPowerUpSpawnRef.current = performance.now();
    lastGoldenSpawnRef.current = performance.now();
    nextGoldenIntervalRef.current = GOLDEN_SPAWN_INTERVAL_MIN + Math.random() * (GOLDEN_SPAWN_INTERVAL_MAX - GOLDEN_SPAWN_INTERVAL_MIN);
    scoopsRef.current = [];
    powerUpsRef.current = [];
    activePowerUpsRef.current = [];
    particlesRef.current = [];
    trailRef.current = [];
    shakeRef.current = { x: 0, y: 0, intensity: 0 };
    themeTransitionRef.current = { current: "sunrise", target: "sunrise", t: 1 };

    skaterRef.current = {
      x: canvas.width / 2,
      y: canvas.height - 80,
      targetX: canvas.width / 2,
      targetY: canvas.height - 80,
      width: SKATER_WIDTH,
    };

    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setLives(LIVES);
    setActivePowerUps([]);

    try {
      const saved = localStorage.getItem("icsp-highscore");
      if (saved) {
        highScoreRef.current = parseInt(saved) || 0;
        setHighScore(highScoreRef.current);
      }
    } catch {}

    gameStateRef.current = "playing";
    setGameState("playing");
    gameLoop(canvas, ctx);
  }, [gameLoop]);

  // ─── Canvas resize ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (gameStateRef.current !== "playing") {
        skaterRef.current.x = canvas.width / 2;
        skaterRef.current.targetX = canvas.width / 2;
        skaterRef.current.y = canvas.height - 80;
        skaterRef.current.targetY = canvas.height - 80;
      }
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ─── Keyboard input ────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === " " || e.key === "Enter") {
        if (gameStateRef.current !== "playing") startGame();
      }
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [startGame]);

  // ─── Touch input (iPad optimized, full-screen, multi-touch) ────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (gameStateRef.current !== "playing") {
        startGame();
        return;
      }
      const touch = e.changedTouches[0];
      touchRef.current = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
      };
      // Move directly to touch position for immediate response
      skaterRef.current.targetX = touch.clientX;
      skaterRef.current.targetY = touch.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (gameStateRef.current !== "playing") return;

      // Find our tracked touch or use first available
      let touch: Touch | null = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (touchRef.current && e.touches[i].identifier === touchRef.current.id) {
          touch = e.touches[i];
          break;
        }
      }
      if (!touch) touch = e.touches[0];
      if (!touch) return;

      // 1:1 direct position mapping for responsive feel
      skaterRef.current.targetX = touch.clientX;
      skaterRef.current.targetY = touch.clientY;

      if (touchRef.current) {
        touchRef.current.lastX = touch.clientX;
        touchRef.current.lastY = touch.clientY;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        touchRef.current = null;
      } else {
        // Switch to remaining touch
        const remaining = e.touches[0];
        touchRef.current = {
          id: remaining.identifier,
          startX: remaining.clientX,
          startY: remaining.clientY,
          lastX: remaining.clientX,
          lastY: remaining.clientY,
        };
      }
    };

    // Prevent rubber-banding globally
    const preventScroll = (e: TouchEvent) => {
      if (gameStateRef.current === "playing") {
        e.preventDefault();
      }
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });
    document.addEventListener("touchmove", preventScroll, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("touchmove", preventScroll);
    };
  }, [startGame]);

  // ─── Cleanup ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ─── Ambient background sparkles ───────────────────────────────────
  const ambientSparkles = Array.from({ length: 20 }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    delay: `${Math.random() * 5}s`,
    duration: `${2 + Math.random() * 3}s`,
    size: 2 + Math.random() * 4,
  }));

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#1a0a3e]" style={{ touchAction: "none" }}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none" }}
        onClick={() => {
          if (gameStateRef.current !== "playing") startGame();
        }}
      />

      {/* Ambient sparkles */}
      {ambientSparkles.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            background: i % 2 === 0 ? "rgba(167, 139, 250, 0.6)" : "rgba(251, 191, 36, 0.6)",
            animation: `sparkle ${s.duration} ${s.delay} infinite`,
          }}
        />
      ))}

      {/* HUD - Score + Power-ups */}
      {gameState === "playing" && (
        <div className="absolute top-4 left-0 right-0 flex justify-between items-start px-4 pointer-events-none z-10">
          <div>
            <div className="glass-panel px-5 py-3" style={{ animation: "slide-in 0.3s ease-out" }}>
              <div className="text-white/60 text-xs uppercase tracking-wider">Score</div>
              <div className="text-white text-2xl font-bold">{score.toLocaleString()}</div>
            </div>

            {/* Active power-up indicators */}
            {activePowerUps.length > 0 && (
              <div className="flex gap-2 mt-2">
                {activePowerUps.map((ap, i) => (
                  <div
                    key={`${ap.type}-${i}`}
                    className="glass-panel px-3 py-2 text-center"
                    style={{
                      borderColor: POWERUP_COLORS[ap.type].glow,
                      background: `${POWERUP_COLORS[ap.type].glow.replace("0.6", "0.15")}`,
                    }}
                  >
                    <div className="text-sm">{POWERUP_COLORS[ap.type].icon}</div>
                    <div className="text-white text-xs font-bold">{Math.ceil(ap.remaining)}s</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {combo >= 3 && (
            <div
              className="glass-panel px-5 py-3 text-center"
              style={{
                animation: showComboPopup ? "combo-pop 0.4s ease-out" : "slide-in 0.3s ease-out",
                background: "rgba(245, 158, 11, 0.2)",
                borderColor: "rgba(245, 158, 11, 0.4)",
              }}
            >
              <div className="text-[#fbbf24] text-xs uppercase tracking-wider">🔥 Combo</div>
              <div className="text-[#fcd34d] text-2xl font-bold">{combo}x</div>
              <div className="text-[#fbbf24]/60 text-xs">×{Math.min(Math.floor(combo / 5) + 1, 5)}</div>
            </div>
          )}
        </div>
      )}

      {/* Start Screen */}
      {gameState === "start" && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div
            className="glass-panel p-8 md:p-12 text-center max-w-md mx-4 frost-texture"
            style={{ animation: "slide-in 0.5s ease-out" }}
          >
            <div
              className="text-5xl md:text-6xl font-bold mb-2"
              style={{
                animation: "title-bounce 3s ease-in-out infinite",
                background: "linear-gradient(135deg, #c4b5fd, #fbbf24, #a78bfa, #f59e0b)",
                backgroundSize: "300% 300%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              🍦 Ice Cream
            </div>
            <div
              className="text-4xl md:text-5xl font-bold mb-6"
              style={{
                animation: "title-bounce 3s 0.2s ease-in-out infinite",
                background: "linear-gradient(135deg, #fbbf24, #a78bfa, #f59e0b, #c4b5fd)",
                backgroundSize: "300% 300%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Skate Party 🛼
            </div>

            <p className="text-white/70 text-sm md:text-base mb-6 leading-relaxed">
              Skate around the rink and catch falling ice cream scoops!
              <br />
              <span className="text-[#c4b5fd]">🫐 Blueberry</span> &{" "}
              <span className="text-[#fbbf24]">🥭 Mango</span> flavors!
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
                <span>🎮</span> Arrow keys / WASD to skate freely
              </div>
              <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
                <span>📱</span> Touch & drag anywhere to skate
              </div>
              <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
                <span>🔥</span> Build combos for multipliers!
              </div>
              <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
                <span>✨</span> Catch power-ups & golden scoops!
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-8 py-4 rounded-full text-lg font-bold text-white cursor-pointer
                transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #f59e0b)",
                boxShadow: "0 4px 20px rgba(124, 58, 237, 0.4), 0 4px 20px rgba(245, 158, 11, 0.3)",
              }}
            >
              ✨ Tap to Play! ✨
            </button>

            {highScore > 0 && (
              <div className="mt-4 text-white/40 text-sm">
                🏆 Best: {highScore.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === "gameover" && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div
            className="glass-panel p-8 md:p-12 text-center max-w-md mx-4"
            style={{ animation: "slide-in 0.5s ease-out" }}
          >
            <div className="text-4xl mb-2">🍦💫</div>
            <h2
              className="text-3xl md:text-4xl font-bold mb-6"
              style={{
                background: "linear-gradient(135deg, #c4b5fd, #fbbf24)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Skate Over!
            </h2>

            <div className="space-y-3 mb-6">
              <div className="glass-panel px-6 py-3">
                <div className="text-white/50 text-xs uppercase tracking-wider">Final Score</div>
                <div className="text-white text-3xl font-bold">{score.toLocaleString()}</div>
              </div>

              <div className="flex gap-3">
                <div className="glass-panel px-4 py-3 flex-1">
                  <div className="text-white/50 text-xs uppercase tracking-wider">Best Combo</div>
                  <div className="text-[#fbbf24] text-xl font-bold">{bestCombo}x</div>
                </div>
                <div className="glass-panel px-4 py-3 flex-1">
                  <div className="text-white/50 text-xs uppercase tracking-wider">High Score</div>
                  <div className="text-[#c4b5fd] text-xl font-bold">
                    {Math.max(highScore, score).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {score >= highScore && score > 0 && (
              <div className="text-[#fcd34d] text-sm font-bold mb-4 animate-pulse">
                🎉 New High Score! 🎉
              </div>
            )}

            <button
              onClick={startGame}
              className="px-8 py-4 rounded-full text-lg font-bold text-white cursor-pointer
                transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #f59e0b)",
                boxShadow: "0 4px 20px rgba(124, 58, 237, 0.4), 0 4px 20px rgba(245, 158, 11, 0.3)",
              }}
            >
              🔄 Play Again!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
