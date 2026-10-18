import fs from 'node:fs/promises';
import path from 'node:path';

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function errorMessage(error, target) {
  if (error?.code === 'ENOENT') return `Path not found: ${target}`;
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return `Permission denied: ${target}`;
  if (error?.code === 'EISDIR') return `Expected a file but found a directory: ${target}`;
  return error?.message || 'Unexpected error';
}

export async function walkFiles(directory, excludedDirectories = []) {
  const root = path.resolve(directory);
  const excluded = new Set(excludedDirectories.map((item) => path.resolve(item)));
  const result = [];
  async function visit(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (excluded.has(path.resolve(fullPath))) continue;
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }
  await visit(root);
  return result;
}
