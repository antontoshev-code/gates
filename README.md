# gates

Anthony Toshev's personal site. You stand on a stone path in front of two gates: a warm one woven from branches (**People**: coaching, events, teambuildings) and a glass one full of light (**Technology**: websites, custom builds, AI automations). You walk through one and explore that world.

## How it works
- **The gate**: a WebGL scene of the illustration with a depth map, so it moves in 2.5D as you move the mouse (or tilt the phone). A firefly follows you, embers rise on the people side, sparkles twinkle on the tech side.
- **Walking through**: click a gate, the glowing button on the path, or press ← / →. The camera flies through the gate into that world.
- **Exploring**: glowing spots in each world (the lantern, the campfire, the globe, the bonsai…) each open a glass panel with an offer. Move between them with arrow keys, scroll, swipe, or the bar at the bottom. Esc or "Back through the gate" returns.
- **Fast path**: "Start a brief" (top right) and the menu jump straight to any offer or the brief form, so a business client on a phone never has to play.
- **Fallbacks**: without JavaScript or WebGL, the page shows the picture with all panels as a plain readable list. Reduced-motion settings turn the animation off.

## Stack
- Astro + TypeScript, static output
- Plain WebGL shader for the scene (`src/scripts/scene.ts`), canvas overlay for the firefly and particles (`src/scripts/fx.ts`)
- GSAP for camera moves, SplitType for headline reveals
- Custom CSS design tokens (`src/styles/tokens.css`)
- Content in Markdown/JSON collections (`src/content/`)
- Web3Forms for the brief, Umami for analytics (both off until keys are set)
- Hosting: Replit static deployment (`.replit`)

## Editing content
| What | Where |
|---|---|
| The places you can visit in each world | `src/content/stops/*.md`. `x`/`y` place the glowing spot on the picture (0–1), `order` sets the route |
| Things I've started (shown at the bread table) | `src/content/projects/*.md` |
| "Note to self" prompts | `src/content/notes.json` |
| Process steps | `src/components/Process.astro` |
| The scene pictures | `public/scenes/gate-wide.jpg` (desktop, tablet landscape), `gate-tall.jpg` (phones, tablet portrait) |

Anything in `[square brackets]` renders as a yellow placeholder until you replace it.

The pictures are the first mockups. Final art should be at least 3840px wide and, ideally, one extra close-up picture per world so the zoomed-in views stay sharp.

## Run it
```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # type-checks, then builds to dist/
```

## Settings
Copy `.env.example` to `.env` (on Replit: Secrets) and fill in:
- `PUBLIC_WEB3FORMS_KEY`: free access key from web3forms.com. Without it the brief form says it isn't connected yet.
- `PUBLIC_UMAMI_ID`: website id from Umami Cloud. Without it no analytics script loads.

## Deploy on Replit
1. Replit → Create → Import from GitHub → this repo.
2. Press Run to preview.
3. Deploy → Static. The build command and `dist` folder are already set in `.replit`.
4. Add `antontoshev.com` as a custom domain once you own it.
