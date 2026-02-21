# Banner Generator Module — Full Plan

**Date**: 2026-02-20
**Status**: Brainstorm / Pre-implementation
**Budget**: ~$200-220/month for external services

---

## Overview

A banner generator tool module for the marketing app that lets product owners go from reference images to fully translated, multi-size ad banners in minutes instead of hours.

**Core workflow**: Reference images + user assets → AI generates initial banner → Polotno editor for fine-tuning → multi-size generation → multi-language translation → batch render → review → export.

---

## Stack (Stack 4 — Polotno SDK)

| Service | Cost | Purpose |
|---------|------|---------|
| Polotno SDK | $199/mo | Editor + server-side rendering |
| fal.ai (FLUX Kontext) | ~$5-15/mo | AI scene generation (~100-200 banners) |
| Claude Haiku | ~$2-5/mo | Vision analysis + translation |
| DeepL Free | $0 | Backup translation (500K chars) |
| **Total** | **~$210-220/mo** | |

**Budget-saver option ($205/mo)**: Use only Path B (Claude vision + Polotno JSON mapping), add FLUX Kontext later as an optional "AI scene" mode.

---

## Phase 0: AI-Powered Banner Creation

### Step 1 — User Uploads Inputs

- Reference image(s): competitor ads, inspiration banners, mood boards
- Their own assets: product photos, brand logo, brand colors/fonts

### Step 2 — AI Analyzes & Generates

Three viable paths (not mutually exclusive):

#### Path A: "AI Scene Generation" (FLUX Kontext Max Multi)

- **Best for**: "Take this competitor ad, swap their product for mine"
- **How**: Send reference image + product photo to FLUX Kontext Max Multi via fal.ai
- **Cost**: ~$0.08/image
- **Output**: A raster image (PNG) — looks great but is a flat image, not editable layers
- **Then**: Image becomes the **background layer** in Polotno. User adds text/CTA elements on top manually (or AI suggests them via Path B)
- **Limitation**: Product won't be pixel-perfect — AI interprets it. Good enough for ~80% of cases. For exact product fidelity, user drags in their actual product photo in the editor

```javascript
const result = await fal.subscribe("fal-ai/flux-pro/kontext/max/multi", {
  input: {
    prompt: "Place the supplement bottle from image 2 into the hand of the person in image 1...",
    image_urls: [competitorAdUrl, yourProductPhotoUrl],
    guidance_scale: 3.5,
    output_format: "png"
  }
});
```

#### Path B: "AI Layout Blueprint" (Vision LLM → Polotno JSON)

- **Best for**: "Analyze this ad's layout and recreate it with my assets"
- **How**:
  1. Send reference banner to Claude Sonnet/Haiku vision
  2. Prompt: "Analyze this banner. Output JSON with: background color, text elements (content, position %, font size, color, weight), image positions, CTA button style/position"
  3. Map the JSON output to Polotno's `store.loadJSON()` format
  4. Swap in user's product photo, brand colors, brand fonts, logo automatically
- **Cost**: ~$0.01-0.03/analysis (Claude Haiku)
- **Output**: A fully editable Polotno design with real layers — text is text, images are images
- **Limitation**: Layout is approximate (vision models aren't pixel-perfect at spatial coordinates). But since the user edits next, 70-80% accuracy is enough to save significant time

#### Path C: Hybrid (Recommended)

- Use Path B for layout structure (text positions, element arrangement)
- Use FLUX Kontext or Stability AI for the hero image/background (product in context)
- Combine: AI-generated background image + structured text/CTA layers from vision analysis
- **Cost**: ~$0.10/banner
- **Output**: Best of both worlds — photorealistic scene + editable text layers

### Key Insight

No current API reliably composites actual product photos pixel-perfectly — all generate AI interpretations. For exact product fidelity, use a template/compositing approach (Polotno) where actual product photos are layered in.

---

## Phase 1: Polotno Editor (Drag-and-Drop Refinement)

The AI output loads directly into the Polotno editor. User sees:
- Background layer (AI-generated scene or solid color)
- Text elements (headline, subheadline, CTA) — all editable
- Product image (their actual photo, positioned by AI)
- Logo (auto-placed based on reference analysis)

User fine-tunes: move elements, change text, swap fonts, adjust colors. This step goes from "start from scratch" (~20 min) to "tweak AI output" (~3-5 min).

```tsx
import { createStore } from 'polotno/model/store';
import { Workspace } from 'polotno/canvas/workspace';
import { Toolbar } from 'polotno/toolbar/toolbar';
import { SidePanel } from 'polotno/side-panel';

const store = createStore({ key: process.env.NEXT_PUBLIC_POLOTNO_KEY });
store.addFont({ fontFamily: 'YourBrandFont', styles: [...] });

// Save template
const json = store.toJSON();
// Load template
store.loadJSON(json);
// Resize with intelligent reflow
page.setSize({ width: 728, height: 90, useMagic: true });
// Modify elements programmatically
element.set({ text: 'Translated text', fontSize: 32 });
```

---

## Phase 2: Multi-Size Generation

User selects target sizes from presets:

| Platform | Sizes |
|----------|-------|
| Google Display | 300x250, 728x90, 160x600, 336x280 |
| Facebook | 1200x628, 1080x1080 |
| Instagram | 1080x1080, 1080x1920 |
| Custom | Any dimension |

Engine uses Polotno's `page.setSize({ width, height, useMagic: true })` to intelligently reflow each size. For each variant:
1. Clone the master design JSON
2. Apply target dimensions with magic resize
3. Store as a separate page in multi-page document

---

## Phase 3: Multi-Language Translation

User selects target languages. For each size variant x each language:

1. Extract all text elements from Polotno JSON
2. Send to Claude Haiku with prompt:
   ```
   Translate to [language]. Constraints:
   - Headline: max [N] characters (based on element width)
   - CTA: max [N] characters
   - Preserve tone: [urgent/playful/professional]
   - Brand terms glossary: [term -> translation]
   ```
3. Write translated text back into cloned design JSON
4. If text overflows, auto-reduce font size (Polotno Cloud Render supports `textOverflow: "change-font-size"`)

**Cost**: ~$0.001-0.005 per translation batch (Claude Haiku)

---

## Phase 4: Batch Render

All variants (sizes x languages) render via:
- **Option A**: Polotno Cloud Render API — $0.004/image, zero infrastructure
- **Option B**: Self-hosted `polotno-node` (Puppeteer) — free, but needs a server

```javascript
// polotno-node server-side rendering
const { createInstance } = require('polotno-node');
const instance = await createInstance({ key: 'YOUR_API_KEY' });
const imageBase64 = await instance.jsonToImageBase64(json, {
  pixelRatio: 2,
  mimeType: 'image/png'
});
instance.close();
```

```
// Cloud Render API
POST https://api.polotno.com/api/renders?KEY=YOUR_API_KEY
Body: { "design": { /* store.toJSON() */ }, "pixelRatio": 1, "format": "png", "textOverflow": "change-font-size" }
```

For 5 sizes x 4 languages = 20 images:
- Cloud: $0.08
- Self-hosted: $0

---

## Phase 5: Review & Export

User sees a grid of all generated variants. For each one they can:
- Approve as-is
- Click to open in mini-editor for quick fixes (text cut off, element misaligned)
- Regenerate just that variant

Export options: PNG, JPG, WebP, PDF. Download as ZIP or push to asset library.

---

## Time Savings

| Step | Before (manual) | After (this tool) |
|------|-----------------|-------------------|
| Initial design | 20-30 min from scratch | 3-5 min tweaking AI output |
| Each additional size | 10-15 min manual resize | Automatic (seconds) |
| Each language | 15-20 min (translate + refit) | Automatic + review (1-2 min) |
| **Total for 5 sizes x 4 languages** | **~6-8 hours** | **~15-30 minutes** |

---

## Build Phases (Implementation Order)

### Build Phase 1 (MVP — 2-3 weeks)
- Polotno editor integration (React component)
- Template save/load (store JSON in Neon DB)
- Manual banner creation workflow
- Single-size export

### Build Phase 2 (Multi-size — 1 week)
- Size presets UI
- Polotno magic resize integration
- Batch render pipeline (Cloud API or polotno-node)
- Review grid + ZIP export

### Build Phase 3 (Translation — 1 week)
- Language selection UI
- Claude Haiku translation pipeline with character constraints
- Font fallback for non-Latin scripts
- Translated variant generation

### Build Phase 4 (AI Creative — 1-2 weeks)
- Reference image upload UI
- Path B: Vision LLM → Polotno JSON converter
- Path A/C: FLUX Kontext integration for AI scene generation
- Asset swap logic (auto-place user's product/logo)

**Note**: Phase 4 is the flashiest feature but Phases 1-3 deliver the most consistent daily value (multi-size + translation automation). Build in this order so the team gets immediate productivity gains while the AI creative features are being refined.

---

## Alternative Editors Considered

| Editor | Cost | Verdict |
|--------|------|---------|
| Polotno SDK | $199/mo | **Selected** — React-native, JSON API, magic resize, server rendering |
| Orshot Studio Embed | $30/mo | Cheaper but iframe-only, less programmatic control |
| LidoJS | $999 one-time | Promising but immature, limited docs |
| react-design-editor | Free (MIT) | Abandoned, Fabric.js 4.x, no resize intelligence |
| IMG.LY CE.SDK | ~$13K/yr | Overkill for this use case |
| Canva Connect API | Free | **Ruled out** — cannot read/edit design content via REST, Autofill requires Enterprise (30+ seats) |
| Konva.js + react-konva | Free (MIT) | Would need to build everything from scratch |
| Design Huddle | $500-750/mo | Over budget |

## AI Creative Reconstruction Tools Considered

| Tool | Cost | Best For |
|------|------|----------|
| FLUX Kontext Max Multi | $0.08/img via fal.ai | Multi-image scene composition |
| Claude Vision (Haiku/Sonnet) | $0.01-0.03/analysis | Layout extraction → structured JSON |
| ControlNet + IP-Adapter | Self-hosted (GPU needed) | Highest quality, most complex |
| Stability AI Edit API | $0.03-0.06/img | Background removal, inpainting, relighting |
| Sony BannerAgency | Free (open-source) | Multi-agent ad analysis (research paper, EMNLP 2025) |

## Translation Services Considered

| Service | Cost | Notes |
|---------|------|-------|
| Claude Haiku 4.5 | ~$2/mo | Best for char-limit-aware translation |
| DeepL Free | $0 (500K chars) | Formality control, glossaries |
| Google Cloud Translation | $0 (500K chars) | Backup option |
