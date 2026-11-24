# RESEARCH -- a study beside the journal and the dreams (C-454, DESIGN)

*Design only, 2026-11-21; built after C-455 (`docs/REVIEWS.md`). Every name the player reads is DRAFT.*

The user's ask (2026-11-21): a research kind, set beside the journal and the dreams. You set a hypothesis, add files for
context, and talk to a mind agent whose system makes it a senior expert in the field. It draws in conversations,
journals, dreams, life management and goals, and it may meet EUDAIMONIA's PRAXIS and ARETE.

## The user's choices (by multiple choice, 2026-11-21)

| Question | Chosen |
|---|---|
| Where it lives | **A PRAXIS form**, RESEARCH: a study holds its hypothesis, its sources (files kept as blobs), its conversations and its findings. It syncs like GOALS, and a finding earns ARETE. In the app it sits beside JOURNAL and DREAMS |
| How the expert is made | **From the field the player names** ("sleep science", "Jungian analysis") and the hypothesis: its system prompt is written from them, **shown and editable**, and it speaks as an expert, **not as the daemon** |
| What it draws in | **Ticked per study**: conversations, journal, dreams, GOALS and life, other PRAXIS spaces. **All off until turned on**, and the expert says which it read |

## The form (`docs/PROJECTS.md` section 8 gains a row)

| Form | Kinds | Views | Points for |
|---|---|---|---|
| **RESEARCH** | Study, Source, Conversation, Finding | the study (hypothesis on top, sources, the talk, findings), a list of studies | a finding recorded |

- **Study**: a title, a **field**, the **hypothesis** (a sentence), the expert's **system** (written once, then the
  player's to edit), the **draws** (which of their own spaces it may read), and a state: *open*, *supported*,
  *not supported*, *set aside*. Never "failed": a hypothesis not supported is a finding too.
- **Source**: a file (a PDF, text, an image) kept by its SHA-256 in PRAXIS's blob store (C-431), with its extracted text
  beside it for the expert to read. Or a link, or a note.
- **Conversation**: the talk with the expert, turn by turn. Each answer names the sources and the drawn-in entries it
  used.
- **Finding**: a line the player keeps from the talk, or one the expert *proposes* (PRAXIS's rule: the AI proposes, you
  decide). It earns ARETE when kept.

## Mind and machine (C-387)

- MIND (`psyche/` or `lifemanagement/`, per PROJECTS 3): `research.ts`. It writes the expert's system from the field and
  the hypothesis, gathers what the ticked draws allow into a context (each piece labelled with where it came from), and
  shapes the ask. It is handed a `Chat`; it never calls a model.
- MACHINE: THE MIND routes the talk. A study is long-context work, so the Tiiny or the player's endpoint comes first and
  the phone's own mind is a fallback for short turns only. Extracting text from a PDF is the machine's too (`blobstore.ts`'s
  neighbour).

## The privacy line

Nothing is drawn in that the player did not tick, and each answer says what it read. A study's files and talk live only
on the player's own replicas, as every PRAXIS space does. Nothing personal goes in the repository.

## First slice, when it is built

A study with field, hypothesis, an editable expert, text and PDF sources, the talk, findings proposed and kept, and two
draws: the journal and GOALS. Dreams, conversations and other spaces follow. EUDAIMONIA shows it once the site's PRAXIS
pages exist (E-1).

## Built (2026-11-23, DRAFT)

- **First slice** (3058104a): the study, the editable expert, text, link and file sources (a PDF read on the hub, kept
  as a blob), the talk answered in the background by the house's mind (a RESEARCH task, home minds only), findings
  proposed and kept, and two draws: the JOURNAL and GOALS.
- **Second slice**: two more draws -- **DREAMS** (the dream journals' dreams and the daemon's own nights, the ten newest)
  and **CONVERSATIONS** (meetings written up and voice notes heard, the eight newest). Other PRAXIS spaces follow.

## OPEN

- Whether a study can have **more than one expert** (a second opinion, REASON and INSTINCT's pair).
- Whether the daemon **comments** on a study from outside it, for example in MENTIONS.
- **Web search** for the expert: off for now, since it would send the hypothesis out of the house.
