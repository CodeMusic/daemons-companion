# daemons-companion -- for a session working here

Read `CONTEXT.md` (what this is), then **`LAYOUT.md` (where everything lives)**, then, for the app, `app/AGENTS.md`.

- **Put new code where `LAYOUT.md` says its kind goes.** Nothing new goes loose at the top of `app/` or of a folder
  that already sorts its files. If no folder fits, add one and say what it is for.
- **Keep `LAYOUT.md` true** (C-292): a commit that adds, moves, renames or removes a folder, or a file at the root,
  updates `LAYOUT.md` in the same commit. `server/test/layout.test.ts` (in `npm test`) fails when they disagree.
- **Keep mind and machine apart** (C-387; `LAYOUT.md` "Mind and machine"): the psychology of mind (feelings, persona,
  dreams, memory, the muse, synesthesia, the words a creation is asked for) never imports the machinery of models
  (thinkers, endpoints, THE MIND's routing, the voice, image and music doors) and never calls a model itself -- it is
  handed a thinker, or writes a recipe the machine renders. A new file in `server/src/machine/` or `server/src/psyche/`, or any new MIND or MACHINE
  file, is named on its side in `LAYOUT.md`; `server/test/layout.test.ts` fails otherwise.
- Move a file with `git mv`, in a commit that only moves it and fixes its imports, so `git log --follow` keeps its history.
- Tickets are `C-` ids, permanent, **held in Redmine** (project `companion`; DAEMONS' `tools/tickets.py`, and its
  CLAUDE.md for the commands). `TODO.md` here is Redmine's mirror, rebuilt nightly: never edit a ticket row by hand.
  Commit messages and code comments cite the ids (`// C-264: ...`); keep those comments when code moves.
- This repository is **public**: nothing personal goes in it. DAEMONS is said **DAY-mons** (`app/AGENTS.md`).
