// Mensajes que viajan entre jugadores por WebRTC (PeerJS).
// El anfitrión ejecuta la "autoridad" (authority.ts): recibe la posición de
// cada jugador, mueve a los enemigos, decide sus ataques y reenvía el estado.

import type { EntityKind } from './world';

export const MAX_PLAYERS = 4;
export const PEER_PREFIX = 'juegoweb-adrianps2001-';
export const TICK_MS = 50; // 20 veces por segundo
export const PLAYER_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f];

export interface Pose {
  level: number;
  x: number;
  y: number; // altura de los pies
  z: number;
  ry: number; // hacia dónde mira
  light: boolean; // linterna encendida
  sprint: boolean; // corriendo (hace ruido)
  dead: boolean;
}

export interface PlayerState extends Pose {
  id: string;
  name: string;
  color: number;
}

export interface EntityState {
  id: number;
  kind: EntityKind;
  level: number;
  x: number;
  z: number;
  ry: number;
  anim: number; // ver Anim en models.ts
}

export type ClientMessage =
  | { t: 'join'; name: string }
  | { t: 'pose'; pose: Pose }
  | { t: 'pickup'; key: string }
  | { t: 'died'; reason: string };

export type HostMessage =
  | { t: 'welcome'; id: string; color: number; picked: string[]; x: number; z: number }
  | { t: 'full' }
  | { t: 'state'; players: PlayerState[]; entities: EntityState[]; blackout: number[] }
  | { t: 'picked'; key: string; by: string }
  | { t: 'hit'; damage: number; kind: EntityKind }
  | { t: 'notice'; text: string };
