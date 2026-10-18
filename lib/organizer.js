import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { walkFiles } from './utils.js';

const CATEGORIES = {
  Documents: ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.tiff', '.ico'],
  Archives: ['.zip', '.rar', '.tar', '.gz', '.7z', '.bz2'],
  Code: ['.js', '.mjs', '.cjs', '.py', '.java', '.cpp', '.c', '.h', '.html', '.css', '.json', '.ts', '.jsx', '.tsx', '.sh', '.sql'],
  Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.m4v', '.mpeg'],
  Other: []
};

async function uniqueTarget(directory, fileName) {
  const extension = path.extname(fileName);
  const base = path.basename(fileName, extension);
  let candidate = path.join(directory, fileName);
  let number = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${base}(${number})${extension}`);
      number += 1;
    } catch (error) {
      if (error.code === 'ENOENT') return candidate;
      throw error;
    }
  }
}

async function copyFileSmart(source, target, size) {
  if (size < 10 * 1024 * 1024) {
    await fs.copyFile(source, target, fs.constants?.COPYFILE_EXCL ?? 1);
  } else {
    await pipeline(createReadStream(source), createWriteStream(target, { flags: 'wx' }));
  }
}

export class Organizer extends EventEmitter {
  async organize(source, target) {
    const sourceRoot = path.resolve(source);
    const targetRoot = path.resolve(target);
    if (targetRoot === sourceRoot || targetRoot.startsWith(sourceRoot + path.sep)) {
      throw new Error('Target directory must not be the source directory or a subdirectory of it.');
    }
    await fs.mkdir(targetRoot, { recursive: true });
    for (const category of Object.keys(CATEGORIES)) {
      await fs.mkdir(path.join(targetRoot, category), { recursive: true });
    }
    const paths = await walkFiles(sourceRoot, [targetRoot]);
    this.emit('organize-start', { source: sourceRoot, target: targetRoot, total: paths.length });
    const counts = Object.fromEntries(Object.keys(CATEGORIES).map((category) => [category, 0]));
    let totalSize = 0;
    let copied = 0;

    for (const sourcePath of paths) {
      this.emit('copy-start', { source: sourcePath, processed: copied, total: paths.length });
      try {
        const stats = await fs.stat(sourcePath);
        const extension = path.extname(sourcePath).toLowerCase();
        const category = Object.entries(CATEGORIES).find(([name, extensions]) => name !== 'Other' && extensions.includes(extension))?.[0] || 'Other';
        const targetDirectory = path.join(targetRoot, category);
        const targetPath = await uniqueTarget(targetDirectory, path.basename(sourcePath));
        await copyFileSmart(sourcePath, targetPath, stats.size);
        counts[category] += 1;
        totalSize += stats.size;
        copied += 1;
        this.emit('copy-complete', { source: sourcePath, target: targetPath, processed: copied, total: paths.length, size: stats.size });
      } catch (error) {
        this.emit('copy-error', { source: sourcePath, error, message: error.message });
      }
    }
    const result = { counts, totalSize, copied };
    this.emit('organize-complete', result);
    return result;
  }
}
