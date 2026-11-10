# Junta2 · Brand override

This project follows `MANUALDEMARCA.pdf` as the visual source of truth. The generated design-system defaults are secondary.

## Brand colors

- Primary orange: `#FC4C02`
- Secondary orange: `#FF7A18`
- Cream: `#FFF1D0`
- Ink: `#0A0A0A`
- Light text: `#FFF8E8`

Use orange for primary actions, selected navigation and active states. Use cream for branded surfaces and on-orange text. Use ink for dark app chrome. Keep body text high-contrast; do not use orange for long paragraphs.

## Identity assets

- Horizontal wordmark: `assets/brand/wordmark.png`
- Isotype/app icon: `assets/brand/icon.png`
- Android adaptive foreground: `assets/brand/adaptive-foreground.png`
- Splash: `assets/brand/splash.png`

## Type

The manual names Moga for the wordmark and Ambiguity Generous for supporting display typography. The source font files were not included, so the app uses the official raster wordmark for identity and a platform-native sans fallback for UI legibility. Do not fake the wordmark with a substitute font.

## Interaction

Pressable controls use short feedback (roughly 160ms), a subtle pressed scale, 44px minimum hit targets, and reduced-motion fallbacks. Avoid ornamental motion that delays frequent actions.
