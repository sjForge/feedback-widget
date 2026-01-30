# Feedback Widget SDK - Project Status

## Current State: Complete (v0.3.0)

All 7 phases of the feedback widget SDK have been implemented.

## What's Included

### @sjforge/feedback-widget (Web/Electron)

| Feature | Status | Notes |
|---------|--------|-------|
| Text feedback submission | ✅ Complete | Core submission with type/priority/title/description |
| Screenshot capture | ✅ Complete | html2canvas with privacy masking |
| Annotation editor | ✅ Complete | Rectangle, arrow, text, highlight, blur tools |
| Session recording | ✅ Complete | rrweb with chunked upload |
| Offline queue | ✅ Complete | IndexedDB with auto-sync |
| Context capture | ✅ Complete | Browser, errors, network failures |
| Electron support | ✅ Complete | ElectronAdapter with preload helpers |
| CDN bundle | ✅ Complete | IIFE bundle for script tag usage |
| Privacy controls | ✅ Complete | Mask/block selectors, auto-mask passwords |

### @sjforge/feedback-widget-native (React Native)

| Feature | Status | Notes |
|---------|--------|-------|
| Text feedback submission | ✅ Complete | Same API as web |
| Screenshot capture | ✅ Complete | react-native-view-shot integration |
| Offline queue | ✅ Complete | AsyncStorage with auto-sync |
| Context capture | ✅ Complete | Device/OS info via expo-device |
| UI components | ✅ Complete | FeedbackButton, FeedbackForm |
| Network detection | ✅ Complete | @react-native-community/netinfo |

### Portal Enhancements

| Feature | Status | Notes |
|---------|--------|-------|
| Widget API endpoints | ✅ Complete | /api/widget/feedback, /upload/* |
| API key authentication | ✅ Complete | HMAC-SHA256 signing |
| Recording playback | ✅ Complete | rrweb-player in admin |
| API key management UI | ✅ Complete | Admin → Projects → Widget Keys |
| Context display | ✅ Complete | Browser, errors, network in detail view |

## File Structure

```
feedback-widget/                    # Web/Electron SDK
├── src/
│   ├── core/
│   │   ├── widget.ts              # Main FeedbackWidget class
│   │   ├── transport.ts           # API communication
│   │   ├── context.ts             # Context collection
│   │   ├── screenshot.ts          # html2canvas wrapper
│   │   ├── recording.ts           # rrweb wrapper
│   │   └── offline-queue.ts       # IndexedDB queue
│   ├── ui/
│   │   ├── widget-ui.ts           # Floating button and form
│   │   └── annotation-editor.ts   # Drawing tools
│   ├── adapters/
│   │   ├── web.ts                 # Default web adapter
│   │   ├── electron.ts            # Electron adapter
│   │   └── electron-preload.ts    # Preload script helpers
│   ├── types/
│   │   └── index.ts               # TypeScript definitions
│   ├── index.ts                   # Main exports
│   ├── cdn.ts                     # CDN entry point
│   └── electron-preload.ts        # Standalone preload export
├── package.json
├── tsconfig.json
├── README.md
└── DEPLOYMENT.md

feedback-widget-native/             # React Native SDK
├── src/
│   ├── core/
│   │   ├── widget.ts              # Main FeedbackWidget class
│   │   ├── transport.ts           # API communication
│   │   ├── context.ts             # Device/OS collection
│   │   ├── screenshot.ts          # react-native-view-shot wrapper
│   │   └── offline-queue.ts       # AsyncStorage queue
│   ├── components/
│   │   ├── FeedbackButton.tsx     # Floating button
│   │   └── FeedbackForm.tsx       # Modal form
│   ├── types/
│   │   └── index.ts               # TypeScript definitions
│   └── index.ts                   # Main exports
├── package.json
├── tsconfig.json
└── README.md
```

## Next Steps (Post-Release)

1. **npm publish** - Publish both packages to npm
2. **CDN setup** - Configure cdn.sjforge.dev or use unpkg/jsdelivr
3. **Integrate into apps** - ShaneStephanieBakery, BookOfMormonMastery
4. **Monitor usage** - Watch for issues in production

## Known Limitations

- Session recording not available on React Native (no DOM)
- Screenshot annotation not available on React Native (would need native canvas)
- Large recordings (>50MB) may fail upload on slow connections

## Dependencies

### Web SDK
- html2canvas: Screenshot capture
- rrweb: Session recording
- pako: Gzip compression

### React Native SDK
- @react-native-async-storage/async-storage: Offline storage (required)
- @react-native-community/netinfo: Network detection (optional)
- react-native-view-shot: Screenshot capture (optional)
- expo-device: Device info (optional)

---

*Last updated: 2026-01-30*
