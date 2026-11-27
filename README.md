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
