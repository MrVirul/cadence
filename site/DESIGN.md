# Cadence Site Design System

## Typography

- Scale: h1 `clamp(40px,5vw,64px)/1.05` w600 -0.02em; h2 `clamp(28px,3.5vw,40px)/1.1` w600 -0.02em; h3 `18px/1.3` w600; body `17-18px/1.6` w400 max 65ch; tabular-nums on numbers.
- Text wrap: `text-wrap: balance` on all headings; `text-wrap: pretty` on paragraphs.
- Spacing: 4/8px grid. Section gap 96px desktop / 64px mobile. Container max 1120px. Section divider lines match content container width. Left-aligned headings.

## Palette (Light Only)

- Primary (Indigo):
  - `primary`: #4F46E5 (CTA button, links, active states, focus ring, small accents)
  - `primary-hover`: #4338CA
  - `primary-50`: #F5F3FF (illustration container, offset hero panel, soft badges)
  - `primary-100`: #EDE9FE (avatar background, tag backgrounds)
  - `primary-200`: #DDD6FE (avatar background)
- Ink (Black / Secondary Accent):
  - `ink`: #0B0B14 (headings, body text, filled secondary button, closing band)
  - `ink-hover`: #1B1B2B (secondary button hover)
- Surfaces & Neutrals:
  - `page`: #FBFAFF
  - `surface`: #FFFFFF
  - `subtle`: #F3F1FA
  - `border`: #E6E3F1
  - `text-secondary`: #52506B
- Semantic & Meaning:
  - `success`: #15803D on #F0FDF4 (shipped indicators, diff add)
  - `warning`: #92400E on #FFFBEB (vague task alert, in-review)
  - `danger`: #B91C1C on #FEF2F2 (diff remove, missed commitments)
- Usage Rules:
  - Purple strictly for the primary button, links, active states, focus rings and small accents.
  - Black for headings, body text, the secondary button (filled black, white text) and the closing band.
  - Every text/background pair achieves at least 4.5:1 (3:1 for large text and UI borders). Lowest text ratio is 4.79:1 (#15803D on #F0FDF4).

## Radii, Borders & Elevation

- Radii: 6px (buttons, chips, inputs) and 12px (cards, frames, panels, illustration panel).
- Borders: 1px hairline borders using `#E6E3F1`.
- Shadows: Soft hero shadow `0 16px 40px rgba(11,11,20,0.06)`; sticky header subtle bottom shadow only after scrolling.

## Motion System

- Principles: CSS only, `transform` and `opacity` only, ease-out `cubic-bezier(.22,1,.36,1)`, 500-700ms duration, 70ms stagger.
- Accessibility & SSR:
  - Scoped entirely inside `@media (prefers-reduced-motion: no-preference)`.
  - With reduced motion or JavaScript disabled, the page renders the final static state (no hidden content).
  - Hide-then-reveal classes apply only when JavaScript adds `.js` to `<html>` early (inline script in `<head>`), ensuring prerendered HTML without JS is never hidden.
- Animations:
  - **Scroll reveal**: IntersectionObserver triggers once per section with 12px translateY + fade.
  - **Hero load**: h1 lines, paragraph, and buttons fade up sequentially (staggered 70ms).
  - **ProductFrame story**: Plays once upon hero entering view: frame appears; AI finding slides down at ~0.9s; Apply button shows pressed state at ~2.4s; main task cross-fades from "Implement checkout" to "Checkout handles expired cards, confirmed on staging" with soft purple highlight fading in 1.2s; finding collapses into an "Applied" chip. Static fallback displays the before-state with finding visible. Frame is `aria-hidden="true"` accompanied by a visually hidden text description.
  - **Week rail**: Horizontal purple progress line scales left-to-right (`scaleX`) on scroll into view; dots fill in sequence; Friday dot pops with checkmark. Mobile switches to vertical rail.
  - **Team table**: Rows fade in staggered; avatars scale 0.8 to 1; history squares pop in sequence.
  - **Illustration**: Gentle float (`translateY: ±6px`, 7s ease-in-out, infinite) active only while in view; no other loops.
  - **Buttons**: 150ms color transitions, 1px lift on hover, arrow nudges 2px.

## Sections

1. Header: sticky, background #FBFAFF, hairline border #E6E3F1, logo, links, login, CTA, scroll-triggered shadow.
2. Hero: 2-column vertically centered row, left copy with h1/paragraph/CTA, right cropped ProductFrame (max height ~520px, soft white fade at bottom) with flat offset panel (#F5F3FF, 12px radius).
3. How a week runs: Mon–Fri rail with unified baseline, dots pinned on the line (Mon, Tue, Wed-Thu spanning 2 cols, Fri), purple progress bar, filled Fri shipped dot. Vertical on mobile.
4. The AI: 2-column, curly quotes in heading (‘that’s not a result.’), 4-item checklist, diff card with blocker rewrite.
5. For leads: team-week table with local DiceBear Lorelei avatars, 12px status squares (green filled shipped, outlined x missed, grey dot none), clear legend, plain list.
6. Closing band: solid ink #0B0B14 background, 2-column layout (left: h2 + primary CTA; right: soft purple #F5F3FF panel max 420px with optimized brand schedule.svg).
7. Footer: logo, tagline, Storyset attribution link, navigation links, copyright.
