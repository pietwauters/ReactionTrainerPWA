// The exercise list (a dialog): built-in programs and own exercises.
// Tap a row to choose it; ✎ opens it in the editor.

import { mixSummary } from './exercises.js';

const $ = (id) => document.getElementById(id);

export class Picker {
  /**
   * @param library  Library
   * @param onSelect (def) => void
   * @param onEdit   (def) => void
   * @param onNew    () => void
   */
  constructor(library, { onSelect, onEdit, onNew }) {
    this.library = library;
    this.dialog = $('pickerDialog');
    this.onSelect = onSelect;
    this.onEdit = onEdit;
    $('btnNewExercise').addEventListener('click', onNew);
    $('btnPickerClose').addEventListener('click', () => this.dialog.close());
  }

  open(selectedId) {
    this.render(selectedId);
    this.dialog.showModal();
    // focus (and show) the current exercise instead of the first button
    this.dialog.querySelector('.ex-item.selected')?.focus();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }

  render(selectedId) {
    const rows = (list, label) => list.map((def, i) => this.#row(def, label(def, i), def.id === selectedId));
    $('presetList').replaceChildren(...rows(this.library.presets, (d, i) => `${i + 1}. ${d.name.replace('\n', ' ')}`));
    $('customList').replaceChildren(...rows(this.library.custom, (d) => d.name));
    $('customEmpty').hidden = this.library.custom.length > 0;
  }

  #row(def, title, selected) {
    const li = document.createElement('li');
    const pick = document.createElement('button');
    pick.className = 'ex-item';
    pick.classList.toggle('selected', selected);
    if (selected) pick.setAttribute('aria-current', 'true');
    const name = document.createElement('span');
    name.className = 'ex-name';
    name.textContent = title;
    const meta = document.createElement('span');
    meta.className = 'ex-meta';
    meta.textContent = mixSummary(def);
    pick.append(name, meta);
    pick.addEventListener('click', () => { this.dialog.close(); this.onSelect(def); });

    const edit = document.createElement('button');
    edit.className = 'ex-edit';
    edit.textContent = '✎';
    edit.setAttribute('aria-label', `${def.builtIn ? 'View' : 'Edit'} ${title}`);
    edit.addEventListener('click', () => this.onEdit(def));

    li.append(pick, edit);
    return li;
  }
}
