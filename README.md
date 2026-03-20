# Star Simulator

![alt text](assets/image.png)

Interactive 3D simulator of stellar evolution, built with Three.js and real stellar physics. Powered by [MIST](https://waps.cfa.harvard.edu/MIST/) evolutionary tracks (Choi et al. 2016, Dotter 2016).

This project was written with a massive support from Claude.

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

The app is deployed on [Vercel](https://vercel.com) at **[starsimulator.vercel.app](https://starsimulator.vercel.app)**.

### Automatic deploys

The Vercel project is linked to this GitHub repo. Pushing to `main` triggers an automatic rebuild and deploy.

If auto-deploy isn't working (e.g. webhook issues), deploy manually from the project root:

```bash
npx vercel --prod
```

### Notes

- `vercel.json` configures the Vite build (`npm run build`, output from `dist/`)
- `.vercelignore` excludes the raw MIST data files (`data/mist_raw/`, ~400 MB) from upload — only the processed `src/data/mist_tracks.json` (1.3 MB) is needed at runtime
- The processed MIST tracks JSON is committed to git and bundled by Vite as a static asset

## Data attribution

Stellar evolution tracks from MIST v1.2 (solar metallicity, non-rotating):
- Choi et al. (2016), [ApJ 823, 102](https://doi.org/10.3847/0004-637X/823/2/102)
- Dotter (2016), [ApJS 222, 8](https://doi.org/10.3847/0067-0049/222/1/8)
- Paxton et al. (2011, 2013, 2015) — MESA
