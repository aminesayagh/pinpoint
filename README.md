# Pinpoint

A Chrome extension for visual QA. Browse a website normally, select elements, leave comments,
then send the reviewed feedback to Linear as one issue per comment.

## Develop

```sh
pnpm install
pnpm dev        # opens Chrome with the extension loaded and hot reload
```

Load a build in your own Chrome: `pnpm build`, open `chrome://extensions`, enable
Developer mode, click **Load unpacked** and choose `.output/chrome-mv3`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development build with hot reload |
| `pnpm build` | Production build in `.output/chrome-mv3` |
| `pnpm zip` | Production build packed as a zip |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | TypeScript, ESLint, Prettier |
| `pnpm check` | Type check, lint, tests and build together |

## Stack

pnpm, TypeScript, [WXT](https://wxt.dev) (Manifest V3), React, HeroUI v3, Tailwind CSS v4.

## Connecting Linear

Open the side panel and paste a Linear **personal API key** (Linear → Settings → Security & access).
Pinpoint checks the key with Linear before saving it, then lets you pick the default team,
project, priority and labels for new review sessions.

The key is kept in `chrome.storage.local`. That is fine for a personal prototype but it is
not a secure vault: a public release would need OAuth instead.

## Permissions

| Permission | Why |
|---|---|
| `sidePanel`, `storage`, `unlimitedStorage` | The panel UI, settings, and drafts with screenshots |
| `tabs`, `scripting` | Know which site the current tab shows; load the selection script there |
| `api.linear.app`, `storage.googleapis.com` | Linear's API, and the host Linear signs screenshot uploads for |
| All websites (optional) | Asked once, on the first **Allow** in the panel: Chrome only allows screenshots with it. Pinpoint keeps its own list of allowed sites and only runs there; **Remove access** takes a site off the list |
| `Alt+Shift+S` | Opens the panel and starts selecting an element |

## Demo page

`demo/index.html` is a small fake shop with deliberate flaws (a typo, a badly wrapping name, a
modal popup) to try Pinpoint on: `python3 -m http.server 8123 -d demo`, then open
http://localhost:8123.
