import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { Authority } from './authority';
import { PEER_PREFIX, type ClientMessage, type HostMessage } from './protocol';

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

export interface Link {
  roomCode: string;
  isHost: boolean;
  send: (msg: ClientMessage) => void;
  leave: () => void;
}

function randomRoomCode(): string {
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

/** Crea una sala: este navegador hace de anfitrión y ejecuta la autoridad. */
export function hostRoom(name: string, onMessage: (msg: HostMessage) => void): Promise<Link> {
  const roomCode = randomRoomCode();
  const peer = new Peer(PEER_PREFIX + roomCode, PEER_OPTIONS);
  const conns = new Map<string, DataConnection>();

  return new Promise((resolve, reject) => {
    let authority: Authority | null = null;

    peer.on('open', (myId) => {
      const sendTo = (id: string, msg: HostMessage) => {
        if (id === myId) onMessage(msg);
        else if (conns.get(id)?.open) conns.get(id)!.send(msg);
      };
      const auth = new Authority({
        sendTo,
        broadcast: (msg) => {
          onMessage(msg);
          for (const c of conns.values()) if (c.open) c.send(msg);
        },
      });
      authority = auth;
      resolve({
        roomCode,
        isHost: true,
        send: (msg) => auth.handle(myId, msg),
        leave: () => {
          auth.stop();
          peer.destroy();
        },
      });
      auth.join(myId, name);
    });

    peer.on('connection', (conn) => {
      conn.on('data', (raw) => {
        const msg = raw as ClientMessage;
        if (!authority) return;
        if (msg.t === 'join') {
          conns.set(conn.peer, conn);
          if (!authority.join(conn.peer, msg.name)) {
            conns.delete(conn.peer);
            conn.send({ t: 'full' } satisfies HostMessage);
            setTimeout(() => conn.close(), 500);
          }
        } else if (conns.has(conn.peer)) {
          authority.handle(conn.peer, msg);
        }
      });
      const drop = () => {
        if (conns.delete(conn.peer)) authority?.leave(conn.peer);
      };
      conn.on('close', drop);
      conn.on('error', drop);
    });

    peer.on('error', (err) => {
      if (!authority) {
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
export function joinRoom(
  roomCode: string,
  name: string,
  onMessage: (msg: HostMessage) => void,
  onClosed: (reason: string) => void,
): Promise<Link> {
  const peer = new Peer(PEER_OPTIONS);
  const code = roomCode.trim().toUpperCase();

  return new Promise((resolve, reject) => {
    let open = false;
    let closed = false;
    const close = (reason: string) => {
      if (closed) return;
      closed = true;
      peer.destroy();
      if (open) onClosed(reason);
      else reject(new Error(reason));
    };

    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      conn.on('open', () => {
        open = true;
        conn.send({ t: 'join', name } satisfies ClientMessage);
        resolve({
          roomCode: code,
          isHost: false,
          send: (msg) => {
            if (conn.open) conn.send(msg);
          },
          leave: () => {
            closed = true;
            peer.destroy();
          },
        });
      });
      conn.on('data', (raw) => onMessage(raw as HostMessage));
      conn.on('close', () => close('El anfitrión ha cerrado la sala.'));
    });

    peer.on('error', (err) => close(errorText(err)));
  });
}
