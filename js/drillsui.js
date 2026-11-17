// Drill screens: the list (for the current exercise, or all), the read view
// and the editor.

import { TYPES, TYPE_LABELS, PRESETS, newId } from './exercises.js';
import { RESPONSE_LABELS, normalizeDrill, drillTypes, exerciseTypes, drillFits, typesSummary } from './drills.js';

const $ = (id) => document.getElementById(id);

const exerciseTitle = (def) => {
  const n = PRESETS.indexOf(def) + 1;
  return n ? `Program ${n}` : def.name;
};

export class DrillsUI {
  /**
   * @param drills      DrillLibrary
   * @param library     Library (exercises), to show which exercises a drill fits
   * @param getExercise () => the current exercise definition
   * @param onShare     (drill) => void
   * @param onChanged   () => void   drills were added, changed or deleted
   */
  constructor({ drills, library, getExercise, onShare, onChanged }) {
    this.drills = drills;
    this.library = library;
    this.getExercise = getExercise;
    this.onShare = onShare;
    this.onChanged = onChanged;
    this.current = null; // drill in the view / editor
    this.deleteTimer = 0;

    // list
    $('swAllDrills').addEventListener('change', () => this.renderList());
    $('btnNewDrill').addEventListener('click', () => this.edit(null));
    $('btnDrillsClose').addEventListener('click', () => $('drillsDialog').close());

    // view
    $('dvEdit').addEventListener('click', () => { $('drillView').close(); this.edit(this.current); });
    $('dvShare').addEventListener('click', () => this.onShare(this.current));
    $('dvClose').addEventListener('click', () => $('drillView').close());

    // editor
    this.resp = {};
    for (const t of TYPES) {
      const label = document.createElement('label');
      const span = document.createElement('span');
      span.textContent = RESPONSE_LABELS[t];
      const area = document.createElement('textarea');
      area.rows = 2;
      area.maxLength = 1000;
      label.append(span, area);
      $('deResponses').append(label);
      this.resp[t] = area;
    }
    $('drillEditor').addEventListener('input', () => this.#updateEditor());
    $('deSave').addEventListener('click', () => this.#save());
    $('deCancel').addEventListener('click', () => $('drillEditor').close());
    $('deDelete').addEventListener('click', () => {
      if (!this.deleteTimer) {
        $('deDelete').textContent = 'Tap again to delete';
        this.deleteTimer = setTimeout(() => this.#resetDelete(), 3000);
        return;
      }
      this.#resetDelete();
      this.drills.remove(this.current.id);
      $('drillEditor').close();
      this.#changed();
    });
  }

  // ---------- list ----------

  open() {
    $('swAllDrills').checked = false;
    this.renderList();
    $('drillsDialog').showModal();
  }

  renderList() {
    const def = this.getExercise();
    const types = exerciseTypes(def);
    const all = $('swAllDrills').checked;
    $('drillsFor').textContent = types.length
      ? `For ${exerciseTitle(def).replace('\n', ' ')}: drills with ${typesSummary(types, TYPE_LABELS)}` +
        (def.mix.distract ? ' (Distract optional)' : '') + '.'
      : 'This exercise only has Distract signals, so no drill fits it.';
    const list = all ? this.drills.sorted() : this.drills.forExercise(def);
    $('drillList').replaceChildren(...list.map((d) => this.#row(d, def)));
    $('drillsEmpty').hidden = list.length > 0;
    $('drillsEmpty').textContent = all
      ? 'No drills yet. Add one with “New drill”.'
      : 'No drills for this exercise yet. Add one with “New drill”, or switch on “Show all drills”.';
  }

  #row(drill, def) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'ex-item';
    const name = document.createElement('span');
    name.className = 'ex-name';
    name.textContent = drill.name;
    const meta = document.createElement('span');
    meta.className = 'ex-meta';
    meta.textContent = typesSummary(drillTypes(drill), TYPE_LABELS) + (drillFits(drill, def) ? '' : ' (other exercises)');
    b.append(name, meta);
    b.addEventListener('click', () => this.view(drill));
    li.append(b);
    return li;
  }

  // ---------- read view ----------

  view(drill) {
    this.current = drill;
    $('dvName').textContent = drill.name;
    $('dvTypes').textContent = typesSummary(drillTypes(drill), TYPE_LABELS);
    const body = $('dvBody');
    body.replaceChildren();
    const section = (title, content) => {
      const h = document.createElement('h3');
      h.textContent = title;
      body.append(h, content);
    };
    const para = (text) => { const p = document.createElement('p'); p.textContent = text; return p; };
    if (drill.start) section('Start position', para(drill.start));
    for (const t of TYPES) if (drill.responses[t]) section(RESPONSE_LABELS[t], para(drill.responses[t]));
    if (drill.notes) section('Notes', para(drill.notes));
    if (drill.video) {
      const a = document.createElement('a');
      a.href = drill.video; // normalizeDrill only lets http(s) links through
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = drill.video;
      section('Video', a);
    }
    $('drillView').showModal();
    $('drillView').focus(); // not the video link
    $('drillView').scrollTop = 0;
  }

  // ---------- editor ----------

  /** @param drill a drill to edit, or null for a new one */
  edit(drill) {
    this.isNew = !drill;
    this.current = drill ?? { id: newId(), name: '', start: '', responses: {}, notes: '', video: '' };
    this.#resetDelete();
    $('deTitle').textContent = this.isNew ? 'New drill' : 'Edit drill';
    $('deDelete').hidden = this.isNew;
    $('deName').value = this.current.name;
    $('deStart').value = this.current.start;
    for (const t of TYPES) this.resp[t].value = this.current.responses[t] ?? '';
    $('deNotes').value = this.current.notes;
    $('deVideo').value = this.current.video;
    this.#updateEditor();
    $('drillEditor').showModal();
    $('drillEditor').scrollTop = 0;
  }

  #resetDelete() {
    clearTimeout(this.deleteTimer);
    this.deleteTimer = 0;
    $('deDelete').textContent = 'Delete';
  }

  /** The form as a drill, plus the first problem (or null). */
  #read() {
    const raw = {
      id: this.current.id,
      name: $('deName').value,
      start: $('deStart').value,
      responses: Object.fromEntries(TYPES.map((t) => [t, this.resp[t].value])),
      notes: $('deNotes').value,
      video: $('deVideo').value.trim(),
    };
    let problem = null;
    if (!raw.name.trim()) problem = 'Give the drill a name.';
    else if (!TYPES.some((t) => t !== 'distract' && raw.responses[t].trim())) problem = 'Describe what to do on at least one signal (other than Distract).';
    else if (raw.video && !/^https?:\/\/\S+$/i.test(raw.video)) problem = 'The video link must start with https:// (or http://).';
    return { drill: problem ? null : normalizeDrill(raw), problem };
  }

  #updateEditor() {
    const { drill, problem } = this.#read();
    $('deSave').disabled = !drill;
    const preview = $('dePreview');
    preview.classList.toggle('error', !drill);
    if (!drill) { preview.textContent = problem; return; }
    const fits = [...this.library.presets, ...this.library.custom].filter((d) => drillFits(drill, d)).map(exerciseTitle);
    preview.textContent = `Signals: ${typesSummary(drillTypes(drill), TYPE_LABELS)}. ` +
      (fits.length ? `Shows up for: ${fits.join(', ')}.` : 'No exercise uses exactly these signals yet.');
  }

  #save() {
    const { drill } = this.#read();
    if (!drill) return;
    const saved = this.drills.save(drill);
    $('drillEditor').close();
    this.#changed();
    if (saved) this.view(saved);
  }

  #changed() {
    if ($('drillsDialog').open) this.renderList();
    this.onChanged();
  }
}
