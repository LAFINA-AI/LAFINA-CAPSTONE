# UniGuide-Mobile Visual Design Reference

> **Source Repository:** `https://github.com/TeamOnlyPrompts/UniGuide-Mobile` (Read-Only Reference)  
> **Branch:** `main`  
> **Audited Commit SHA:** `0d44b4e62b08626774e43ad37a6943c3e7c104c3`  
> **Target Repository:** `LAFINA-CAPSTONE` (`feature/uniguide-inspired-ui-overhaul`)

---

## 1. Visual Identity Summary

UniGuide-Mobile establishes an approachable, modern academic productivity aesthetic characterized by:
- **Soft tinted canvas backgrounds** (`#FCFBFF` light / `#11101E` dark) paired with crisp elevated white/deep-indigo cards (`#FFFFFF` / `#1B192E`).
- **Violet/Indigo primary accent** (`#5945EB` light / `#7C6BFF` dark) replacing harsh crimson accents in Modern mode while keeping high contrast.
- **Purposeful pastel surface tokens** (`softViolet`, `mint`, `blueSoft`, `peach`, `lilac`, `cream`) to differentiate content categories (schedule, focus time, reminders/alarms, tasks, notes) cleanly without visual noise.
- **Generous rounded geometry** (`24px` major cards, `28px` modal bottom sheets, `16px` surface inputs, `999px` pill chips/buttons).
- **Curved Bottom Navigation Bar** using `react-native-svg` with a center U-shaped notch cradling a raised circular primary AI/Assistant action button.

---

## 2. Extracted Color Palettes

### Light Mode (`modernLightPalette`)
| Token | Hex | Semantic Role |
|---|---|---|
| `bg` | `#FCFBFF` | App screen background canvas |
| `card` | `#FFFFFF` | Primary elevated card surface |
| `surface` | `#F4F2FA` | Nested inputs, containers, inactive pills |
| `text` | `#151327` | Primary headings and body copy |
| `muted` | `#6E6B7B` | Secondary captions, timestamps, subtitles |
| `accent` | `#5945EB` | Primary brand violet/indigo CTA & active state |
| `accentDeep` | `#4734D4` | Pressed / deep accent contrast |
| `periwinkle` | `#8FA8FF` | Soft decorative/ring highlight |
| `periwinkleSoft` | `#EEF1FF` | Gentle periwinkle container wash |
| `darkInkBtn` | `#151327` | High-contrast active filter pill background |
| `border` | `#EEEDF4` | Subtle 1px card/input hairline border |
| `softViolet` | `#F2EFFF` | AI / assistant / profile highlight surface |
| `mint` | `#E5F8F0` | Completed / study / free-block positive wash |
| `mintInk` | `#48AA81` | Accessible mint ink for icons/labels |
| `blueSoft` | `#EAF1FF` | Schedule / alarm / time-block wash |
| `blueInk` | `#5B7FD6` | Blue ink for schedule/alarm accents |
| `peach` | `#FFF0E8` | Urgent / due-soon / reminder wash |
| `peachInk` | `#EA9972` | Warm peach ink for reminder accents |
| `lilac` | `#F2E9FA` | Notes / category wash |
| `lilacInk` | `#8D5EB8` | Lilac ink for notes/tag accents |
| `cream` | `#FFF3CA` | Highlight / pinned / caution wash |
| `creamInk` | `#856404` | High-contrast warm ink on cream |
| `danger` | `#C94035` | Destructive / error ink |

### Dark Mode (`modernDarkPalette`)
| Token | Hex | Semantic Role |
|---|---|---|
| `bg` | `#11101E` | Deep obsidian-indigo screen canvas |
| `card` | `#1B192E` | Elevated dark card surface |
| `surface` | `#24213C` | Nested inputs, chip wells, list containers |
| `text` | `#F7F6FF` | High-contrast crisp near-white text |
| `muted` | `#A39FB8` | Secondary lavender-gray supporting text |
| `accent` | `#7C6BFF` | Luminous violet/indigo active & CTA accent |
| `accentDeep` | `#5945EB` | Deep indigo badge/button backing |
| `periwinkle` | `#6E7FF3` | Soft dark-mode periwinkle highlight |
| `periwinkleSoft` | `#272548` | Dark periwinkle tint container |
| `darkInkBtn` | `#5945EB` | Selected filter pill fill in dark mode |
| `border` | `#2C2847` | Subtle dark indigo card divider/border |
| `softViolet` | `#252142` | Dark AI/profile wash |
| `mint` | `#183028` | Dark study/positive wash |
| `mintInk` | `#6EE7B7` | Mint ink in dark mode |
| `blueSoft` | `#1D253E` | Dark schedule/alarm wash |
| `blueInk` | `#93B4FF` | Periwinkle-blue ink in dark mode |
| `peach` | `#33221D` | Dark reminder/urgency wash |
| `peachInk` | `#FFAE92` | Warm peach ink in dark mode |
| `lilac` | `#2A213D` | Dark notes/category wash |
| `lilacInk` | `#D3B8F8` | Light lilac ink in dark mode |
| `cream` | `#2E281B` | Dark pin/highlight wash |
| `creamInk` | `#FFD43B` | Warm amber ink in dark mode |
| `danger` | `#FFB3A9` | Soft legible coral danger ink in dark mode |

---

## 3. Typography, Shapes, and Elevation

- **Typography Mapping**: UniGuide-Mobile uses `Plus Jakarta Sans` (headings) and `DM Sans` (body). In `LAFINA-CAPSTONE`, rather than bundling native font binaries that would require native Android link changes, we define a compatible typographic scale (`ModernTypography`) using `Fonts.heading` / `Fonts.body` with tightened display letter-spacing (`-0.5` on `24–28px` titles), bold `700/800` hierarchy, uppercase tracked section micro-headers (`12px`, `letterSpacing: 0.7`), and generous body line-heights (`20–22px`).
- **Corner Radii**:
  - Major content cards & hero cards: `24px`
  - Bottom sheets & modals: `28px` top corners
  - Inputs & search bars: `16px`
  - Filter chips, badges, primary CTA buttons: `999px` (pill)
- **Elevation / Shadow**: Soft purple-tinted card shadow (`shadowColor: '#4C379A'`, `shadowOffset: { width: 0, height: 8 }`, `shadowOpacity: 0.08`, `shadowRadius: 18`, `elevation: 3`).

---

## 4. Key Screen & Component Patterns Adapted for LAFINA

1. **Curved Bottom Navigation Bar (`CustomTabBar.tsx`)**:
   - Audited from `app/(tabs)/_layout.tsx`: Full-width bottom surface (`contentHeight = 66`, `bottomInset = Math.max(insets.bottom, 8)`) drawn with `react-native-svg` cubic Bezier U-notch (`topRadius = 24`, `notchHalf = 46`, `notchDepth = 30`).
   - Raised circular center `AI` button positioned cleanly inside the U-notch (`width: 58`, `height: 58`, `borderRadius: 29`) plus always-visible tab labels for clear discoverability.
2. **Hero Focus Card (`UpNextWidget.tsx`)**:
   - Rich indigo surface (`#5945EB` / `#4734D4`) with crisp white title, translucent pill status tag (`LIVE NOW` / `UP NEXT`), time/room metadata, slim progress bar, and pill action button.
3. **Pastel Category Bento Widgets & Rounded Week Strip (`DashboardScreen`, `CalendarScreen`, `AlarmsView`)**:
   - Soft pastel icon badges (`blueSoft`, `mint`, `peach`, `lilac`, `cream`) paired with 24px white/deep-indigo cards.
   - Rounded week strip container (`borderRadius: 20`) with circular/pill active date highlight.
4. **Filter Pills & Segmented Controls (`NotesScreen`, `NoteFilters`, `CalendarScreen`)**:
   - `surface`-filled pill container for segmented mode switchers (`Calendar | Alarms`, `Notes | To-Do`).
   - `darkInkBtn` (`#151327` light / `#5945EB` dark) active filter chips.
5. **Appearance Switcher (`ProfileScreen`)**:
   - Two side-by-side selectable interface cards (`Modern` vs `Classic`) inside the Appearance section, strictly independent from the `Dark Mode` switch below them.

---

## 5. Adaptation & Restraint Boundaries

- Retained **LAFINA** name, LAFINA brand logos, voice-first academic AI secretary identity, offline-first SQLite architecture, native Android exact alarms, USTP COR onboarding/profile, and USTP Handbook RAG.
- Excluded UniGuide's Expo Router APIs, UniGuide branding/mascots, and non-applicable product screens.
