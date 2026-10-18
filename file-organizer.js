#!/usr/bin/env node
import path from 'node:path';
import { Scanner } from './lib/scanner.js';
import { DuplicateFinder } from './lib/duplicates.js';
import { Organizer } from './lib/organizer.js';
import { Cleanup } from './lib/cleanup.js';
import { formatSize, errorMessage } from './lib/utils.js';

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.log(`
file-organizer — organize and inspect files safely

Usage:
  node file-organizer.js scan <directory>
  node file-organizer.js duplicates <directory>
  node file-organizer.js organize <source> --output <target>
  node file-organizer.js cleanup <directory> --older-than <days> [--confirm]

Examples:
  node file-organizer.js scan ~/Downloads
  node file-organizer.js duplicates ~/Downloads
  node file-organizer.js organize ~/Downloads --output ~/Organized
  node file-organizer.js cleanup ~/Downloads --older-than 90
  node file-organizer.js cleanup ~/Downloads --older-than 90 --confirm

cleanup without --confirm is a dry run. Always inspect the list before deleting.
`);
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  return index === -1 ? undefined : args[index + 1];
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  const directory = args[0];
  if (!directory) {
    usage();
    process.exitCode = 1;
    return;
  }

  try {
    if (command === 'scan') {
      const scanner = new Scanner();
      scanner.on('scan-start', ({ directory }) => console.log(`📂 Scanning: ${directory}`));
      scanner.on('file-found', ({ processed, total }) => {
        if (processed === total || processed % 25 === 0) {
          process.stdout.write(`\rProcessing... ${processed}/${total} files`);
        }
      });
      scanner.on('scan-complete', (stats) => {
        console.log('\n\n📊 Scan Results');
        console.log(`Total files: ${stats.totalFiles}`);
        console.log(`Total size: ${formatSize(stats.totalSize)}`);
        console.log('\nBy file type:');
        for (const [extension, value] of [...stats.byType].sort((a, b) => b[1].totalSize - a[1].totalSize)) {
          console.log(`  ${extension.padEnd(10)} ${String(value.count).padStart(5)} files  ${formatSize(value.totalSize)}`);
        }
        console.log('\nFile age:');
        console.log(`  Last 7 days:   ${stats.age.last7}`);
        console.log(`  Last 30 days:  ${stats.age.last30}`);
        console.log(`  Older than 90: ${stats.age.older90}`);
        console.log('\nLargest files:');
        stats.largest.forEach((file, index) => console.log(`  ${index + 1}. ${file.path} — ${formatSize(file.size)}`));
        console.log(`\nOldest file: ${stats.oldest ? `${stats.oldest.path} (${Math.floor(stats.oldest.ageDays)} days ago)` : 'No files found'}`);
      });
      await scanner.scan(path.resolve(directory));
    } else if (command === 'duplicates') {
      const finder = new DuplicateFinder();
      finder.on('scan-start', ({ directory }) => console.log(`🔍 Searching for duplicates in: ${directory}`));
      finder.on('file-processed', ({ processed, total }) => {
        if (processed === total || processed % 10 === 0) process.stdout.write(`\rCalculating hashes... ${processed}/${total} files`);
      });
      finder.on('duplicates-found', ({ groups, wastedBytes }) => {
        console.log(`\n\nFound ${groups.length} duplicate groups (${formatSize(wastedBytes)} wasted):`);
        groups.forEach((group, index) => {
          console.log(`\nGroup ${index + 1} (${group.files.length} copies, ${formatSize(group.size)} each):`);
          console.log(`  SHA-256: ${group.hash}`);
          group.files.forEach((file) => console.log(`  📄 ${file}`));
          console.log(`  Wasted space: ${formatSize(group.size * (group.files.length - 1))}`);
        });
        console.log(`\n💾 Total wasted space: ${formatSize(wastedBytes)}`);
      });
      await finder.find(path.resolve(directory));
    } else if (command === 'organize') {
      const output = optionValue(args, '--output');
      if (!output) throw new Error('Missing required option: --output <target-directory>');
      const organizer = new Organizer();
      organizer.on('organize-start', ({ source, target, total }) => {
        console.log(`📦 Organizing: ${source}\nTarget: ${target}\nFiles found: ${total}`);
      });
      organizer.on('copy-complete', ({ processed, total }) => {
        if (processed === total || processed % 25 === 0) process.stdout.write(`\rCopying files... ${processed}/${total}`);
      });
      organizer.on('copy-error', ({ source, message }) => console.error(`\n⚠️ Could not copy ${source}: ${message}`));
      organizer.on('organize-complete', ({ counts, totalSize, copied }) => {
        console.log('\n\n✅ Organization complete!\nSummary:');
        for (const [category, count] of Object.entries(counts)) console.log(`  ${category}: ${count} files`);
        console.log(`Total copied: ${copied} files (${formatSize(totalSize)})`);
      });
      await organizer.organize(path.resolve(directory), path.resolve(output));
    } else if (command === 'cleanup') {
      const rawDays = optionValue(args, '--older-than');
      const days = Number(rawDays);
      if (rawDays === undefined || !Number.isFinite(days) || days < 0) {
        throw new Error('Provide a valid non-negative number with --older-than <days>.');
      }
      const cleanup = new Cleanup();
      const confirm = args.includes('--confirm');
      cleanup.on('file-found', ({ path: file, daysOld, size }) => {
        console.log(`\n${file}\n  Size: ${formatSize(size)}\n  Modified: ${Math.floor(daysOld)} days ago`);
      });
      cleanup.on('file-deleted', ({ processed, total }) => {
        if (processed === total || processed % 25 === 0) process.stdout.write(`\rDeleting... ${processed}/${total}`);
      });
      cleanup.on('cleanup-complete', ({ candidates, deleted, totalSize, dryRun }) => {
        console.log(`\n\nTotal candidates: ${candidates.length} (${formatSize(totalSize)})`);
        if (dryRun) {
          console.log('⚠️ DRY RUN MODE: No files were deleted.');
          console.log(`To delete these files, rerun with --confirm.`);
        } else {
          console.log(`✅ Cleanup complete! Deleted ${deleted} files.`);
        }
      });
      await cleanup.run(path.resolve(directory), days, confirm);
    } else {
      console.error(`Unknown command: ${command}`);
      usage();
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`\n❌ ${errorMessage(error, directory)}`);
    process.exitCode = 1;
  }
}

main();
