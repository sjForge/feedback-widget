# Deployment Guide

## npm Publishing

### Prerequisites

1. npm account with access to `@sjforge` scope
2. Logged in via `npm login`

### Publishing Steps

```bash
# Build all formats
npm run build:all

# Verify dist contents
ls -la dist/
ls -la dist/cdn/

# Publish (dry run first)
npm publish --dry-run

# Publish for real
npm publish --access public
```

### Version Bumping

```bash
# Patch release (0.3.0 → 0.3.1)
npm version patch

# Minor release (0.3.0 → 0.4.0)
npm version minor

# Major release (0.3.0 → 1.0.0)
npm version major
```

---

## CDN Deployment

The CDN bundle is built to `dist/cdn/cdn.js`. This needs to be hosted at `https://cdn.sjforge.dev/feedback-widget.min.js`.

### Option 1: Vercel Edge (Recommended)

Since the feedback portal is already on Vercel, use the same infrastructure.

1. Create a `/public/cdn/` folder in the portal project
2. Copy the built CDN file there during CI/CD
3. Configure Vercel to serve it with proper caching headers

```json
// vercel.json addition
{
  "headers": [
    {
      "source": "/cdn/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" },
        { "key": "Access-Control-Allow-Origin", "value": "*" }
      ]
    }
  ]
}
```

### Option 2: Separate CDN Project

Create a minimal Vercel project just for the CDN:

```
feedback-widget-cdn/
├── public/
│   └── feedback-widget.min.js
├── vercel.json
└── package.json
```

### Option 3: npm CDN (unpkg/jsdelivr)

The npm package automatically gets CDN URLs:

```html
<!-- unpkg -->
<script src="https://unpkg.com/@sjforge/feedback-widget@0.3.0/dist/cdn/cdn.js"></script>

<!-- jsdelivr -->
<script src="https://cdn.jsdelivr.net/npm/@sjforge/feedback-widget@0.3.0/dist/cdn/cdn.js"></script>
```

These work immediately after npm publish without additional setup.

---

## React Native Package

### Publishing

```bash
cd ../feedback-widget-native

# Build
npm run build

# Publish
npm publish --access public
```

---

## Post-Publish Verification

After publishing, verify:

1. **npm install works:**
   ```bash
   npm install @sjforge/feedback-widget@latest
   npm install @sjforge/feedback-widget-native@latest
   ```

2. **CDN loads:**
   ```html
   <script src="https://unpkg.com/@sjforge/feedback-widget@latest/dist/cdn/cdn.js"></script>
   ```

3. **Types work:**
   ```typescript
   import { FeedbackWidget } from '@sjforge/feedback-widget';
   // Should have full TypeScript support
   ```

4. **Test submission:**
   ```javascript
   FeedbackWidget.init({
     projectId: 'test-project',
     apiKey: 'fpk_test',
   });
   await FeedbackWidget.submit({
     type: 'feature',
     priority: 'low',
     title: 'Test submission',
     description: 'Verifying npm publish worked',
   });
   ```

---

## Environment Checklist

Before publishing:

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build:all`
- [ ] Version bumped appropriately
- [ ] CHANGELOG updated
- [ ] README reflects current features
