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

Each month, pick **one** action. The research pipeline mirrors real ML work:

```
read papers (arXiv)  ->  Research Idea
quick experiment     ->  Toy-Scale Result
scale it up          ->  SOTA Result
ablations / plots    ->  Plots  (x figuresRequired)
write the paper      ->  Submission -> Accepted Paper (or Reviewer-2 rejection)
```

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
is easily moddable.

## Build and Play Locally

After cloning the repository and running `npm install`, run

```
npm run build && npm start
```

and then navigate to http://localhost:8000 in your browser. Built bundle will be
outputted to the `dist` directory.

> [!NOTE] 
> The rulesets in this repo can be different from the online version hosted on
> my website.

## License

MIT
