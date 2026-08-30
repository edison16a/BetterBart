# BetterBART

A really simple map and directions app for BART.

The official BART app is confusing, so I made this instead. It's one map, all 50 real stations, and directions that are actually easy to follow.

## How it works

Open it, tap where you are, tap where you're going. That's it.

You get one clear instruction at a time, like:

> Get on the **Richmond train** in **6 min** or at **11:45**

> Get off in **4 stops** at **MacArthur** in **9 min**

If you allow location, the app follows along as you ride — the stop count ticks down and the next instruction shows up on its own when you reach a transfer or your stop. There's also a Next button if you'd rather tap through yourself.

Tapping a single station shows every train coming to it, with a little animation of the next train approaching.

## Other stuff

- Clean schematic map, dark mode, works on phone and desktop
- Drag from one station to another to plan a trip fast
- `/mobile` or `/web` in the URL forces either layout
- The whole thing is one HTML file, no build step, no dependencies

## Heads up

Train times are simulated for now (they behave realistically, but they're not live BART data yet). Hooking up the real BART API is the next step.

## Run it

Open `index.html` in a browser, or deploy it to Vercel. If you want the `/mobile` and `/web` paths to work on Vercel, add this `vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Location features need https, which Vercel gives you for free.
