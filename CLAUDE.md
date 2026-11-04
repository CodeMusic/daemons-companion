# daemons-companion -- for a session working here

Read `CONTEXT.md` (what this is), then **`LAYOUT.md` (where everything lives)**, then, for the app, `app/AGENTS.md`.

- **Put new code where `LAYOUT.md` says its kind goes.** Nothing new goes loose at the top of `app/` or of a folder
  that already sorts its files. If no folder fits, add one and say what it is for.
- **Keep `LAYOUT.md` true** (C-292): a commit that adds, moves, renames or removes a folder, or a file at the root,
  updates `LAYOUT.md` in the same commit. `server/test/layout.test.ts` (in `npm test`) fails when they disagree.
- Move a file with `git mv`, in a commit that only moves it and fixes its imports, so `git log --follow` keeps its history.
- Tickets are `C-` ids in `TODO.md`, permanent; commit messages and code comments cite them (`// C-264: ...`). Keep those
  comments when code moves.
- This repository is **public**: nothing personal goes in it. DAEMONS is said **DAY-mons** (`app/AGENTS.md`).
