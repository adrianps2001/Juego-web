// Mensajes que viajan entre jugadores por WebRTC (PeerJS).
// El anfitrión (host) recibe los movimientos de todos y reenvía una
// "foto" (snapshot) del estado completo varias veces por segundo.

export const MAX_PLAYERS = 4;
export const PEER_PREFIX = 'juegoweb-adrianps2001-';
export const SNAPSHOT_RATE_MS = 50; // 20 veces por segundo
export const PLAYER_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f];

export interface PlayerState {
  id: string;
  name: string;
  color: number;
  x: number;
  y: number;
  z: number;
  ry: number; // rotación en el eje Y (hacia dónde mira)
}

export type Pose = Pick<PlayerState, 'x' | 'y' | 'z' | 'ry'>;

export type Message =
  | { t: 'join'; name: string }
  | { t: 'welcome'; id: string; color: number; pose: Pose }
  | { t: 'full' }
  | { t: 'move'; pose: Pose }
  | { t: 'snapshot'; players: PlayerState[] };
