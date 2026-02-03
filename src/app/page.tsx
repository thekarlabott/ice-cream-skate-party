"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────
type Flavor = "blueberry" | "mango";
type GameState = "start" | "playing" | "gameover";

interface Scoop {
  id: number;
  x: number;
  y: number;
  flavor: Flavor;
  speed: number;
  wobble: number;
  wobbleSpeed: number;
  rotation: number;
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

// ─── Constants ───────────────────────────────────────────────────────
const SKATER_WIDTH = 60;
const SKATER_HEIGHT = 60;
const SCOOP_SIZE = 40;
const CATCH_RADIUS = 50;
const INITIAL_SPAWN_INTERVAL = 1200;
const MIN_SPAWN_INTERVAL = 400;
const INITIAL_SPEED = 2;
const MAX_SPEED = 7;
const LIVES = 5;

const BLUEBERRY_COLORS = ["#8b6cc1", "#a78bfa", "#c4b5fd", "#7c3aed"];
const MANGO_COLORS = ["#f59e0b", "#fbbf24", "#fcd34d", "#f97316"];

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

  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const bestComboRef = useRef(0);
  const livesRef = useRef(LIVES);
  const highScoreRef = useRef(0);

  const skaterRef = useRef({ x: 0, y: 0, targetX: 0, width: SKATER_WIDTH });
  const scoopsRef = useRef<Scoop[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const trailRef = useRef<TrailDot[]>([]);
  const nextIdRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const elapsedRef = useRef(0);
  const animFrameRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<number | null>(null);

  // ─── Helpers ─────────────────────────────────────────────────────
  const getId = () => nextIdRef.current++;

  const spawnParticles = (x: number, y: number, flavor: Flavor, type: "sparkle" | "splat") => {
    const colors = flavor === "blueberry" ? BLUEBERRY_COLORS : MANGO_COLORS;
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
      color: points >= 20 ? "#fcd34d" : "#ffffff",
      size: points >= 20 ? 24 : 18,
      type: "score",
    });
  };

  const getDifficulty = () => {
    const t = Math.min(elapsedRef.current / 120, 1); // max difficulty at 2 min
    return {
      spawnInterval: INITIAL_SPAWN_INTERVAL - t * (INITIAL_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL),
      speed: INITIAL_SPEED + t * (MAX_SPEED - INITIAL_SPEED),
    };
  };

  // ─── Game Loop ───────────────────────────────────────────────────
  const gameLoop = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const W = canvas.width;
    const H = canvas.height;
    let lastTime = performance.now();

    const loop = (now: number) => {
      if (gameStateRef.current !== "playing") return;

      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      elapsedRef.current += dt;

      const { spawnInterval, speed } = getDifficulty();

      // ── Input ──
      const skater = skaterRef.current;
      const moveSpeed = 500 * dt;

      if (keysRef.current.has("ArrowLeft") || keysRef.current.has("a")) {
        skater.targetX -= moveSpeed;
      }
      if (keysRef.current.has("ArrowRight") || keysRef.current.has("d")) {
        skater.targetX += moveSpeed;
      }

      skater.targetX = Math.max(SKATER_WIDTH / 2, Math.min(W - SKATER_WIDTH / 2, skater.targetX));
      skater.x += (skater.targetX - skater.x) * 0.15;
      skater.y = H - 80;

      // ── Trail ──
      if (Math.abs(skater.targetX - skater.x) > 2) {
        trailRef.current.push({ id: getId(), x: skater.x, y: skater.y + 20, life: 1 });
      }
      trailRef.current = trailRef.current.filter(t => {
        t.life -= dt * 3;
        return t.life > 0;
      });

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
        });
      }

      // ── Update scoops ──
      const caughtScoops: Scoop[] = [];
      const missedScoops: Scoop[] = [];

      scoopsRef.current = scoopsRef.current.filter(scoop => {
        scoop.y += scoop.speed * 60 * dt;
        scoop.wobble += scoop.wobbleSpeed * dt;
        scoop.rotation += dt * 2;

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

      // ── Handle catches ──
      for (const scoop of caughtScoops) {
        comboRef.current++;
        const multiplier = Math.min(Math.floor(comboRef.current / 5) + 1, 5);
        const points = 10 * multiplier;
        scoreRef.current += points;
        if (comboRef.current > bestComboRef.current) bestComboRef.current = comboRef.current;

        spawnParticles(scoop.x, scoop.y, scoop.flavor, "sparkle");
        spawnScoreParticle(scoop.x, scoop.y - 20, points);

        if (comboRef.current > 0 && comboRef.current % 5 === 0) {
          setShowComboPopup(true);
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

      // ── Update particles ──
      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.type === "splat") p.vy += 5 * dt;
        if (p.type === "score") p.vy = -1.5;
        p.life -= dt / p.maxLife;
        return p.life > 0;
      });

      // ── Draw ──
      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, "#1a0a3e");
      bgGrad.addColorStop(0.4, "#2d1b69");
      bgGrad.addColorStop(0.7, "#4a2080");
      bgGrad.addColorStop(1, "#1a0a3e");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

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

        // Glow
        const glowColor = scoop.flavor === "blueberry" ? "rgba(167, 139, 250, 0.4)" : "rgba(251, 191, 36, 0.4)";
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 15;

        // Scoop body
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

        // Cone base
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#d4a057";
        ctx.beginPath();
        ctx.moveTo(-10, SCOOP_SIZE / 2 - 5);
        ctx.lineTo(10, SCOOP_SIZE / 2 - 5);
        ctx.lineTo(2, SCOOP_SIZE / 2 + 10);
        ctx.lineTo(-2, SCOOP_SIZE / 2 + 10);
        ctx.fill();

        // Waffle pattern
        ctx.strokeStyle = "#c28a3e";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-6, SCOOP_SIZE / 2 - 2);
        ctx.lineTo(0, SCOOP_SIZE / 2 + 8);
        ctx.moveTo(6, SCOOP_SIZE / 2 - 2);
        ctx.lineTo(0, SCOOP_SIZE / 2 + 8);
        ctx.stroke();

        ctx.restore();

        // Sparkle trail
        if (Math.random() > 0.6) {
          const colors = scoop.flavor === "blueberry" ? BLUEBERRY_COLORS : MANGO_COLORS;
          particlesRef.current.push({
            id: getId(),
            x: sx + (Math.random() - 0.5) * 20,
            y: sy - SCOOP_SIZE / 2,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -0.5 - Math.random(),
            life: 1,
            maxLife: 0.4,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: 1.5 + Math.random() * 2,
            type: "trail",
          });
        }
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
          const points = p.size >= 24 ? "✨" : "+";
          ctx.fillText(`${points}${Math.round(p.size >= 24 ? scoreRef.current : 10)}`, p.x, p.y);
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.type === "sparkle" ? 8 : 4;
          if (p.type === "sparkle" || p.type === "trail") {
            // Star shape for sparkles
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

      // Skater body
      ctx.save();
      ctx.translate(sk.x, sk.y);

      // Body glow
      ctx.shadowColor = "rgba(167, 139, 250, 0.5)";
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
      bodyGrad.addColorStop(0, "#f59e0b");
      bodyGrad.addColorStop(1, "#d97706");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(-14, -12, 28, 20, 8);
      ctx.fill();

      // Stripe on shirt
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(-12, -4, 24, 4);

      // Arms
      const armWave = Math.sin(elapsedRef.current * 6) * 0.3;
      ctx.save();
      ctx.translate(-14, -6);
      ctx.rotate(-0.5 + armWave);
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(-2, 0, 5, 14);
      ctx.fillStyle = "#fcd9a0";
      ctx.beginPath();
      ctx.arc(0, 15, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(14, -6);
      ctx.rotate(0.5 - armWave);
      ctx.fillStyle = "#f59e0b";
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
      const heartsStr = "❤️".repeat(livesRef.current) + "🖤".repeat(LIVES - livesRef.current);
      ctx.fillText(heartsStr, 16, 80);

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
    scoopsRef.current = [];
    particlesRef.current = [];
    trailRef.current = [];

    skaterRef.current = {
      x: canvas.width / 2,
      y: canvas.height - 80,
      targetX: canvas.width / 2,
      width: SKATER_WIDTH,
    };

    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setLives(LIVES);

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

  // ─── Touch input ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (gameStateRef.current !== "playing") {
        startGame();
        return;
      }
      const touch = e.touches[0];
      touchRef.current = touch.clientX;
      skaterRef.current.targetX = touch.clientX;
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (gameStateRef.current !== "playing") return;
      const touch = e.touches[0];
      skaterRef.current.targetX = touch.clientX;
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      touchRef.current = null;
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
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
    <div className="relative w-screen h-screen overflow-hidden bg-[#1a0a3e]">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
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

      {/* HUD - Score */}
      {gameState === "playing" && (
        <div className="absolute top-4 left-0 right-0 flex justify-between items-start px-4 pointer-events-none z-10">
          <div className="glass-panel px-5 py-3" style={{ animation: "slide-in 0.3s ease-out" }}>
            <div className="text-white/60 text-xs uppercase tracking-wider">Score</div>
            <div className="text-white text-2xl font-bold">{score.toLocaleString()}</div>
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
              Skate across the rink and catch falling ice cream scoops!
              <br />
              <span className="text-[#c4b5fd]">🫐 Blueberry</span> &{" "}
              <span className="text-[#fbbf24]">🥭 Mango</span> flavors!
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
                <span>🎮</span> Arrow keys / A,D to move
              </div>
              <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
                <span>📱</span> Touch & drag to skate
              </div>
              <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
                <span>🔥</span> Build combos for multipliers!
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
