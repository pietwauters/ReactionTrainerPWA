// Sharing and backup UI: the share dialog (QR code + link), adding a shared
// exercise or drill (from an opened link or a pasted one), and backup files.

import { qrSvg } from './qr.js';
import { APP_URL, exerciseLink, drillLink, findShared, decodeShared, backupFile, readBackup, sameExercise } from './transfer.js';
import { buildExercise, mixSummary, TYPE_LABELS } from './exercises.js';
import { drillTypes, typesSummary, sameDrill } from './drills.js';

const $ = (id) => document.getElementById(id);

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A small choice dialog. Resolves with the chosen action's value, or null when
 * dismissed.
 * @param actions [{ label, value, kind: 'primary' | 'secondary' | 'danger' }]
 */
export function ask({ title, text, note = null, actions }) {
  const dialog = $('msgDialog');
  $('msgTitle').textContent = title;
  $('msgText').textContent = text;
  $('msgNote').textContent = note ?? '';
  $('msgNote').hidden = !note;
  return new Promise((resolve) => {
    let result = null;
    $('msgActions').replaceChildren(...actions.map(({ label, value = null, kind = 'primary' }) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (kind !== 'primary') b.className = kind;
      b.addEventListener('click', () => { result = value; dialog.close(); });
      return b;
    }));
    dialog.addEventListener('close', () => resolve(result), { once: true });
    dialog.showModal();
  });
}

export class Sharing {
  /**
   * @param library      Library
   * @param drills       DrillLibrary
   * @param getLevel     () => current level, for previews
   * @param onAdded      (def) => void    an exercise was added or updated from a link
   * @param onDrillAdded (drill) => void  a drill was added or updated from a link
   * @param onChanged    () => void       own exercises / drills changed (restore)
   */
  constructor({ library, drills, getLevel, onAdded, onDrillAdded, onChanged }) {
    this.library = library;
    this.drills = drills;
    this.onDrillAdded = onDrillAdded;
    this.getLevel = getLevel;
    this.onAdded = onAdded;
    this.onChanged = onChanged;
    this.shareData = null;

    // share dialog
    $('btnShareClose').addEventListener('click', () => $('shareDialog').close());
    $('btnShareLink').addEventListener('click', () => {
      navigator.share(this.shareData).catch(() => { /* cancelled */ });
    });
    $('btnCopyLink').addEventListener('click', async () => {
      const btn = $('btnCopyLink');
      try {
        await navigator.clipboard.writeText(this.shareData.url);
        btn.textContent = 'Copied!';
      } catch {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => { btn.textContent = 'Copy link'; }, 1500);
    });

    // paste a link
    const openPaste = () => {
      $('pasteInput').value = '';
      $('pasteError').hidden = true;
      $('pasteDialog').showModal();
      $('pasteInput').focus();
    };
    $('btnPasteLink').addEventListener('click', openPaste);
    $('btnDrillPaste').addEventListener('click', openPaste);
    const pasteOk = () => {
      const shared = findShared($('pasteInput').value);
      if (!shared) { $('pasteError').hidden = false; return; }
      $('pasteDialog').close();
      this.importShared(shared);
    };
    $('btnPasteOk').addEventListener('click', pasteOk);
    $('pasteInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') pasteOk(); });
    $('pasteInput').addEventListener('input', () => { $('pasteError').hidden = true; });
    $('btnPasteCancel').addEventListener('click', () => $('pasteDialog').close());

    // backup
    $('btnBackup').addEventListener('click', () => this.saveBackup());
    $('btnRestore').addEventListener('click', () => { $('restoreFile').value = ''; $('restoreFile').click(); });
    $('restoreFile').addEventListener('change', (e) => { if (e.target.files[0]) this.restore(e.target.files[0]); });
  }

  // ---------- share dialog ----------

  #openShare({ title, note, url, shareTitle, text }) {
    $('shareTitle').textContent = title;
    $('shareNote').textContent = note;
    $('shareQr').innerHTML = qrSvg(url);
    $('shareUrl').textContent = url;
    this.shareData = { title: shareTitle, text, url };
    $('btnShareLink').hidden = !(navigator.share && (!navigator.canShare || navigator.canShare(this.shareData)));
    $('shareDialog').showModal();
  }

  shareApp() {
    this.#openShare({
      title: 'Share Reaction Trainer',
      note: 'Scan with a phone camera to open the app.',
      url: APP_URL,
      shareTitle: 'Reaction Trainer',
      text: 'Reaction trainer with metronome',
    });
  }

  async shareExercise(def) {
    this.#openShare({
      title: `Share “${def.name}”`,
      note: 'Scan with a phone camera or send the link. Opening it offers to add this exercise.',
      url: await exerciseLink(def),
      shareTitle: def.name,
      text: `Reaction Trainer exercise: ${def.name}`,
    });
  }

  async shareDrill(drill) {
    this.#openShare({
      title: `Share “${drill.name}”`,
      note: 'Scan with a phone camera or send the link. Opening it offers to add this drill.',
      url: await drillLink(drill),
      shareTitle: drill.name,
      text: `Reaction Trainer drill: ${drill.name}`,
    });
  }

  // ---------- adding a shared exercise or drill ----------

  /** Handle a shared item in the page address (opened link), if any. */
  handleIncomingLink() {
    const shared = findShared(location.hash);
    if (!shared) return;
    history.replaceState(null, '', location.pathname + location.search);
    this.importShared(shared);
  }

  #iosNote(what) {
    return isIOS && !isStandalone
      ? `Installed this app on your home screen? It keeps its own ${what}s, separate from Safari. ` +
        `To add the ${what} there, copy this link, open the app and use “Add from a shared link”.`
      : null;
  }

  async importShared(shared) {
    const item = await decodeShared(shared);
    if (!item) {
      await ask({
        title: shared.kind === 'drill' ? 'Shared drill' : 'Shared exercise',
        text: `This link does not contain a valid ${shared.kind}. It may have been cut off: ask the sender to share it again.`,
        actions: [{ label: 'Close' }],
      });
      return;
    }
    if (shared.kind === 'drill') await this.#importDrill(item);
    else await this.#importExercise(item);
  }

  async #importDrill(drill) {
    const describe = (d) => `${d.name}\nSignals: ${typesSummary(drillTypes(d), TYPE_LABELS)}` + (d.start ? `\nStart position: ${d.start}` : '');
    const existing = this.drills.get(drill.id);
    if (!existing) {
      const choice = await ask({
        title: 'Add shared drill?',
        text: describe(drill),
        note: this.#iosNote('drill'),
        actions: [{ label: 'Add', value: 'add' }, { label: 'Cancel', kind: 'secondary' }],
      });
      if (choice === 'add') this.onDrillAdded(this.drills.save(drill));
    } else if (sameDrill(existing, drill)) {
      const choice = await ask({
        title: 'Already added',
        text: `You already have the drill “${existing.name}”.`,
        actions: [{ label: 'Show it', value: 'show' }, { label: 'Close', kind: 'secondary' }],
      });
      if (choice === 'show') this.onDrillAdded(existing);
    } else {
      const choice = await ask({
        title: 'Update drill?',
        text: `You already have a version of this drill (“${existing.name}”). The shared version:\n\n${describe(drill)}`,
        actions: [
          { label: 'Replace mine', value: 'replace' },
          { label: 'Keep both', value: 'both', kind: 'secondary' },
          { label: 'Cancel', kind: 'secondary' },
        ],
      });
      if (choice === 'replace') this.onDrillAdded(this.drills.save(drill));
      if (choice === 'both') this.onDrillAdded(this.drills.save(this.drills.copyOf(drill)));
    }
  }

  #describe(def) {
    const level = this.getLevel();
    const ex = buildExercise(def, level);
    return `${def.name}\n${mixSummary(def)}\nAt level ${level}: ${plural(ex.count, 'signal')}, about ${ex.totalSeconds} s.`;
  }

  async #importExercise(def) {
    const existing = this.library.get(def.id);
    if (!existing) {
      const choice = await ask({
        title: 'Add shared exercise?',
        text: this.#describe(def),
        note: this.#iosNote('exercise'),
        actions: [{ label: 'Add', value: 'add' }, { label: 'Cancel', kind: 'secondary' }],
      });
      if (choice === 'add') this.onAdded(this.library.save(def));
    } else if (sameExercise(existing, def)) {
      const choice = await ask({
        title: 'Already added',
        text: `You already have “${existing.name}”.`,
        actions: [{ label: 'Choose it', value: 'select' }, { label: 'Close', kind: 'secondary' }],
      });
      if (choice === 'select') this.onAdded(existing);
    } else {
      const choice = await ask({
        title: 'Update exercise?',
        text: `You already have a version of this exercise (“${existing.name}”). The shared version:\n\n${this.#describe(def)}`,
        actions: [
          { label: 'Replace mine', value: 'replace' },
          { label: 'Keep both', value: 'both', kind: 'secondary' },
          { label: 'Cancel', kind: 'secondary' },
        ],
      });
      if (choice === 'replace') this.onAdded(this.library.save(def));
      if (choice === 'both') this.onAdded(this.library.save(this.library.copyOf(def)));
    }
  }

  // ---------- backup ----------

  async saveBackup() {
    const own = this.library.custom;
    const drills = this.drills.all;
    if (!own.length && !drills.length) {
      await ask({ title: 'Save backup', text: 'You have no own exercises or drills yet, so there is nothing to back up.', actions: [{ label: 'OK' }] });
      return;
    }
    const file = backupFile(own, drills);
    // iPhone: the share sheet offers "Save to Files", mail, AirDrop, ...
    if (isIOS && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async restore(file) {
    let backup;
    try {
      backup = readBackup(await file.text());
    } catch (e) {
      await ask({ title: 'Restore backup', text: e.message, actions: [{ label: 'Close' }] });
      return;
    }
    const n = backup.exercises.length;
    const nd = backup.drills.length;
    if (!n && !nd) {
      await ask({ title: 'Restore backup', text: 'This backup contains no exercises or drills.', actions: [{ label: 'Close' }] });
      return;
    }
    const date = backup.created ? new Date(backup.created).toLocaleDateString() : 'an unknown date';
    const mineN = this.library.custom.length;
    const mineD = this.drills.all.length;
    const mine = mineN + mineD;
    const choice = await ask({
      title: 'Restore backup',
      text: `Backup from ${date} with ${plural(n, 'exercise')} and ${plural(nd, 'drill')}.` +
        (mine ? `\nYou now have ${plural(mineN, 'own exercise')} and ${plural(mineD, 'drill')}.` : ''),
      note: mine
        ? 'Add: items that are in both are replaced by the backup version. Replace: your current own exercises and drills are deleted first.'
        : null,
      actions: mine
        ? [
          { label: 'Add to mine', value: 'merge' },
          { label: 'Replace mine', value: 'replace', kind: 'secondary' },
          { label: 'Cancel', kind: 'secondary' },
        ]
        : [{ label: 'Restore', value: 'merge' }, { label: 'Cancel', kind: 'secondary' }],
    });
    if (!choice) return;
    if (choice === 'replace') {
      this.library.replaceAll(backup.exercises);
      this.drills.replaceAll(backup.drills);
    } else {
      backup.exercises.forEach((d) => this.library.save(d));
      backup.drills.forEach((d) => this.drills.save(d));
    }
    this.onChanged();
  }
}
