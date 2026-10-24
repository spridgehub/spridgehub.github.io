# spridgehub

The hub page for every spridgehub project: https://spridgehub.github.io/

- `build.mjs` holds the project list, fetches each repo's 12-week commit activity from GitHub, checks every address, and writes `docs/index.html` (the public site, served by GitHub Pages from `main` /docs).
- `hub.html` is the page template (INLAP design language).
- Home-network links live in `private-groups.json`, which is not committed; they only go into the private copy `index.html`.
- `activity-cache.json` keeps the last good activity so a GitHub rate limit never blanks a tile.

Publish with `ship` (builds, commits, pushes, waits for the site).
