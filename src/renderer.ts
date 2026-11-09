import { Anchor, FloatingCallout, Needle, Particle } from './types';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private dpr: number = 1;

  // Offscreen canvas for cached drafting paper texture and millimeter grid
  private bgCanvas: HTMLCanvasElement | null = null;
  private bgCtx: CanvasRenderingContext2D | null = null;
  private bgDirty: boolean = true;

  // Line-boil jitter phase (12fps update)
  private boilPhase: number = 0;
  private lastBoilTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.updateDimensions();
  }

  public updateDimensions(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2 for optimal 60fps performance
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.resetTransform?.();
    this.ctx.scale(this.dpr, this.dpr);
    this.bgDirty = true;
  }

  public getWidth(): number { return this.width; }
  public getHeight(): number { return this.height; }

  /**
   * Pre-renders paper texture, millimeter graduation ticks, graph grid, and compass rose
   */
  private renderBackgroundCache(): void {
    if (!this.bgCanvas) {
      this.bgCanvas = document.createElement('canvas');
      this.bgCtx = this.bgCanvas.getContext('2d', { alpha: false });
    }
    if (!this.bgCtx) return;

    this.bgCanvas.width = Math.floor(this.width * this.dpr);
    this.bgCanvas.height = Math.floor(this.height * this.dpr);
    this.bgCtx.resetTransform?.();
    this.bgCtx.scale(this.dpr, this.dpr);

    const w = this.width;
    const h = this.height;

    // 1. Warm cream drafting paper background (#FBF9F4)
    this.bgCtx.fillStyle = '#FBF9F4';
    this.bgCtx.fillRect(0, 0, w, h);

    // Subtle natural paper tooth / grain
    const imgData = this.bgCtx.getImageData(0, 0, Math.min(w * this.dpr, 300), Math.min(h * this.dpr, 300));
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 5;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    // Pattern repeat if desired, or fine graph lines provide the architectural vellum feel
    const gridColorMajor = '#E4E0D5';
    const gridColorMinor = '#EFECE3';

    // 2. Minor Graph Guidelines (20px spacing)
    this.bgCtx.beginPath();
    this.bgCtx.strokeStyle = gridColorMinor;
    this.bgCtx.lineWidth = 0.5;
    for (let x = 20; x < w; x += 20) {
      this.bgCtx.moveTo(x, 0);
      this.bgCtx.lineTo(x, h);
    }
    for (let y = 20; y < h; y += 20) {
      this.bgCtx.moveTo(0, y);
      this.bgCtx.lineTo(w, y);
    }
    this.bgCtx.stroke();

    // 3. Major Isometric / Architectural Grid (100px spacing)
    this.bgCtx.beginPath();
    this.bgCtx.strokeStyle = gridColorMajor;
    this.bgCtx.lineWidth = 0.8;
    for (let x = 100; x < w; x += 100) {
      this.bgCtx.moveTo(x, 0);
      this.bgCtx.lineTo(x, h);
    }
    for (let y = 100; y < h; y += 100) {
      this.bgCtx.moveTo(0, y);
      this.bgCtx.lineTo(w, y);
    }
    this.bgCtx.stroke();

    // 4. Subtle 45° isometric guide lines
    this.bgCtx.beginPath();
    this.bgCtx.strokeStyle = 'rgba(225, 220, 210, 0.45)';
    this.bgCtx.lineWidth = 0.5;
    for (let d = -h; d < w + h; d += 140) {
      this.bgCtx.moveTo(d, 0);
      this.bgCtx.lineTo(d + h, h);
    }
    this.bgCtx.stroke();

    // 5. Border millimeter graduation ticks along edges
    this.drawMillimeterTicks(this.bgCtx, w, h);

    // 6. Archival Corner Crosshairs
    this.drawArchivalCrosshairs(this.bgCtx, w, h);

    // 7. Architectural Compass Rose (subtle watermark in center background)
    this.drawCompassRose(this.bgCtx, w * 0.5, h * 0.5);

    // 8. Technical Title Block in bottom corner
    this.drawTitleBlock(this.bgCtx, w, h);

    this.bgDirty = false;
  }

  private drawMillimeterTicks(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = '#A69F91';
    ctx.fillStyle = '#8C8577';
    ctx.font = '8px "JetBrains Mono", "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const tickMargin = 12;

    // Top border ticks
    ctx.beginPath();
    for (let x = 20; x < w - 20; x += 10) {
      const isMajor = x % 50 === 0;
      const len = isMajor ? 8 : 4;
      ctx.moveTo(x, tickMargin);
      ctx.lineTo(x, tickMargin + len);

      if (isMajor && x % 100 === 0 && x > 60 && x < w - 60) {
        ctx.fillText(`${x}`, x, tickMargin + 10);
      }
    }

    // Left border ticks
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let y = 20; y < h - 20; y += 10) {
      const isMajor = y % 50 === 0;
      const len = isMajor ? 8 : 4;
      ctx.moveTo(tickMargin, y);
      ctx.lineTo(tickMargin + len, y);

      if (isMajor && y % 100 === 0 && y > 60 && y < h - 60) {
        ctx.fillText(`${y}`, tickMargin + 10, y);
      }
    }
    ctx.stroke();

    // Outer border drafting boundary line
    ctx.beginPath();
    ctx.strokeStyle = '#B8B0A0';
    ctx.lineWidth = 1;
    ctx.strokeRect(tickMargin, tickMargin, w - tickMargin * 2, h - tickMargin * 2);
  }

  private drawArchivalCrosshairs(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const corners = [
      { x: 30, y: 30, label: '000 / 000' },
      { x: w - 30, y: 30, label: `${Math.round(w)} / 000` },
      { x: 30, y: h - 30, label: `000 / ${Math.round(h)}` },
      { x: w - 30, y: h - 30, label: `${Math.round(w)} / ${Math.round(h)}` }
    ];

    ctx.strokeStyle = '#8C8375';
    ctx.fillStyle = '#9C9385';
    ctx.font = '8px monospace';
    ctx.lineWidth = 1;

    corners.forEach(c => {
      ctx.beginPath();
      // Precise crosshair (+)
      ctx.moveTo(c.x - 10, c.y);
      ctx.lineTo(c.x + 10, c.y);
      ctx.moveTo(c.x, c.y - 10);
      ctx.lineTo(c.x, c.y + 10);
      ctx.stroke();

      // Small central circle
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  private drawCompassRose(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(215, 208, 195, 0.4)';
    ctx.fillStyle = 'rgba(215, 208, 195, 0.2)';
    ctx.lineWidth = 0.8;

    const r = Math.min(cx, cy) * 0.42;

    // Outer and inner concentric guide rings
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.stroke();

    // 8 Cardinal and Intercardinal compass needles
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const isMajor = i % 2 === 0;
      const armLength = isMajor ? r : r * 0.75;
      const perpAngle = angle + Math.PI / 2;
      const baseW = isMajor ? 8 : 4;

      const tipX = cx + Math.cos(angle) * armLength;
      const tipY = cy + Math.sin(angle) * armLength;
      const leftX = cx + Math.cos(perpAngle) * baseW;
      const leftY = cy + Math.sin(perpAngle) * baseW;
      const rightX = cx - Math.cos(perpAngle) * baseW;
      const rightY = cy - Math.sin(perpAngle) * baseW;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(tipX, tipY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(rightX, rightY);
      ctx.lineTo(tipX, tipY);
      ctx.closePath();
      ctx.stroke();
    }

    // Cardinal letter markers
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(170, 160, 145, 0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, cy - r - 12);
    ctx.fillText('S', cx, cy + r + 12);
    ctx.fillText('E', cx + r + 12, cy);
    ctx.fillText('W', cx - r - 12, cy);

    ctx.restore();
  }

  private drawTitleBlock(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Only render title block if screen is wide enough
    if (w < 480) return;

    const bw = 240;
    const bh = 54;
    const bx = w - bw - 20;
    const by = h - bh - 20;

    ctx.save();
    ctx.fillStyle = 'rgba(251, 249, 244, 0.9)';
    ctx.fillRect(bx, by, bw, bh);

    ctx.strokeStyle = '#B8B0A0';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.beginPath();
    ctx.moveTo(bx, by + 18);
    ctx.lineTo(bx + bw, by + 18);
    ctx.moveTo(bx, by + 36);
    ctx.lineTo(bx + bw, by + 36);
    ctx.moveTo(bx + 130, by + 18);
    ctx.lineTo(bx + 130, by + bh);
    ctx.stroke();

    ctx.fillStyle = '#4A443B';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('PROJECT: INK-TETHER // ARENA DUEL', bx + 6, by + 9);

    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillStyle = '#6E6659';
    ctx.fillText('DWG: DRAFT-01-A', bx + 6, by + 27);
    ctx.fillText('SCALE: 1:1 VECTOR', bx + 136, by + 27);
    ctx.fillText('STANDARD: ISO-128 ARCHIVAL', bx + 6, by + 45);
    ctx.fillText('FPS: 60 SYNC', bx + 136, by + 45);

    ctx.restore();
  }

  /**
   * Main render dispatch called every 60fps frame
   */
  public render(
    now: number,
    anchors: Anchor[],
    p1: Needle,
    p2: Needle,
    particles: Particle[],
    callouts: FloatingCallout[]
  ): void {
    if (this.bgDirty || !this.bgCanvas) {
      this.renderBackgroundCache();
    }

    // 12fps line boil update
    if (now - this.lastBoilTime > 83) { // ~12 fps = 83ms
      this.boilPhase = (this.boilPhase + 1) % 1000;
      this.lastBoilTime = now;
    }

    // Draw cached drafting background
    if (this.bgCanvas) {
      this.ctx.drawImage(this.bgCanvas, 0, 0, this.width, this.height);
    }

    // 1. Draw Banked Territory Polygons (P1 and P2)
    this.drawCapturedTerritories(p1);
    this.drawCapturedTerritories(p2);

    // 2. Draw Brass Anchors & Orbital Guides
    this.drawAnchors(anchors, p1, p2);

    // 3. Draw Active Tether Guidelines
    this.drawTetherLine(p1, anchors);
    this.drawTetherLine(p2, anchors);

    // 4. Draw Wet Trailing Lines with 12fps Line-Boil
    this.drawWetTrail(p1);
    this.drawWetTrail(p2);

    // 5. Draw Particles (Droplets, Bleeds, Recoils)
    this.drawParticles(particles);

    // 6. Draw Needles (Compass points)
    this.drawNeedle(p1);
    this.drawNeedle(p2);

    // 7. Draw Floating Architectural Callouts
    this.drawCallouts(callouts);
  }

  /**
   * Renders captured polygons with 15% watercolor wash and 45° drafting hatching
   */
  private drawCapturedTerritories(needle: Needle): void {
    if (needle.territoryPolygons.length === 0) return;

    this.ctx.save();
    for (const poly of needle.territoryPolygons) {
      const pts = poly.points;
      if (pts.length < 3) continue;

      // Draw watercolor wash fill
      this.ctx.beginPath();
      this.ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        this.ctx.lineTo(pts[i].x, pts[i].y);
      }
      this.ctx.closePath();

      this.ctx.fillStyle = poly.washColor;
      this.ctx.fill();

      // Architectural 45-degree hatching clip
      this.ctx.save();
      this.ctx.clip();

      this.ctx.strokeStyle = needle.id === 'p1' ? 'rgba(26, 54, 93, 0.12)' : 'rgba(200, 90, 50, 0.12)';
      this.ctx.lineWidth = 1;

      // Find bounding box of polygon for hatch lines
      let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }

      this.ctx.beginPath();
      const hatchStep = 10;
      for (let x = minX - (maxY - minY); x < maxX + (maxY - minY); x += hatchStep) {
        this.ctx.moveTo(x, minY);
        this.ctx.lineTo(x + (maxY - minY), maxY);
      }
      this.ctx.stroke();
      this.ctx.restore();

      // Perimeter stroke with archival ink
      this.ctx.strokeStyle = poly.color;
      this.ctx.lineWidth = 1.8;
      this.ctx.stroke();

      // Ink bleed expansion animation if freshly captured
      if (poly.bleedProgress < 1.0) {
        this.ctx.strokeStyle = needle.id === 'p1' ? 'rgba(26, 54, 93, 0.35)' : 'rgba(200, 90, 50, 0.35)';
        this.ctx.lineWidth = 4 * (1 - poly.bleedProgress);
        this.ctx.stroke();
      }
    }
    this.ctx.restore();
  }

  /**
   * Renders Brass Anchors with metallic knurling, pivot pin, and latch zone
   */
  private drawAnchors(anchors: Anchor[], p1: Needle, p2: Needle): void {
    const ctx = this.ctx;

    for (const anchor of anchors) {
      const isP1Latched = p1.isTethered && p1.tetherAnchorId === anchor.id;
      const isP2Latched = p2.isTethered && p2.tetherAnchorId === anchor.id;
      const d1 = Math.hypot(p1.x - anchor.x, p1.y - anchor.y);
      const d2 = Math.hypot(p2.x - anchor.x, p2.y - anchor.y);
      const isP1Close = d1 < anchor.tetherRadius;
      const isP2Close = d2 < anchor.tetherRadius;

      // 1. Faint compass concentric tether capture zone
      if (isP1Close || isP2Close || isP1Latched || isP2Latched) {
        ctx.save();
        ctx.strokeStyle = isP1Latched
          ? 'rgba(26, 54, 93, 0.3)'
          : isP2Latched
          ? 'rgba(200, 90, 50, 0.3)'
          : 'rgba(184, 151, 88, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, anchor.tetherRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshairs through the anchor
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(anchor.x - anchor.tetherRadius, anchor.y);
        ctx.lineTo(anchor.x + anchor.tetherRadius, anchor.y);
        ctx.moveTo(anchor.x, anchor.y - anchor.tetherRadius);
        ctx.lineTo(anchor.x, anchor.y + anchor.tetherRadius);
        ctx.stroke();
        ctx.restore();
      }

      // 2. Brass Anchor Outer Ring
      ctx.save();
      // Outer drop shadow for tactile metallic peg
      ctx.shadowColor = 'rgba(60, 50, 30, 0.15)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;

      const grad = ctx.createRadialGradient(
        anchor.x - 3, anchor.y - 3, 2,
        anchor.x, anchor.y, anchor.radius + 4
      );
      grad.addColorStop(0, '#E0CD9D'); // Brass highlight
      grad.addColorStop(0.6, '#B89758'); // Metallic brass body
      grad.addColorStop(1, '#7A6233');   // Shaded rim

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, anchor.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Outer metallic bevel
      ctx.strokeStyle = '#5E4B27';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, anchor.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Knurled perimeter notches
      ctx.save();
      ctx.strokeStyle = '#5E4B27';
      ctx.lineWidth = 0.8;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const nx = anchor.x + Math.cos(a) * (anchor.radius - 2.5);
        const ny = anchor.y + Math.sin(a) * (anchor.radius - 2.5);
        const ox = anchor.x + Math.cos(a) * anchor.radius;
        const oy = anchor.y + Math.sin(a) * anchor.radius;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.lineTo(ox, oy);
        ctx.stroke();
      }
      ctx.restore();

      // Inner pivot socket and central pin dot
      ctx.fillStyle = '#2B2418';
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Pin center reflection
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(anchor.x - 1, anchor.y - 1, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Taut elastic guideline when needle is latched to an anchor
   */
  private drawTetherLine(needle: Needle, anchors: Anchor[]): void {
    if (!needle.isTethered || needle.tetherAnchorId === null) return;
    const anchor = anchors.find(a => a.id === needle.tetherAnchorId);
    if (!anchor) return;

    const ctx = this.ctx;
    ctx.save();

    // Elastic guideline styling
    ctx.strokeStyle = needle.id === 'p1' ? '#1A365D' : '#C85A32';
    ctx.lineWidth = 1.6;

    // Slight vibration wave on the line based on orbital velocity
    const dx = needle.x - anchor.x;
    const dy = needle.y - anchor.y;
    const d = Math.hypot(dx, dy);
    const midX = (anchor.x + needle.x) * 0.5;
    const midY = (anchor.y + needle.y) * 0.5;

    // Perpendicular vector for vibration
    const perpX = -dy / (d || 1);
    const perpY = dx / (d || 1);
    const vibOffset = Math.sin(performance.now() * 0.04) * Math.min(needle.speed * 0.005, 3.5);

    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.quadraticCurveTo(midX + perpX * vibOffset, midY + perpY * vibOffset, needle.x, needle.y);
    ctx.stroke();

    // Tension tick lines along the tether (like a calibrated measuring cord)
    ctx.strokeStyle = needle.id === 'p1' ? 'rgba(26, 54, 93, 0.4)' : 'rgba(200, 90, 50, 0.4)';
    ctx.lineWidth = 1;
    const steps = 5;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = anchor.x + dx * t;
      const py = anchor.y + dy * t;
      ctx.beginPath();
      ctx.moveTo(px - perpX * 3, py - perpY * 3);
      ctx.lineTo(px + perpX * 3, py + perpY * 3);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draws the active Wet Trailing Line with a subtle 12fps line-boil jitter
   */
  private drawWetTrail(needle: Needle): void {
    const trail = needle.wetTrail;
    if (trail.length < 2) return;

    const ctx = this.ctx;
    ctx.save();

    ctx.strokeStyle = needle.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i < trail.length; i++) {
      const pt = trail[i];
      // 12fps procedural line-boil offset for genuine pen micro-jitter
      const jitterX = Math.sin(i * 1.7 + this.boilPhase) * 0.45;
      const jitterY = Math.cos(i * 2.3 + this.boilPhase) * 0.45;

      const px = pt.x + jitterX;
      const py = pt.y + jitterY;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // Subtle wet ink gloss highlight along the freshest trail tip
    if (trail.length > 4) {
      ctx.strokeStyle = needle.id === 'p1' ? '#3B82F6' : '#F97316';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      const recentStart = Math.max(0, trail.length - 8);
      ctx.moveTo(trail[recentStart].x, trail[recentStart].y);
      for (let j = recentStart + 1; j < trail.length; j++) {
        ctx.lineTo(trail[j].x, trail[j].y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draws the Needle - a precision drafting compass leg
   */
  private drawNeedle(needle: Needle): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(needle.x, needle.y);
    ctx.rotate(needle.angle);

    // If needle is stunned / recoiling from thread cut
    if (needle.recoilTimer > 0) {
      const shake = (Math.random() - 0.5) * 6;
      ctx.translate(shake, shake);
    }

    // 1. Compass Arm Shadow
    ctx.shadowColor = 'rgba(30, 25, 20, 0.25)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;

    // 2. Compass Body (brass / metallic leg)
    ctx.fillStyle = '#B89758';
    ctx.strokeStyle = '#5E4B27';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(12, 0);       // Needle tip (front)
    ctx.lineTo(-14, -5);     // Top joint
    ctx.lineTo(-20, -3);     // Pivot back
    ctx.lineTo(-20, 3);
    ctx.lineTo(-14, 5);      // Bottom joint
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Ink Reservoir Chamber (colored by player's ink)
    ctx.fillStyle = needle.color;
    ctx.beginPath();
    ctx.ellipse(-4, 0, 6, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Sharp drafting needle point (steel tip)
    ctx.strokeStyle = '#2B2418';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();

    // 5. Brass Pivot Hinge Screw
    ctx.fillStyle = '#D6B87B';
    ctx.beginPath();
    ctx.arc(-16, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5E4B27';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Renders particles (droplets, thread snaps, ink spatter)
   */
  private drawParticles(particles: Particle[]): void {
    const ctx = this.ctx;

    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);

      if (p.type === 'snap_string') {
        // Snapped thread recoil line segment
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 3.5, p.y - p.vy * 3.5);
        ctx.stroke();
      } else if (p.type === 'ring') {
        // Expanding watercolor capillary ring
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Ink droplet / spatter
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /**
   * Renders floating architectural callouts (e.g. "+16.8% SNARED", "THREAD SEVERED!")
   */
  private drawCallouts(callouts: FloatingCallout[]): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = 'bold 11px "JetBrains Mono", "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const c of callouts) {
      ctx.globalAlpha = Math.max(0, c.alpha);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, c.x, c.y);
    }
    ctx.restore();
  }
}
