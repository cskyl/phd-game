# AI PhD Simulator — Maintainer & Contributor Guide

> Read this before touching the game. It explains the architecture, the
> data-driven content format, the specific game systems we added, and the
> non-obvious gotchas that will otherwise cost you an afternoon.

This project is a reskin of **[phd-game](https://github.com/morriswmz/phd-game)**
by Mianzhi Wang (MIT). We kept the engine essentially untouched and built an
**AI/ML-PhD** game entirely in the YAML rulesets plus two small engine additions
(bilingual loading + a language-switch footer button).

---

## 1. The 30-second mental model

- The **engine** (`src/`, TypeScript → webpack → `dist/app.bundle.js`) is a
  generic, random-event-driven, text-adventure state machine. It knows nothing
  about AI PhDs.
- The **game** is **pure data**: YAML files under
  `static/rulesets/default/`. Events, items, statuses, stats bar, and all text
  live here. **95% of changes are YAML-only and need no TypeScript.**
- At boot, `app.bundle.js` reads `static/index.html`'s `#app_config` JSON, which
  points at the ruleset files and the two language files.

```
static/index.html  ──#app_config──▶  rulesets/default/{events,items,status,attributes,gui}.yaml
                                      rulesets/default/lang.{en,zh}.yaml
```

---

## 2. Repository layout

| Path | What it is | Touch it when… |
|------|------------|----------------|
| `static/rulesets/default/events.yaml` | **The game logic.** All events, choices, the research pipeline, conference calendar, internships, endings. | changing gameplay |
| `static/rulesets/default/items.yaml` | Inventory item ids + rarity (rarity only drives display color). | adding a tracked artifact |
| `static/rulesets/default/status.yaml` | Status effects (buffs/debuffs/flags) + attribute modifiers + durations. | adding a buff/flag/cooldown |
| `static/rulesets/default/attributes.yaml` | Derived attributes (`experimentBoost`, `hopeBoost`, `paperAcceptanceBoost`). | adding a new modifiable attribute |
| `static/rulesets/default/gui.yaml` | Stats-bar meters, footer buttons, item/status panels. | adding a meter or footer button |
| `static/rulesets/default/lang.en.yaml` / `lang.zh.yaml` | **All player-facing text**, keyed. Must stay in sync. | adding/altering any text |
| `static/index.html` | Boot config (which ruleset, which languages). | repointing rulesets / adding a language |
| `src/app.ts` | Boot + **language resolution** (`?lang=`, localStorage, browser, default). | language loading logic |
| `src/gui/guiFooter.ts` | Footer buttons incl. the `setLanguage` button type. | footer button behavior |
| `src/gui/guiStatsBar.ts` | Stats-bar rendering (see gotcha #4). | stats-bar rendering logic |
| `src/event/*.ts` | Engine: event loop, actions, conditions, expression compiler. | new action/condition types (rare) |
| `scripts/validate-ruleset.js` | **Static validator.** Run before every build (`prebuild` hook). | always run after editing YAML |
| `docs/MAINTAINERS.md` | This file. | |

---

## 3. Build, validate, run

Requires Node ≥ 18. On the BU SCC: `module load nodejs/20.12.2` (node is not on
the default PATH).

```bash
npm install
npm run validate     # static checks (also runs automatically via prebuild)
npm run build        # validate + webpack → dist/
npm start            # serve dist/ on http://localhost:8000  (Express)
```

`dist/` is a fully static site. You can also serve it with anything, e.g.
`python -m http.server 8000` from inside `dist/`. The game **must** be served
over HTTP — opening `index.html` from `file://` fails because it `fetch`es the
YAML.

### Running on the SCC and viewing from a laptop
The server runs on an SCC node (e.g. `scc-217`); `localhost` in your laptop
browser is your laptop. Bridge with an SSH tunnel:
```bash
# on your laptop, then open http://localhost:8000
ssh -L 8000:scc-217:8000 <user>@scc1.bu.edu
```
After any rebuild, **hard-refresh** the browser (Ctrl/Cmd+Shift+R): the bundle
filename is stable, so normal refresh serves the cached old version. This is the
single most common "my change didn't show up" cause.

---

## 4. The content DSL (what you can write in `events.yaml`)

An event:
```yaml
- id: UniqueEventId          # unique; also used by eventOccurred()/exclusions
  trigger: MonthBegin        # Initialization | Tick | YearBegin | MonthBegin | <custom>
  once: true                 # optional: fire at most once (only counts when it actually executes)
  probability: 0.3           # optional: chance to fire when conditions pass (expression or number)
  conditions:                # optional: ALL must be true
  - id: Expression
    expression: year >= 2 && itemCount('paper') < rule.papersRequired
  actions:                   # run in order when the event fires
  - id: DisplayMessage
    message: message.someKey
    confirm: message.ok
```

### Triggers and the monthly tick
- `GameTick` (trigger `Tick`) increments `elapsedMonth` and recomputes `month`
  (1–12) and `year`, then fires `YearBegin` (only on month 1, higher priority)
  and `MonthBegin`.
- **Within a single `MonthBegin` batch, events execute in file order** (for the
  same priority). We rely on this — see gotcha #1.

### Actions you'll use most
| Action | Purpose |
|--------|---------|
| `DisplayMessage` / `DisplayRandomMessage` | show text (`message`, `confirm`; `messages: [...]` for random) |
| `DisplayChoices` | present `choices:` (each has `message`, optional `requirement` *(HIDE if false)*, optional `disabledIf` *(SHOW greyed-out if true; gets `ui.disabledLabel` appended; click does nothing)*, `actions`) |
| `UpdateVariable` / `UpdateVariables` | set vars from expressions (RHS evaluated against live store) |
| `UpdateVariableLimits` | clamp a var to `[lo, hi]` |
| `GiveItem` / `UpdateItemAmounts` | change inventory (`updates:` keyed by item id) |
| `SetStatus` | `statusId` + `on: true/false` |
| `CoinFlip` | `probability` → `success:` / `fail:` action lists |
| `Random` | `groups:` each with `weight` (expression ok) + `actions` |
| `Switch` | `branches:` each `condition` + `actions`; **first true branch wins** |
| `EndGame` | `message`, `confirm`, `winning: bool`, optional `fx: confetti` |
| `TriggerEvents` | fire events by trigger id (used by the tick loop) |

### Expression language
Compiled to JS (`src/utils/expression.ts`). Variable names become
`getVar('name')`. Available functions (and **only** these):
`random()`, `randi(n)`, `max`, `min`, `floor`, `round`, `ceil`,
`clip(x,lo,hi)`, `eventOccurred('Id')`, `itemCount('id')`, `hasStatus('id')`,
`getAttributeValue('id')`, `totalMonths()`, `setVarLimits`, `upperBound`,
`lowerBound`. Operators include `+ - * / %`, comparisons, `&& || !`, and the
ternary `?:`. Booleans coerce to numbers, so prefer `hasStatus('x') * 2` over a
ternary (see gotcha #2).

---

## 5. The AI-PhD game design (what the data actually models)

### Core loop / research pipeline
```
read arXiv (free) ─▶ Research Idea
  └─ run experiment (−1 GPU) ─▶ Toy-Scale Result
       ├─ scale up (−3 GPU) ───────────▶ SOTA Result
       └─ train large model (−8 GPU) ──▶ SOTA Result + a figure (high impact)
  SOTA Result + run ablations (−2 GPU each) ─▶ Plots ×rule.figuresRequired
  write paper ─▶ Paper Draft
  submit at a real deadline ─▶ Under Review @ Venue ─▶ Accepted Paper | Rejected
```
Win condition: `itemCount('paper') >= rule.papersRequired` (default 3), then
**graduate by choice** (or get pushed out from year 7).

### Key variables (set in the `Init` event)
| Variable | Meaning | Notes |
|----------|---------|-------|
| `player.hope` | morale, 0–100 | 0 ⇒ drop out (`LostAllHope`) |
| `player.compute` | GPU budget **for this month**, 0–99 | **RESET every month** (use-it-or-lose-it, NOT banked) to `computeBase + funding + computeBoost(attr) + floor(year/2)`. Spent by experiments. |
| `player.computeBase` | your lab's monthly GPU allocation | set by the advisor pick + subfield modifier |
| `player.citations` | total citations | grow monthly ∝ `pubWeight × citeVelocity`; milestones at 50 / 200 |
| `player.pubWeight` | reputation/impact stock | from papers, preprints, internships, code release, viral models; raises acceptance & cuts scooping |
| `player.scoopMod` / `player.citeVelocity` | subfield modifiers | scoop rate × `scoopMod`; citation growth × `citeVelocity` |
| `player.letterStrength` / `player.serviceRep` | placement signals | advisor pick + fellowships / reviewing; feed the final placement |
| `player.hindex` / `player.paperCount` | derived display stats | recomputed each month in `CommonVariableUpdates` |
| `player.internCount` / `researchIntern` / `bigTechIntern` | internship record | feed the final placement score |
| `player.graduating` | 0/1 | set by thesis action or forced graduation; `Graduation` event reads it |
| `player.finalScore` | scratch | computed once per career choice to pick the placement tier |
| `advisor.fundingLevel` | compute regen + upgrade gating | moved by funding events |
| `advisor.happiness` | advisor mood | <0 ⇒ `unhappyAdvisor` debuff |
| `rule.papersRequired` / `rule.figuresRequired` | tunables | default 3 / 3 |

### Game setup (one-time, in `TheBeginning`)
After accepting the offer the player picks **difficulty** (sets
`rule.papersRequired` + scoop), an **advisor archetype** (famous/junior/balanced
→ `computeBase`, funding, `letterStrength`), and a **subfield** (LLM/CV/RL/
theory/systems → `scoopMod`, `citeVelocity`, `computeBase` tweak). These are the
biggest source of run-to-run variety. Keep `subfield` numeric (1–5).

### Core systems
1. **Compute** (`player.compute`): a **monthly capacity that resets** in
   `CommonVariableUpdates` (GPU is a rate, not a savings account — you cannot
   bank unused compute). Capacity = `computeBase + funding + computeBoost
   (attribute, from `upgradedEquipment`/`internCredits*`/`fellowship`/
   `gpuShortage`) + floor(year/2)`. Spent by the menu research actions; gates
   the large-model path. Top-left meter. Internships grant *temporary* capacity
   via the `internCredits*` statuses (you only have the company's GPUs for the
   summer), not a permanent dump.
2. **Citations** (`player.citations` + `player.pubWeight`): `CitationGrowth`
   accrues monthly; `WellCitedMilestone`/`InfluentialMilestone` grant acceptance
   buffs; reputation reduces scoop probability in `IdeaDoneByOthers` /
   `PrelimDoneByOthers`. Shown in the top-right stats meter.
3. **Real conference calendar** (game month = calendar month): you hold a
   `paperDraft` and submit at an open deadline; the decision lands months later.

   | Venue | `Deadline*` event (submit) | `Decision*` event (notify) |
   |-------|---------------------------|----------------------------|
   | ICML | month 2 | month 5 |
   | NeurIPS | month 5 | month 9 |
   | ICLR | month 9 | month 1 |
   | CVPR | month 11 | month 2 |

   Each venue has its own `submitted<Venue>` item. Submission is gated to one
   in-flight paper per venue (`itemCount('submitted<Venue>') === 0`) so a single
   `CoinFlip` resolves it cleanly.

### Service, awards & AI-world drama (event pack)
`ReviewRequest` (service → `serviceRep`), `CodeRelease`/`ReproducibilityCallout`
(`codeReleased` status → citations / avoid a callout), `Fellowship` (→
`fellowship` status: compute + acceptance + letter), `Obsolescence` (a new
foundation model voids a `majorResult`/`paperDraft`, forces a pivot),
`FamousCitation`, `GpuShortageEvent` (→ `gpuShortage` status cuts capacity),
`DatasetScandal`, and `TADuty` (skips a month early-on; sits before the menu).
`RebuttalPeriod` has a compute-spending "extra experiment" option.

### Internships (`RecruiterReachout` event + `applyInternship` menu action)
- **Apply yourself**: a monthly action (costs the month). Offer chance scales
  with reputation; on success a `Random` picks one of 5 company archetypes.
- **Get headhunted**: fires automatically when `pubWeight>=2 || citations>=60`
  (advisor/recruiter reaches out) — better, research-focused offers, for free.
- Archetypes differ in **compute granted** and **whether you can publish**
  (frontier lab / big-tech research / product team (no publish) / GPU-rich /
  startup). They set `researchIntern` / `bigTechIntern` which steer the ending.
- `interned` status (duration 10) limits you to ~one internship per year.

### Endings (`workOnThesis` / `ForcedGraduation` → `Graduation`)
- Graduate voluntarily once you meet the bar, or get pushed out from **year 7**.
- `Graduation` asks **academia vs industry**, computes `player.finalScore` from
  papers + citations + internship flags + `randi()` randomness, and a `Switch`
  picks a tiered placement message. **Year 8 with no degree ⇒ `Overdue` loss.**

### Parody names (in `lang.*.yaml` only — never in logic)
Companies: 狗家/Goggle, 香蕉/Banana, 脸谱/Faceplant, OpenAEye, DeepKind,
软软/Mikrohard, 黄狗/NWidia, 亚麻/Amazoom, 字节/ByteDunce, Mythral, Unicorn.ai,
Entropic. Schools: Stanfjord, Massivechusetts Institute of Tech, Berzerkeley,
Carnegie Meowlon. Add more freely — they live entirely in text.

---

## 6. How to make common changes

**Add a research event / random flavor event**
1. Add the event to `events.yaml` (pick the right `trigger`/`conditions`).
2. Add every `message`/`confirm` key to **both** `lang.en.yaml` and
   `lang.zh.yaml`.
3. `npm run validate`.

**Add an item** → `items.yaml` (id + rarity) + `item.<id>` &
`item.<id>.description` in both lang files. Reference via `itemCount('<id>')` /
`GiveItem` / `UpdateItemAmounts`.

**Add a status/buff** → `status.yaml` (id, `duration`, optional
`attributeModifiers`) + `status.<id>` & `.description` in both lang files.
Toggle with `SetStatus`.

**Add a stats-bar meter** → add an item to `gui.yaml`'s `statsBar.items` with a
`ui.*` text key; add the key to both lang files. **Put `elapsedMonth` in
`updateTrigger.variables`** so it repaints every month (gotcha #4).

**Add a language** → create `lang.<code>.yaml` with every required key, add it to
`languageFileUrls` in `index.html`, and add a footer `setLanguage` button in
`gui.yaml`. `npm run validate` only checks `en`/`zh` by default — pass a dir arg
or extend `LANGS` in the validator.

**Retune difficulty** → numbers only: `rule.papersRequired`, compute
costs/regen, `CoinFlip`/`clip` acceptance probabilities, internship weights,
placement-score thresholds in the `Graduation` event.

---

## 7. Gotchas (these will bite you)

1. **File order matters for `MonthBegin`.** `monthSkipped` is reset to 0 early in
   `CommonVariableUpdates`; `Coursework`/`ExhaustionBadMonth` set it to 1 to skip
   the research menu; `MonthBeginTasks` reads it. An event that must run before
   the menu has to appear **above** `MonthBeginTasks` in the file. Likewise
   `ForcedGraduation` and the `Graduation` placement event sit after the menu so
   the `graduating` flag is observed the same month.
2. **Avoid ternaries in YAML expressions when you can.** A plain YAML scalar
   cannot contain `: ` (colon-space), and `a ? b : c` has one. Either quote the
   whole value or — better — use boolean×number arithmetic
   (`hasStatus('x') * 2`).
3. **Quote any text value containing `": "`.** Same YAML rule applies to
   player-facing strings (`role: big`, `emailed: "..."`). The validator won't
   catch this (it's a parse error) — `npm run validate` will simply fail to load
   the file and tell you the line.
4. **Stats-bar items only repaint on a variable change.** `guiStatsBar.ts`
   renders an item when one of its `updateTrigger.variables` fires a change
   event. A meter for a rarely-changing variable (e.g. `citations`) will look
   blank/stale, so we add `elapsedMonth` to its triggers to force a monthly
   repaint. Variable change events are dispatched async (`setTimeout(0)`); the
   value itself updates synchronously.
5. **Bilingual parity is mandatory.** Every referenced key must exist in *both*
   language files or that text renders as the raw key id in-game. The validator
   enforces this.
6. **`once: true` only "spends" when the event actually executes** (conditions
   met). An armed once-event with failing conditions stays armed.
7. **`Random` group `weight`s are relative**, not probabilities, and may be
   expressions. `CoinFlip`/event `probability` are absolute (clamp with `clip`).

---

## 8. Engine touch-points we changed (the only non-data edits)

- `src/app.ts`: `languageFileUrls` + `resolveLanguage()` (query → localStorage →
  browser → default) and `window.setGameLanguage()` (persists + reloads, keeping
  the seed in the URL hash).
- `src/gui/guiFooter.ts`: a `setLanguage` button type for the EN/中文 switch.
- `static/index.html`: `languageFileUrls` / `defaultLanguage` config + title.

Everything else is upstream engine behavior. If you need a genuinely new
mechanic the DSL can't express, add an `EventAction` subclass in
`src/event/actions.ts` and register it in `EventActionFactory` — but check first
whether `Switch`/`Random`/`CoinFlip` + variables already cover it (they usually
do).

---

## 9. Definition of done for any change

```bash
npm run validate     # 0 errors (warnings about unused keys are OK)
npm run build        # compiles; prebuild re-runs validate
# hard-refresh the browser and play from a fresh timeline (new-game-only
# content such as the opening notice and coursework won't appear mid-run)
```
There is no automated headless playtest (the engine needs a DOM), so a manual
click-through of a changed path is the real acceptance test.
