# WatchFlow — Official Product Website

This directory contains the public-facing product marketing and privacy website for **WatchFlow**.

It is completely decoupled from the Chrome extension runtime located in `/src`.

---

## Tech Stack & Architecture

- **Engine**: Vite (Static Site Generator & Bundler)
- **Languages**: Semantic HTML5, Vanilla Modern CSS3, ES2022 JavaScript
- **Styling**: Minimalist dark-first design system with custom CSS variables, responsive breakpoints, and `prefers-reduced-motion` support
- **Assets**: Official WatchFlow wordmark, boxed icons, and high-resolution real-Chrome interface captures
- **Zero Runtime Bloat**: Zero client-side frontend framework overhead; pure static HTML/CSS output

---

## Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open your browser at the local URL printed in the terminal (typically `http://localhost:5173`).

### 3. Production Build
```bash
npm run build
```
Compiles the static website assets into `website/dist/`.

### 4. Preview Production Build
```bash
npm run preview
```

---

## Project Structure

```
website/
├── index.html          # Main product landing page & hero product visual
├── privacy.html        # Detailed technical privacy policy & data model
├── package.json        # Project metadata and build scripts
├── vite.config.js      # Multi-page Vite configuration
├── README.md           # Documentation and development guide
├── src/
│   ├── style.css       # Design tokens, responsive layout, dark theme
│   └── main.js         # Navigation, modal dialog, and micro-interactions
└── public/
    ├── assets/         # Official WatchFlow logos
    ├── icons/          # Favicons and extension icons
    └── screenshots/    # High-resolution real-Chrome product captures
```

---

## Deployment Recommendations

The `website/dist` output is completely static and can be deployed directly to:
- **Cloudflare Pages**: Framework preset `Vite`, build command `npm run build`, output directory `dist`.
- **Vercel**: Framework preset `Vite`, root directory `website`.
- **Netlify**: Build command `npm run build`, publish directory `website/dist`.
- **GitHub Pages**: Via GitHub Actions running `npm run build`.

---

## Domain Configuration

The canonical URL is configurable in `website/src/main.js` via the `CONFIG` object. Update `CONFIG.SITE_DOMAIN` once the production custom domain is finalized.
