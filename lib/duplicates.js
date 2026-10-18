import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { walkFiles } from './utils.js';

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export class DuplicateFinder extends EventEmitter {
  async find(directory) {
    this.emit('scan-start', { directory });
    const paths = await walkFiles(directory);
    const bySize = new Map();
    for (const filePath of paths) {
      try {
        const { size } = await fs.stat(filePath);
        if (!bySize.has(size)) bySize.set(size, []);
        bySize.get(size).push(filePath);
      } catch (error) {
        this.emit('file-error', { path: filePath, error });
      }
    }

    const candidates = [...bySize.values()].filter((group) => group.length > 1).flat();
    const hashes = new Map();
    let processed = 0;
    for (const filePath of candidates) {
      try {
        const hash = await hashFile(filePath);
        if (!hashes.has(hash)) hashes.set(hash, []);
        hashes.get(hash).push(filePath);
      } catch (error) {
        this.emit('file-error', { path: filePath, error });
      }
      processed += 1;
      this.emit('file-processed', { path: filePath, processed, total: candidates.length });
    }

    const groups = [];
    let wastedBytes = 0;
    for (const [hash, files] of hashes) {
      if (files.length < 2) continue;
      const size = (await fs.stat(files[0])).size;
      groups.push({ hash, files, size });
      wastedBytes += size * (files.length - 1);
    }
    const result = { groups, wastedBytes };
    this.emit('duplicates-found', result);
    return result;
  }
}
