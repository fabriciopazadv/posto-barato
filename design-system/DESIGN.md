---
name: Posto Barato Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#d1dbec'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dfe9fa'
  surface-container-highest: '#d9e3f4'
  on-surface: '#121c28'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#27313e'
  inverse-on-surface: '#eaf1ff'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#4edea3'
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#00687a'
  on-tertiary: '#ffffff'
  tertiary-container: '#00b2d0'
  on-tertiary-container: '#003f4b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#acedff'
  tertiary-fixed-dim: '#4cd7f6'
  on-tertiary-fixed: '#001f26'
  on-tertiary-fixed-variant: '#004e5c'
  background: '#f8f9ff'
  on-background: '#121c28'
  surface-variant: '#d9e3f4'
typography:
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
  price-display:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '800'
    lineHeight: 24px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 16px
  gutter: 12px
---

## Brand & Style
The design system focuses on delivering critical information with speed and reliability. The brand personality is rooted in economy and technological precision, designed primarily for users in high-stress, "on-the-go" environments (driving). 

The visual style is **Modern Corporate** with a focus on **Tonal Layering**. It prioritizes high legibility and a systematic 8pt grid to ensure consistency across mobile and desktop interfaces. The aesthetic balance combines the organic softness of rounded corners (12-18px) with the clinical precision of a neutral, utilitarian color palette, punctuated by high-vibrancy accent colors that signal value and energy.

## Colors
The palette is strategically divided to differentiate fuel types and service categories:
- **Primary (Vivid Green):** Represents economy, savings, and "Go." Used for the lowest fuel prices and primary calls to action.
- **Secondary (Petrol Blue):** Establishes trust and navigation. Used for headers, structural elements, and established brand touchpoints.
- **Tertiary (Electric Cyan):** Specifically reserved for EV Charging stations and technological features to create a distinct visual mental model for non-combustion services.
- **Neutral (Graphite/Grey):** Scaled from #111827 (titles) to #9CA3AF (helper text) to maintain clear visual hierarchy.

The system supports a native **Dark Mode** where surfaces shift to deep navy/slate tones rather than pure black to maintain depth and reduce glare during night driving.

## Typography
We utilize a dual-font strategy. **Manrope** is used for headlines and price displays to provide a modern, slightly geometric character that feels technological. **Inter** is used for all functional UI elements and body text due to its exceptional legibility at small sizes and high x-height, which is critical for glanceable data like fuel prices and distances.

- **Scale:** A tight 1.25x scale ensures that even on small devices, information density remains high without sacrificing clarity.
- **Weight:** Bold weights are used aggressively for prices and station names to ensure they are the first items scanned.

## Layout & Spacing
This design system uses a strictly enforced **8pt Grid System**. All margins, paddings, and component heights must be multiples of 8 (or 4 for micro-adjustments).

- **Mobile First:** The layout relies on a fluid grid with 16px side margins. 
- **Touch Targets:** All interactive elements (buttons, chips) must maintain a minimum height of 48px to accommodate drivers or users on the move.
- **Bottom Sheets:** Primary interaction for station details happens via expandable bottom sheets, allowing users to keep the map context visible while browsing prices.

## Elevation & Depth
The system uses **Tonal Layering** combined with **Ambient Shadows** to define hierarchy. 

- **Level 0 (Background):** The map or base surface.
- **Level 1 (Cards):** Soft 1px border (#E5E7EB) with a very diffused shadow (0px 4px 20px rgba(0,0,0,0.05)).
- **Level 2 (Floating Action Buttons/Markers):** More pronounced shadow to indicate highest interactability.
- **Level 3 (Bottom Sheets/Modals):** High elevation with a background backdrop blur (12px) to focus the user on the task at hand.

## Shapes
The shape language is "Friendly Professional." 
- **Standard Radius:** 8px for small components like input fields.
- **Container Radius:** 16px for cards and bottom sheets.
- **Pill Shape:** Used exclusively for "Status" indicators (e.g., "Open Now", "Cheapest") and Selection Chips to differentiate them from square-ish buttons.

## Components

### Buttons & Inputs
- **Primary Button:** Solid Vivid Green background, white text, 12px corner radius.
- **Secondary Button:** Petrol Blue outline or ghost style for less critical actions like "View History."
- **Inputs:** Large 56px height for mobile ease, using a subtle light grey fill (#F3F4F6) that transitions to a Primary Green border on focus.

### Cards (Station & EV)
- **Fuel Card:** Displays the brand logo, distance, and a prominent price tag in the top right. Uses Primary Green for the price if it's in the lowest 10% of the area.
- **EV Card:** Swaps the primary accent for Electric Cyan. Displays "kW" output and connector types (CCS, Type 2) as small icons.

### Selection Chips
- Horizontal scrolling list of fuel types (Gasoline, Diesel, Ethanol, EV). Active state uses a Petrol Blue background with white text.

### Map Markers
- **Fuel:** Teardrop shape containing the price.
- **EV:** Circular marker with a bolt icon and Cyan glow.
- **Active State:** Marker scales up by 20% and adds a high-contrast border.

### Feedback States
- **Skeletons:** Use a subtle pulse animation on light grey (#E5E7EB) blocks mimicking the card structure.
- **Iconography:** Use a consistent 2pt stroke weight with rounded terminals. Icons should be "Open" style, never filled unless active.