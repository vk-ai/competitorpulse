# CompetitorPulse — local walkthrough (record this)

Use this as a **screen-recording script** on your laptop. Goal: show a new user how to install and use the product in ~2–3 minutes.

**Prep (before you hit Record)**
- Install: Node.js 18+ (`node -v`), Git, and a terminal
- Optional: VS Code / Cursor open to show files briefly
- Clear terminal scrollback; font size ≥16; dark theme looks good on camera
- Browser tab ready: https://github.com/vk-ai/competitorpulse

**Recording tips**
- macOS: QuickTime → File → New Screen Recording (or OBS)
- Capture **one terminal window** full-screen or large; hide bookmarks/passwords
- Speak from the voiceover beats below, or stay silent and add VO later

---

## Shot list (follow in order)

### 1. Repo (10s)
Open the GitHub page. Say: "CompetitorPulse is an open-source competitive-intel agent — watch sites, changelogs, blogs, pricing; get Markdown digests."

### 2. Clone + install (30–40s)
```bash
git clone https://github.com/vk-ai/competitorpulse.git
cd competitorpulse
npm install
cp examples/competitors.example.yaml competitors.yaml
```
Briefly open `competitors.yaml` and point at `website` / `changelog` / `blog` / `pricing` fields.

### 3. List competitors (15s)
```bash
npm run cli -- list
```
Explain: these are example competitors from the sample config.

### 4. Run a check (25–35s)
```bash
npm run cli -- check
```
Explain: polite fetch → meaningful diff → classify → write digests under `data/`.

### 5. Show digest (20s)
```bash
npm run cli -- digest
```
Scroll the Markdown summary. Optional: open `data/digests/combined_latest.md` in the editor.

### 6. MCP (optional, 20s)
Show README MCP section. Say you can run:
```bash
npm run mcp
```
…and connect that as an MCP server in Cursor so the agent can `run_check` / `get_digest`.

### 7. Close (10s)
Back to GitHub. "MIT licensed — star, fork, open issues. Self-host free."

---

## Voiceover (short)

1. CompetitorPulse watches competitor pages and turns changes into digests.
2. Clone, npm install, copy the example YAML.
3. List your competitors, run check, read the digest.
4. Same flow works from Cursor via MCP.
5. Open source under MIT — github.com/vk-ai/competitorpulse

---

## After recording

- Export 1080p MP4
- Upload to YouTube/LinkedIn unlisted or public
- Paste the link in the README Demo section
- Optional: add to Product Hunt / Indie Hackers launch post

## Not in v1 (by design)

- No paid cloud billing yet (open-source first)
- No LinkedIn scraping
