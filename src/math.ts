import { Vector2D } from './types';

/**
 * Basic 2D vector utilities
 */
export function dist(a: Vector2D, b: Vector2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distSq(a: Vector2D, b: Vector2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/**
 * Checks if line segments AB and CD intersect.
 * Returns intersection point or null.
 */
export function lineSegmentIntersection(
  a: Vector2D,
  b: Vector2D,
  c: Vector2D,
  d: Vector2D
): Vector2D | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;

  const rxs = cross(rx, ry, sx, sy);
  const qpx = c.x - a.x;
  const qpy = c.y - a.y;
  const qpxr = cross(qpx, qpy, rx, ry);

  // Collinear or parallel
  if (Math.abs(rxs) < 1e-7) {
    return null;
  }

  const t = cross(qpx, qpy, sx, sy) / rxs;
  const u = qpxr / rxs;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: a.x + t * rx,
      y: a.y + t * ry
    };
  }

  return null;
}

/**
 * Checks for a self-intersection on the latest step of the wet trail.
 * Skips the latest few points to prevent false self-collisions during tight turns.
 */
export interface SelfIntersectionResult {
  intersectPoint: Vector2D;
  segmentIndex: number;
  loopPoints: Vector2D[];
}

export function detectSelfIntersection(
  trail: { x: number; y: number }[]
): SelfIntersectionResult | null {
  const len = trail.length;
  if (len < 6) return null;

  const pNew1 = trail[len - 2];
  const pNew2 = trail[len - 1];

  // Compare newest segment against all older segments
  // Skip last 4 segments to ignore immediate neighbor curvature
  for (let i = 0; i < len - 5; i++) {
    const pOld1 = trail[i];
    const pOld2 = trail[i + 1];

    const inter = lineSegmentIntersection(pNew1, pNew2, pOld1, pOld2);
    if (inter) {
      // Loop is from intersection, through points i+1 up to len-2, and back to intersection
      const loop: Vector2D[] = [inter];
      for (let k = i + 1; k < len - 1; k++) {
        loop.push({ x: trail[k].x, y: trail[k].y });
      }
      loop.push(inter);

      return {
        intersectPoint: inter,
        segmentIndex: i,
        loopPoints: loop
      };
    }
  }

  return null;
}

/**
 * Calculates polygon area using the Shoelace (Gauss) formula.
 */
export function shoelaceArea(points: Vector2D[]): number {
  const n = points.length;
  if (n < 3) return 0;

  let sum1 = 0;
  let sum2 = 0;

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    sum1 += points[i].x * points[next].y;
    sum2 += points[next].x * points[i].y;
  }

  return Math.abs(sum1 - sum2) * 0.5;
}

/**
 * Checks if a point is inside a polygon using ray casting (even-odd rule).
 */
export function isPointInPolygon(point: Vector2D, poly: Vector2D[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;

    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if a movement segment (from -> to) intersects any segment of a wet trail.
 * Used for thread cutting combat!
 */
export function checkThreadCut(
  needlePrev: Vector2D,
  needleCurr: Vector2D,
  targetTrail: { x: number; y: number }[]
): { hit: boolean; cutIndex: number; cutPoint: Vector2D | null } {
  const len = targetTrail.length;
  if (len < 2) return { hit: false, cutIndex: -1, cutPoint: null };

  for (let i = 0; i < len - 1; i++) {
    const t1 = targetTrail[i];
    const t2 = targetTrail[i + 1];

    const inter = lineSegmentIntersection(needlePrev, needleCurr, t1, t2);
    if (inter) {
      return { hit: true, cutIndex: i, cutPoint: inter };
    }
  }

  // Also check if needle's current position is within touching distance of any trail point
  for (let i = 0; i < len; i++) {
    const d = distSq(needleCurr, targetTrail[i]);
    if (d < 14 * 14) { // 14px needle collision circle
      return { hit: true, cutIndex: i, cutPoint: targetTrail[i] };
    }
  }

  return { hit: false, cutIndex: -1, cutPoint: null };
}

/**
 * Cubic Hermite Spline for ultra-smooth remote multiplayer movement
 */
export function hermiteInterpolate(
  p0: Vector2D,
  v0: Vector2D,
  p1: Vector2D,
  v1: Vector2D,
  t: number
): Vector2D {
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return {
    x: h00 * p0.x + h10 * v0.x + h01 * p1.x + h11 * v1.x,
    y: h00 * p0.y + h10 * v0.y + h01 * p1.y + h11 * v1.y
  };
}

/**
 * Simplifies a polyline using the Ramer-Douglas-Peucker algorithm.
 */
export function simplifyPolyline(points: Vector2D[], tolerance: number = 3.5): Vector2D[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }

  if (maxDist > tolerance) {
    const recResults1 = simplifyPolyline(points.slice(0, index + 1), tolerance);
    const recResults2 = simplifyPolyline(points.slice(index), tolerance);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [points[0], points[end]];
  }
}

function perpendicularDistance(p: Vector2D, a: Vector2D, b: Vector2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag < 1e-6) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / mag;
}
