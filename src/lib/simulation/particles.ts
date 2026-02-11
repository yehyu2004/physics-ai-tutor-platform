/**
 * Canvas particle system for physics simulations.
 * Provides burst effects, trails, sparks, confetti, and bubbles.
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  shape: "circle" | "square" | "star" | "spark";
  gravity: number;
  drag: number;
}

export interface ParticleOptions {
  speed?: number;
  speedVariance?: number;
  lifetime?: number;
  lifetimeVariance?: number;
  gravity?: number;
  size?: number;
  sizeVariance?: number;
  drag?: number;
  shape?: Particle["shape"];
  angle?: number; // direction in radians (undefined = all directions)
  spread?: number; // spread angle in radians (default PI*2)
}

const DEFAULT_OPTIONS: Required<ParticleOptions> = {
  speed: 150,
  speedVariance: 50,
  lifetime: 0.8,
  lifetimeVariance: 0.3,
  gravity: 200,
  size: 4,
  sizeVariance: 2,
  drag: 0.98,
  shape: "circle",
  angle: 0,
  spread: Math.PI * 2,
};

export class ParticleSystem {
  particles: Particle[] = [];

  emit(x: number, y: number, count: number, color: string, opts?: ParticleOptions) {
    const o = { ...DEFAULT_OPTIONS, ...opts };
    for (let i = 0; i < count; i++) {
      const angle = o.spread < Math.PI * 2
        ? o.angle + (Math.random() - 0.5) * o.spread
        : Math.random() * Math.PI * 2;
      const speed = o.speed + (Math.random() - 0.5) * o.speedVariance;
      const life = o.lifetime + (Math.random() - 0.5) * o.lifetimeVariance;
      const size = Math.max(1, o.size + (Math.random() - 0.5) * o.sizeVariance);

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Math.max(0.1, life),
        maxLife: Math.max(0.1, life),
        size,
        color,
        alpha: 1,
        shape: o.shape,
        gravity: o.gravity,
        drag: o.drag,
      });
    }
  }

  /** Emit sparks (fast, small, short-lived) */
  emitSparks(x: number, y: number, count: number, color = "#fbbf24") {
    this.emit(x, y, count, color, {
      speed: 250,
      lifetime: 0.4,
      size: 2,
      sizeVariance: 1,
      shape: "spark",
      gravity: 100,
    });
  }

  /** Emit glow particles (slow, large, long-lived) */
  emitGlow(x: number, y: number, count: number, color = "#60a5fa") {
    this.emit(x, y, count, color, {
      speed: 40,
      lifetime: 1.2,
      size: 6,
      sizeVariance: 3,
      shape: "circle",
      gravity: -20,
      drag: 0.96,
    });
  }

  /** Emit confetti (celebration effect) */
  emitConfetti(x: number, y: number, count = 30) {
    const colors = ["#ef4444", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ec4899"];
    for (let i = 0; i < count; i++) {
      this.emit(x, y, 1, colors[i % colors.length], {
        speed: 200 + Math.random() * 150,
        lifetime: 1.5,
        size: 4 + Math.random() * 3,
        shape: "square",
        gravity: 300,
        drag: 0.97,
        angle: -Math.PI / 2,
        spread: Math.PI * 0.8,
      });
    }
  }

  /** Emit bubbles (rising, wobbling) */
  emitBubbles(x: number, y: number, count: number, color = "rgba(100,200,255,0.6)") {
    this.emit(x, y, count, color, {
      speed: 30,
      speedVariance: 15,
      lifetime: 2.0,
      size: 5,
      sizeVariance: 3,
      shape: "circle",
      gravity: -80,
      drag: 0.99,
      angle: -Math.PI / 2,
      spread: Math.PI * 0.4,
    });
  }

  /** Emit directional trail particles */
  emitTrail(x: number, y: number, angle: number, color = "#a855f7") {
    this.emit(x, y, 2, color, {
      speed: 30,
      lifetime: 0.6,
      size: 3,
      shape: "circle",
      gravity: 0,
      drag: 0.95,
      angle: angle + Math.PI,
      spread: Math.PI * 0.3,
    });
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      switch (p.shape) {
        case "circle":
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "square":
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 10);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
          break;
        case "star":
          this.drawStar(ctx, p.x, p.y, p.size * p.alpha);
          break;
        case "spark":
          ctx.beginPath();
          const len = p.size * 3;
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (speed > 1) {
            const nx = p.vx / speed;
            const ny = p.vy / speed;
            ctx.moveTo(p.x - nx * len, p.y - ny * len);
            ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size * p.alpha;
            ctx.stroke();
          } else {
            ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  clear() {
    this.particles = [];
  }

  get count() {
    return this.particles.length;
  }
}
