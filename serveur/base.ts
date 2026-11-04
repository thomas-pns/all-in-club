/**
 * Base de données SQLite (module intégré à Node.js : aucune dépendance native).
 * Un seul fichier : data/all-in-club.db
 */
import type { DatabaseSync as TDatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Chargé dynamiquement : certains outils (Vite) ne connaissent pas encore ce module intégré.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
export type Base = TDatabaseSync;

export function ouvrirBase(chemin: string): Base {
  if (chemin !== ':memory:') mkdirSync(dirname(chemin), { recursive: true });
  const db = new DatabaseSync(chemin);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 3000;

    CREATE TABLE IF NOT EXISTS utilisateurs (
      id INTEGER PRIMARY KEY,
      pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
      hash TEXT NOT NULL,
      email TEXT COLLATE NOCASE,
      avatar TEXT NOT NULL DEFAULT 'renard',
      toujours_montrer INTEGER NOT NULL DEFAULT 0,
      cree INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      jeton TEXT PRIMARY KEY,          -- empreinte SHA-256 du jeton
      utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      expire INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reinitialisations (
      jeton TEXT PRIMARY KEY,
      utilisateur INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
      expire INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_utilisateur ON sessions(utilisateur);
  `);
  return db;
}
