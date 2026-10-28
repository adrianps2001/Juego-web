import { Game } from './game';
import { Hud } from './hud';
import { hostRoom, joinRoom, type Link } from './net';
import type { HostMessage } from './protocol';
import { Sound } from './sound';
import { initSettingsUi, openSettings } from './settings-ui';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const menu = $('menu');
const nameInput = $<HTMLInputElement>('name');
const codeInput = $<HTMLInputElement>('code');
const hostBtn = $<HTMLButtonElement>('host');
const joinBtn = $<HTMLButtonElement>('join');
const status = $('status');
const hud = new Hud();

let link: Link | null = null;
let game: Game | null = null;
let sound: Sound | null = null;

try {
  nameInput.value = localStorage.getItem('nombre') ?? '';
} catch {
  // sin almacenamiento local: no pasa nada
}
const roomFromUrl = new URLSearchParams(location.search).get('sala');
if (roomFromUrl) codeInput.value = roomFromUrl.toUpperCase();

function onMessage(msg: HostMessage) {
  switch (msg.t) {
    case 'welcome':
      menu.hidden = true;
      game = new Game($('game'), hud, sound!, msg.id, msg.picked, msg, (m) => link?.send(m));
      if (import.meta.env.DEV) Object.assign(window, { juego: game }); // para depurar desde la consola
      break;
    case 'full':
      leave('La sala está llena (máximo 4 jugadores).');
      break;
    case 'state':
      game?.onState(msg.players, msg.entities);
      break;
    case 'picked':
      game?.onPicked(msg.key, msg.by);
      break;
    case 'notice':
      if (game) hud.notice(msg.text);
      break;
  }
}

async function start(mode: 'host' | 'join') {
  const name = nameInput.value.trim() || 'Jugador';
  try {
    localStorage.setItem('nombre', name);
  } catch {
    // ignorado
  }
  const code = codeInput.value.trim().toUpperCase();
  if (mode === 'join' && code.length !== 5) {
    status.textContent = 'El código tiene 5 caracteres.';
    return;
  }
  hostBtn.disabled = joinBtn.disabled = true;
  status.textContent = 'Haciendo noclip…';
  sound = new Sound(); // el audio solo puede arrancar tras un clic
  try {
    link = mode === 'host' ? await hostRoom(name, onMessage) : await joinRoom(code, name, onMessage, leave);
  } catch (err) {
    leave((err as Error).message);
    return;
  }
  status.textContent = '';
  $('room').textContent = link.roomCode;
  history.replaceState(null, '', `?sala=${link.roomCode}`);
}

function leave(reason = '') {
  link?.leave();
  game?.dispose();
  sound?.close();
  link = null;
  game = null;
  sound = null;
  menu.hidden = false;
  hostBtn.disabled = joinBtn.disabled = false;
  status.textContent = reason;
  history.replaceState(null, '', location.pathname);
}

hostBtn.onclick = () => start('host');
joinBtn.onclick = () => start('join');
codeInput.onkeydown = (e) => e.key === 'Enter' && start('join');
$('leave').onclick = () => leave();
$('copy').onclick = () => navigator.clipboard.writeText(location.href);
$('reenter').onclick = () => game?.reenter();
$('menu-settings').onclick = () => openSettings();
$('pause-settings').onclick = () => openSettings();
$('resume').onclick = () => game?.lockPointer();
$('pause-leave').onclick = () => leave();
initSettingsUi();
