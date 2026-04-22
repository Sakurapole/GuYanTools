# Design System Specification: Lucid Architect

## 1. Overview & Creative North Star: The Ethereal Monolith
This design system rejects the "flatness" of the modern web in favor of **The Ethereal Monolith**. The Creative North Star is a vision of digital interfaces as architectural glass—transparent, structural, yet weightless. 

We move beyond standard UI by abandoning rigid, opaque boxes. Instead, we utilize **Lucid Architecture**: a methodology where hierarchy is defined by light refraction and tonal depth rather than lines. By utilizing intentional asymmetry and overlapping "sheets" of interface, we create a signature experience that feels high-end, bespoke, and profoundly calm.

### The Core Principles
*   **Refraction over Division:** We never use lines to separate content. We use shifts in glass density (transparency) and background blur.
*   **Intentional Asymmetry:** Break the 12-column boredom. Use large `display-lg` type offset against narrow, high-density content blocks.
*   **Tonal Fluidity:** Colors are not static; they breathe. Use subtle gradients and surface-tinted overlays to ensure the UI feels alive.

---

## 2. Colors & Surface Architecture

The palette is anchored in `#66CCFF` (Primary), but its power lies in how it interacts with the `surface` tiers. 

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or containment. Boundaries must be defined solely through background color shifts or the "Ghost Border" fallback (see Elevation). To separate a sidebar from a main feed, transition from `surface-container-low` to `surface`.

### Surface Hierarchy (The Layering Logic)
Treat the UI as a physical stack of frosted glass.
*   **Base:** `surface` (#00101c) - The furthest depth.
*   **Secondary Sections:** `surface-container-low` (#001524) - Subtle recession.
*   **Primary Content Containers:** `surface-container` (#001c2d) - The standard workhorse.
*   **Actionable Floating Elements:** `surface-bright` (#002f49) - High prominence.

### The Glass & Gradient Rule
To achieve the "Lucid" look, primary actions should utilize a linear gradient:
*   **Signature Gradient:** `primary` (#66ccff) to `primary_container` (#3eabdc) at a 135° angle.
*   **Glassmorphism:** For floating modals or navigation bars, use `surface-variant` at 60% opacity with a `24px` backdrop-blur. This allows the `on-surface` content to "bleed" through softly.

---

## 3. Typography: The Editorial Voice

We use **Manrope** for its geometric precision and modern "tech-humanist" balance. 

*   **Display (lg/md):** Reserved for hero moments. Use `display-lg` (3.5rem) with `-0.04em` letter spacing to create an authoritative, "monolithic" feel.
*   **Headlines:** `headline-md` (1.75rem) should always be paired with generous `20` (7rem) top spacing to allow the layout to breathe.
*   **Body:** `body-lg` (1rem) is the standard for readability. Ensure a line-height of `1.6` to maintain the "airy" quality of the glass aesthetic.
*   **Labels:** `label-md` (0.75rem) in `on-surface-variant` (#8bafcf) should be used for metadata, all-caps with `0.05em` tracking for a premium, architectural feel.

---

## 4. Elevation & Depth: Tonal Layering

Traditional drop shadows are too "heavy" for this system. We use **Ambient Refraction**.

*   **The Layering Principle:** Depth is achieved by "stacking." A `surface-container-highest` card sitting on a `surface-container` base creates a natural lift.
*   **Ambient Shadows:** For floating elements (e.g., Popovers), use a shadow color of `surface-tint` (#66ccff) at 8% opacity with a `48px` blur and `12px` Y-offset. This mimics a blue-tinted light source hitting glass.
*   **The Ghost Border Fallback:** If accessibility requires a container definition, use `outline-variant` (#254b67) at **15% opacity**. This creates a "glint" on the edge of the glass rather than a hard stroke.

---

## 5. Components: Fluid Primitives

### Buttons
*   **Primary:** A gradient fill (`primary` to `primary_container`). `Round Eight` (0.5rem) corner radius. No border.
*   **Secondary (Glass):** `surface-variant` at 40% opacity with a backdrop-blur. 
*   **Tertiary:** Pure text using `primary` color, with a subtle `surface-container-high` hover state background.

### Input Fields
*   **Style:** Background set to `surface-container-low`. No bottom line.
*   **Focus:** Transition background to `surface-container-high` and add a 1px `Ghost Border` using the `primary` token at 30% opacity.
*   **Roundness:** Stick strictly to `0.5rem` (DEFAULT).

### Cards & Lists
*   **The Divider Ban:** Never use `<hr>` or border-bottom. Separate list items using `1.5` (0.5rem) of vertical whitespace or alternating `surface-container-low` and `surface-container` backgrounds.
*   **Interactive Cards:** On hover, a card should shift from `surface-container` to `surface-bright` and scale by `1.02x` to simulate the glass moving closer to the viewer.

### Navigation (The "Frost" Bar)
*   The top navigation should be a `surface` container at 70% opacity with a heavy `backdrop-filter: blur(20px)`. This keeps the user grounded in the "Lucid Architect" space as they scroll.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use overlapping elements. Let a card partially bleed over a section transition to emphasize the Z-axis.
*   **Do** use high-contrast type scales. A `display-lg` headline next to a `body-sm` caption creates a sophisticated, editorial rhythm.
*   **Do** prioritize whitespace. If a layout feels "crowded," double the spacing using the `16` (5.5rem) or `20` (7rem) tokens.

### Don't
*   **Don't** use pure black (#000000) for shadows or backgrounds. Always use the `surface` (#00101c) or `on-background` (#d1e8ff) tones to keep the "blue-hour" atmosphere.
*   **Don't** use 100% opaque borders. It breaks the illusion of glass.
*   **Don't** use standard "Material" elevation shadows. They are too muddy for a glass-centric system.
*   **Don't** use sharp corners. Every element must adhere to the **Round Eight** (`0.5rem`) scale to maintain the soft, lucid feel.