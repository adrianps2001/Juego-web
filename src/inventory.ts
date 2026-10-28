import type { ItemKind } from './world';

export const SLOTS = 6;
export const STACK = 5;

export const ITEM_INFO: Record<ItemKind, { name: string; hint: string }> = {
  agua: { name: 'Agua de almendras', hint: 'Recupera cordura' },
  pila: { name: 'Pilas', hint: 'Recarga la linterna' },
  barrita: { name: 'Barrita energética', hint: 'Recupera toda la energía' },
  vendas: { name: 'Vendas', hint: 'Cura heridas' },
  lata: { name: 'Lata de conserva', hint: 'Cura un poco y da energía' },
  bengala: { name: 'Bengala', hint: 'Se lanza y atrae a los Smilers' },
};

export interface Slot {
  kind: ItemKind;
  count: number;
}

/** Inventario de huecos con objetos apilables. */
export class Inventory {
  readonly slots: (Slot | null)[] = Array(SLOTS).fill(null);
  selected = 0;

  /** ¿Cabe un objeto más de este tipo? */
  fits(kind: ItemKind): boolean {
    return this.slots.some((s) => !s || (s.kind === kind && s.count < STACK));
  }

  add(kind: ItemKind): boolean {
    const stack = this.slots.find((s) => s?.kind === kind && s.count < STACK);
    if (stack) {
      stack.count++;
      return true;
    }
    const empty = this.slots.indexOf(null);
    if (empty < 0) return false;
    this.slots[empty] = { kind, count: 1 };
    return true;
  }

  /** Gasta uno del hueco seleccionado y devuelve qué era. Los huecos vacíos no dejan agujeros. */
  takeSelected(): ItemKind | null {
    const s = this.slots[this.selected];
    if (!s) return null;
    s.count--;
    if (s.count <= 0) {
      this.slots.splice(this.selected, 1);
      this.slots.push(null);
      this.selected = Math.max(0, Math.min(this.selected, this.used - 1));
    }
    return s.kind;
  }

  /** Huecos ocupados (siempre son los primeros). */
  get used(): number {
    const i = this.slots.indexOf(null);
    return i < 0 ? this.slots.length : i;
  }

  current(): Slot | null {
    return this.slots[this.selected];
  }
}
