# ataraxia-webpage

Website for Ataraxia, the iPhone game, served by GitHub Pages. Plain HTML and CSS, no build step.

| Page | Used for |
| --- | --- |
| `index.html` | Home page; the App Store Connect Marketing URL |
| `support.html` | App Store Connect Support URL |
| `privacy.html` | App Store Connect Privacy Policy URL, and the in-game Settings > Data link |
| `404.html` | Shown by GitHub Pages for missing pages |

Publish: repo Settings > Pages > Build and deployment > Deploy from a branch > `main`, folder `/ (root)`.
The site is then at https://brand750.github.io/ataraxia-webpage/

Fonts are self-hosted (no third-party requests): Pixelify Sans and Atkinson Hyperlegible, both SIL Open Font License, licence files in `assets/fonts/`.

To update: text lives in the HTML files; colours and type in `assets/site.css`; the "Try a chain" demo in `assets/chain.js` follows the game's rules (the 5-slot pentagon processor with its Reserve, left-to-right evaluation rounded down, strike tiers at 1, 20 and 82, and the orb-element mixes). Its sprites in `assets/img/sprites/` are copied from the game project (Oreivax idle, tumbleweed, element orbs, strike beam).

Preview locally: `python3 -m http.server 8765`, then open http://localhost:8765/
