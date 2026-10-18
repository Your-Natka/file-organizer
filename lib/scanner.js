import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { walkFiles } from './utils.js';

export class Scanner extends EventEmitter {
  async scan(directory) {
    this.emit('scan-start', { directory });
    const paths = await walkFiles(directory);
    const now = Date.now();
    const byType = new Map();
    const files = [];
    let totalSize = 0;
    const age = { last7: 0, last30: 0, older90: 0 };

    for (let index = 0; index < paths.length; index += 1) {
      const filePath = paths[index];
      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) continue;
        const extension = path.extname(filePath).toLowerCase() || '(other)';
        const ageDays = (now - stats.mtimeMs) / 86400000;
        const file = { path: filePath, size: stats.size, mtime: stats.mtime, ageDays };
        files.push(file);
        totalSize += stats.size;
        const type = byType.get(extension) || { count: 0, totalSize: 0 };
        type.count += 1;
        type.totalSize += stats.size;
        byType.set(extension, type);
        if (ageDays <= 7) age.last7 += 1;
        if (ageDays <= 30) age.last30 += 1;
        if (ageDays > 90) age.older90 += 1;
        this.emit('file-found', { ...file, processed: index + 1, total: paths.length });
      } catch (error) {
        this.emit('file-error', { path: filePath, error });
      }
    }

    const sorted = [...files].sort((a, b) => b.size - a.size);
    const oldest = files.reduce((oldestFile, file) => !oldestFile || file.mtime < oldestFile.mtime ? file : oldestFile, null);
    const statistics = {
      totalFiles: files.length, totalSize, byType, age,
      largest: sorted.slice(0, 3),
      oldest: oldest ? { ...oldest, ageDays: (now - oldest.mtime.getTime()) / 86400000 } : null
    };
    this.emit('scan-complete', statistics);
    return statistics;
  }
}
