// Sharing and backup UI: the share dialog (QR code + link), adding a shared
// exercise (from an opened link or a pasted one), and backup files.

import { qrSvg } from './qr.js';
import { APP_URL, exerciseLink, findPayload, decodeExercise, backupFile, readBackup, sameExercise } from './transfer.js';
import { buildExercise, mixSummary } from './exercises.js';

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
   * @param library    Library
   * @param getLevel   () => current level, for previews
   * @param onAdded    (def) => void   an exercise was added or updated from a link
   * @param onChanged  () => void      own exercises changed (restore)
   */
  constructor({ library, getLevel, onAdded, onChanged }) {
    this.library = library;
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
    $('btnPasteLink').addEventListener('click', () => {
      $('pasteInput').value = '';
      $('pasteError').hidden = true;
      $('pasteDialog').showModal();
      $('pasteInput').focus();
    });
    const pasteOk = () => {
      const payload = findPayload($('pasteInput').value);
      if (!payload) { $('pasteError').hidden = false; return; }
      $('pasteDialog').close();
      this.importPayload(payload);
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

  // ---------- adding a shared exercise ----------

  /** Handle a shared exercise in the page address (opened link), if any. */
  handleIncomingLink() {
    const payload = findPayload(location.hash);
    if (!payload) return;
    history.replaceState(null, '', location.pathname + location.search);
    this.importPayload(payload);
  }

  #describe(def) {
    const level = this.getLevel();
    const ex = buildExercise(def, level);
    return `${def.name}\n${mixSummary(def)}\nAt level ${level}: ${plural(ex.count, 'signal')}, about ${ex.totalSeconds} s.`;
  }

  async importPayload(payload) {
    const def = await decodeExercise(payload);
    if (!def) {
      await ask({
        title: 'Shared exercise',
        text: 'This link does not contain a valid exercise. It may have been cut off: ask the sender to share it again.',
        actions: [{ label: 'Close' }],
      });
      return;
    }
    const existing = this.library.get(def.id);
    if (!existing) {
      const note = isIOS && !isStandalone
        ? 'Installed this app on your home screen? It keeps its own exercises, separate from Safari. ' +
          'To add the exercise there, copy this link, open the app, hold Program and choose “Add from a shared link”.'
        : null;
      const choice = await ask({
        title: 'Add shared exercise?',
        text: this.#describe(def),
        note,
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
    if (!own.length) {
      await ask({ title: 'Save backup', text: 'You have no own exercises yet, so there is nothing to back up.', actions: [{ label: 'OK' }] });
      return;
    }
    const file = backupFile(own);
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
    if (!n) {
      await ask({ title: 'Restore backup', text: 'This backup contains no exercises.', actions: [{ label: 'Close' }] });
      return;
    }
    const date = backup.created ? new Date(backup.created).toLocaleDateString() : 'an unknown date';
    const mine = this.library.custom.length;
    const choice = await ask({
      title: 'Restore backup',
      text: `Backup from ${date} with ${plural(n, 'exercise')}.` + (mine ? `\nYou now have ${plural(mine, 'own exercise')}.` : ''),
      note: mine
        ? 'Add: exercises that are in both are replaced by the backup version. Replace: your current own exercises are deleted first.'
        : null,
      actions: mine
        ? [
          { label: 'Add to my exercises', value: 'merge' },
          { label: 'Replace my exercises', value: 'replace', kind: 'secondary' },
          { label: 'Cancel', kind: 'secondary' },
        ]
        : [{ label: 'Restore', value: 'merge' }, { label: 'Cancel', kind: 'secondary' }],
    });
    if (!choice) return;
    if (choice === 'replace') this.library.replaceAll(backup.exercises);
    else backup.exercises.forEach((d) => this.library.save(d));
    this.onChanged();
  }
}
