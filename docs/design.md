# Launchpad design

A homepage for one person's Tesla browser. Its job is to put familiar web apps within easy reach while parked.

## Tokens

- Canvas / graphite: `#131619`
- Tile / charcoal: `#1b1f23`
- Raised surface / slate: `#23282d`
- Text / mist: `#e5e9e8`
- Secondary text / brushed metal: `#a0a9ad`
- Primary action / pale sage: `#c8ddcd`

Manrope 500/600 gives headings and the wordmark a rounded, instrument-like shape. DM Sans 400/500 keeps labels and controls readable. Both fonts are bundled locally. App icons use muted coral, mint, violet, amber, blue, and silver on matching dark backgrounds.

## Layout and signature

The signature is a tray of softly illuminated app icons in generous graphite tiles, drawing on a car's app tray. Everything else stays quiet. Four columns on a landscape screen, three on tablets, two on phones. Large touch targets, no animation beyond subtle interaction feedback, reduced-motion support, and native dialogs with contained keyboard focus.

```text
mark + launchpad                         lock
────────────────────────────────────────────
Your apps.                         Edit apps
editing instructions only

[ icon       ] [ icon       ] [ ... ] [ ... ]
[ name     ↗ ] [ name     ↗ ] [ ... ] [ ... ]
[ ...        ] [ ...        ] [ ... ] [ +   ]

app count / save status
```

An initial idea used dashboard widgets and a large ambient glow. Removed both: they distract from the actual task and resemble a generic dashboard. The aesthetic risk is restraint: colored icons carry the identity, with no hero illustration or decorative metrics. Copy and controls remain subordinate to launching apps.

Captions, taglines, and decorative footer copy are omitted. Editing makes the tile body a large drag surface with a visible “Drag to move” cue; a separate Edit button opens its form. Only action instructions and save status remain.
