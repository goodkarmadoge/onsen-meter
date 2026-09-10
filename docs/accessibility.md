# Accessibility notes

Against PRD §7.4 and the §7.5 acceptance criterion.

## Measured contrast

Computed with the WCAG 2.1 relative-luminance formula against the implemented
palette (card `#FAF6EF`, sunk track `#EADFCE`, ink `#2E2822`).

| Tier | Colour | vs. card | vs. track | Ink text **on** tier | Cream text **on** tier |
|---|---|---|---|---|---|
| Serene | `#8FA88C` | 2.39 | 1.96 | **5.65** | 2.39 |
| Tranquil | `#6E9C93` | 2.85 | 2.33 | **4.74** | 2.85 |
| Comfortable | `#C8A25C` | 2.22 | 1.82 | **6.08** | 2.22 |
| Lively | `#C97B4A` | 3.04 | 2.49 | 4.45 | 3.04 |
| Bustling | `#A85C43` | 4.56 | 3.73 | 2.96 | **4.56** |

All guest-facing body copy renders as ink on cream: **13.51:1**, comfortably
past AA and AAA.

## The finding

**PRD §7.5's acceptance criterion cannot be met as literally written.** It asks
the five tier colours to "pass an automated WCAG 2.1 AA contrast check", but:

1. **No single text colour works across all five.** Dark ink passes on Serene,
   Tranquil and Comfortable (4.74–6.08) but fails on Lively (4.45, just under
   the 4.5 threshold) and Bustling (2.96). Cream text passes only on Bustling.
   A design that prints each tier's label in its own colour would need a
   per-tier text colour, and two of the five would still need adjusting.

2. **None of the five reaches 3:1 against a cream ground** as a standalone
   graphical indicator (1.82–3.73). This is inherent to the brief: §5 asks for
   warm, spa-appropriate mid-tones explicitly *instead of* stock traffic-light
   colours, and warm mid-tones on a warm cream ground are low-contrast by
   construction. The palette is doing exactly what the PRD asked; the
   acceptance criterion just assumed it would come for free.

## How the build resolves it

Colour is made **strictly redundant**, which is what §7.4 asks for anyway
("never rely on colour alone"). Three independent channels carry the tier:

1. the written label and its sentence of description,
2. the number of filled segments on the five-segment meter,
3. the colour.

Because colour is never the sole means of conveying the state, WCAG 1.4.11
(non-text contrast) does not require the tier swatches to hit 3:1 — that
requirement applies to elements *required to identify* a control or its state.
Every segment additionally carries a `rgba(46,40,34,0.10)` inset hairline so its
edge stays visible against a pale ground regardless.

**Suggested rewording of the §7.5 criterion:**

> All guest-facing text passes WCAG 2.1 AA (4.5:1). Tier colour is verified to
> be redundant with a text label and a non-colour visual indicator, so no tier
> is distinguishable by colour alone.

If the venue would rather keep the literal criterion, the five colours need to
be darkened roughly 15–25% in lightness, which will move them away from the
soft spa palette §5 was aiming for. That is a brand call, not a build call.

## Other §7.4 items

- **`aria-live="polite"`** wraps the tier label and description, so a tier
  change is announced without interrupting the guest.
- The meter carries `role="img"` with an `aria-label` of "N of 5 on the crowd
  scale", so the fill level is available without sight of the colour.
- **Mobile-first**: the standalone page is a single column with a 44px+ touch
  target minimum; the console's primary tap targets are far larger again.
- **`prefers-reduced-motion`** collapses the tier-change transition.
- The PIN pad exposes progress as a `role="status"` ("3 of 6 digits entered")
  rather than relying on the filled dots alone.

## Not yet done

- No automated axe/Lighthouse run in CI. Worth adding before launch.
- Not tested with a real screen reader (VoiceOver/NVDA); the live-region
  behaviour is reasoned, not observed.
