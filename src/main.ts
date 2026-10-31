import { Game } from './game';
import { Hud } from './hud';
import { setSession } from './levels';
import { hostRoom, joinRoom, type Link } from './net';
import type { HostMessage } from './protocol';
import { Sound } from './sound';
import { Voice } from './voice';
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
let voice: Voice | null = null;

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
      status.textContent = '';
      setSession(msg.session); // objetos y criaturas de esta partida (iguales para todos)
      game = new Game($('game'), hud, sound!, msg.id, msg.picked, msg, (m) => link?.send(m));
      game.addMarks(msg.marks ?? []);
      startVoice();
      if (import.meta.env.DEV) Object.assign(window, { juego: game }); // para depurar desde la consola
      break;
    case 'full':
      leave('La sala está llena (máximo 4 jugadores).');
      break;
    case 'state':
      game?.onState(msg);
      break;
    case 'picked':
      game?.onPicked(msg.key, msg.by, msg.items, msg.junk, msg.hurt);
      break;
    case 'restock':
      game?.onRestock(msg.keys);
      break;
    case 'say':
      game?.onSay(msg.id, msg.text);
      break;
    case 'hit':
      game?.onHit(msg.damage, msg.kind);
      break;
    case 'notice':
      if (game) hud.notice(msg.text);
      break;
    case 'revived':
      game?.onRevived(msg.by);
      break;
    case 'cue':
      game?.onCue(msg.kind, msg.level, msg.x, msg.z);
      break;
    case 'mark':
      game?.addMark(msg.mark);
      break;
  }
}

/** El chat de voz necesita la partida y la conexión (en el anfitrión, la bienvenida llega antes). */
function startVoice() {
  if (voice || !link || !game || !sound) return;
  voice = new Voice(link.peer, sound, (text) => hud.notice(text));
  game.setVoice(voice);
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
  status.textContent = mode === 'join' ? 'Entrando en la sala…' : '';
  if (mode === 'join') {
    const mine = link;
    setTimeout(() => {
      if (link === mine && !game) leave('El anfitrión no responde. Comprueba el código y que su pestaña siga abierta.');
    }, 20000);
  }
  startVoice();
  $('room').textContent = link.roomCode;
  history.replaceState(null, '', `?sala=${link.roomCode}`);
}

function leave(reason = '') {
  voice?.dispose();
  voice = null;
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
// (con addEventListener: un onkeydown que devuelve false cancelaría cada tecla)
codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void start('join');
});
$('copy').onclick = () => {
  navigator.clipboard.writeText(location.href).then(
    () => ($('copy').textContent = 'Enlace copiado'),
    () => ($('copy').textContent = location.href),
  );
  setTimeout(() => ($('copy').textContent = 'Copiar enlace de la sala'), 2500);
};
$('reenter').onclick = () => game?.reenter();
$('menu-settings').onclick = () => openSettings();
$('pause-settings').onclick = () => openSettings();
$('resume').onclick = () => game?.lockPointer();
$('pause-leave').onclick = () => leave();
initSettingsUi();
