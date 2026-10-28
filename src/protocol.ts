// Mensajes que viajan entre jugadores por WebRTC (PeerJS).
// El anfitrión ejecuta la "autoridad" (authority.ts): recibe la posición de
// cada jugador, mueve a las criaturas, decide sus ataques, abre las cajas,
// cambia el laberinto y reenvía el estado a todos.

import type { EntityKind, ItemKind } from './world';

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
  sprint: boolean; // corriendo
  crouch: boolean; // agachado
  noise: number; // ruido que hace ahora mismo (0 = silencio, 1 = correr, 1,5 = gritar)
  shout: boolean; // acaba de gritar
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

export interface Flare {
  id: number;
  level: number;
  x: number;
  y: number;
  z: number;
  left: number; // segundos que le quedan
}

export type ClientMessage =
  | { t: 'join'; name: string }
  | { t: 'pose'; pose: Pose }
  | { t: 'pickup'; key: string }
  | { t: 'flare'; level: number; x: number; y: number; z: number }
  | { t: 'died'; reason: string };

export type HostMessage =
  | { t: 'welcome'; id: string; color: number; picked: string[]; x: number; z: number }
  | { t: 'full' }
  | {
      t: 'state';
      players: PlayerState[];
      entities: EntityState[];
      blackout: number[]; // niveles con Parpadeo (todo apagado)
      circuits: number[]; // niveles con un circuito de luces fundido
      shifts: string[]; // bloques de cambio periférico cerrados ("nivel:id")
      flares: Flare[];
    }
  | { t: 'picked'; key: string; by: string; items?: ItemKind[]; junk?: string; hurt?: number }
  | { t: 'restock'; keys: string[] }
  | { t: 'hit'; damage: number; kind: EntityKind }
  | { t: 'say'; id: number; text: string }
  | { t: 'notice'; text: string };
