# Star Simulator

![alt text](assets/image.png)

Interactive 3D simulator of a main-sequence star, built with Three.js and real stellar physics.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Production build

```bash
npm run build
npm run preview   # preview the build locally
```

The build output is in `dist/`.

## Deploy

The app is a static Vite build. To deploy on Vercel:

1. Connect the GitHub repo to [Vercel](https://vercel.com)
2. It auto-detects the Vite config and deploys from `dist/`

Or deploy manually:

```bash
npx vercel
```
