# 海川珠宝首页梵克雅宝比例改版 Design QA

## Evidence

- Source visual truth:
  - `G:\网站搭建2\design-qa-assets\reference-vca-proportion-home.png`
  - `G:\网站搭建2\design-qa-assets\reference-vca-proportion-drawer.png`
  - `G:\网站搭建2\design-qa-assets\reference-vca-proportion-mobile.png`
- Browser-rendered implementation:
  - `G:\网站搭建2\design-qa-assets\vca-inspired-home-final-1920x1080.jpg`
  - `G:\网站搭建2\design-qa-assets\vca-inspired-drawer-final-1920x1080.jpg`
  - `G:\网站搭建2\design-qa-assets\vca-inspired-drawer-mobile-final-390x844.jpg`
- Full-view comparison evidence:
  - `G:\网站搭建2\design-qa-assets\comparison-vca-home-final.jpg`
  - `G:\网站搭建2\design-qa-assets\comparison-vca-drawer-final.jpg`
  - `G:\网站搭建2\design-qa-assets\comparison-vca-mobile-final.jpg`
- Focused comparison evidence:
  - `G:\网站搭建2\design-qa-assets\comparison-vca-header-focus.jpg`
  - `G:\网站搭建2\design-qa-assets\comparison-vca-drawer-focus.jpg`
- Viewports: desktop `1920×1080`; mobile `390×844`.
- Source pixels: desktop references `1672×941`; mobile reference `853×1844`.
- Density normalization: all references were proportionally normalized to the CSS viewport dimensions. Browser implementation used `deviceScaleFactor: 1`. The in-app browser's 1920 viewport was captured as adjacent non-overlapping segments and stitched without rescaling; mobile was captured directly at `390×844`.
- States: homepage closed menu, desktop left drawer open, mobile full-screen drawer open.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the English brand uses Cormorant Garamond with Garamond/Times fallback, and Chinese navigation uses Noto Serif SC with Song-style system fallbacks. The desktop wordmark reaches 41px at 1920 and remains optically centered. Drawer labels use 21px desktop and 25px mobile, avoiding the former oversized 40px menu.
- Spacing and layout rhythm: the desktop header is 96px high. The drawer is exactly 432px at 1920, or 22.5% of the viewport, matching the reference proportion. Main navigation begins near 118px rather than being vertically centered. Mobile rows, dividers, secondary links, and utilities follow the selected reference's vertical rhythm.
- Colors and visual tokens: the interface is pure white and deep brown-black. The desktop mask is the approved 35% deep-brown overlay; no black primary surface, gold button, card, radius, or glass effect was introduced.
- Image quality and asset fidelity: the existing HaiChuan gold bangle hero remains full-bleed and sharp. The image itself was not regenerated or replaced. Its crop and focal point remain compatible with the existing homepage media configuration.
- Copy and content: the hero contains no marketing headline, subtitle, or CTA. The drawer retains the four approved primary routes and adds the reference-approved secondary grouping and business utilities.
- Icons: all visible interface icons use the existing Ant Design icon family; no CSS-drawn, text-glyph, inline-SVG, or placeholder icon substitutions were used.
- Responsiveness: desktop header groups do not overlap at the desktop boundary. At 390px the drawer occupies the complete viewport and has no horizontal overflow. All content remains visible at 844px height.
- Accessibility and behavior: Ant Design Drawer retains focus trapping and page scroll locking. Menu state is exposed through `aria-expanded`; Esc closes the drawer; after closing, focus returns to the menu button. Route changes continue to close the drawer automatically.
- Runtime: the browser console contains no application errors. Only existing React Router v7 future-flag warnings are present.

## Full-view comparison

- Homepage: the implementation matches the selected media-first composition, large centered wordmark, left menu/search cluster, right service icons, full-bleed hero, and bottom scroll cue. The hero intentionally contains no promotional copy.
- Desktop drawer: the implementation matches the 432px white left rail, top close control, top-aligned primary navigation, grouped secondary navigation, bottom utilities, and visible dimmed hero.
- Mobile drawer: the final implementation aligns closely with the selected reference in wordmark placement, 25px navigation scale, 64px row rhythm, divider positions, and lower utility block.

## Focused-region comparison

- Header focus: confirms the center wordmark scale, 60px desktop outer margin, left control spacing, and right utility balance.
- Drawer focus: confirms close control placement, label size, chevrons, hairlines, group spacing, and bottom utility hierarchy at the exact 432px drawer width.

## Comparison history

### Iteration 1

- [P2] Desktop drawer was proportionally too wide at medium desktop sizes because it allowed up to 38vw.
  - Fix: capped the desktop drawer at 24vw while retaining the 432px maximum, so it resolves to exactly 432px at 1920 and follows the reference ratio.
- [P2] The first navigation item appeared selected after opening because it was forcibly focused and inherited the hover fade treatment.
  - Fix: removed the forced first-link focus. Ant Design keeps the focus trap, and focus still returns to the menu button after close.
- [P2] Mobile primary navigation was too large and vertically loose compared with the selected mobile reference.
  - Fix: changed the mobile labels from 29px to 25px, rows from 80px to 64px, and rebalanced the navigation and utility gaps.

### Iteration 2

- Re-captured the exact 1920×1080 desktop closed/open states and the exact 390×844 mobile open state.
- Rebuilt full-view and focused side-by-side comparison images.
- Re-tested Esc close, scroll lock, focus return, responsive overflow, and browser console state.
- No new P0, P1, or P2 findings.

## Primary interactions tested

- Open the left drawer from the homepage menu button.
- Close the drawer with Esc.
- Confirm focus returns to the homepage menu button.
- Confirm body scroll is locked while the drawer is open.
- Confirm route links and accessible names are present.
- Confirm the 390×844 full-screen drawer has no horizontal overflow.

## Residual test gaps

- The repository's lint script cannot run because ESLint is not installed in the current client dependencies. TypeScript and the Vite production build pass.
- The existing React Router future-flag warnings were not changed because they are unrelated to this visual revision.

## Follow-up polish

- P3: when a final licensed brand typeface is selected, self-host it to remove dependence on Google Fonts and ensure identical rendering in restricted networks.
- P3: final production video and poster focal coordinates should still be tuned in the existing homepage media admin after real assets are uploaded.

final result: passed
