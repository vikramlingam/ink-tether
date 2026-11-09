import { Needle, Anchor, AIDifficulty, Vector2D } from './types';
import { dist } from './math';

export class BotAI {
  public difficulty: AIDifficulty = 'acrobat';
  private stateTimer: number = 0;
  private tetherHoldTarget: number = 0.8;
  public comboChainCount: number = 0;

  // Prevent immediately re-latching to the peg the bot just slingshotted away from
  private lastAnchorId: number | null = null;
  private anchorCooldown: number = 0;

  constructor(difficulty: AIDifficulty = 'acrobat') {
    this.difficulty = difficulty;
  }

  public setDifficulty(diff: AIDifficulty): void {
    this.difficulty = diff;
    this.stateTimer = 0;
    this.comboChainCount = 0;
    this.lastAnchorId = null;
    this.anchorCooldown = 0;
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
    if (this.anchorCooldown > 0) {
      this.anchorCooldown -= dt;
    }

    // Keep track of current tethered anchor
    if (bot.isTethered && bot.tetherAnchorId !== null) {
      this.lastAnchorId = bot.tetherAnchorId;
    }

    let wantsTether = false;
    switch (this.difficulty) {
      case 'novice':
        wantsTether = this.updateNovice(bot, anchors);
        break;
      case 'acrobat':
        wantsTether = this.updateAcrobat(bot, anchors);
        break;
      case 'predator':
        wantsTether = this.updatePredator(bot, player, anchors, arenaWidth);
        break;
      default:
        wantsTether = this.updateNovice(bot, anchors);
        break;
    }

    // If bot was tethered and now decided to release, initiate cooldown on that anchor
    if (bot.isTethered && !wantsTether) {
      this.anchorCooldown = 1.1; // Cannot re-latch to this same anchor for 1.1 seconds
    }

    return wantsTether;
  }

  /**
   * Novice: rhythmically slingshots after short orbits
   */
  private updateNovice(bot: Needle, anchors: Anchor[]): boolean {
    if (bot.isTethered) {
      if (bot.tetherHoldDuration >= this.tetherHoldTarget) {
        this.stateTimer = 0;
        this.tetherHoldTarget = 0.5 + Math.random() * 0.5;
        return false;
      }
      return true;
    } else {
      // Find candidate anchors excluding the one we just left
      const candidates = anchors.filter(a => {
        if (a.id === this.lastAnchorId && this.anchorCooldown > 0) return false;
        return dist(bot, a) < a.tetherRadius * 0.90;
      });

      if (candidates.length > 0 && this.stateTimer > 0.3) {
        this.stateTimer = 0;
        return true;
      }
      return false;
    }
  }

  /**
   * Acrobat: chains high-speed slingshots across multiple anchors
   */
  private updateAcrobat(bot: Needle, anchors: Anchor[]): boolean {
    if (bot.isTethered) {
      const currentAnchor = anchors.find(a => a.id === bot.tetherAnchorId);
      if (!currentAnchor) {
        return false;
      }

      // Allow 0.35s to build centrifugal speed
      if (bot.tetherHoldDuration > 0.35) {
        const tangentAngle = bot.angle;
        const tangentX = Math.cos(tangentAngle);
        const tangentY = Math.sin(tangentAngle);

        // Check if tangent points toward another anchor to chain into
        for (const candidate of anchors) {
          if (candidate.id === currentAnchor.id) continue;

          const toCandX = candidate.x - bot.x;
          const toCandY = candidate.y - bot.y;
          const candDist = Math.sqrt(toCandX * toCandX + toCandY * toCandY);
          if (candDist < 60 || candDist > 800) continue;

          const dot = (tangentX * toCandX + tangentY * toCandY) / candDist;
          // Generous alignment cone (~38 degrees)
          if (dot > 0.78) {
            this.comboChainCount++;
            return false; // Slingshot toward next peg!
          }
        }

        // Failsafe: never spin for more than 1.1s on any single peg
        if (bot.tetherHoldDuration > 1.1) {
          return false;
        }
      }

      return true;
    } else {
      // In flight: search for new anchors (skipping the one we just released)
      const candidates = anchors.filter(a => {
        if (a.id === this.lastAnchorId && this.anchorCooldown > 0) return false;
        return dist(bot, a) < a.tetherRadius * 0.92;
      });

      return candidates.length > 0;
    }
  }

  /**
   * Predator: actively monitors player's unclosed wet line to cut it, otherwise snares territory
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
        return false;
      }

      // If player is vulnerable, search for intercept angle to sever their thread
      if (isPlayerVulnerable && bot.tetherHoldDuration > 0.3) {
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
            if (dot > 0.88) {
              return false; // Catapult to cut player's thread!
            }
          }
        }
      }

      // Close own polygon if loop is available
      if (bot.tetherHoldDuration > 0.45 && bot.wetTrail.length > 8) {
        const startPt = bot.wetTrail[0];
        const tangentAngle = bot.angle;
        const toStartX = startPt.x - bot.x;
        const toStartY = startPt.y - bot.y;
        const dStart = Math.sqrt(toStartX * toStartX + toStartY * toStartY);
        const dot = (Math.cos(tangentAngle) * toStartX + Math.sin(tangentAngle) * toStartY) / Math.max(dStart, 1);
        if (dot > 0.82 && dStart < 400) {
          return false; // Slingshot to complete loop!
        }
      }

      // Slingshot toward another anchor
      if (bot.tetherHoldDuration > 0.5) {
        const tangentAngle = bot.angle;
        const tangentX = Math.cos(tangentAngle);
        const tangentY = Math.sin(tangentAngle);

        for (const candidate of anchors) {
          if (candidate.id === currentAnchor.id) continue;
          const toCandX = candidate.x - bot.x;
          const toCandY = candidate.y - bot.y;
          const candDist = Math.sqrt(toCandX * toCandX + toCandY * toCandY);
          if (candDist < 60 || candDist > 800) continue;

          const dot = (tangentX * toCandX + tangentY * toCandY) / candDist;
          if (dot > 0.82) {
            return false;
          }
        }
      }

      // Failsafe: max 1.0s orbit
      if (bot.tetherHoldDuration > 1.0) {
        return false;
      }

      return true;
    } else {
      // In flight: look for anchors excluding the one we just left
      const candidates = anchors.filter(a => {
        if (a.id === this.lastAnchorId && this.anchorCooldown > 0) return false;
        return dist(bot, a) < a.tetherRadius * 0.92;
      });

      return candidates.length > 0;
    }
  }

  private calculateTrailLength(trail: Vector2D[]): number {
    let len = 0;
    for (let i = 0; i < trail.length - 1; i++) {
      len += dist(trail[i], trail[i + 1]);
    }
    return len;
  }

  private findVulnerableTrailIntercept(trail: Vector2D[]): Vector2D | null {
    if (trail.length === 0) return null;
    const midIdx = Math.floor(trail.length * 0.5);
    return trail[midIdx] || trail[0];
  }
}
