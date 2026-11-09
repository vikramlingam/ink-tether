# INK-TETHER
### *An Orbital Slingshot & Territorial Snare Duel*

A production-ready, lightweight, and deeply addictive multiplayer web duel built in the tactile, minimalist **"pen-on-notebook paper"** drafting aesthetic of *ink-drift*. Runs at a locked 60fps across desktop and mobile browsers with zero external assets (0 MB asset download, 100% procedural graphics and Web Audio API synthesis).

---

## 📐 1. Architectural Drafting Aesthetic & Visuals

- **The Arena Canvas:**
  - Off-white / warm cream drafting paper (`#FBF9F4`) with organic cotton vellum tooth.
  - Subtle faint isometric and orthogonal graph grid guidelines (`#E8E5DC`).
  - Archival corner crosshairs (`+`) with dynamic coordinate annotations (`000 / 000`, `W / H`).
  - Perimeter millimeter graduation ticks (5mm and 10mm technical graduation lines).
  - Concentric architectural compass rose watermark in background.
  - Authentic ISO-128 technical drawing title block in bottom corner.
- **Ink Palette:**
  - **Player 1 (Local):** Deep archival ballpoint blue (`#1A365D` / `#0F2942`).
  - **Player 2 / AI:** Warm terracotta / crimson archival ink (`#C85A32` / `#A83224`).
  - **Neutral Anchors:** Brass / metallic pivot rings (`#B89758` / `#8C733E`) with central pivot pin and knurled perimeter notches.
  - **Captured Territory:** Translucent watercolor ink wash fill (15% opacity tint of player's ink) with 45° drafting cross-hatching and capillary bleed expansion.
  - **Wet Trailing Line:** Crisp solid 2.5px ink stroke with a subtle 12fps line-boil jitter simulating authentic fountain pen ink delivery on textured paper.
- **Mobile UI & Responsive Immersion:**
  - **Zero Viewport Clutter:** On mobile touchscreens, all secondary UI (Room codes, AI Difficulty selector, Sound controls, Live telemetry, Drafting manual) is tucked into a minimalist hamburger menu drawer in the top-right corner.
  - **Minimal HUD:** Only a hairline timer (90s countdown) and a live territory control percentage bar (`P1: 52% | P2: 48%`) at the top center.
  - Fullscreen dynamic canvas scaling with devicePixelRatio awareness and `touch-action: none`.

---

## 🎯 2. Core Game Loop & Kinetic Slingshot Mechanics

### The Needle & Inertial Drift
Each player controls a precision drafting compass point that constantly glides across the paper with momentum and aerodynamic drag ($v \leftarrow v \times 0.992$).

- **Controls:**
  - **Desktop:** Hold `SPACEBAR` or `LEFT MOUSE CLICK` anywhere to latch tether; release to slingshot.
  - **Mobile:** `TOUCH & HOLD` anywhere on the screen to latch tether; release touch to slingshot.
  - **Local 2-Player (Split Controls):** Player 1 (`SPACEBAR` / Left Half of Screen), Player 2 (`ENTER` / `UP ARROW` / Right Half of Screen).

### Brass Anchors & Orbital Mechanics
- 9 fixed brass anchors are strategically positioned across the arena in normalized coordinates.
- Holding the tether action draws an elastic guideline to the nearest brass anchor within capture range ($R \approx 240\text{px}$).
- While latched:
  - The needle enters an orbital angular trajectory ($v = \omega \cdot r$).
  - Rotational speed accelerates based on distance to anchor and spool time ($\omega_{\max} = 9.5\text{ rad/s}$).
  - Centripetal spring elasticity gently stabilizes the orbit.
- On release:
  - The needle catapults forward along its instantaneous tangent vector at high exit velocity!
  - Slingshot boost multiplies speed with directional ink spray particles.

### Territory Snare & Polygon Closure
- Leaves behind an active "Wet Ink Trail".
- Detects self-intersections using vector segment intersection tests.
- When a closed polygon loop is formed:
  - Enclosed area is computed via the **Shoelace formula** ($\text{Area} = \frac{1}{2} |\sum (x_i y_{i+1} - x_{i+1} y_i)|$).
  - Flashes perimeter with an ink-bleed pulse, fills polygon with translucent watercolor wash, and renders 45° architectural hatching.
  - Synthesizes a warm pentatonic acoustic chime scaling higher in pitch with larger captured areas.
  - Polygons inside an opponent's larger loop flip ownership!

### Thread Cutting & High-Stakes Combat
- While a player's line is unclosed ("Wet"), it is vulnerable.
- If an opponent's needle crosses an unclosed wet line, the wet trail **snaps** like a guitar string (with a dramatic visual break effect, snapped string particles, audio break twang, and kinetic recoil on the victim's needle). All unclosed progress is wiped!

---

## 🔊 3. Pure Programmatic Web Audio (0 MB Download)

Zero external audio files; all sounds are synthesized mathematically in code via the Web Audio API:
1. **Tether Spooling:** Mechanical ratchet whir with frequency scaled to orbital angular speed.
2. **Slingshot Snap:** Crisp acoustic whip-release sound with noise burst and pitch sweep.
3. **Fountain Pen Scratch:** Pink noise generator passed through a 2800Hz bandpass filter, with gain dynamically modulated by needle velocity (authentic nib friction on cotton paper).
4. **Loop Closure Chords:** Resonant pentatonic acoustic chimes (sine + triangle harmonics) scaling upward in pitch tiers for larger territory captures.
5. **Thread Snap:** Snappy twang string break on cutting an opponent's line using dual detuned saw/square oscillators with steep frequency dive.
6. **Boundary Tap:** Delicate muted drafting ruler tap.

---

## 🤖 4. Game Modes

### A. Single Player Offline Mode (Intelligent Heuristic AI)
Runs 100% client-side with 3 selectable difficulty levels:
- **Novice:** Predictable slingshot intervals (1.0 - 1.8s); focuses on small localized territory loops.
- **Acrobat:** Chains continuous high-speed slingshots across 3+ pegs; evaluates tangent alignment vectors toward subsequent anchors to slingshot directly into multi-peg orbital chains.
- **Predator:** Actively monitors player's unclosed wet line length; when length exceeds 200px, calculates intercept slingshot vectors to cut the thread and erase progress!

### B. Global Multiplayer via Room Codes (PeerJS WebRTC)
- 5-letter room codes (e.g. `TETHR`) with 1-click shareable URLs (`?room=TETHR`).
- Instant peer-to-peer WebRTC DataChannels connecting players without accounts or installs.
- 25Hz compact state packet exchange with **Cubic Hermite Spline interpolation** for smooth movement even across 150ms cross-continental ping.

### C. Local 2-Player Duel
- Play with a friend on the same device!
- Desktop: P1 (`SPACEBAR`), P2 (`ENTER` / `UP ARROW`).
- Mobile / Tablet: Left half of screen touches control P1, right half touches control P2.

---

## 🚀 5. Development & Running

### Install Dependencies
```bash
npm install
```

### Start Local Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

---

## 📦 Zero Asset Dependencies
- All graphics, paper textures, compass roses, rulers, and title blocks are rendered procedurally on HTML5 Canvas.
- All sound effects and ambient paper friction are generated via the Web Audio API.
- 0 MB external downloads; runs instantaneously on any modern browser.
