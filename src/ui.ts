import { AIDifficulty, GameMode, MatchStats } from './types';
import { GameEngine } from './game';
import { NetworkManager } from './multiplayer';
import { sound } from './audio';

export class UIManager {
  private game: GameEngine;
  private network: NetworkManager;

  // DOM Elements
  private timerText: HTMLElement;
  private p1LabelText: HTMLElement;
  private p2LabelText: HTMLElement;
  private p1BarFill: HTMLElement;
  private p2BarFill: HTMLElement;
  private hudTimerBadge: HTMLElement;

  private menuToggleBtn: HTMLElement;
  private menuDrawer: HTMLElement;
  private drawerOverlay: HTMLElement;
  private closeDrawerBtn: HTMLElement;

  private modeBtns: NodeListOf<HTMLButtonElement>;
  private diffBtns: NodeListOf<HTMLButtonElement>;
  private aiDiffSection: HTMLElement;
  private diffDesc: HTMLElement;
  private mpSection: HTMLElement;

  private roomCodeVal: HTMLElement;
  private copyLinkBtn: HTMLButtonElement;
  private joinInput: HTMLInputElement;
  private joinBtn: HTMLButtonElement;
  private statusDot: HTMLElement;
  private statusText: HTMLElement;
  private pingText: HTMLElement;

  private soundToggleBtn: HTMLButtonElement;
  private volumeSlider: HTMLInputElement;

  private statP1Area: HTMLElement;
  private statP2Area: HTMLElement;
  private statP1Slings: HTMLElement;
  private statCuts: HTMLElement;
  private statMaxSpeed: HTMLElement;

  private restartBtn: HTMLButtonElement;
  private modalRestartBtn: HTMLButtonElement;
  private gameOverModal: HTMLElement;
  private modalWinnerText: HTMLElement;
  private modalP1Pct: HTMLElement;
  private modalP2Pct: HTMLElement;
  private modalSlingshots: HTMLElement;
  private modalCuts: HTMLElement;
  private modalVelocity: HTMLElement;

  private toastEl: HTMLElement;
  private toastTimeout: number | null = null;

  constructor(game: GameEngine, network: NetworkManager) {
    this.game = game;
    this.network = network;

    this.timerText = document.getElementById('timer-text')!;
    this.p1LabelText = document.getElementById('p1-label-text')!;
    this.p2LabelText = document.getElementById('p2-label-text')!;
    this.p1BarFill = document.getElementById('territory-fill-p1')!;
    this.p2BarFill = document.getElementById('territory-fill-p2')!;
    this.hudTimerBadge = document.getElementById('hud-timer')!;

    this.menuToggleBtn = document.getElementById('menu-toggle-btn')!;
    this.menuDrawer = document.getElementById('menu-drawer')!;
    this.drawerOverlay = document.getElementById('drawer-overlay')!;
    this.closeDrawerBtn = document.getElementById('close-drawer-btn')!;

    this.modeBtns = document.querySelectorAll<HTMLButtonElement>('[data-mode]');
    this.diffBtns = document.querySelectorAll<HTMLButtonElement>('[data-diff]');
    this.aiDiffSection = document.getElementById('ai-difficulty-section')!;
    this.diffDesc = document.getElementById('difficulty-desc')!;
    this.mpSection = document.getElementById('multiplayer-section')!;

    this.roomCodeVal = document.getElementById('room-code-val')!;
    this.copyLinkBtn = document.getElementById('copy-room-link-btn') as HTMLButtonElement;
    this.joinInput = document.getElementById('join-room-input') as HTMLInputElement;
    this.joinBtn = document.getElementById('join-room-btn') as HTMLButtonElement;
    this.statusDot = document.getElementById('status-dot')!;
    this.statusText = document.getElementById('status-text')!;
    this.pingText = document.getElementById('ping-text')!;

    this.soundToggleBtn = document.getElementById('sound-toggle-btn') as HTMLButtonElement;
    this.volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;

    this.statP1Area = document.getElementById('stat-p1-area')!;
    this.statP2Area = document.getElementById('stat-p2-area')!;
    this.statP1Slings = document.getElementById('stat-p1-slings')!;
    this.statCuts = document.getElementById('stat-cuts')!;
    this.statMaxSpeed = document.getElementById('stat-max-speed')!;

    this.restartBtn = document.getElementById('restart-match-btn') as HTMLButtonElement;
    this.modalRestartBtn = document.getElementById('modal-restart-btn') as HTMLButtonElement;
    this.gameOverModal = document.getElementById('game-over-modal')!;
    this.modalWinnerText = document.getElementById('modal-winner-text')!;
    this.modalP1Pct = document.getElementById('modal-p1-pct')!;
    this.modalP2Pct = document.getElementById('modal-p2-pct')!;
    this.modalSlingshots = document.getElementById('modal-slingshots')!;
    this.modalCuts = document.getElementById('modal-cuts')!;
    this.modalVelocity = document.getElementById('modal-velocity')!;

    this.toastEl = document.getElementById('toast')!;

    this.bindEvents();
    this.checkUrlForRoomCode();
  }

  private bindEvents(): void {
    // Menu Drawer Toggle
    this.menuToggleBtn.addEventListener('click', () => this.toggleDrawer());
    this.closeDrawerBtn.addEventListener('click', () => this.closeDrawer());
    this.drawerOverlay.addEventListener('click', () => this.closeDrawer());

    // Mode Buttons
    this.modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as GameMode;
        this.setMode(mode);
      });
    });

    // AI Difficulty Buttons
    this.diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const diff = btn.dataset.diff as AIDifficulty;
        this.setAIDifficulty(diff);
      });
    });

    // Copy Link Button
    this.copyLinkBtn.addEventListener('click', () => {
      const url = this.network.getShareableUrl();
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('Room link copied to clipboard!');
      }).catch(() => {
        this.showToast(`Room code: ${this.network.roomCode}`);
      });
    });

    // Join Room Button
    this.joinBtn.addEventListener('click', () => {
      const code = this.joinInput.value.trim().toUpperCase();
      if (code.length >= 3) {
        this.network.joinRoom(code);
        this.showToast(`Joining room ${code}...`);
      }
    });

    // Sound Controls
    this.soundToggleBtn.addEventListener('click', () => {
      sound.resume();
      const muted = sound.toggleMute();
      this.soundToggleBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
    });

    this.volumeSlider.addEventListener('input', () => {
      sound.resume();
      const vol = parseFloat(this.volumeSlider.value) / 100;
      sound.setVolume(vol);
      if (sound.getIsMuted()) {
        sound.setMuted(false);
        this.soundToggleBtn.textContent = 'SOUND: ON';
      }
    });

    // Restart Duel Buttons
    this.restartBtn.addEventListener('click', () => {
      this.game.resetMatch();
      this.closeDrawer();
      this.hideGameOverModal();
    });

    this.modalRestartBtn.addEventListener('click', () => {
      this.game.resetMatch();
      this.hideGameOverModal();
    });
  }

  public toggleDrawer(): void {
    const isOpen = this.menuDrawer.classList.contains('open');
    if (isOpen) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }

  public openDrawer(): void {
    this.menuDrawer.classList.add('open');
    this.drawerOverlay.classList.add('active');
    this.menuToggleBtn.classList.add('open');
  }

  public closeDrawer(): void {
    this.menuDrawer.classList.remove('open');
    this.drawerOverlay.classList.remove('active');
    this.menuToggleBtn.classList.remove('open');
  }

  public setMode(mode: GameMode): void {
    this.modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    this.game.setMode(mode);

    if (mode === 'ai') {
      this.aiDiffSection.style.display = 'block';
      this.mpSection.style.display = 'none';
      this.p2LabelText.textContent = 'ORANGE: 0.0%';
      this.network.cleanup();
    } else if (mode === 'multiplayer') {
      this.aiDiffSection.style.display = 'none';
      this.mpSection.style.display = 'block';
      this.p2LabelText.textContent = 'ORANGE: 0.0%';
      if (this.network.status === 'disconnected') {
        this.network.hostRoom();
      }
    } else if (mode === 'local2p') {
      this.aiDiffSection.style.display = 'none';
      this.mpSection.style.display = 'none';
      this.p2LabelText.textContent = 'ORANGE: 0.0%';
      this.network.cleanup();
    }
  }

  public setAIDifficulty(diff: AIDifficulty): void {
    this.diffBtns.forEach(b => b.classList.toggle('active', b.dataset.diff === diff));
    this.game.botAI.setDifficulty(diff);

    const descriptions: Record<AIDifficulty, string> = {
      novice: 'Novice: Predictable slingshot intervals; focuses on small, localized territory loops.',
      acrobat: 'Acrobat: Chains continuous high-speed slingshots across 3+ pegs; proactively targets larger territories.',
      predator: 'Predator: Actively monitors your wet line; calculates intercept slingshots to sever your thread!'
    };
    this.diffDesc.textContent = descriptions[diff] || '';
  }

  public updateHUD(timeRemaining: number, p1Pct: number, p2Pct: number): void {
    // Format mm:ss
    const totalSecs = Math.ceil(timeRemaining);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    this.timerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (totalSecs <= 10) {
      this.hudTimerBadge.classList.add('urgent');
    } else {
      this.hudTimerBadge.classList.remove('urgent');
    }

    // Territory label text & bar fill
    const p1Formatted = p1Pct.toFixed(1);
    const p2Formatted = p2Pct.toFixed(1);

    this.p1LabelText.textContent = `BLUE: ${p1Formatted}%`;
    this.p2LabelText.textContent = `ORANGE: ${p2Formatted}%`;

    this.p1BarFill.style.width = `${Math.min(p1Pct, 100)}%`;
    this.p2BarFill.style.width = `${Math.min(p2Pct, 100)}%`;

    // Drawer telemetry table updates
    this.statP1Area.textContent = `${p1Formatted}%`;
    this.statP2Area.textContent = `${p2Formatted}%`;
    this.statP1Slings.textContent = `${this.game.p1.slingshotsFired}`;
    this.statCuts.textContent = `${this.game.p1.threadsCut + this.game.p2.threadsCut}`;
    this.statMaxSpeed.textContent = `${this.game.p1MaxSpeed} px/s`;
  }

  public showGameOverModal(stats: MatchStats): void {
    this.modalP1Pct.textContent = `${stats.p1AreaPercentage.toFixed(1)}%`;
    this.modalP2Pct.textContent = `${stats.p2AreaPercentage.toFixed(1)}%`;
    this.modalSlingshots.textContent = `${stats.p1Slingshots + stats.p2Slingshots}`;
    this.modalCuts.textContent = `${stats.p1Cuts + stats.p2Cuts}`;
    this.modalVelocity.textContent = `${Math.max(stats.p1MaxSpeed, stats.p2MaxSpeed)} px/s`;

    if (stats.winner === 'p1') {
      this.modalWinnerText.textContent = 'BLUE WINS';
      this.modalWinnerText.className = 'modal-result result-p1';
    } else if (stats.winner === 'p2') {
      this.modalWinnerText.textContent = 'ORANGE WINS';
      this.modalWinnerText.className = 'modal-result result-p2';
    } else {
      this.modalWinnerText.textContent = 'DRAW';
      this.modalWinnerText.className = 'modal-result';
    }

    this.gameOverModal.classList.add('visible');
  }

  public hideGameOverModal(): void {
    this.gameOverModal.classList.remove('visible');
  }

  public updateNetworkStatus(status: string, message?: string): void {
    this.statusDot.className = `status-dot ${status}`;
    this.statusText.textContent = message || status;
    this.roomCodeVal.textContent = this.network.roomCode || '-----';
  }

  public updatePing(pingMs: number): void {
    this.pingText.textContent = `${pingMs}ms`;
  }

  public showToast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('visible');
    if (this.toastTimeout !== null) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 2400);
  }

  private checkUrlForRoomCode(): void {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('drawer')) {
      this.openDrawer();
    }
    const room = urlParams.get('room');
    if (room && room.length >= 3) {
      this.setMode('multiplayer');
      this.network.joinRoom(room);
      this.showToast(`Joining room from link: ${room}`);
    }
  }
}

