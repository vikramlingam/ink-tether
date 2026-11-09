import { Peer, DataConnection } from 'peerjs';
import { RemotePlayerPacket, HostSyncPacket } from './types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'hosting' | 'joined' | 'connected' | 'error';

export interface NetworkCallbacks {
  onStatusChange: (status: ConnectionStatus, message?: string) => void;
  onRemoteStateReceived: (packet: RemotePlayerPacket) => void;
  onHostSyncReceived: (packet: HostSyncPacket) => void;
  onPlayerJoined: (peerId: string) => void;
  onPlayerDisconnected: () => void;
  onPingUpdate: (pingMs: number) => void;
}

export class NetworkManager {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  public roomCode: string = '';
  public isHost: boolean = false;
  public status: ConnectionStatus = 'disconnected';
  public pingMs: number = 0;

  private callbacks: NetworkCallbacks;
  private lastPingSent: number = 0;
  private pingInterval: number | null = null;

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  public generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous characters like 0/O, 1/I
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private getPeerIdFromCode(code: string): string {
    return `inktether-${code.toUpperCase()}`;
  }

  /**
   * Host a new multiplayer room with a given or generated 5-letter code
   */
  public hostRoom(customCode?: string): void {
    this.cleanup();
    this.roomCode = (customCode || this.generateRoomCode()).toUpperCase();
    this.isHost = true;
    this.status = 'hosting';
    this.callbacks.onStatusChange('hosting', `Hosting room ${this.roomCode}...`);

    const myPeerId = this.getPeerIdFromCode(this.roomCode);

    try {
      this.peer = new Peer(myPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('[P2P] Room open with Peer ID:', id);
        this.callbacks.onStatusChange('hosting', `Room ${this.roomCode} ready! Share code or link.`);
      });

      this.peer.on('connection', (connection) => {
        console.log('[P2P] Incoming player connected:', connection.peer);
        this.conn = connection;
        this.setupConnectionListeners();
      });

      this.peer.on('error', (err) => {
        console.warn('[P2P] Peer host error:', err);
        // If room code ID is taken, regenerate new code
        if (err.type === 'unavailable-id') {
          console.log('[P2P] ID taken, regenerating room code...');
          this.hostRoom();
        } else {
          this.status = 'error';
          this.callbacks.onStatusChange('error', `Connection error: ${err.message || 'Unable to host'}`);
        }
      });

      this.peer.on('disconnected', () => {
        console.log('[P2P] Peer disconnected from signaling server, attempting reconnect...');
        this.peer?.reconnect();
      });
    } catch (e) {
      this.status = 'error';
      this.callbacks.onStatusChange('error', 'WebRTC / PeerJS initialization failed');
    }
  }

  /**
   * Join an existing multiplayer room by 5-letter code
   */
  public joinRoom(code: string): void {
    this.cleanup();
    this.roomCode = code.toUpperCase().trim();
    this.isHost = false;
    this.status = 'connecting';
    this.callbacks.onStatusChange('connecting', `Connecting to room ${this.roomCode}...`);

    const targetPeerId = this.getPeerIdFromCode(this.roomCode);

    try {
      this.peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', () => {
        console.log('[P2P] Client peer open. Dialing host:', targetPeerId);
        this.conn = this.peer!.connect(targetPeerId, {
          reliable: false, // Low-latency UDP-style Datachannel
          serialization: 'json'
        });
        this.setupConnectionListeners();
      });

      this.peer.on('error', (err) => {
        console.warn('[P2P] Client peer error:', err);
        this.status = 'error';
        this.callbacks.onStatusChange('error', `Could not find room ${this.roomCode}.`);
      });
    } catch (e) {
      this.status = 'error';
      this.callbacks.onStatusChange('error', 'WebRTC join failed');
    }
  }

  private setupConnectionListeners(): void {
    if (!this.conn) return;

    this.conn.on('open', () => {
      console.log('[P2P] Data channel established!');
      this.status = 'connected';
      this.callbacks.onStatusChange('connected', `Connected to opponent in room ${this.roomCode}!`);
      this.callbacks.onPlayerJoined(this.conn!.peer);
      this.startPingHeartbeat();
    });

    this.conn.on('data', (data: unknown) => {
      this.handlePacket(data);
    });

    this.conn.on('close', () => {
      console.log('[P2P] Opponent disconnected');
      this.status = this.isHost ? 'hosting' : 'disconnected';
      this.callbacks.onStatusChange(this.status, 'Opponent disconnected');
      this.callbacks.onPlayerDisconnected();
      this.stopPingHeartbeat();
    });

    this.conn.on('error', (err) => {
      console.warn('[P2P] Connection error:', err);
    });
  }

  private handlePacket(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const packet = data as Record<string, unknown>;

    // Handle Ping/Pong
    if (packet.type === 'ping') {
      this.send({ type: 'pong', sentTime: packet.sentTime });
      return;
    }
    if (packet.type === 'pong') {
      const now = performance.now();
      const rtt = Math.round(now - (packet.sentTime as number));
      this.pingMs = Math.max(1, rtt);
      this.callbacks.onPingUpdate(this.pingMs);
      return;
    }

    if (packet.type === 'state') {
      this.callbacks.onRemoteStateReceived(packet.payload as RemotePlayerPacket);
    } else if (packet.type === 'sync') {
      this.callbacks.onHostSyncReceived(packet as unknown as HostSyncPacket);
    }
  }

  public sendState(packet: RemotePlayerPacket): void {
    if (this.conn && this.conn.open) {
      this.conn.send({ type: 'state', payload: packet });
    }
  }

  public sendHostSync(sync: HostSyncPacket): void {
    if (this.conn && this.conn.open && this.isHost) {
      this.conn.send(sync);
    }
  }

  private send(obj: unknown): void {
    if (this.conn && this.conn.open) {
      this.conn.send(obj);
    }
  }

  private startPingHeartbeat(): void {
    this.stopPingHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.conn && this.conn.open) {
        this.lastPingSent = performance.now();
        this.send({ type: 'ping', sentTime: this.lastPingSent });
      }
    }, 2000);
  }

  private stopPingHeartbeat(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public getShareableUrl(): string {
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomCode);
    return url.toString();
  }

  public cleanup(): void {
    this.stopPingHeartbeat();
    if (this.conn) {
      try { this.conn.close(); } catch { /* ignore */ }
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* ignore */ }
      this.peer = null;
    }
    this.status = 'disconnected';
    this.pingMs = 0;
  }
}
