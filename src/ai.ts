import { Needle, Anchor, AIDifficulty, Vector2D } from './types';
import { dist } from './math';

export class BotAI {
  public difficulty: AIDifficulty = 'acrobat';
  private stateTimer: number = 0;
  private tetherHoldTarget: number = 1.5;
  private desireToTether: boolean = false;
  public comboChainCount: number = 0;

  constructor(difficulty: AIDifficulty = 'acrobat') {
    this.difficulty = difficulty;
  }

  public setDifficulty(diff: AIDifficulty): void {
    this.difficulty = diff;
    this.stateTimer = 0;
    this.comboChainCount = 0;
  }

  /**
   * Main AI decision step called each frame.
   * Returns whether AI wants to hold tether (true = tether hold, false = release/sling).
   */
  public update(
    dt: number,
    bot: Needle,
    player: Needle,
    anchors: Anchor[],
    arenaWidth: number,
    _arenaHeight: number
  ): boolean {
    this.stateTimer += dt;

    switch (this.difficulty) {
      case 'novice':
        return this.updateNovice(bot, anchors);
      case 'acrobat':
        return this.updateAcrobat(bot, anchors);
      case 'predator':
        return this.updatePredator(bot, player, anchors, arenaWidth);
      default:
        return this.updateNovice(bot, anchors);
    }
  }

  /**
   * Novice: simple, predictable rhythm, forms modest loops around nearest peg
   */
  private updateNovice(bot: Needle, anchors: Anchor[]): boolean {
    if (bot.isTethered) {
      // Hold tether for predictable interval, then release
      if (this.stateTimer >= this.tetherHoldTarget) {
        this.desireToTether = false;
        this.stateTimer = 0;
        this.tetherHoldTarget = 1.0 + Math.random() * 0.8;
      } else {
        this.desireToTether = true;
      }
    } else {
      // Find nearest anchor within range
      const nearest = this.getNearestAnchor(bot, anchors);
      if (nearest && nearest.dist < nearest.anchor.tetherRadius * 0.95) {
        if (this.stateTimer > 0.4) {
          this.desireToTether = true;
          this.stateTimer = 0;
        }
      }
    }
    return this.desireToTether;
  }

  /**
   * Acrobat: chains continuous high-speed slingshots across 3+ pegs!
   * Proactively targets larger territories and calculates tangent trajectories toward other anchors.
   */
  private updateAcrobat(bot: Needle, anchors: Anchor[]): boolean {
    if (bot.isTethered) {
      // Orbiting an anchor. We want at least a quarter or half orbit to build slingshot speed,
      // but release as soon as tangent vector points toward another high-value peg!
      const currentAnchor = anchors.find(a => a.id === bot.tetherAnchorId);
      if (!currentAnchor) {
        this.desireToTether = false;
        return false;
      }

      // Minimum orbit time to build centrifugal whip (0.45s)
      if (bot.tetherHoldDuration > 0.45) {
        // Calculate current tangent velocity direction
        const tangentAngle = bot.angle; // facing direction is tangent
        const tangentX = Math.cos(tangentAngle);
        const tangentY = Math.sin(tangentAngle);

        // Find candidate target anchors in the direction of the tangent
        for (const candidate of anchors) {
          if (candidate.id === currentAnchor.id) continue;

          const toCandX = candidate.x - bot.x;
          const toCandY = candidate.y - bot.y;
          const candDist = Math.sqrt(toCandX * toCandX + toCandY * toCandY);
          if (candDist < 50 || candDist > 750) continue;

          // Normalized dot product for alignment
          const dot = (tangentX * toCandX + tangentY * toCandY) / candDist;
          // If aligned within ~25 degrees (cos > 0.90) and moving fast, slingshot into chain combo!
          if (dot > 0.90) {
            this.desireToTether = false;
            this.comboChainCount++;
            this.stateTimer = 0;
            return false;
          }
        }

        // Failsafe: don't spin indefinitely around one peg (max 2.2s)
        if (bot.tetherHoldDuration > 2.2) {
          this.desireToTether = false;
          return false;
        }
      }

      this.desireToTether = true;
    } else {
      // Free flight. Look for anchors within capture range
      const candidates = anchors.filter(a => {
        const d = dist(bot, a);
        return d < a.tetherRadius * 0.96;
      });

      if (candidates.length > 0) {
        // Pick best candidate: prefer anchors that allow continuing the loop or moving toward open space
        this.desireToTether = true;
        this.stateTimer = 0;
      } else {
        this.desireToTether = false;
      }
    }

    return this.desireToTether;
  }

  /**
   * Predator: monitors player's unclosed wet line.
   * If player wet line exceeds threshold, calculates intercept slingshot vector to sever line!
   */
  private updatePredator(
    bot: Needle,
    player: Needle,
    anchors: Anchor[],
    arenaWidth: number
  ): boolean {
    const threshold = arenaWidth <= 768 ? 140 : 200;
    const playerLineLength = this.calculateTrailLength(player.wetTrail);
    const isPlayerVulnerable = playerLineLength > threshold && player.wetTrail.length > 8;

    if (bot.isTethered) {
      const currentAnchor = anchors.find(a => a.id === bot.tetherAnchorId);
      if (!currentAnchor) {
        this.desireToTether = false;
        return false;
      }

      // If player is vulnerable, search for intercept angle to cut their thread!
      if (isPlayerVulnerable && bot.tetherHoldDuration > 0.35) {
        const targetPt = this.findVulnerableTrailIntercept(player.wetTrail);
        if (targetPt) {
          const tangentAngle = bot.angle;
          const tangentX = Math.cos(tangentAngle);
          const tangentY = Math.sin(tangentAngle);

          const toTargetX = targetPt.x - bot.x;
          const toTargetY = targetPt.y - bot.y;
          const dTarget = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);

          if (dTarget > 20) {
            const dot = (tangentX * toTargetX + tangentY * toTargetY) / dTarget;
            // High alignment with victim's thread -> CUT!
            if (dot > 0.94) {
              this.desireToTether = false;
              return false;
            }
          }
        }
      }

      // If not hunting or already spun enough, attempt to close own loop or chain
      if (bot.tetherHoldDuration > 0.6) {
        // Check if releasing now closes own polygon!
        if (bot.wetTrail.length > 10) {
          const startPt = bot.wetTrail[0];
          const tangentAngle = bot.angle;
          const toStartX = startPt.x - bot.x;
          const toStartY = startPt.y - bot.y;
          const dStart = Math.sqrt(toStartX * toStartX + toStartY * toStartY);
          const dot = (Math.cos(tangentAngle) * toStartX + Math.sin(tangentAngle) * toStartY) / Math.max(dStart, 1);
          if (dot > 0.88 && dStart < 350) {
            // High probability of closing a massive snare!
            this.desireToTether = false;
            return false;
          }
        }

        // Check if tangent points toward another peg for chain
        if (bot.tetherHoldDuration > 1.4) {
          this.desireToTether = false;
          return false;
        }
      }

      this.desireToTether = true;
    } else {
      // In flight: if player is vulnerable and close, continue flying toward target!
      const nearest = this.getNearestAnchor(bot, anchors);
      if (nearest && nearest.dist < nearest.anchor.tetherRadius * 0.95) {
        // Tether to build speed or turn
        this.desireToTether = true;
      } else {
        this.desireToTether = false;
      }
    }

    return this.desireToTether;
  }

  private getNearestAnchor(
    pt: Vector2D,
    anchors: Anchor[]
  ): { anchor: Anchor; dist: number } | null {
    if (anchors.length === 0) return null;
    let best = anchors[0];
    let minDist = dist(pt, best);

    for (let i = 1; i < anchors.length; i++) {
      const d = dist(pt, anchors[i]);
      if (d < minDist) {
        minDist = d;
        best = anchors[i];
      }
    }
    return { anchor: best, dist: minDist };
  }

  private calculateTrailLength(trail: Vector2D[]): number {
    let len = 0;
    for (let i = 0; i < trail.length - 1; i++) {
      len += dist(trail[i], trail[i + 1]);
    }
    return len;
  }

  /**
   * Finds the best segment or midpoint of the player's wet trail to target
   */
  private findVulnerableTrailIntercept(trail: Vector2D[]): Vector2D | null {
    if (trail.length === 0) return null;
    // Prefer the middle 50% of the trail (hardest for player to quickly recover)
    const midIdx = Math.floor(trail.length * 0.5);
    return trail[midIdx] || trail[0];
  }
}
