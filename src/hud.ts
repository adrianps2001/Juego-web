import type { PlayerState } from './protocol';
import { ESCAPED, LEVELS } from './world';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
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

  show(visible: boolean) {
    $('hud').hidden = !visible;
  }

  bars(sanity: number, stamina: number, battery: number) {
    this.sanity.style.width = `${sanity}%`;
    this.stamina.style.width = `${stamina}%`;
    this.battery.style.width = `${battery}%`;
  }

  setPrompt(text: string | null) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.prompt.hidden = !text;
    if (text) this.prompt.textContent = text;
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
        const where = p.level === ESCAPED ? 'ha escapado' : LEVELS[p.level].name;
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
