# gates

Anthony Toshev's personal site. A guided walk: you stand between two gates with Anthony, then walk into **People** (coaching, workshops, mediation) or **Systems** (web creation, Note to self, archive), one stop at a time.

## How it works (v1, guided 3D walk)
- **One gesture, one step.** Scroll, swipe, arrow keys, the ‹ › buttons or the chapter dots move you one stop. At the gates, ← picks People and → picks Systems. Home goes back to the gates, Esc closes whatever is open.
- **Route:** gates → People (Coaching, Workshops & teambuildings, Mediation & communication) → back to the gates → Systems (Web creation, Note to self, Archive) → back to the gates. Every stop has a URL: `#coaching`, `#web`, `#note_to_self` …
- **Anthony** is a photo billboard (`src/three/anthony.ts`): a flat cut-out that turns to face you, glides between marks with a small bob, swaps poses with a short crossfade, and has a blob shadow and a light world tint. No rig. Swap that class for a `char_anthony` GLB later.
- **Three tiers**, picked before anything heavy loads (inline script in `src/layouts/Base.astro`):
  - `tier-3d`: desktops and tablets with WebGL2. Loads three.js and `public/3d/*.glb`.
  - `tier-25d`: phones, data saver, low memory. Same stops, words and buttons, told with one picture per stop (`public/pictures`). Never downloads three.js.
  - `tier-plain`: no WebGL or reduced motion. A calm readable page with everything on it.
  - Force one with `?tier=3d`, `?tier=25d`, `?tier=plain`, or `?tier=walk` (auto, but ignores reduced motion).

## Loading and fallbacks
- First paint loads only `threshold.glb` and Anthony. Each world's GLB loads when you hover or focus its gate, or right before you walk in.
- Every step is a browser history entry: Back and Forward walk you back and forth. Esc closes the topmost thing (menu, form, panel, Anthony's bubble), then walks you back to the gates.
- Opening a panel from a hotspot or chapter dot moves focus to its title; closing it returns focus to the hotspot.
- If the 3D fails to load or the GPU drops the WebGL context, the page reloads as the plain version and says why at the top.
- Without JavaScript the plain page has its own table of contents, so every stop and form is one link away.

## Asset pipeline
- `npm run optimize:glb --name=human` compresses `public/3d-src/human.glb` into `public/3d/human.glb` (Meshopt geometry, KTX2 textures; KTX2 needs the `ktx` command-line tool from KTX-Software installed).
- The KTX2 transcoder is in `public/basis/` and is only downloaded if a GLB actually uses KTX2 textures.

## Words vs positions
- **All words** live in `src/content/`. **All positions** come from named empties in the Blender exports. A stop file never holds coordinates; Blender never holds copy.
- `npm run build` runs `scripts/validate-scene.mjs` first. It fails if a stop is missing `cam_<stop>_pos`, `cam_<stop>_look`, `char_anthony_mark_<stop>` or `ui_anchor_<stop>`, if Blender has an empty or `int_` object for a stop with no file, if a camera path skips a number, or if a name breaks the prefix contract (`world_ env_ int_ cam_ char_anthony_mark_ ui_anchor_ light_`). Run it alone with `npm run check:scene`.

## Editing content
| What | Where |
|---|---|
| The threshold and six stops (title, facts, Anthony's line, button) | `src/content/stops/<stop id>.md`. The file name is the id Blender uses |
| Gate labels and world names | `src/content/worlds.json` |
| Anthony at the gates, world entry and exit lines | `src/content/dialogue/threshold.md` |
| Questions people ask | `src/content/faq/*.md` |
| Anthony's height (1.78 m placeholder), walking speed, step lock | `src/tour/constants.ts` |
| Enquiry types on the contact form | `ENQUIRY` in `src/content.config.ts`; each stop's `enquiry:` preselects one |
| Anthony's pose photos | `src/content/anthony.json` → files in `public/anthony/`. All five poses use the open-arms photo until the real shots exist |
| Archive entries | `src/content/projects/*.md` |
| 3D scenes | `public/3d/threshold.glb`, `human.glb`, `tech.glb` (Blender, Meshopt) |

Anything in `[square brackets]` renders as a yellow placeholder until you replace it. The Blender scenes are grey-box placeholders and the pictures are the first mockups.

## Run it
```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # type-checks, then builds to dist/
```

## Settings
Copy `.env.example` to `.env` (on Replit: Secrets) and fill in:
- `PUBLIC_WEB3FORMS_KEY`: free access key from web3forms.com. Without it the contact and brief forms say it isn't connected yet.
- `PUBLIC_UMAMI_ID`: website id from Umami Cloud. Without it no analytics script loads.

## Deploy on Replit
1. Replit → Create → Import from GitHub → this repo.
2. Press Run to preview.
3. Deploy → Static. The build command and `dist` folder are already set in `.replit`.
4. Add `antontoshev.com` as a custom domain once you own it.
