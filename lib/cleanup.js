import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { walkFiles } from './utils.js';

export class Cleanup extends EventEmitter {
  async run(directory, olderThanDays, confirm = false) {
    this.emit('cleanup-start', { directory, olderThanDays, confirm });
    const paths = await walkFiles(directory);
    const thresholdMs = olderThanDays * 86400000;
    const now = Date.now();
    const candidates = [];

    for (const filePath of paths) {
      try {
        const stats = await fs.stat(filePath);
        const ageMs = now - stats.mtimeMs;
        if (ageMs > thresholdMs) {
          const candidate = { path: filePath, size: stats.size, daysOld: ageMs / 86400000 };
          candidates.push(candidate);
          this.emit('file-found', candidate);
        }
      } catch (error) {
        this.emit('file-error', { path: filePath, error });
      }
    }

    const totalSize = candidates.reduce((sum, file) => sum + file.size, 0);
    let deleted = 0;
    if (confirm) {
      for (const file of candidates) {
        try {
          await fs.unlink(file.path);
          deleted += 1;
          this.emit('file-deleted', { path: file.path, processed: deleted, total: candidates.length });
        } catch (error) {
          this.emit('file-error', { path: file.path, error });
        }
      }
    }
    const result = { candidates, deleted, totalSize, dryRun: !confirm };
    this.emit('cleanup-complete', result);
    return result;
  }
}
