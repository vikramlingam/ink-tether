import './style.css';
import { GameEngine } from './game';
import { CanvasRenderer } from './renderer';
import { NetworkManager } from './multiplayer';
import { UIManager } from './ui';
import { sound } from './audio';
import { HostSyncPacket, RemotePlayerPacket } from './types';

function initApp(): void {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const renderer = new CanvasRenderer(canvas);
  const game = new GameEngine();

  // WebRTC Network Manager
  let network!: NetworkManager;
  let ui!: UIManager;

  network = new NetworkManager({
    onStatusChange: (status, message) => {
      ui.updateNetworkStatus(status, message);
    },
    onRemoteStateReceived: (packet: RemotePlayerPacket) => {
      game.receiveRemoteState(packet);
    },
    onHostSyncReceived: (sync: HostSyncPacket) => {
      game.timeRemaining = sync.timeRemaining;
      game.receiveRemoteState(sync.p1);
    },
    onPlayerJoined: () => {
      ui.showToast('Opponent connected! Duel starting!');
      game.resetMatch();
    },
    onPlayerDisconnected: () => {
      ui.showToast('Opponent disconnected.');
    },
    onPingUpdate: (pingMs: number) => {
      ui.updatePing(pingMs);
    }
  });

  ui = new UIManager(game, network);

  // Wire Game callbacks to UI
  game.onStateUpdate = (timeRemaining, p1Pct, p2Pct) => {
    ui.updateHUD(timeRemaining, p1Pct, p2Pct);
  };

  game.onMatchEnd = (stats) => {
    ui.showGameOverModal(stats);
  };

  // Handle Window Resizing
  const handleResize = () => {
    renderer.updateDimensions();
    game.initArena(renderer.getWidth(), renderer.getHeight());
  };
  window.addEventListener('resize', handleResize);
  handleResize();

  // Input Handling: Desktop (Spacebar, Mouse Click/Hold) & Mobile (Touch & Hold anywhere)
  let activeTouches = new Map<number, { x: number; y: number }>();

  // 1. Keyboard Controls
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    sound.resume();

    // Prevent default scrolling on game control keys
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
      e.preventDefault();
    }

    if (e.code === 'Space') {
      game.p1InputHeld = true;
    }

    // Local 2-Player keyboard controls
    if (game.mode === 'local2p') {
      if (e.code === 'Enter' || e.code === 'ArrowUp') {
        game.p2InputHeld = true;
      }
    }
  });

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      game.p1InputHeld = false;
    }
    if (game.mode === 'local2p') {
      if (e.code === 'Enter' || e.code === 'ArrowUp') {
        game.p2InputHeld = false;
      }
    }
  });

  // 2. Mouse Controls (Hold anywhere on canvas to tether, release to slingshot)
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    sound.resume();
    // Only process primary left click
    if (e.button === 0) {
      if (game.mode === 'local2p') {
        // In local 2P split screen: left half = P1, right half = P2
        if (e.clientX < window.innerWidth * 0.5) {
          game.p1InputHeld = true;
        } else {
          game.p2InputHeld = true;
        }
      } else {
        game.p1InputHeld = true;
      }
    }
  });

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 0) {
      if (game.mode === 'local2p') {
        if (e.clientX < window.innerWidth * 0.5) {
          game.p1InputHeld = false;
        } else {
          game.p2InputHeld = false;
        }
      } else {
        game.p1InputHeld = false;
      }
    }
  });

  // 3. Mobile Touch Controls (Hold anywhere on screen to tether, release to slingshot)
  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    sound.resume();
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      activeTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });

      if (game.mode === 'local2p') {
        if (touch.clientX < window.innerWidth * 0.5) {
          game.p1InputHeld = true;
        } else {
          game.p2InputHeld = true;
        }
      } else {
        game.p1InputHeld = true;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      activeTouches.delete(touch.identifier);

      if (game.mode === 'local2p') {
        if (touch.clientX < window.innerWidth * 0.5) {
          game.p1InputHeld = false;
        } else {
          game.p2InputHeld = false;
        }
      } else {
        if (activeTouches.size === 0) {
          game.p1InputHeld = false;
        }
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchcancel', (e: TouchEvent) => {
    e.preventDefault();
    activeTouches.clear();
    game.p1InputHeld = false;
    game.p2InputHeld = false;
  }, { passive: false });

  // Prevent right click menu on canvas
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Network State Transmission Loop (25 times per second = 40ms)
  let lastNetworkSync = 0;
  const networkSyncInterval = 40; // 25 Hz

  // 60fps Main Game Loop
  let lastFrameTime = performance.now();

  function gameLoop(now: number): void {
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // 1. Update Game Physics & Simulation
    game.update(dt);

    // 2. Render Frame
    renderer.render(
      now,
      game.anchors,
      game.p1,
      game.p2,
      game.particles,
      game.callouts
    );

    // 3. Transmit Multiplayer Network Packets
    if (game.mode === 'multiplayer' && network.status === 'connected') {
      if (now - lastNetworkSync >= networkSyncInterval) {
        lastNetworkSync = now;
        const localPacket = game.getLocalPlayerPacket();

        if (network.isHost) {
          network.sendHostSync({
            type: 'sync',
            timeRemaining: game.timeRemaining,
            p1: localPacket,
            p1AreaPct: game.p1.areaPercentage,
            p2AreaPct: game.p2.areaPercentage
          });
        } else {
          network.sendState(localPacket);
        }
      }
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

