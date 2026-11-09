export interface Vector2D {
  x: number;
  y: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface Anchor {
  id: number;
  normX: number; // 0..1 normalized arena coordinate
  normY: number; // 0..1 normalized arena coordinate
  x: number;     // rendered arena pixels
  y: number;
  radius: number;
  tetherRadius: number; // capture radius (typically ~240px normalized)
  pulse: number; // visual hover/latch wave
}

export interface Needle {
  id: 'p1' | 'p2';
  color: string;
  fillColor: string;
  washColor: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // facing orientation in radians
  speed: number;
  isTethered: boolean;
  tetherAnchorId: number | null;
  tetherAngle: number;       // current angle around anchor
  orbitRadius: number;       // distance from anchor
  angularVelocity: number;   // rad/sec
  orbitDirection: number;    // +1 (CW) or -1 (CCW)
  tetherHoldDuration: number; // seconds held
  wetTrail: TrailPoint[];
  territoryPolygons: CapturedPolygon[];
  totalArea: number;         // in sq pixels
  areaPercentage: number;    // 0..100%
  score: number;
  slingshotsFired: number;
  threadsCut: number;
  recoilTimer: number;       // stun/shake time after being cut
}

export interface CapturedPolygon {
  points: Vector2D[];
  area: number;
  timestamp: number;
  color: string;
  washColor: string;
  bleedProgress: number; // 0..1 for initial ink-bleed expansion animation
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  type: 'droplet' | 'snap_string' | 'spatter' | 'ring' | 'hatch';
}

export interface FloatingCallout {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  vy: number;
  fontSize: number;
}

export type GameMode = 'ai' | 'multiplayer' | 'local2p';
export type AIDifficulty = 'novice' | 'acrobat' | 'predator';

export interface MatchStats {
  matchDuration: number;
  p1AreaPercentage: number;
  p2AreaPercentage: number;
  p1Slingshots: number;
  p2Slingshots: number;
  p1Cuts: number;
  p2Cuts: number;
  p1MaxSpeed: number;
  p2MaxSpeed: number;
  winner: 'p1' | 'p2' | 'draw' | null;
}

export interface RemotePlayerPacket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  isTethered: boolean;
  tetherAnchorId: number | null;
  tetherAngle: number;
  orbitRadius: number;
  trailPoints: Vector2D[];
  capturedPolygons: { points: Vector2D[]; area: number }[];
  timestamp: number;
}

export interface HostSyncPacket {
  type: 'sync';
  timeRemaining: number;
  p1: RemotePlayerPacket;
  p2?: RemotePlayerPacket;
  p1AreaPct: number;
  p2AreaPct: number;
}

export interface ClientInputPacket {
  type: 'input';
  p2: RemotePlayerPacket;
}
