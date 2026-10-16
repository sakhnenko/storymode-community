# AI editor benchmark

Measures what the AI editor sends and spends for every kind of question, on every speed, as the text-only editor and with project memory. It runs on a fixture book, "The Glass Hollows" (`fixture.ts`): 8 chapters of about 13k characters, folios, Codex memory, and three planted contradictions (Lia's eye colour, Kai's age, which eye Kai lost).

The 15 questions are in `scenarios.ts`:

| Kind | What it covers |
|---|---|
| Passage (4) | Editorial review, spelling and grammar, and reading flow on a selected passage; a selection checked against earlier chapters. |
| Chapter (3) | Chapter review, brainstorming an ending, and a question about the chapter's facts. |
| Book (8) | Eye colour, age and injury contradictions, the first mention of the amulet, a named chapter, a reported belief, pacing, and plot holes. |

## Offline: tokens, routing and evidence (free, every test run)

`npm run bench:editor` builds the exact prompt story-chat would send for all 90 requests (15 questions × fast, thoughtful and creative × text-only and memory) and fails when:

- a request uses more than 5% more input tokens than `baseline.json`;
- a request switches model or context (selection, chapter, full book, or focused book);
- a question loses the passages its answer depends on (`evidence` in `scenarios.ts`);
- book fact questions with memory stop using at most half the input of the full text.

After an intended change, run `npm run bench:editor:update` to rewrite `baseline.json` and `report.md`, and commit both. `report.md` has the per-request tables.

## Live: real tokens, credits, speed and answers (costs credits)

Open **Admin → AI editor** (`/admin?tab=editor`). It runs as the signed-in admin, so there is nothing to log in with. The deployed app must include the memory-first editor (PR #31); the tab says so if it doesn't.

1. **Test book.** Create the test project, which is free, then read it into the Codex, which costs about 80 credits.
2. **Run.** Pick the speeds, the editors (text only, with memory), the question kinds and the number of repeats. The tab shows how many requests that is and roughly what it costs, and asks before spending:
   - the full matrix is about 1,700 credits, mostly the creative speed;
   - thoughtful book questions alone are about 100.
3. **Results.** The editor is asked each question in turn while the tab shows progress; keep the tab open. Then every request shows, as "text only → with memory":
   - input and output tokens and credits, from the credit ledger;
   - time to first text and total time, as the browser sees them;
   - whether the answer mentions what it should (`expect` in `scenarios.ts`).
4. **Baseline.** Every run is saved in `ai_editor_bench_runs`, which only admins can see. Mark one **Use as baseline**. Later runs list the requests that got worse:
   - more than 10% more input tokens;
   - more than 15% more credits, plus one credit;
   - more than 1.5 times as long to first text, plus 2 seconds;
   - a check that used to pass now fails.

The same runner works from the command line with `npm run bench:editor:live`, which uses `scripts/editor-bench-live.ts`. Use `-- setup [--yes]` first, then `-- --yes [--save-baseline]`, narrowed with `--speeds`, `--modes`, `--kinds`, `--only` and `--repeat`. Its runs appear in the same history. It signs in with `BENCH_EMAIL` and `BENCH_PASSWORD`, or `BENCH_ACCESS_TOKEN`, from `.env.bench.local`, which git ignores. Every charge is labelled in `credit_ledger.metadata.bench`.
