# AGENTS.md

## Project Overview

This is a dependency-free browser incremental game built around a simulated
Python-like instruction runner. Players clear programming-themed levels, earn
permanent fragments, buy meta upgrades, unlock achievements, and progress an
endless main game.

The code display is not a Python interpreter. Each visible source line is a
JavaScript instruction object with a `source` string and a `run(context)`
function.

## How To Run

Open `index.html` directly in a browser, or serve the folder locally:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8000/index.html`.

Direct `file://` access and the local HTTP URL use different browser storage
origins, so their saves are separate.

## File Structure

- `index.html`: Minimal application shell.
- `styles.css`: Responsive layout and visual styling.
- `app.js`: Level definitions, runtime state, rendering, persistence, main
  game, meta upgrades, and achievements.

## Architecture

- Keep level content data-driven in the level definitions in `app.js`.
- App views are `level-select`, `level-playing`, `level-complete`, and
  `main-game`.
- The active level runtime is independent from the visible view. Switching to
  the main game keeps the level running; only the explicit exit-level action
  discards its in-memory progress.
- A level owns its initial variables, instruction lines, shop upgrades,
  completion behavior, and fragment reward.
- Level and main-game runners execute one visible instruction per second. The
  main game produces fragments through its persistent Python-like program. An
  inserted `break` instruction completes the current level when reached.
- Main-game code definitions contain executable behavior, while the save only
  stores owned line IDs, enabled states, and loop order. Program structure
  changes reset the main instruction pointer to `while True:`.
- Main-game ticks use targeted DOM updates so focused form controls are not
  destroyed. Reserve full `render()` calls for navigation or structural UI
  changes such as buying, toggling, or moving program lines.
- Unlock rules allow every completed level and the lowest-numbered incomplete
  level to be played.
- Persistent progress is stored in `localStorage` under
  `python-incremental-save-v2`.
- Save data includes a version, completed levels, fragments, meta upgrades,
  achievements, main-game progress, and the last processed tick timestamp.
- Browser timers are treated only as wake-up signals. Elapsed wall-clock time
  determines how many one-second ticks run, with catch-up work processed in
  batches and capped at 24 hours.

## Development Guidelines

- Keep the project in vanilla HTML, CSS, and JavaScript unless a dependency
  solves a concrete need.
- Add new programming concepts through instruction objects instead of parsing
  arbitrary Python.
- Keep displayed source, instruction order, and runtime behavior synchronized.
- Route permanent progression changes through the save object and call
  `persist()` after meaningful updates.
- Treat save compatibility carefully. Increment the save version and migrate
  old data when changing its shape.
- Keep UI text in Traditional Chinese.
- Preserve the desktop split layout and the stacked narrow-screen layout.
- Format large and fractional values for readability.
- Do not commit browser profiles, generated save databases, or local server
  artifacts.

## Manual Verification

The project currently relies on manual playtesting. For behavior changes,
check the affected flow in a browser and watch the console for errors.

Important paths include:

- Starting, replaying, completing, and unlocking levels.
- Buying repeatable, one-time, line-insertion, and completion upgrades.
- Confirming the highlighted line advances once per second.
- Reloading and verifying persistent progress.
- Buying meta upgrades and confirming their effects in later runs.
- Running the main game and converting its resources into fragments.
- Unlocking each achievement only once.
- Resetting the save and returning to the initial state.
