# VibeAssist — Expressive Studio redesign master prompt

Act as a senior brand designer, editorial art director, product designer, and frontend engineer. Fully redesign this project's public website in the Expressive Studio direction described below. Produce a coherent, working website with a distinctive brand identity and polished responsive behavior.

## Start with the actual project

Read repository instructions, the README, routes, existing pages, components, assets, and styles. Determine the real product name, audience, core problem, supported capabilities, conversion goal, and technical stack. VibeAssist is the provisional brand name: verify it against the project. Inspect the current website if runnable. Preserve working routes, authentication, forms, analytics hooks, integrations, and application behavior. Use the existing stack and package manager. Do not replace the application with a static mockup.

Before implementation, briefly state the product understanding and the concrete design choices. Continue with reasonable, reversible decisions. Ask only about essential facts that cannot be established from the project. Never invent customers, logos, statistics, testimonials, awards, integrations, product capabilities, or pricing. If proof is unavailable, use a real workflow demonstration. Do not display placeholders as real evidence.

## Creative direction

Expressive Studio: bold, intelligent, creative, human, and exacting. Combine editorial typography, deliberate asymmetry, strong flat color, and authentic product visuals. The site should feel commissioned for this specific product. Give it a recognizable silhouette and a clear story.

Use warm paper as the main canvas, ink for text, cobalt for primary actions and selected large surfaces, acid yellow as a high-energy highlight, and coral sparingly. Start around 65% neutral, 25% cobalt, and 10% acid/coral across a typical page, treating these as art-direction guidance rather than strict quotas. Use substantial quiet space between expressive moments.

Avoid generic purple gradients, glass panels, soft glow backgrounds, repeated three-card feature grids, fake terminal windows, decorative code, excessive pills, AI sparkle motifs, random floating shapes, and endless scroll reveals. Abstract artwork must reinforce the identity or a real concept. Keep essential navigation conventional and easy to use.

## Brand system

Palette: Paper #F5F1E8; Ink #171717; Cobalt #2448FF; Acid #DFFF00; Coral #FF6B52; White #FFFFFF; Muted ink #595750; Rule #D3CFC5.

Fonts: Space Grotesk 500/600/700 for display, Inter 400/500/600 for reading and UI, optional IBM Plex Mono 400/500 for short labels. If the existing project has an equally strong licensed font system, propose retaining it. Verify font sources and licenses, self-host appropriately, load only required subsets/weights, and use font-display: swap. The optional mono family may be omitted to reduce loading cost.

Headlines are oversized, tightly composed, and concrete: clamp 52–128px for the hero and 36–76px for section titles. Use roughly 0.98–1.08 display line-height, modest negative tracking, and 1.5–1.65 body line-height. Body copy should be 16–18px. Keep paragraph measures around 55–70 characters. Do not force desktop line breaks onto small screens.

Use a 4px spacing base; typical steps are 8, 12, 16, 24, 32, 48, 64, 96, 128px. Use a 12-column desktop composition and a simple 4-column mobile composition. Maximum content width: 1440px. Fluid gutters: 20–64px. Components are mostly square or gently rounded: 6px controls, 12px product panels. Use thin rules and flat surfaces; reserve strong borders for meaningful framing.

## Logo and visual language

Explore an original, compact V made from two broad diagonal strokes, with one restrained fold or cut that gives it character. It should suggest creative momentum and assistance without requiring an explanation. Pair it with a carefully spaced VibeAssist wordmark. Use the symbol on its own for the favicon and app icon. Avoid resemblance to existing marks; do not claim legal clearance.

The identity must work in one color, reversed, on cobalt, and on acid. Simplify the favicon as necessary for 16px. Keep clear space of at least one stroke width. Never stretch or add shadows. Logo generation is exploration; redraw the chosen concept as clean vector paths and inspect the result at small sizes before treating it as a final asset.

Use the logo's diagonal geometry for a small family of flat illustrations: folded bands, intersecting planes, and offset cutouts. Use only a few intentional pieces. Prefer actual product captures and meaningful diagrams over generic artwork.

## Homepage narrative

1. Compact header: wordmark, up to four meaningful navigation items, one primary action matching the real conversion goal. Accessible mobile navigation.
2. Editorial hero: specific outcome-focused headline, one short explanatory paragraph, primary CTA, optional secondary demo link. Compose headline and a real product scene asymmetrically. Give mobile its own intentional composition.
3. Product demonstration: show a real input, supported transformation, and useful result. If an interactive demo is appropriate, make it keyboard accessible and functional. Otherwise use authentic captures with concise annotations. Clearly label simulated or illustrative content.
4. Three core benefits: distinct alternating editorial sections, each tied to a real feature and visible evidence. Vary composition while preserving consistent spacing and typography.
5. Supported use cases: use tabs only when the content warrants interaction; otherwise use a concise editorial list. Each example should demonstrate an actual user task.
6. Trust: real testimonials, customer evidence, or factual security/privacy information only when supported. Omit unsupported claims. A detailed workflow example can supply confidence without social proof.
7. Pricing only if the product genuinely has public pricing. Preserve real terms. Otherwise omit the section.
8. Short FAQ based on actual onboarding questions; concluding CTA with a strong cobalt or acid surface; useful footer with valid links.

Adapt this structure to the real product. A shorter page with strong evidence is better than filler sections. Extend the design system consistently across all existing public pages without losing their content or function. Keep authenticated workflows intact; do not invent new product flows merely to fit the art direction.

## Copy

Write specific, confident, plain language. Lead with the user's outcome and explain how the product achieves it. Avoid 'revolutionize', 'unlock your potential', 'supercharge', 'seamless', and unsupported 'all-in-one' claims. Tie every CTA to an actual action. 'Find your flow.' is only a visual concept-board headline and must be replaced if it does not communicate the product clearly enough.

## Interaction and accessibility

Choose one signature interaction tied to the product: an input-to-output transformation, keyboard-accessible before/after comparison, or guided workflow. Keep essential content accessible without hover, animation, or dragging. All interactions must work with touch and keyboard. Motion should explain state changes; target 140ms microstates, 220ms transitions, and at most 420ms larger transitions. Honor reduced motion, avoid scroll hijacking and custom cursors, and provide pause controls if needed.

Provide visible focus, semantic landmarks, logical headings, descriptive labels, useful alt text, readable contrast, accessible menus/dialogs, and at least 44px targets where practical. Check final text contrast against WCAG AA. Do not communicate information through color alone. Avoid layouts that break at zoom or when text wraps.

## Implementation and delivery

Use shared tokens and reusable components without flattening every section into the same layout. Reuse tokens.css in this folder where appropriate. Keep assets optimized, reserve media dimensions, avoid layout shifts, and do not ship video or a heavy animation library solely for decoration. Use vector artwork for logos/icons and appropriately compressed responsive raster images for product scenes.

Deliver the implemented site, responsive states, brand tokens, chosen logo assets in SVG plus required raster sizes, favicon assets, social preview image, and a short brand guide. Every visible button and navigation item must work; forms need meaningful loading, success, and failure states where applicable.

Verify the real routes and conversion flow. Inspect at 360, 390, 768, 1280, and 1440px widths, keyboard navigation, reduced motion, and zoom. Check for overflow, clipped headings, layout shifts, broken links, misleading content, and inconsistent spacing. Run the project's relevant build and checks. Summarize what changed, what was verified, and any remaining limitations. Do not deploy unless already authorized.
