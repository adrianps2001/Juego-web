// Mensajes que viajan entre jugadores por WebRTC (PeerJS).
// El anfitrión ejecuta la "autoridad" (authority.ts): recibe la posición de
// cada jugador, mueve a las entidades y reenvía el estado a todos.

export const MAX_PLAYERS = 4;
export const PEER_PREFIX = 'juegoweb-adrianps2001-';
export const TICK_MS = 50; // 20 veces por segundo
export const PLAYER_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f];

export interface Pose {
  level: number;
  x: number;
  z: number;
  ry: number; // hacia dónde mira (rotación en Y)
  light: boolean; // linterna encendida
}

export interface PlayerState extends Pose {
  id: string;
  name: string;
  color: number;
}

export interface EntityState {
  id: number;
  level: number;
  x: number;
  z: number;
}

export type ClientMessage =
  | { t: 'join'; name: string }
  | { t: 'pose'; pose: Pose }
  | { t: 'pickup'; key: string }
  | { t: 'died'; reason: string; entity?: number };

export type HostMessage =
  | { t: 'welcome'; id: string; color: number; picked: string[]; x: number; z: number }
  | { t: 'full' }
  | { t: 'state'; players: PlayerState[]; entities: EntityState[] }
  | { t: 'picked'; key: string; by: string }
  | { t: 'notice'; text: string };
