import { Game } from './game';
import { hostRoom, joinRoom, type NetworkEvents, type Session } from './net';
import type { PlayerState } from './protocol';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const menu = $('menu');
const hud = $('hud');
const nameInput = $<HTMLInputElement>('name');
const codeInput = $<HTMLInputElement>('code');
const hostBtn = $<HTMLButtonElement>('host');
const joinBtn = $<HTMLButtonElement>('join');
const status = $('status');
const playerList = $('players');

let session: Session | null = null;
let game: Game | null = null;

nameInput.value = localStorage.getItem('nombre') ?? '';
const roomFromUrl = new URLSearchParams(location.search).get('sala');
if (roomFromUrl) codeInput.value = roomFromUrl.toUpperCase();

function renderPlayers(players: PlayerState[]) {
  playerList.replaceChildren(
    ...players.map((p) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = '#' + p.color.toString(16).padStart(6, '0');
      li.append(dot, p.name + (p.id === session?.me.id ? ' (tú)' : ''));
      return li;
    }),
  );
}

const events: NetworkEvents = {
  onSnapshot: (players) => {
    game?.applySnapshot(players);
    renderPlayers(players);
  },
  onDisconnected: (reason) => leave(reason),
};

async function start(mode: 'host' | 'join') {
  const name = nameInput.value.trim() || 'Jugador';
  localStorage.setItem('nombre', name);
  hostBtn.disabled = joinBtn.disabled = true;
  status.textContent = 'Conectando…';
  try {
    if (mode === 'host') {
      session = await hostRoom(name, events);
    } else {
      if (codeInput.value.trim().length !== 5) throw new Error('El código tiene 5 caracteres.');
      session = await joinRoom(codeInput.value, name, events);
    }
  } catch (err) {
    status.textContent = (err as Error).message;
    hostBtn.disabled = joinBtn.disabled = false;
    return;
  }
  status.textContent = '';
  menu.hidden = true;
  hud.hidden = false;
  $('room').textContent = session.roomCode;
  history.replaceState(null, '', `?sala=${session.roomCode}`);
  game = new Game($('game'), session.me, session.sendPose);
}

function leave(reason = '') {
  session?.leave();
  game?.dispose();
  session = null;
  game = null;
  hud.hidden = true;
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
