import { ITEM_INFO, type Slot } from './inventory';
import { ESCAPED, LEVELS } from './levels';
import type { PlayerState } from './protocol';
import type { ItemKind } from './world';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private health = $('bar-health');
  private sanity = $('bar-sanity');
  private stamina = $('bar-stamina');
  private battery = $('bar-battery');
  private prompt = $('prompt');
  private notices = $('notices');
  private levelLabel = $('level');
  private players = $('players');
  private death = $('death');
  private titleCard = $('title-card');
  private lock = $('pause');
  private escaped = $('escaped');
  private fps = $('fps');
  private lastPlayers = '';
  private lastPrompt: string | null = null;
  private subtitle = $('subtitle');
  private subTimer = 0;
  private note = $('note');

  show(visible: boolean) {
    $('hud').hidden = !visible;
  }

  bars(health: number, sanity: number, stamina: number, battery: number, exhausted: boolean) {
    this.health.style.width = `${Math.max(0, health)}%`;
    this.sanity.style.width = `${sanity}%`;
    this.stamina.style.width = `${stamina}%`;
    this.stamina.classList.toggle('exhausted', exhausted);
    this.battery.style.width = `${battery}%`;
  }

  setInventory(slots: (Slot | null)[], selected: number) {
    const bar = $('hotbar');
    // solo los huecos con algo; sin objetos, no se ve la barra
    const filled = slots.filter((s): s is Slot => !!s);
    $('inventory').hidden = filled.length === 0;
    bar.replaceChildren(
      ...filled.map((s, i) => {
        const el = document.createElement('div');
        el.className = 'slot' + (i === selected ? ' selected' : '');
        const key = document.createElement('span');
        key.className = 'key';
        key.textContent = String(i + 1);
        el.append(key);
        if (s) {
          const img = document.createElement('img');
          img.src = itemIcon(s.kind);
          img.alt = ITEM_INFO[s.kind].name;
          el.append(img);
          if (s.count > 1) {
            const n = document.createElement('span');
            n.className = 'count';
            n.textContent = String(s.count);
            el.append(n);
          }
        }
        return el;
      }),
    );
    const cur = slots[selected];
    $('item-name').textContent = cur ? `${ITEM_INFO[cur.kind].name} · clic para usar` : '';
  }

  setPrompt(text: string | null) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.prompt.hidden = !text;
    if (text) this.prompt.textContent = text;
  }

  /** Frase dicha por alguien (o algo) cerca. */
  say(text: string, seconds = 4) {
    this.subtitle.textContent = text;
    this.subtitle.hidden = false;
    window.clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => (this.subtitle.hidden = true), seconds * 1000);
  }

  showNote(title: string | null, text = '') {
    this.note.hidden = !title;
    if (!title) return;
    $('note-title').textContent = title;
    $('note-text').textContent = text;
  }

  get noteOpen() {
    return !this.note.hidden;
  }

  /** Fundido a negro muy corto (al pasar de nivel). */
  fade() {
    const el = $('fade');
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  showFps(visible: boolean) {
    this.fps.hidden = !visible;
  }

  setFps(fps: number) {
    if (!this.fps.hidden) this.fps.textContent = `${fps} FPS`;
  }

  notice(text: string) {
    const div = document.createElement('div');
    div.textContent = text;
    this.notices.append(div);
    setTimeout(() => div.classList.add('fade'), 5000);
    setTimeout(() => div.remove(), 6000);
  }

  enterLevel(level: number) {
    const L = LEVELS[level];
    this.levelLabel.textContent = L ? `${L.name} · ${L.title}` : '';
    this.escaped.hidden = level !== ESCAPED;
    if (!L) return;
    this.titleCard.innerHTML = `<div>${L.name}</div><small>${L.title}</small>`;
    this.titleCard.classList.remove('show');
    void this.titleCard.offsetWidth; // reinicia la animación
    this.titleCard.classList.add('show');
  }

  setPlayers(list: PlayerState[], myId: string) {
    const text = JSON.stringify(list.map((p) => [p.id, p.name, p.level]));
    if (text === this.lastPlayers) return;
    this.lastPlayers = text;
    this.players.replaceChildren(
      ...list.map((p) => {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = '#' + p.color.toString(16).padStart(6, '0');
        const where = p.level === ESCAPED ? 'Nivel 3' : LEVELS[p.level].name;
        li.append(dot, `${p.name}${p.id === myId ? ' (tú)' : ''} — ${where}`);
        return li;
      }),
    );
  }

  showDeath(reason: string | null) {
    this.death.hidden = !reason;
    if (reason) $('death-reason').textContent = reason;
  }


  showLock(visible: boolean) {
    this.lock.hidden = !visible;
  }
}

const icons = new Map<ItemKind, string>();

/** Icono dibujado a mano para cada objeto. */
function itemIcon(kind: ItemKind): string {
  let url = icons.get(kind);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  if (kind === 'agua') {
    g.fillStyle = 'rgba(220, 235, 255, 0.85)';
    g.beginPath();
    g.roundRect(22, 18, 20, 38, 5);
    g.fill();
    g.fillRect(27, 10, 10, 9);
    g.fillStyle = '#f5f5f5';
    g.fillRect(26, 6, 12, 6);
    g.fillStyle = '#f2ead5';
    g.fillRect(22, 30, 20, 13);
    g.fillStyle = '#7a5530';
    g.fillRect(25, 34, 14, 2);
    g.fillRect(25, 38, 10, 2);
  } else if (kind === 'pila') {
    for (const x of [16, 34]) {
      g.fillStyle = '#222';
      g.fillRect(x, 16, 14, 40);
      g.fillStyle = '#d8a619';
      g.fillRect(x, 16, 14, 14);
      g.fillStyle = '#bbb';
      g.fillRect(x + 4, 11, 6, 5);
    }
  } else if (kind === 'barrita') {
    g.save();
    g.translate(32, 32);
    g.rotate(-0.5);
    g.fillStyle = '#c23a1c';
    g.fillRect(-24, -9, 48, 18);
    g.fillStyle = '#ddd';
    g.fillRect(-28, -8, 4, 16);
    g.fillRect(24, -8, 4, 16);
    g.fillStyle = '#fff';
    g.font = 'bold 9px sans-serif';
    g.textAlign = 'center';
    g.fillText('ENERGÍA', 0, 3);
    g.restore();
  } else if (kind === 'lata') {
    g.fillStyle = '#7a2b1c';
    g.fillRect(18, 16, 28, 36);
    g.fillStyle = '#bbb';
    g.beginPath();
    g.ellipse(32, 16, 14, 4, 0, 0, 7);
    g.fill();
    g.fillStyle = '#f2ead0';
    g.fillRect(18, 28, 28, 10);
    g.fillStyle = '#7a2b1c';
    g.font = 'bold 7px sans-serif';
    g.textAlign = 'center';
    g.fillText('CONSERVA', 32, 36);
  } else if (kind === 'bengala') {
    g.save();
    g.translate(32, 32);
    g.rotate(-0.7);
    g.fillStyle = '#b2241a';
    g.fillRect(-24, -6, 40, 12);
    g.fillStyle = '#ddd';
    g.fillRect(16, -6, 8, 12);
    g.fillStyle = '#ffcf6a';
    g.beginPath();
    g.arc(-26, 0, 5, 0, 7);
    g.fill();
    g.restore();
  } else {
    g.fillStyle = '#e8e4dc';
    g.beginPath();
    g.roundRect(10, 18, 44, 34, 5);
    g.fill();
    g.fillStyle = '#c41e1e';
    g.fillRect(28, 24, 8, 22);
    g.fillRect(21, 31, 22, 8);
    g.fillStyle = '#444';
    g.fillRect(24, 12, 16, 6);
  }
  url = c.toDataURL();
  icons.set(kind, url);
  return url;
}
