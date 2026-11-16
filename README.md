# gates

Anthony Toshev's personal site. It opens on two gates: **People** (coaching, events, teambuildings) on the left and **Technology** (websites, custom builds, AI automations) on the right.

It's built as an experience:
- **← →** (arrow keys, swipe, horizontal trackpad scroll) moves between the worlds: People ← Gate → Technology
- **↑ ↓** (arrow keys, scroll, swipe) moves through the scenes inside a world
- A "Start a brief" button stays on screen in the People and Technology worlds, so business clients never have to play to reach the form
- With JavaScript off, all three worlds render one after another

## Stack
- Astro + TypeScript, static output
- Custom CSS design tokens (`src/styles/tokens.css`), no Tailwind
- GSAP + ScrollTrigger, Lenis smooth scroll, SplitType headline reveals
- Content in Markdown/JSON collections (`src/content/`)
- Web3Forms for the project brief, Umami for analytics (both off until keys are set)
- Hosting: Cloudflare Pages

## Editing content
| What | Where |
|---|---|
| Offers (both worlds) | `src/content/offers/*.md`. `world: people` or `technology`, `order` sets position, the body is the extra hover text |
| Things I've started | `src/content/projects/*.md` |
| "Note to self" prompts | `src/content/notes.json` |
| Process steps, honest bit, contact | `src/components/Process.astro`, `Honest.astro`, `Contact.astro` |

Anything in `[square brackets]` renders as a yellow placeholder until you replace it with real content.

## Run it
```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # type-checks, then builds to dist/
```

## Settings
Copy `.env.example` to `.env` and fill in:
- `PUBLIC_WEB3FORMS_KEY`: free access key from web3forms.com. Without it, the brief form says it isn't connected yet.
- `PUBLIC_UMAMI_ID`: website id from Umami Cloud. Without it, no analytics script loads.

## Deploy (Cloudflare Pages)
1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect this GitHub repo.
2. Framework preset: Astro. Build command `npm run build:fast`, output directory `dist`.
3. Add the two environment variables above.
4. Add the custom domain `antontoshev.com` once you own it.
