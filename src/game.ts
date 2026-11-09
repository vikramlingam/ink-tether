import {
  Anchor,
  FloatingCallout,
  GameMode,
  MatchStats,
  Needle,
  Particle,
  RemotePlayerPacket,
  Vector2D
} from './types';
import {
  checkThreadCut,
  detectSelfIntersection,
  dist,
  hermiteInterpolate,
  isPointInPolygon,
  shoelaceArea,
  simplifyPolyline
} from './math';
import { sound } from './audio';
import { BotAI } from './ai';

export class GameEngine {
  public mode: GameMode = 'ai';
  public botAI: BotAI = new BotAI('acrobat');

  public anchors: Anchor[] = [];
  public p1!: Needle;
  public p2!: Needle;

  public particles: Particle[] = [];
  public callouts: FloatingCallout[] = [];

  public arenaWidth: number = 1000;
  public arenaHeight: number = 700;
  public playableArea: number = 1;
  public isMobile: boolean = false;

  public getSpeedScale(): number {
    return this.isMobile ? 0.72 : 1.0;
  }

  // 90s Match Countdown
  public matchDuration: number = 90;
  public timeRemaining: number = 90;
  public isMatchOver: boolean = false;
  public isPaused: boolean = false;
  public winner: 'p1' | 'p2' | 'draw' | null = null;

  // Local Controls state
  public p1InputHeld: boolean = false;
  public p2InputHeld: boolean = false;

  // Remote interpolation buffer for multiplayer
  private remoteStateBuffer: { packet: RemotePlayerPacket; receivedAt: number }[] = [];

  // Match statistics tracking
  public p1MaxSpeed: number = 0;
  public p2MaxSpeed: number = 0;

  // Event callbacks for UI
  public onStateUpdate?: (timeRemaining: number, p1Pct: number, p2Pct: number) => void;
  public onMatchEnd?: (stats: MatchStats) => void;

  constructor() {
    this.initArena(window.innerWidth, window.innerHeight);
    this.resetMatch();
  }

  public initArena(width: number, height: number): void {
    this.arenaWidth = width;
    this.arenaHeight = height;
    const isTouch = ('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    this.isMobile = width <= 768 || (isTouch && width <= 1024);
    const margin = 24;
    this.playableArea = Math.max(1000, (width - margin * 2) * (height - margin * 2));

    // 9 Brass Anchors strategically distributed in an architectural lattice
    const normalizedAnchors = [
      { id: 1, normX: 0.20, normY: 0.24 },
      { id: 2, normX: 0.50, normY: 0.20 },
      { id: 3, normX: 0.80, normY: 0.24 },
      { id: 4, normX: 0.32, normY: 0.50 },
      { id: 5, normX: 0.50, normY: 0.50 },
      { id: 6, normX: 0.68, normY: 0.50 },
      { id: 7, normX: 0.20, normY: 0.76 },
      { id: 8, normX: 0.50, normY: 0.80 },
      { id: 9, normX: 0.80, normY: 0.76 }
    ];

    const baseRadius = Math.max(10, Math.min(width, height) * 0.016);
    const tetherRadius = Math.max(160, Math.min(width, height) * 0.24);

    this.anchors = normalizedAnchors.map(a => ({
      id: a.id,
      normX: a.normX,
      normY: a.normY,
      x: a.normX * width,
      y: a.normY * height,
      radius: baseRadius,
      tetherRadius: tetherRadius,
      pulse: 0
    }));
  }

  public resetMatch(): void {
    this.timeRemaining = this.matchDuration;
    this.isMatchOver = false;
    this.isPaused = false;
    this.winner = null;
    this.particles = [];
    this.callouts = [];
    this.p1MaxSpeed = 0;
    this.p2MaxSpeed = 0;

    const w = this.arenaWidth;
    const h = this.arenaHeight;
    const speedScale = this.getSpeedScale();

    // Player 1: Archival Ballpoint Blue (#1A365D)
    this.p1 = {
      id: 'p1',
      name: 'Blue',
      color: '#1A365D',
      fillColor: '#1A365D',
      washColor: 'rgba(26, 54, 93, 0.15)',
      x: w * 0.25,
      y: h * 0.5,
      vx: 180 * speedScale,
      vy: -120 * speedScale,
      angle: -Math.PI / 4,
      speed: 216 * speedScale,
      isTethered: false,
      tetherAnchorId: null,
      tetherAngle: 0,
      orbitRadius: 0,
      angularVelocity: 0,
      orbitDirection: 1,
      tetherHoldDuration: 0,
      wetTrail: [{ x: w * 0.25, y: h * 0.5, timestamp: performance.now() }],
      territoryPolygons: [],
      totalArea: 0,
      areaPercentage: 0,
      score: 0,
      slingshotsFired: 0,
      threadsCut: 0,
      recoilTimer: 0
    };

    // Player 2: Terracotta Crimson Ink (#C85A32)
    this.p2 = {
      id: 'p2',
      name: 'Orange',
      color: '#C85A32',
      fillColor: '#C85A32',
      washColor: 'rgba(200, 90, 50, 0.15)',
      x: w * 0.75,
      y: h * 0.5,
      vx: -180 * speedScale,
      vy: 120 * speedScale,
      angle: 3 * Math.PI / 4,
      speed: 216 * speedScale,
      isTethered: false,
      tetherAnchorId: null,
      tetherAngle: 0,
      orbitRadius: 0,
      angularVelocity: 0,
      orbitDirection: 1,
      tetherHoldDuration: 0,
      wetTrail: [{ x: w * 0.75, y: h * 0.5, timestamp: performance.now() }],
      territoryPolygons: [],
      totalArea: 0,
      areaPercentage: 0,
      score: 0,
      slingshotsFired: 0,
      threadsCut: 0,
      recoilTimer: 0
    };

    this.p1InputHeld = false;
    this.p2InputHeld = false;
    this.remoteStateBuffer = [];
  }

  public setMode(mode: GameMode): void {
    this.mode = mode;
    this.resetMatch();
  }

  /**
   * Main Physics & Simulation Step (called ~60fps)
   */
  public update(dt: number): void {
    if (this.isPaused || this.isMatchOver) return;

    // Cap delta time to prevent tunneling during tab switch
    const clampedDt = Math.min(dt, 0.05);

    // 1. Update Match Countdown
    this.timeRemaining -= clampedDt;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.resolveMatchEnd();
      return;
    }

    // 2. Resolve AI controls if in Single Player mode
    if (this.mode === 'ai') {
      this.p2InputHeld = this.botAI.update(
        clampedDt,
        this.p2,
        this.p1,
        this.anchors,
        this.arenaWidth,
        this.arenaHeight
      );
    }

    // 3. Update Needles physics & orbital mechanics
    this.updateNeedlePhysics(this.p1, this.p1InputHeld, clampedDt);

    if (this.mode === 'multiplayer') {
      // Remote multiplayer opponent interpolation
      this.updateRemotePlayerSmoothing(clampedDt);
    } else {
      this.updateNeedlePhysics(this.p2, this.p2InputHeld, clampedDt);
    }

    // 4. Update Trail sampling & check for polygon closure
    this.updateTrailAndSnare(this.p1);
    if (this.mode !== 'multiplayer') {
      this.updateTrailAndSnare(this.p2);
    }

    // 6. Thread Cutting Combat Check
    this.checkThreadCuttingCombat();

    // 7. Update Particles & Bleeds
    this.updateParticles(clampedDt);
    this.updatePolygonsBleed(clampedDt);
    this.updateCallouts(clampedDt);

    // 8. Recompute Territorial Percentages
    this.updateTerritoryCalculations();

    // 9. Early Victory condition check (>= 60% territory)
    if (this.p1.areaPercentage >= 60) {
      this.winner = 'p1';
      this.resolveMatchEnd();
    } else if (this.p2.areaPercentage >= 60) {
      this.winner = 'p2';
      this.resolveMatchEnd();
    }

    // Notify UI of updated state
    this.onStateUpdate?.(this.timeRemaining, this.p1.areaPercentage, this.p2.areaPercentage);
  }

  /**
   * Orbital slingshot & drift physics for a needle
   */
  private updateNeedlePhysics(needle: Needle, inputHeld: boolean, dt: number): void {
    if (needle.recoilTimer > 0) {
      needle.recoilTimer -= dt;
    }

    const speedScale = this.getSpeedScale();

    // Latch Tether Initiation
    if (inputHeld) {
      if (!needle.isTethered) {
        // Find nearest anchor within capture range
        const nearest = this.getNearestAnchorWithinRange(needle);
        if (nearest) {
          needle.isTethered = true;
          needle.tetherAnchorId = nearest.id;
          needle.tetherHoldDuration = 0;

          const dx = needle.x - nearest.x;
          const dy = needle.y - nearest.y;
          needle.tetherAngle = Math.atan2(dy, dx);
          needle.orbitRadius = Math.max(30, Math.hypot(dx, dy));

          // Determine orbital spin direction from approach velocity cross-product
          // cross = dx * vy - dy * vx
          const crossVal = dx * needle.vy - dy * needle.vx;
          needle.orbitDirection = crossVal >= 0 ? 1 : -1;

          // Initial angular velocity: omega = v / r
          const initialSpeed = Math.max(needle.speed, 220 * speedScale);
          needle.angularVelocity = (initialSpeed / needle.orbitRadius) * needle.orbitDirection;
        }
      }
    } else {
      // Released Tether -> Slingshot Catapult!
      if (needle.isTethered) {
        needle.isTethered = false;
        needle.tetherAnchorId = null;

        // Slingshot release boost! Exit along instantaneous tangent vector
        const tangentAngle = needle.tetherAngle + (needle.orbitDirection * Math.PI) / 2;
        const spoolBoost = Math.min(1.0 + needle.tetherHoldDuration * 0.45, 1.55);
        const maxExitSpeed = 780 * speedScale;
        const exitSpeed = Math.min(Math.abs(needle.angularVelocity * needle.orbitRadius) * spoolBoost, maxExitSpeed);

        needle.vx = Math.cos(tangentAngle) * exitSpeed;
        needle.vy = Math.sin(tangentAngle) * exitSpeed;
        needle.speed = exitSpeed;
        needle.angle = tangentAngle;
        needle.slingshotsFired++;

        if (needle.id === 'p1') {
          sound.playSlingshotSnap(exitSpeed / 400);
        }

        // Directional ink ejection spray particles
        this.spawnSlingshotParticles(needle.x, needle.y, tangentAngle, needle.color);
      }
    }

    if (needle.isTethered && needle.tetherAnchorId !== null) {
      // In Tethered Orbit
      const anchor = this.anchors.find(a => a.id === needle.tetherAnchorId);
      if (anchor) {
        needle.tetherHoldDuration += dt;

        // Accelerate rotational speed: omega increases smoothly up to maximum
        const maxOmega = 9.5 * speedScale;
        const accel = 4.2 * speedScale;
        if (needle.orbitDirection > 0) {
          needle.angularVelocity = Math.min(needle.angularVelocity + accel * dt, maxOmega);
        } else {
          needle.angularVelocity = Math.max(needle.angularVelocity - accel * dt, -maxOmega);
        }

        // Spring centripetal elasticity: gently pull toward comfortable orbit radius (~110px)
        const idealRadius = 110;
        needle.orbitRadius += (idealRadius - needle.orbitRadius) * 2.5 * dt;

        // Advance angle around anchor
        needle.tetherAngle += needle.angularVelocity * dt;

        // Update needle Cartesian position
        needle.x = anchor.x + Math.cos(needle.tetherAngle) * needle.orbitRadius;
        needle.y = anchor.y + Math.sin(needle.tetherAngle) * needle.orbitRadius;

        // Facing orientation is instantaneous tangent
        const tangentAngle = needle.tetherAngle + (needle.orbitDirection * Math.PI) / 2;
        needle.angle = tangentAngle;
        needle.speed = Math.abs(needle.angularVelocity * needle.orbitRadius);
        needle.vx = Math.cos(tangentAngle) * needle.speed;
        needle.vy = Math.sin(tangentAngle) * needle.speed;

        // Mechanical ratchet sound
        if (needle.id === 'p1') {
          sound.playTetherRatchet(Math.abs(needle.angularVelocity));
        }
      }
    } else {
      // In Free Inertial Drift
      needle.x += needle.vx * dt;
      needle.y += needle.vy * dt;

      // Gentle aerodynamic drag (coasts at high speed, never dead stops)
      const minSpeed = 160 * speedScale;
      needle.vx *= Math.pow(0.992, dt * 60);
      needle.vy *= Math.pow(0.992, dt * 60);
      needle.speed = Math.hypot(needle.vx, needle.vy);

      if (needle.speed < minSpeed) {
        const factor = minSpeed / (needle.speed || 1);
        needle.vx *= factor;
        needle.vy *= factor;
        needle.speed = minSpeed;
      }

      needle.angle = Math.atan2(needle.vy, needle.vx);

      // Arena boundary bounce physics
      this.handleBoundaryBounce(needle);
    }

    // Track max speed stat
    if (needle.id === 'p1') {
      this.p1MaxSpeed = Math.max(this.p1MaxSpeed, Math.round(needle.speed));
    } else {
      this.p2MaxSpeed = Math.max(this.p2MaxSpeed, Math.round(needle.speed));
    }
  }

  /**
   * Dampened bounce off arena borders
   */
  private handleBoundaryBounce(needle: Needle): void {
    const margin = 18;
    const minX = margin;
    const maxX = this.arenaWidth - margin;
    const minY = margin;
    const maxY = this.arenaHeight - margin;
    let bounced = false;

    if (needle.x < minX) {
      needle.x = minX;
      needle.vx = Math.abs(needle.vx) * 0.82;
      bounced = true;
    } else if (needle.x > maxX) {
      needle.x = maxX;
      needle.vx = -Math.abs(needle.vx) * 0.82;
      bounced = true;
    }

    if (needle.y < minY) {
      needle.y = minY;
      needle.vy = Math.abs(needle.vy) * 0.82;
      bounced = true;
    } else if (needle.y > maxY) {
      needle.y = maxY;
      needle.vy = -Math.abs(needle.vy) * 0.82;
      bounced = true;
    }

    if (bounced) {
      needle.speed = Math.hypot(needle.vx, needle.vy);
      needle.angle = Math.atan2(needle.vy, needle.vx);
      if (needle.id === 'p1') {
        sound.playBoundaryTap();
      }
      this.spawnInkDroplets(needle.x, needle.y, needle.color, 3);
    }
  }

  /**
   * Samples wet ink line and checks for polygon self-intersections
   */
  private updateTrailAndSnare(needle: Needle): void {
    const trail = needle.wetTrail;
    const lastPt = trail[trail.length - 1];

    // Sample a new point every ~5px of travel
    if (!lastPt || dist(lastPt, needle) >= 5) {
      trail.push({
        x: needle.x,
        y: needle.y,
        timestamp: performance.now()
      });

      // Cap trail length to prevent runaway memory
      if (trail.length > 500) {
        trail.shift();
      }

      // Check for self-intersection closure!
      const result = detectSelfIntersection(trail);
      if (result) {
        const simplifiedLoop = simplifyPolyline(result.loopPoints, 2.5);
        const area = shoelaceArea(simplifiedLoop);

        // Minimum threshold to prevent micro-accidental loops
        if (area >= 1400) {
          const areaPct = (area / this.playableArea) * 100;

          // Bank the captured polygon
          needle.territoryPolygons.push({
            points: simplifiedLoop,
            area: area,
            timestamp: performance.now(),
            color: needle.color,
            washColor: needle.washColor,
            bleedProgress: 0
          });

          // Check if this new loop encloses any opponent's territory polygons (territory flipping!)
          const opponent = needle.id === 'p1' ? this.p2 : this.p1;
          for (let oi = opponent.territoryPolygons.length - 1; oi >= 0; oi--) {
            const oppPoly = opponent.territoryPolygons[oi];
            const oppCentroid = this.calculateCentroid(oppPoly.points);
            if (isPointInPolygon(oppCentroid, simplifiedLoop)) {
              // Inner territory flips ownership!
              opponent.territoryPolygons.splice(oi, 1);
              oppPoly.color = needle.color;
              oppPoly.washColor = needle.washColor;
              oppPoly.bleedProgress = 0;
              needle.territoryPolygons.push(oppPoly);

              this.callouts.push({
                x: oppCentroid.x,
                y: oppCentroid.y,
                text: 'TERRITORY USURPED!',
                color: needle.color,
                alpha: 1.0,
                life: 0,
                maxLife: 1.4,
                vy: -30,
                fontSize: 13
              });
            }
          }

          // Play loop closure chord!
          const areaRatio = Math.min(area / (this.playableArea * 0.25), 1.0);
          sound.playClosureChord(areaRatio);

          // Spawn capillary bleed ring & ink spatter
          this.spawnPolygonBleedEffect(simplifiedLoop, needle.color);

          // Add floating callout
          const centroid = this.calculateCentroid(simplifiedLoop);
          this.callouts.push({
            x: centroid.x,
            y: centroid.y,
            text: `+${areaPct.toFixed(1)}% SNARED`,
            color: needle.color,
            alpha: 1.0,
            life: 0,
            maxLife: 1.4,
            vy: -25,
            fontSize: 12
          });

          // Trim trail up to the intersection point
          needle.wetTrail = [
            { x: result.intersectPoint.x, y: result.intersectPoint.y, timestamp: performance.now() },
            { x: needle.x, y: needle.y, timestamp: performance.now() }
          ];
        }
      }
    }
  }

  /**
   * Thread Cutting Combat: Checks if needle severs the opponent's unclosed wet line
   */
  private checkThreadCuttingCombat(): void {
    // 1. Did P1 cut P2's line?
    if (this.p2.wetTrail.length > 3) {
      const p1Cut = checkThreadCut({ x: this.p1.x - this.p1.vx * 0.016, y: this.p1.y - this.p1.vy * 0.016 }, this.p1, this.p2.wetTrail);
      if (p1Cut.hit && p1Cut.cutPoint) {
        this.severThread(this.p1, this.p2, p1Cut.cutPoint, p1Cut.cutIndex);
      }
    }

    // 2. Did P2 cut P1's line?
    if (this.p1.wetTrail.length > 3) {
      const p2Cut = checkThreadCut({ x: this.p2.x - this.p2.vx * 0.016, y: this.p2.y - this.p2.vy * 0.016 }, this.p2, this.p1.wetTrail);
      if (p2Cut.hit && p2Cut.cutPoint) {
        this.severThread(this.p2, this.p1, p2Cut.cutPoint, p2Cut.cutIndex);
      }
    }
  }

  /**
   * Snaps victim's wet line with kinetic recoil and audio break
   */
  private severThread(attacker: Needle, victim: Needle, cutPt: Vector2D, _cutIndex: number): void {
    sound.playThreadCut();
    attacker.threadsCut++;

    // Recoil stun on victim
    victim.recoilTimer = 0.35;
    victim.vx *= 0.4;
    victim.vy *= 0.4;

    // Burst snapped string segments and ink splatter
    for (let i = 0; i < victim.wetTrail.length; i += 2) {
      const pt = victim.wetTrail[i];
      this.particles.push({
        x: pt.x,
        y: pt.y,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160,
        radius: 2 + Math.random() * 2,
        color: victim.color,
        alpha: 0.9,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.3,
        type: 'snap_string'
      });
    }

    // Wipe unclosed wet trail!
    victim.wetTrail = [{ x: victim.x, y: victim.y, timestamp: performance.now() }];

    // Floating callout
    this.callouts.push({
      x: cutPt.x,
      y: cutPt.y,
      text: 'THREAD SEVERED!',
      color: '#A83224',
      alpha: 1.0,
      life: 0,
      maxLife: 1.2,
      vy: -35,
      fontSize: 13
    });
  }

  /**
   * Computes live territory percentage bar (P1 vs P2 vs Neutral)
   */
  private updateTerritoryCalculations(): void {
    let p1Area = 0;
    for (const poly of this.p1.territoryPolygons) {
      p1Area += poly.area;
    }

    let p2Area = 0;
    for (const poly of this.p2.territoryPolygons) {
      p2Area += poly.area;
    }

    this.p1.totalArea = p1Area;
    this.p2.totalArea = p2Area;

    this.p1.areaPercentage = Math.min(100, (p1Area / this.playableArea) * 100);
    this.p2.areaPercentage = Math.min(100, (p2Area / this.playableArea) * 100);
  }

  private resolveMatchEnd(): void {
    this.isMatchOver = true;
    if (this.p1.areaPercentage > this.p2.areaPercentage) {
      this.winner = 'p1';
      sound.playVictoryFanfare();
    } else if (this.p2.areaPercentage > this.p1.areaPercentage) {
      this.winner = 'p2';
    } else {
      this.winner = 'draw';
    }

    const stats: MatchStats = {
      matchDuration: this.matchDuration,
      p1AreaPercentage: this.p1.areaPercentage,
      p2AreaPercentage: this.p2.areaPercentage,
      p1Slingshots: this.p1.slingshotsFired,
      p2Slingshots: this.p2.slingshotsFired,
      p1Cuts: this.p1.threadsCut,
      p2Cuts: this.p2.threadsCut,
      p1MaxSpeed: this.p1MaxSpeed,
      p2MaxSpeed: this.p2MaxSpeed,
      winner: this.winner
    };

    this.onMatchEnd?.(stats);
  }

  private getNearestAnchorWithinRange(needle: Needle): Anchor | null {
    let nearest: Anchor | null = null;
    let minDist = Infinity;

    for (const anchor of this.anchors) {
      const d = dist(needle, anchor);
      if (d <= anchor.tetherRadius && d < minDist) {
        minDist = d;
        nearest = anchor;
      }
    }
    return nearest;
  }

  private spawnSlingshotParticles(x: number, y: number, angle: number, color: string): void {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const speed = 80 + Math.random() * 180;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        radius: 1.5 + Math.random() * 2,
        color: color,
        alpha: 0.8,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.25,
        type: 'spatter'
      });
    }
  }

  private spawnPolygonBleedEffect(poly: Vector2D[], color: string): void {
    // Spawn expanding rings at vertices
    for (let i = 0; i < poly.length; i += 3) {
      const pt = poly[i];
      this.particles.push({
        x: pt.x,
        y: pt.y,
        vx: 0,
        vy: 0,
        radius: 6,
        color: color,
        alpha: 0.7,
        life: 0,
        maxLife: 0.8,
        type: 'ring'
      });
    }
  }

  private spawnInkDroplets(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 70,
        vy: (Math.random() - 0.5) * 70,
        radius: 1.2 + Math.random() * 1.5,
        color: color,
        alpha: 0.7,
        life: 0,
        maxLife: 0.5,
        type: 'droplet'
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;

      if (p.type === 'ring') {
        p.radius += 28 * dt;
      }
      p.alpha = (1 - p.life / p.maxLife);
    }
  }

  private updatePolygonsBleed(dt: number): void {
    for (const poly of this.p1.territoryPolygons) {
      if (poly.bleedProgress < 1.0) {
        poly.bleedProgress = Math.min(1.0, poly.bleedProgress + dt * 1.8);
      }
    }
    for (const poly of this.p2.territoryPolygons) {
      if (poly.bleedProgress < 1.0) {
        poly.bleedProgress = Math.min(1.0, poly.bleedProgress + dt * 1.8);
      }
    }
  }

  private updateCallouts(dt: number): void {
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.life += dt;
      if (c.life >= c.maxLife) {
        this.callouts.splice(i, 1);
        continue;
      }
      c.y += c.vy * dt;
      c.alpha = 1 - Math.pow(c.life / c.maxLife, 2);
    }
  }

  private calculateCentroid(points: Vector2D[]): Vector2D {
    let cx = 0, cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    const len = points.length || 1;
    return { x: cx / len, y: cy / len };
  }

  /**
   * Multiplayer remote packet smoothing
   */
  public receiveRemoteState(packet: RemotePlayerPacket): void {
    this.remoteStateBuffer.push({ packet, receivedAt: performance.now() });
    if (this.remoteStateBuffer.length > 5) {
      this.remoteStateBuffer.shift();
    }

    // Direct update of captured polygons if provided
    if (packet.capturedPolygons && packet.capturedPolygons.length > this.p2.territoryPolygons.length) {
      for (let i = this.p2.territoryPolygons.length; i < packet.capturedPolygons.length; i++) {
        const poly = packet.capturedPolygons[i];
        this.p2.territoryPolygons.push({
          points: poly.points,
          area: poly.area,
          timestamp: performance.now(),
          color: this.p2.color,
          washColor: this.p2.washColor,
          bleedProgress: 0
        });
        sound.playClosureChord(Math.min(poly.area / (this.playableArea * 0.25), 1));
      }
    }
  }

  private updateRemotePlayerSmoothing(dt: number): void {
    if (this.remoteStateBuffer.length === 0) return;
    const latest = this.remoteStateBuffer[this.remoteStateBuffer.length - 1].packet;

    // Hermite / Lerp smoothing
    const target: Vector2D = { x: latest.x, y: latest.y };
    const curr: Vector2D = { x: this.p2.x, y: this.p2.y };
    const targetVel: Vector2D = { x: latest.vx, y: latest.vy };
    const currVel: Vector2D = { x: this.p2.vx, y: this.p2.vy };

    const smoothed = hermiteInterpolate(curr, currVel, target, targetVel, Math.min(dt * 12, 1));
    this.p2.x = smoothed.x;
    this.p2.y = smoothed.y;
    this.p2.vx = latest.vx;
    this.p2.vy = latest.vy;
    this.p2.angle = latest.angle;
    this.p2.speed = Math.hypot(latest.vx, latest.vy);
    this.p2.isTethered = latest.isTethered;
    this.p2.tetherAnchorId = latest.tetherAnchorId;

    if (latest.trailPoints) {
      this.p2.wetTrail = latest.trailPoints.map(p => ({ x: p.x, y: p.y, timestamp: performance.now() }));
    }
  }

  public getLocalPlayerPacket(): RemotePlayerPacket {
    return {
      x: this.p1.x,
      y: this.p1.y,
      vx: this.p1.vx,
      vy: this.p1.vy,
      angle: this.p1.angle,
      isTethered: this.p1.isTethered,
      tetherAnchorId: this.p1.tetherAnchorId,
      tetherAngle: this.p1.tetherAngle,
      orbitRadius: this.p1.orbitRadius,
      trailPoints: this.p1.wetTrail.slice(-40).map(p => ({ x: p.x, y: p.y })),
      capturedPolygons: this.p1.territoryPolygons.map(p => ({ points: p.points, area: p.area })),
      timestamp: performance.now()
    };
  }
}
