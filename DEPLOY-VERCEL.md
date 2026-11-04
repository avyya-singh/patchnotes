# Publish the free portfolio demo

This deployment is a static React site. It needs no model API key, database, Python hosting, or paid inference. Use Vercel's Hobby plan for this personal, non-commercial portfolio. Hobby usage limits still apply.

## 1. GitHub

Create an empty public repository named `patchnotes` under `avyya-singh`. Upload the source at the repository root, including the hidden `.github` directory, `vercel.json`, `frontend/public/demo-data.json`, and `frontend/.env.demo`. Do not upload `data/`, `.venv/`, `.env`, or `node_modules/`.

The source is published at https://github.com/avyya-singh/patchnotes, with commits authored and committed by avyya-singh. GitHub CI has passed.

## 2. Vercel

Sign into Vercel and choose **Add New → Project → Import Git Repository → avyya-singh/patchnotes**. Use your personal **Hobby** account, not a paid team or trial upgrade. Keep Root Directory at the repository root.

The committed `vercel.json` configures:

- Install: `npm ci --prefix frontend`
- Build: `npm run build:demo --prefix frontend`
- Output: `frontend/dist-demo`

No environment variables or secrets are needed for this public build. Click Deploy. Vercel returns the real production URL; copy that URL rather than guessing its hostname. Add it to the GitHub repository About section, README, résumé, and personal website. Subsequent pushes redeploy via Vercel's Git integration.

## 3. What visitors can do

Browse incidents, explore precomputed sample analyses and their citations, open source documents, approve/decline simulated actions, and view/clear their browser-local history. The page explicitly labels precomputed analysis. There are no live agent/model calls and no uploads on the public site. History is capped at 30 runs per browser.

The sample export includes only synthetic fixtures. Never replace it with exports of user-uploaded runbooks or real incident logs without deliberate review.

## Free local AI

The full Python app remains separate. It supports real runtime semantic retrieval and LangChain/Ollama analysis. Install Ollama from its official website, pull an appropriate open model, set `PATCHNOTES_MODE=ollama`, and start the Python backend. No hosted API key is needed. This uses your machine's RAM/CPU/GPU and electricity.

## Deployment status

The public demo is live at https://patchnotes.vercel.app on Vercel Hobby. Anonymous HTTP requests and the browser investigation/citation/approval flow are verified. The Python API is not deployed; `/api/health` returns 404 as expected for the static build.

The project is under `audreystark54-gmailcoms-projects/patchnotes`. GitHub automatic deployment is not yet connected: the Vercel CLI Git connection attempt was rejected. To enable it, sign into Vercel and open Project Settings → Git, then authorize access to `avyya-singh/patchnotes`. This does not affect the already-public URL. Until connected, use `vercel deploy --prod` with the correct project/account settings to publish changes manually.

Official references: https://vercel.com/docs/plans/hobby and https://vercel.com/docs/deployments/git
