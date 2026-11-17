// Moving exercises between devices: share links and backup files.
//
// Share link: <app url>#ex=<payload>. The exercise travels inside the link
// (no server needed). The payload is 'z' + base64url(deflate-raw(JSON)),
// or 'j' + base64url(JSON) where the browser can't compress.
//
// Backup file: JSON { app: 'ReactionTrainer', kind: 'backup', v: 1, created, exercises: [...] }.

import { TYPES, normalizeDef } from './exercises.js';

export const APP_URL = 'https://pietwauters.github.io/ReactionTrainerPWA/';
const HASH_KEY = 'ex';
const BACKUP_APP = 'ReactionTrainer';
const BACKUP_KIND = 'backup';
const BACKUP_VERSION = 1;

// ---------- base64url ----------
function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const canCompress = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// ---------- exercise <-> link ----------

/** The fields worth sending: no defaults, no zeros, nothing built-in. */
function compact(def) {
  const d = { v: def.v, id: def.id, name: def.name, mix: {} };
  for (const t of TYPES) if (def.mix[t]) d.mix[t] = def.mix[t];
  if (def.count != null) d.count = def.count;
  if (def.pause) d.pause = def.pause;
  if (def.mix.change) d.change = def.change;
  if (def.anticipation && def.mix.anticipation) d.anticipation = def.anticipation;
  return d;
}

/** True if two definitions describe the same exercise (ignoring unused settings). */
export function sameExercise(a, b) {
  return JSON.stringify(compact(normalizeDef(a))) === JSON.stringify(compact(normalizeDef(b)));
}

export async function encodeExercise(def) {
  const json = new TextEncoder().encode(JSON.stringify(compact(def)));
  if (canCompress) {
    try { return 'z' + toB64url(await pipe(json, new CompressionStream('deflate-raw'))); } catch { /* fall through */ }
  }
  return 'j' + toB64url(json);
}

/** Payload -> definition (validated), or null. */
export async function decodeExercise(payload) {
  try {
    let bytes = fromB64url(payload.slice(1));
    if (payload[0] === 'z') {
      if (!canCompress) return null;
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else if (payload[0] !== 'j') {
      return null;
    }
    return importable(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export async function exerciseLink(def) {
  return `${APP_URL}#${HASH_KEY}=${await encodeExercise(def)}`;
}

/** Find a shared exercise in a link, a hash or a bare payload. Returns the payload or null. */
export function findPayload(text) {
  const t = String(text || '').trim();
  const m = t.match(new RegExp(`[#&]${HASH_KEY}=([zj][A-Za-z0-9_-]+)`));
  if (m) return m[1];
  return /^[zj][A-Za-z0-9_-]{8,}$/.test(t) ? t : null;
}

/** An incoming definition can never claim to be built in. */
function importable(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { builtIn, legacyRemainder, ...rest } = raw;
  if (typeof rest.id === 'string' && rest.id.startsWith('preset-')) delete rest.id;
  return normalizeDef(rest);
}

// ---------- backup ----------

export function backupFile(exercises) {
  const data = {
    app: BACKUP_APP, kind: BACKUP_KIND, v: BACKUP_VERSION,
    created: new Date().toISOString(),
    exercises: exercises.map(compact),
  };
  const day = data.created.slice(0, 10);
  return new File([JSON.stringify(data, null, 1)], `reactiontrainer-backup-${day}.json`, { type: 'application/json' });
}

/** Backup file text -> { created, exercises } or throws an Error with a message for the user. */
export function readBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This is not a Reaction Trainer backup file.'); }
  if (!data || data.app !== BACKUP_APP || data.kind !== BACKUP_KIND || !Array.isArray(data.exercises)) {
    throw new Error('This is not a Reaction Trainer backup file.');
  }
  if (data.v > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  return {
    created: typeof data.created === 'string' ? data.created : null,
    exercises: data.exercises.map(importable).filter(Boolean),
  };
}
