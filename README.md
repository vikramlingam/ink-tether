# INK-TETHER

An open-source orbital slingshot and territorial snare duel built with HTML5 Canvas, TypeScript, and the Web Audio API.

The game runs at 60 frames per second directly in modern web browsers with zero installation and zero external assets. All graphics, drafting grids, paper textures, and audio effects are generated procedurally in code.

---

## Overview

Two drafting needles glide across an architectural cream canvas leaving wet ink lines behind them. Players hold to tether onto fixed brass anchors, build angular momentum, and release to slingshot across the paper.

Looping your wet ink line into a closed polygon banks permanent watercolor territory. If an opponent cuts through your wet line before you close it, your trail snaps and your unbanked progress is lost.

Matches run for 90 seconds. The player with the highest percentage of captured paper at the end of the round wins.

---

## Core Mechanics

### 1. Compass Needle and Inertial Drift
- Each player controls a drafting needle that glides forward with continuous momentum.
- Aerodynamic drag applies gentle deceleration while keeping minimum cruising speed.
- Hitting the arena boundary produces a dampened bounce with subtle ink ripples.

### 2. Brass Anchors and Orbital Slingshots
- 9 brass anchors are placed symmetrically across the board in normalized coordinates.
- Holding the tether input draws an elastic line to the nearest anchor within capture range (240px normalized).
- While latched:
  - The needle orbits the anchor in the direction of approach (clockwise or counter-clockwise).
  - Rotational speed accelerates based on distance and hold duration (up to 9.5 rad/s).
  - Centripetal spring elasticity pulls the needle toward a stable orbital radius.
- Releasing the input catapults the needle along its instantaneous tangent vector with an exit speed boost.

### 3. Territory Banking and Area Calculation
- As the needle travels, it records vector trail points every few pixels.
- The physics engine tests new line segments against earlier segments using 2D vector cross-products.
- When a self-intersection is detected:
  - Vertices are simplified using the Ramer-Douglas-Peucker algorithm.
  - Enclosed area is computed via the Shoelace formula:
    `Area = 0.5 * |sum(x_i * y_{i+1} - x_{i+1} * y_i)|`
  - Valid loops are banked as permanent territory filled with a 15% opacity watercolor wash and 45-degree architectural hatching lines.
  - The loop closure synthesizes a resonant pentatonic chime scaled to the polygon size.

### 4. Line Cutting Combat and Usurping
- Wet ink lines are vulnerable until closed.
- If an opponent needle crosses your unclosed wet line, the line snaps with an audio twang and visual recoil particles. Your wet trail is wiped back to your needle.
- If a player draws a loop that fully encloses an opponent polygon, ownership of that inner polygon flips to the enclosing player.

---

## Visual and Audio Direction

### Architectural Drafting Canvas
- **Paper Tone:** Warm cream vellum (`#FBF9F4`) with procedural fiber grain.
- **Grid Lines:** Dual graph guidelines (`#E4E0D5` major 100px grid, `#EFECE3` minor 20px grid) with 45-degree isometric guides.
- **Technical Markings:** Archival corner crosshairs (`+`) with dynamic coordinate readouts, millimeter graduation ticks along the perimeter, and a background compass rose.
- **Title Block:** ISO-128 technical drawing block rendered in the corner.
- **Line Boil:** A 12fps procedural micro-jitter applied to wet lines to replicate hand-drawn fountain pen strokes.

### Procedural Web Audio (0 MB Download)
All sounds are synthesized at runtime via the Web Audio API without external audio files:
- **Tether Spooling:** Mechanical ratchet clicks scaled to rotational speed.
- **Slingshot Snap:** Acoustic whip crack with pitch decay and high-frequency noise.
- **Fountain Pen Scratch:** Looped pink noise buffer through a 2800Hz bandpass filter, with gain dynamically modulated by needle velocity.
- **Loop Closure Chords:** Multi-voice pentatonic acoustic chimes with exponential decay, pitched higher for larger snared areas.
- **Thread Snap:** Snapping twang using dual detuned saw and square oscillators with a fast downward pitch dive.
- **Boundary Tap:** Muted drafting ruler tap on canvas edges.

---

## Controls

### Desktop
- **Hold Spacebar or Left Mouse Button:** Latch onto nearest anchor
- **Release:** Slingshot along tangent vector

### Mobile
- **Touch and Hold anywhere on screen:** Latch onto nearest anchor
- **Release Touch:** Slingshot along tangent vector

### Local Two-Player Mode
- **Player 1 (Blue):** Hold `Spacebar` (Desktop) or touch the left half of the screen (Mobile)
- **Player 2 (Red):** Hold `Enter` or `Up Arrow` (Desktop) or touch the right half of the screen (Mobile)

---

## Game Modes

### 1. Offline Single Player (Heuristic Bot)
Runs entirely client-side with three selectable difficulty levels:
- **Novice:** Predictable orbit durations (1.0 to 1.8 seconds); focuses on small localized loops.
- **Acrobat:** Evaluates tangent vectors toward neighboring anchors to chain slingshots across 3 or more pegs in rapid succession.
- **Predator:** Tracks the player's unclosed wet line length. When the trail exceeds 200px, it calculates intercept angles to cut your line.

### 2. Global Multiplayer (PeerJS WebRTC)
- Generates 5-letter room codes (e.g., `TETHR`) with direct shareable links (`?room=TETHR`).
- Connects players peer-to-peer using WebRTC data channels with public STUN servers.
- Syncs state packets at 25Hz using Cubic Hermite Spline interpolation for smooth remote movement even under network latency.

### 3. Local Two-Player
- Two players compete on a single screen without needing an internet connection.

---

## Project Structure

```
ink-tether/
├── index.html           # Main HTML document and layout
├── package.json         # Dependencies and project metadata
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite bundler configuration
├── LICENSE              # MIT License
└── src/
    ├── types.ts         # Data models and interfaces
    ├── math.ts          # Geometry, Shoelace area, Hermite splines, intersection tests
    ├── audio.ts         # Web Audio API sound synthesis engine
    ├── renderer.ts      # HTML5 Canvas rendering pipeline and paper aesthetics
    ├── ai.ts            # Heuristic bot logic (Novice, Acrobat, Predator)
    ├── multiplayer.ts   # WebRTC PeerJS networking and room matchmaking
    ├── game.ts          # Physics, slingshot simulation, territory snaring, combat
    ├── ui.ts            # Minimalist HUD, settings drawer, and telemetry display
    ├── style.css        # Responsive styling and animations
    └── main.ts          # Application bootstrap and 60fps game loop
```

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation
```bash
git clone https://github.com/vikramlingam/ink-tether.git
cd ink-tether
npm install
```

### Local Development
```bash
npm run dev
```
Open `http://localhost:3000` in your web browser.

### Production Build
```bash
npm run build
npm run preview
```
The compiled static assets will be output to the `dist/` directory, ready for deployment on GitHub Pages, Cloudflare Pages, Vercel, or Netlify.

---

## Contributing

Contributions are welcome. If you want to contribute:
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Commit your changes: `git commit -m "Add feature"`.
4. Push to the branch: `git push origin feature/my-feature`.
5. Open a Pull Request.

Please ensure the build passes cleanly (`npm run build`) before opening a pull request.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
