// The exercise editor (a dialog).
// Stage 1: name, signal mix, number of signals and pause (follow the level or own values).
// Stage 2: details for the signal types in the mix (change delay, anticipation wait).
// The form works in seconds; definitions store milliseconds.

import { TYPES, TYPE_LABELS, buildExercise, normalizeDef, levelDefaults } from './exercises.js';

const $ = (id) => document.getElementById(id);
const MIX_STEP = 5;

const fmtS = (ms) => String(Math.round(ms) / 1000);
/** Seconds as typed (comma or dot) -> ms, or NaN. */
const parseS = (s) => {
  const t = String(s).trim().replace(',', '.');
  return /^\d+(\.\d+)?$|^\.\d+$/.test(t) ? Math.round(parseFloat(t) * 1000) : NaN;
};
const parseInt10 = (s) => (/^\s*\d+\s*$/.test(s) ? parseInt(s, 10) : NaN);

export class Editor {
  /**
   * @param getLevel () => current level (1..6), for "follow level" hints and the preview
   * @param onSave   (def) => void
   * @param onCopy   (def) => void   original definition to copy
   * @param onDelete (def) => void
   */
  constructor({ getLevel, onSave, onCopy, onDelete }) {
    this.dialog = $('editorDialog');
    this.getLevel = getLevel;
    this.def = null;
    this.deleteTimer = 0;

    // mix rows
    this.pct = {};
    for (const t of TYPES) {
      const row = document.createElement('div');
      row.className = 'mix-row';
      row.innerHTML =
        `<span class="mix-label">${TYPE_LABELS[t]}</span>` +
        `<button type="button" class="step" aria-label="Less ${TYPE_LABELS[t]}">−</button>` +
        `<input type="text" inputmode="numeric" class="pct" aria-label="${TYPE_LABELS[t]} percent">` +
        `<span>%</span>` +
        `<button type="button" class="step" aria-label="More ${TYPE_LABELS[t]}">+</button>`;
      const [minus, plus] = row.querySelectorAll('button');
      const input = row.querySelector('input');
      const step = (d) => {
        const v = parseInt10(input.value) || 0;
        input.value = Math.min(100, Math.max(0, Math.round((v + d) / MIX_STEP) * MIX_STEP));
        this.#update();
      };
      minus.addEventListener('click', () => step(-MIX_STEP));
      plus.addEventListener('click', () => step(MIX_STEP));
      this.pct[t] = input;
      $('edMix').append(row);
    }

    this.dialog.addEventListener('input', () => this.#update());
    for (const [sw, fill] of [
      ['edCountLevel', () => { $('edCount').value = this.#lv().count; }],
      ['edPauseLevel', () => { const r = this.#lv().pause; $('edPauseMin').value = fmtS(r.min); $('edPauseMax').value = fmtS(r.max); }],
      ['edAntLevel', () => { const r = this.#lv().anticipation; $('edAntMin').value = fmtS(r.min); $('edAntMax').value = fmtS(r.max); }],
    ]) {
      // switching "follow level" off starts from the level's values
      $(sw).addEventListener('change', (e) => { if (!e.target.checked) fill(); this.#update(); });
    }

    $('edSave').addEventListener('click', () => {
      const def = this.#read();
      if (!def) return;
      this.dialog.close();
      onSave(def);
    });
    $('edCopy').addEventListener('click', () => onCopy(this.def));
    $('edCancel').addEventListener('click', () => this.dialog.close());
    $('edDelete').addEventListener('click', () => {
      if (!this.deleteTimer) { // ask for a second tap
        $('edDelete').textContent = 'Tap again to delete';
        this.deleteTimer = setTimeout(() => this.#resetDelete(), 3000);
        return;
      }
      this.#resetDelete();
      this.dialog.close();
      onDelete(this.def);
    });
  }

  /**
   * @param def   definition to show
   * @param mode  'preset' (read only) | 'edit' | 'new'
   * @param title heading
   */
  open(def, mode, title) {
    this.def = def;
    this.mode = mode;
    this.#resetDelete();
    $('editorTitle').textContent = title;
    $('edReadOnly').hidden = mode !== 'preset';
    $('edFields').disabled = mode === 'preset';
    $('edSave').hidden = mode === 'preset';
    $('edCopy').hidden = mode === 'new';
    $('edDelete').hidden = mode !== 'edit';
    $('edCancel').textContent = mode === 'preset' ? 'Close' : 'Cancel';

    $('edName').value = def.name;
    for (const t of TYPES) this.pct[t].value = def.mix[t] || 0;

    $('edCountLevel').checked = def.count == null;
    $('edCount').value = def.count ?? this.#lv().count;

    const pause = def.pause ?? this.#lv().pause;
    $('edPauseLevel').checked = def.pause == null;
    $('edPauseMin').value = fmtS(pause.min);
    $('edPauseMax').value = fmtS(pause.max);

    $('edChangeMin').value = fmtS(def.change.min);
    $('edChangeMax').value = fmtS(def.change.max);

    const ant = def.anticipation ?? this.#lv().anticipation;
    $('edAntLevel').checked = def.anticipation == null;
    $('edAntMin').value = fmtS(ant.min);
    $('edAntMax').value = fmtS(ant.max);

    this.#update();
    this.dialog.showModal();
    this.dialog.scrollTop = 0;
  }

  #resetDelete() {
    clearTimeout(this.deleteTimer);
    this.deleteTimer = 0;
    $('edDelete').textContent = 'Delete';
  }

  #lv() { return levelDefaults(this.getLevel()); }

  /** Read and check the form. Returns a definition, or null (errors are shown). */
  #read() {
    const errors = [];
    const mix = {};
    let total = 0;
    for (const t of TYPES) {
      const v = parseInt10(this.pct[t].value);
      if (Number.isNaN(v) || v > 100) errors.push(`${TYPE_LABELS[t]}: enter a percentage from 0 to 100.`);
      mix[t] = Number.isNaN(v) ? 0 : v;
      total += mix[t];
    }
    if (total !== 100) errors.push(`The mix must add up to 100% (now ${total}%).`);

    const range = (minId, maxId, what) => {
      const min = parseS($(minId).value);
      const max = parseS($(maxId).value);
      if (Number.isNaN(min) || Number.isNaN(max)) { errors.push(`${what}: enter times in seconds, e.g. 2.5.`); return null; }
      if (min > max) { errors.push(`${what}: the first time must not be longer than the second.`); return null; }
      return { min, max };
    };

    let count = null;
    if (!$('edCountLevel').checked) {
      count = parseInt10($('edCount').value);
      if (!(count >= 1 && count <= 200)) { errors.push('Number of signals: enter 1 to 200.'); count = null; }
    }
    const pause = $('edPauseLevel').checked ? null : range('edPauseMin', 'edPauseMax', 'Pause');
    const change = mix.change > 0 ? range('edChangeMin', 'edChangeMax', 'Change reaction') : null;
    const anticipation = mix.anticipation > 0 && !$('edAntLevel').checked
      ? range('edAntMin', 'edAntMax', 'Anticipation')
      : (mix.anticipation > 0 ? null : this.def.anticipation);
    if (!$('edName').value.trim()) errors.push('Give the exercise a name.');

    this.errors = errors;
    if (errors.length) return null;
    return normalizeDef({ ...this.def, name: $('edName').value.trim(), mix, count, pause, change: change ?? this.def.change, anticipation });
  }

  #update() {
    let total = 0;
    for (const t of TYPES) total += parseInt10(this.pct[t].value) || 0;
    $('edMixTotal').textContent = `Total ${total}%`;
    $('edMixTotal').classList.toggle('error', total !== 100);

    const has = (t) => (parseInt10(this.pct[t].value) || 0) > 0;
    $('edChangeBox').hidden = !has('change');
    $('edAntBox').hidden = !has('anticipation');
    $('edStage2').hidden = !has('change') && !has('anticipation');

    $('edCountBox').hidden = $('edCountLevel').checked;
    $('edPauseBox').hidden = $('edPauseLevel').checked;
    $('edAntRange').hidden = $('edAntLevel').checked;

    const level = this.getLevel();
    const lv = this.#lv();
    $('edCountHint').textContent = `(level ${level}: ${lv.count})`;
    $('edPauseHint').textContent = `(level ${level}: ${fmtS(lv.pause.min)} – ${fmtS(lv.pause.max)} s)`;
    $('edAntHint').textContent = `(level ${level}: ${fmtS(lv.anticipation.min)} – ${fmtS(lv.anticipation.max)} s)`;

    const def = this.#read();
    const preview = $('edPreview');
    if (this.mode !== 'preset') $('edSave').disabled = !def;
    if (!def) {
      preview.textContent = this.errors[0];
      preview.classList.add('error');
      return;
    }
    preview.classList.remove('error');
    const ex = buildExercise(def, level);
    const parts = TYPES.map((t, i) => [TYPE_LABELS[t], ex.list.filter((x) => x === i).length])
      .filter(([, n]) => n > 0)
      .map(([name, n]) => `${n} ${name}`);
    preview.textContent = `At level ${level}: ${ex.count} signals (${parts.join(', ')}), about ${ex.totalSeconds} s.`;
  }
}
