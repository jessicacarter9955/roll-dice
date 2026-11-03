import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** SQLite VACUUM INTO creates a transactionally consistent copy, including WAL data. */
export function backupDatabase(source, destination) {
  const from = resolve(source), to = resolve(destination);
  if (from === to) throw new Error('Backup destination must differ from the active database.');
  if (!existsSync(from)) throw new Error('Database does not exist.');
  if (existsSync(to)) throw new Error('Backup already exists; refusing to overwrite it.');
  mkdirSync(dirname(to), {recursive: true});
  const db = new DatabaseSync(from, {readOnly: true});
  try {
    db.exec('PRAGMA busy_timeout=5000');
    db.exec(`VACUUM INTO '${to.replaceAll("'", "''")}'`);
  } finally { db.close(); }
  return verifyDatabase(to);
}

export function verifyDatabase(path) {
  const file = resolve(path);
  if (!existsSync(file)) throw new Error('Backup file does not exist.');
  const db = new DatabaseSync(file, {readOnly: true});
  try {
    const result = db.prepare('PRAGMA integrity_check').all().map(r => Object.values(r)[0]);
    if (result.length !== 1 || result[0] !== 'ok') throw new Error('SQLite integrity check failed.');
    const tables = ['users','sessions','rooms','crews','reports'];
    const count = Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n]));
    return {integrity: 'ok', records: count};
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , action, ...args] = process.argv;
  try {
    if (action === 'create' && args.length === 2) console.log(JSON.stringify(backupDatabase(args[0], args[1])));
    else if (action === 'verify' && args.length === 1) console.log(JSON.stringify(verifyDatabase(args[0])));
    else throw new Error('Usage: node tools/backup.mjs create SOURCE.db DESTINATION.db | verify BACKUP.db');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
