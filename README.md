# AI PhD Simulator / AI 博士模拟器

A random-event-driven, text-based game about surviving an **AI / machine-learning
PhD** — arXiv, GPUs, NeurIPS deadlines, Reviewer 2, rebuttals, getting scooped,
big-lab internships, and burnout. Bilingual: **English and 中文**, switchable in
the footer.

This is a reskin of the original [**PhD Simulator** by Mianzhi
Wang](https://github.com/morriswmz/phd-game) (MIT License). The game engine is
unchanged; the AI theme and the Mandarin localization live entirely in the
[YAML rulesets](static/rulesets/default) and the two language files
(`lang.en.yaml`, `lang.zh.yaml`).

## Gameplay

Each month, pick **one** action. The research pipeline mirrors real ML work, and
every experiment spends **GPU compute** (top-left meter):

```
read papers (arXiv)        ->  Research Idea          (free)
run a quick experiment     ->  Toy-Scale Result       (-1 GPU)
scale it up                ->  SOTA Result            (-3 GPU)
  or: train a large model  ->  SOTA Result + figure   (-8 GPU, high impact)
run ablations / plots      ->  Plots (x figuresRequired)  (-2 GPU each)
write the paper            ->  Paper Draft
submit at a real deadline  ->  Under Review -> Accepted Paper (or Reviewer-2 rejection)
```

**Three systems give the game depth:**

- **Compute budget** — `player.compute` regenerates each month, faster with more
  funding and a better cluster (new H100 node, internship credits). Small
  projects are always affordable; a large-model run needs you to save up, but
  pays off with a high-impact result.
- **Real conference calendar** — you hold a finished draft and submit it at a
  real deadline; decisions arrive months later, just like real life:

  | Venue | Submit (month) | Decision (month) |
  |-------|----------------|------------------|
  | ICML | Feb | May |
  | NeurIPS | May | Sep |
  | ICLR | Sep | Jan |
  | CVPR | Nov | Feb |

- **Citations** — `player.citations` (top-right meter) grow from published and
  preprinted work, building reputation that raises acceptance odds (Well-Cited,
  Influential statuses) and scares off scoopers. Post an arXiv preprint to stake
  your claim early.

Publish enough top-tier papers to graduate before your **Hope** hits 0 or you
run out of time. Watch out for CUDA OOM, cluster outages, scooping on arXiv, and
unhappy advisors. Take an industry internship, write a strong rebuttal, or watch
your model go viral on Hugging Face.

### Localization

The language is chosen from (in priority order) the `?lang=en|zh` query
parameter, your last choice (saved in `localStorage`), your browser language,
then the configured default. Use the **English / 中文** buttons in the footer to
switch; the timeline seed in the URL hash is preserved across the reload.

## About the engine

Random events are defined in [YAML files](static/rulesets/default), so the game
is easily moddable. The engine (`src/`) is generic; all the AI-PhD content lives
in the rulesets and the two language files.

## Contributing / Maintenance

**Read [`docs/MAINTAINERS.md`](docs/MAINTAINERS.md) first.** It documents the
architecture, the YAML content DSL, every game system (compute, citations,
conference calendar, internships, endings), how to add content, and the gotchas.

Validate ruleset changes (key parity, item/status references, expression
compilation) with:

```
npm run validate
```

This also runs automatically before `npm run build` (the `prebuild` hook).

## Build and Play Locally

After cloning the repository and running `npm install`, run

```
npm run build && npm start
```

and then navigate to http://localhost:8000 in your browser. Built bundle will be
outputted to the `dist` directory. (Remember to hard-refresh the browser after a
rebuild — the bundle filename is stable, so the cache can hide your changes.)

> [!NOTE] 
> The rulesets in this repo can be different from the online version hosted on
> my website.

## License

MIT
