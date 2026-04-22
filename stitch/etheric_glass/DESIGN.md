# Design System Strategy: The Lucid Architect

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Lucid Architect."** This concept moves away from the rigid, opaque "boxes" of traditional dashboard design toward a UI that feels like a precision instrument carved from light and air. 

Instead of static layouts, we treat the mobile interface as a high-end lens. By leveraging depth, motion, and transparency, we create a productive environment that feels expensive and intentional. We break the "template" look through **tonal layering** and **asymmetric focal points**, ensuring that even the most data-heavy utility screen feels like a curated editorial piece.

## 2. Colors & Surface Philosophy
The palette is rooted in deep midnight tones (`surface: #0c1324`) and cool architectural greys, accented by high-frequency electric blues.

### The "No-Line" Rule
**Explicit Instruction:** Traditional 1px solid borders for sectioning are strictly prohibited. Boundaries must be defined solely through background color shifts or tonal transitions. To separate a section, place a `surface-container-low` element against the primary `background`. The eye should perceive change through depth, not strokes.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of frosted materials.
*   **Base:** `surface` (#0c1324) – The infinite floor.
*   **Sectioning:** `surface-container-low` (#151b2d) – Large structural groupings.
*   **Primary Cards:** `surface-container` (#191f31) – The standard interactive container.
*   **Elevated Details:** `surface-container-highest` (#2e3447) – Floating elements or active states.

### The "Glass & Gradient" Rule
To achieve the "High-End" aesthetic, main CTAs and Hero headers should utilize a **Signature Texture**: a linear gradient from `secondary` (#7bd0ff) to `secondary-container` (#00a6e0). 
Floating panels must use `surface_variant` at 60% opacity with a `backdrop-filter: blur(24px)`. This ensures that whether the user selects a solid color or a video texture background, the UI remains legible and "anchored" in space.

## 3. Typography: The Editorial Voice
We utilize a dual-font strategy to balance utility with high-end sophistication.

*   **The Power of Manrope:** Used for all Display, Headline, and Title scales. Its geometric yet humanist nature provides an authoritative "Digital Curator" feel. 
    *   *Pro Tip:* Use `display-lg` (3.5rem) with tighter letter-spacing (-0.02em) for hero metrics to create a bold, "magazine-style" impact.
*   **The Precision of Inter:** Reserved for `label-md` and `label-sm`. Inter’s high x-height ensures that secondary data points and micro-copy remain legible even when placed over complex glass textures.
*   **Hierarchy through Scale:** Instead of bolding everything, use the Typography Scale to create contrast. A `headline-lg` title paired with a `body-sm` description creates a sophisticated, spacious rhythm.

## 4. Elevation & Depth
Depth is the primary driver of navigation in this system.

*   **The Layering Principle:** Avoid shadows for static cards. Instead, "stack" tiers. Place a `surface-container-lowest` (#070d1f) input field inside a `surface-container` (#191f31) card to create a "recessed" look.
*   **Ambient Shadows:** For floating elements (Modals, FABs), use extra-diffused shadows. 
    *   *Token:* `shadow-ambient`: 0px 20px 40px rgba(7, 13, 31, 0.4). The shadow should be a tinted version of `surface-container-lowest`, never pure black.
*   **The Ghost Border Fallback:** If a boundary is required for accessibility, use the `outline-variant` (#45464d) at **15% opacity**. This creates a "glint" on the edge of the glass rather than a hard line.

## 5. Components

### Buttons
*   **Primary:** A gradient fill (`secondary` to `secondary-container`) with `on_secondary` text. 1.5rem (`xl`) roundedness.
*   **Secondary (Glass):** `surface_bright` at 20% opacity with a heavy backdrop blur. No border.
*   **Tertiary:** Ghost style, using `primary` text with no container until interaction.

### Input Fields
*   **Style:** Recessed appearance. Use `surface-container-lowest` with `rounded-md` (0.75rem).
*   **State:** On focus, the "Ghost Border" (15% `outline-variant`) becomes 40% opacity to signal activity without "flashing" a heavy color.

### Cards & Lists
*   **Zero Dividers:** Forbid the use of divider lines. Separate list items using 1.5rem (`6`) of vertical whitespace or a subtle toggle between `surface-container-low` and `surface-container`.
*   **Interactive Cards:** Should feature a subtle `primary` tint on the top-left edge (0.5px "Ghost Border") to simulate light catching the edge of a glass pane.

### Glass Tooltips
*   Positioned with `10` (2.5rem) offset from the anchor.
*   Background: `surface_container_highest` at 80% opacity + 12px blur.

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical spacing. A wider left margin (e.g., `8`) vs a tighter right margin (e.g., `4`) can make a dashboard feel like a bespoke layout.
*   **Do** prioritize `backdrop-filter` over high opacity. If the text is hard to read, increase the blur, not the background darkness.
*   **Do** use `primary-fixed-dim` for secondary text to maintain a soft, premium contrast ratio.

### Don’t:
*   **Don’t** use 100% opaque black or grey for shadows. It kills the "glass" illusion.
*   **Don’t** use the `default` (0.5rem) roundedness for large containers; reserve it for small inputs. Use `xl` (1.5rem) for major cards to soften the overall tech-heavy vibe.
*   **Don’t** place "Glass" elements on top of "Glass" elements without a tonal shift (e.g., changing the `surface` tier), as this creates visual mud.