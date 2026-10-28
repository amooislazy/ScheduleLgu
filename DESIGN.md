# ScheduleLGU Design Language: "Quiet Glass"

Read this before touching any UI. It is written for AI coding agents and humans.
Follow it and new screens will look like they were always part of the app.

## 1. Principles

1. **Calm first.** Most of the screen is empty background. Roughly 70% air, 30%
   content/ornament. When in doubt, remove something or add padding.
2. **Frosted, not boxed.** Surfaces are translucent glass over the backdrop, not
   opaque rectangles with heavy borders. Hierarchy comes from blur, tint,
   spacing and type size, not from colored fills.
3. **One accent.** Green (`theme.colors.primary`) is the only chromatic accent.
   Warning/danger appear only for real warnings and errors.
4. **Motion explains.** Every animation says where something came from or what
   changed. Short, soft landing, never bouncy-for-fun.
5. **Hairlines over borders.** Dividers are 1px (`StyleSheet.hairlineWidth`)
   using `theme.colors.hairline`.

## 2. Brand colors (NEVER change)

| Token | Light | Dark |
| --- | --- | --- |
| background | `#F3F6F3` | `#111815` |
| primary | `#16745D` | `#70CDA7` |
| text | `#192720` | `#F0F5F1` |
| splash green (native + `AppSplash`) | `#12823F` | `#12823F` |

All colors live in `src/theme/index.ts`. **Never hardcode a hex in a screen or
component**; read `useTheme().colors`. The only allowed literals are the splash
green and white text on it inside `AppSplash`.

## 3. Files that define the system

| File | Role |
| --- | --- |
| `src/theme/index.ts` | Colors, radii, `elevation(theme, level)` |
| `src/theme/motion.ts` | Easings, durations, spring presets, stagger |
| `src/components/Glass.tsx` | The card. Use for any frosted surface |
| `src/components/GlassLayer.tsx` | Material internals (blur+tint+sheen+edge). Use only when `Glass` cannot wrap |
| `src/components/Pressable.tsx` | `PressableScale`, the only tappable primitive |
| `src/components/useEntrance.ts` | Fade+rise entrance with stagger |
| `src/components/AppIcon.tsx` | `AppIcon` and `IconTile` (squircle) |
| `src/components/AppBackdrop.tsx` | Page background (glow + hairline rings, top 30%) |
| `src/components/AppSplash.tsx` | Launch animation |
| `src/navigation/AppNavigator.tsx` | Floating glass tab bar, tab transitions, splash handoff |

## 4. Layout

- Screen horizontal padding: **22**. Top padding: `insets.top + 28`.
- Bottom padding of scroll content: **40** (120 when a floating progress card shows).
- Screen title: 34 / weight 800 / letterSpacing -1 / `sans-serif-rounded`.
  Subtitle: 14 / 500 / `textMuted`.
- Section title: 20 / 800 / letterSpacing -0.4, 34 above, 14 below.
- Spacing scale: 4, 8, 12, 16, 22, 28, 34. Card inner padding 18 (small) or 24 (hero).
- Gap between stacked cards: 12.

## 5. Shape

`theme.radius`: xs 8, sm 12, md 20 (cards), lg 28, xl 34 (hero, tab bar), pill 999
(buttons, chips). Icon tiles use radius = 32% of side (iOS squircle feel).

## 6. Glass material (Apple-like transparency)

Use `<Glass>`; do not rebuild it. Layers, bottom to top: backdrop blur, tint
(`glassSurface` | `glassAccent` | `glassStrong`), top sheen, bottom shade, 1px top
highlight. Border is 1px `glassBorder`.

- Default card: `<Glass radius="md">`
- Selected / "now": `<Glass accent>`
- Over busy content (tab bar, banners, floating loaders): `<Glass strong>`
- Hero: `<Glass radius="xl" accent level={3}>`

On Android the backdrop blur snapshots the window and blurs it on *every drawn
frame, per instance*, so a surface that repeats passes `blur={false}`: the card
grid and the tab bar both do. The material is then the veil the blur would have
painted (see the Android `TintStyle` numbers in `GlassLayer.tsx`) plus the tint,
sheen, shade and highlight — the same colours without the per-frame cost. Keep
the real blur for one-off chrome: the hero card, banners, floating loaders.

Never put opaque `surface` fills on top of glass. Never stack more than two glass
layers on top of each other (cost + muddy look).

## 7. Icons

- Family: Ionicons only, through `AppIcon`/`IconTile`. Outline = idle, filled = active.
  No `-sharp` variants.
- Sizes: 14-16 inline with text, 20 rows, 23 tab bar, tile glyph = 52% of tile.
- Color: muted by default, `primary` when active/resolved, `warning`/`danger` only
  with matching text.
- Tab bar: Home `home`, Schedule `calendar`, Rooms `business`, Settings `options`.

## 8. Motion

Import from `src/theme/motion.ts`. Always `useNativeDriver: true` (opacity and
transform only; never animate width/height/layout).

| Use | Preset |
| --- | --- |
| Entrance of cards/sections | `useEntrance(index)`, 420ms `easeOut`, 55ms stagger (max 8) |
| Press feedback | `PressableScale`, spring `snappy`, scale 0.97 (cards) / 0.92-0.96 (small) |
| Sliding indicators (tab bar, segmented control) | spring `snappy`/`smooth` |
| Hero/launch | spring `gentle` |
| Loops (ambient) | 9s+ `easeInOut`; progress bars 1.2s |

Tab transition: the incoming screen slides 36dp from the side of its tab and
fades up (`AnimatedTabScreen`). Do not add a second transition on top.

Launch sequence (do not reorder): native green splash, `AppSplash` (ripples,
logo spring, name, tagline, hairline loader, min 1.5s hold), exit (logo zooms,
layer dissolves 560ms) while the app settles in (scale .97 to 1, fade, 700ms).
Mount `AppSplash` exactly once; drive it only through `exiting`.

Respect smoothness: lists use `memo` (see `ClassCard`), stable callbacks, no
inline objects in hot lists, no work in `onScroll`.

## 9. Components cheat sheet

- Button: `AppButton` (pill, primary or glass secondary).
- Tappable surface: `PressableScale` (never bare `Pressable` for visible controls).
- Card: `Glass`. Status note: `NoticeBanner`. Loader: `ProgressLoadingCard`.
- Empty state: `EmptyState` (icon tile, title, message; no box).
- Between-class gap: `BreakCard` (hairline row, no box).
- Segmented control / chips: see `ScheduleScreen` (`Segmented`, day chips).

## 10. Do / Don't

Do: keep large empty areas; use `Glass`; add `useEntrance` to new top-level blocks;
support light and dark; keep text contrast at least 4.5:1 on glass.

Don't: add colors, shadows with hardcoded colors (use `elevation()`), borders
thicker than 1px, new icon families, bouncy overshoot springs on content,
animations on layout properties, or gradients that need a new native dependency.

## 11. Data rules that UI must keep

Unchanged from the product spec: ambiguous rooms render "Location unclear", never
a guessed Block/Floor (`LocationBadge`); UI never derives Block/Floor itself.
