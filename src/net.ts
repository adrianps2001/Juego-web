import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import {
  MAX_PLAYERS,
  PEER_PREFIX,
  PLAYER_COLORS,
  SNAPSHOT_RATE_MS,
  type Message,
  type PlayerState,
  type Pose,
} from './protocol';

export interface NetworkEvents {
  onSnapshot: (players: PlayerState[]) => void;
  onDisconnected: (reason: string) => void;
}

export interface Session {
  roomCode: string;
  me: PlayerState;
  isHost: boolean;
  sendPose: (pose: Pose) => void;
  leave: () => void;
}

// Por defecto se usa el servidor público gratuito de PeerJS (0.peerjs.com).
// Con VITE_PEER_HOST (y opcionalmente VITE_PEER_PORT / VITE_PEER_PATH) se
// puede usar un servidor de señalización propio.
const env = import.meta.env;
const PEER_OPTIONS: PeerOptions = env.VITE_PEER_HOST
  ? {
      host: env.VITE_PEER_HOST,
      port: Number(env.VITE_PEER_PORT ?? 443),
      path: env.VITE_PEER_PATH ?? '/',
      secure: env.VITE_PEER_SECURE !== 'false',
    }
  : {};

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  return code;
}

function errorText(err: { type?: string; message?: string }): string {
  switch (err.type) {
    case 'unavailable-id':
      return 'Ese código de sala ya está en uso. Prueba otra vez.';
    case 'peer-unavailable':
      return 'No existe ninguna sala con ese código.';
    case 'network':
    case 'server-error':
    case 'socket-error':
      return 'No se pudo conectar con el servidor de señalización.';
    case 'browser-incompatible':
      return 'Tu navegador no soporta WebRTC.';
    default:
      return err.message ?? 'Error de conexión.';
  }
}

/** Crea una sala: este navegador hace de anfitrión. */
export function hostRoom(name: string, events: NetworkEvents): Promise<Session> {
  const roomCode = randomRoomCode();
  const peer = new Peer(PEER_PREFIX + roomCode, PEER_OPTIONS);

  return new Promise((resolve, reject) => {
    let opened = false;
    const me: PlayerState = { id: '', name, color: PLAYER_COLORS[0], x: 0, y: 0, z: 0, ry: 0 };
    const players = new Map<string, { conn: DataConnection | null; state: PlayerState }>();

    const snapshot = () => [...players.values()].map((p) => p.state);
    const freeColor = () => {
      const used = new Set(snapshot().map((p) => p.color));
      return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
    };

    const timer = window.setInterval(() => {
      const msg: Message = { t: 'snapshot', players: snapshot() };
      for (const p of players.values()) if (p.conn?.open) p.conn.send(msg);
      events.onSnapshot(msg.players);
    }, SNAPSHOT_RATE_MS);

    peer.on('open', (id) => {
      opened = true;
      me.id = id;
      players.set(id, { conn: null, state: me });
      resolve({
        roomCode,
        me,
        isHost: true,
        sendPose: (pose) => Object.assign(me, pose),
        leave: () => {
          window.clearInterval(timer);
          peer.destroy();
        },
      });
    });

    peer.on('connection', (conn) => {
      conn.on('data', (raw) => {
        const msg = raw as Message;
        if (msg.t === 'join') {
          if (players.size >= MAX_PLAYERS) {
            conn.send({ t: 'full' } satisfies Message);
            setTimeout(() => conn.close(), 500);
            return;
          }
          const state: PlayerState = {
            id: conn.peer,
            name: msg.name.slice(0, 16) || 'Jugador',
            color: freeColor(),
            x: (Math.random() - 0.5) * 6,
            y: 0,
            z: (Math.random() - 0.5) * 6,
            ry: 0,
          };
          players.set(conn.peer, { conn, state });
          const { x, y, z, ry } = state;
          conn.send({ t: 'welcome', id: state.id, color: state.color, pose: { x, y, z, ry } } satisfies Message);
        } else if (msg.t === 'move') {
          const p = players.get(conn.peer);
          if (p) Object.assign(p.state, msg.pose);
        }
      });
      conn.on('close', () => players.delete(conn.peer));
      conn.on('error', () => players.delete(conn.peer));
    });

    peer.on('error', (err) => {
      if (!opened) {
        window.clearInterval(timer);
        peer.destroy();
        reject(new Error(errorText(err)));
      }
    });

    peer.on('disconnected', () => {
      // perder la señalización no corta las conexiones ya hechas; reintentamos
      if (!peer.destroyed) peer.reconnect();
    });
  });
}

/** Se une a una sala existente con su código. */
export function joinRoom(roomCode: string, name: string, events: NetworkEvents): Promise<Session> {
  const peer = new Peer(PEER_OPTIONS);
  const code = roomCode.trim().toUpperCase();

  return new Promise((resolve, reject) => {
    let joined = false;
    let failed = false;
    const fail = (reason: string) => {
      if (failed) return;
      failed = true;
      peer.destroy();
      if (joined) events.onDisconnected(reason);
      else reject(new Error(reason));
    };

    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });

      conn.on('open', () => conn.send({ t: 'join', name } satisfies Message));

      conn.on('data', (raw) => {
        const msg = raw as Message;
        if (msg.t === 'welcome') {
          joined = true;
          const me: PlayerState = { id: msg.id, name, color: msg.color, ...msg.pose };
          resolve({
            roomCode: code,
            me,
            isHost: false,
            sendPose: (pose) => {
              Object.assign(me, pose);
              if (conn.open) conn.send({ t: 'move', pose } satisfies Message);
            },
            leave: () => peer.destroy(),
          });
        } else if (msg.t === 'full') {
          fail('La sala está llena (máximo 4 jugadores).');
        } else if (msg.t === 'snapshot') {
          events.onSnapshot(msg.players);
        }
      });

      conn.on('close', () => fail('El anfitrión ha cerrado la sala.'));
    });

    peer.on('error', (err) => fail(errorText(err)));
  });
}
