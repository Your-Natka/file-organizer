# file-organizer

A Node.js command-line tool to inspect a directory, detect duplicate files, copy files into categories, and safely identify old files for cleanup.

## Requirements

- Node.js 20 or newer
- npm (included with Node.js)

No third-party npm dependencies are required.

## Setup

```bash
git clone <your-repository-url>
cd file-organizer
node --version
```

This project uses ES Modules (`"type": "module"` in `package.json`).

## Commands

### 1. Scan a directory

```bash
node file-organizer.js scan ~/Downloads
# or
npm run scan -- ~/Downloads
```

Reports total file count and size, extension statistics, file age counts, three largest files, and the oldest file.

### 2. Find duplicates

```bash
node file-organizer.js duplicates ~/Downloads
# or
npm run duplicates -- ~/Downloads
```

Files are hashed with SHA-256 using `createReadStream()`. Files are grouped by hash; files with identical hashes and contents are reported along with wasted space. File sizes are checked first to avoid hashing files that cannot be duplicates.

### 3. Organize files

```bash
node file-organizer.js organize ~/Downloads --output ~/Organized
# or
npm run organize -- ~/Downloads --output ~/Organized
```

Copies files into `Documents`, `Images`, `Archives`, `Code`, `Videos`, or `Other`. Source files remain unchanged. Existing destination filenames are preserved by creating names such as `report(1).pdf`. Files smaller than 10 MB use `fs.copyFile`; files of 10 MB or larger use streams and `pipeline()`.

**Safety:** choose an output directory outside the source directory.

### 4. Clean up old files

First preview the files that match the age threshold (this does not delete anything):

```bash
node file-organizer.js cleanup ~/Downloads --older-than 90
```

Only after reviewing the list, delete matching files:

```bash
node file-organizer.js cleanup ~/Downloads --older-than 90 --confirm
```

Age is based on last modification time (`mtime`). `--confirm` performs permanent deletion, so use it carefully.

## Architecture

```text
file-organizer/
├── package.json
├── .gitignore
├── README.md
├── file-organizer.js
└── lib/
    ├── utils.js
    ├── scanner.js
    ├── duplicates.js
    ├── organizer.js
    └── cleanup.js
```

Each command is implemented as a class extending Node.js `EventEmitter`. Events separate command logic from console progress and reporting. File operations are handled asynchronously and errors are surfaced with actionable messages.

## Error handling

The CLI provides specific messages for missing paths (`ENOENT`) and permission errors (`EACCES` / `EPERM`). Individual file errors during a scan, copy, hash, or cleanup are emitted so that one inaccessible file does not necessarily stop the entire run.

## Testing safely

Create a small test directory with a few sample files and duplicate copies. Run `scan` and `duplicates`, then run `organize` to a separate output directory. Test cleanup in dry-run mode first. Do not test deletion against important personal folders.

## Notes

- Hidden files are included.
- Symbolic links are not followed by the directory walker.
- `cleanup` permanently removes files only when `--confirm` is supplied.
