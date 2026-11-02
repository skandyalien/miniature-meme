# LumiQuiz — PDF → MCQ study studio

A mobile-friendly, light-and-dark 3D study app powered by **FastAPI, PyMuPDF, vanilla JavaScript, and the OpenAI Responses API**.

## What works

- Drag-and-drop PDF upload (up to **18 MB** and **250 pages**) and PDF validation
- Request **5–40** questions, set difficulty (Easy / Balanced / Challenging)
- Exactly **four answer choices** for generated questions
- Instant correct/incorrect marking with **detailed teaching explanations**
- Optional **hints** and **30 / 60 / 90 / 120-second** question timer
- Optional **image/diagram questions** grounded in source pages, with tap-to-enlarge previews
- **Ask ChatGPT** panel for explanations, why distractors are wrong, and mnemonics
- Quiz progress, true batch-generation progress, elapsed generation time, result summaries and downloadable JSON results
- Responsive dark/light mode, glowing effects, hover tilt, and a **five-question psychiatry sample** (works without an API key)
- Scores saved in the browser's local storage (last 25 sessions)
- Optional HTTP Basic password protection for cloud deployment; required when `PRODUCTION=true`

## Online deployment

For a public HTTPS link, see **[DEPLOY_ONLINE.md](DEPLOY_ONLINE.md)**. The included `render.yaml` supplies the cloud build/start configuration. Production uses a password so strangers cannot use your OpenAI API credits. A Render or similar hosting account must be connected before a public URL can be issued.

## 1. Install

Python 3.10+ is recommended.

```bash
cd lumiquiz_app
python -m pip install -r requirements.txt
```

On some Windows systems use `py -m pip` instead.

## 2. Configure the OpenAI API key

Copy `.env.example` to `.env` and replace `your_api_key_here` with your actual OpenAI API key. **Do not share this key or include `.env` in a public upload.**

```text
OPENAI_API_KEY=sk-...your-key...
OPENAI_MODEL=gpt-4.1
```

The key is loaded **server-side**. If you skip this step, the sample quiz works, but PDF→AI quiz generation and the in-app AI tutor do not. OpenAI API usage is billed separately from ChatGPT subscriptions.

## 3. Run

```bash
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000** in your browser.

- On an iPhone or iPad, host the app on a reachable HTTPS server if you want to use it from that device. The local address above is accessible only to the computer running the server.
- `LumiQuiz_Demo.html`, distributed separately, can be opened as a static design + sample quiz with no Python or API key. Its PDF upload feature needs the full running backend.

## 4. Test

```bash
python -m pytest -q tests/
```

The automated tests mock the OpenAI API, so they do not incur API charges. They cover upload/validation, source-page image rendering, quiz output validation, batch events, and tutor routing. A browser smoke test was separately performed on the bundled sample quiz.

## Important usage notes

- This is a **local development app**, not a production deployment with authentication, per-user accounts, rate limits, or a persistent database.
- Uploaded PDF bytes are held in **server memory** for up to 3 hours. The server sends the PDF to the configured OpenAI API when generating questions. There is no account/login feature.
- For confidential patient records, identifiable medical data, or restricted copyrighted documents, obtain appropriate authorization and check your institution's policies before uploading.
- AI-generated answers can contain errors. Always verify facts and cited PDF pages, particularly for medicine and exam preparation.
- PDFs can contain scanned pages, tables, and figures. Image quality and model performance vary; the app displays **the original PDF page**, not a guaranteed figure-only crop.
- Large PDFs and many questions may incur significant model input-token costs; question generation makes one AI call per up-to-10-question batch. `OPENAI_MODEL` must support vision-based PDF input and structured JSON output.
- The loading screen reports **real elapsed time and completed batches**. After the first batch, it also displays a **rough remaining-time estimate** extrapolated from measured progress; this is not a guarantee.

## Project structure

```
server.py            FastAPI backend, PDF validation, page rendering, generation, tutor
static/index.html    Interface and controls
static/styles.css    Responsive visual design
static/app.js        Interactive quiz, timer, hints, results, ChatGPT drawer
tests/test_server.py Backend smoke tests
.env.example         Configuration template
requirements.txt     Python dependencies
```

Built as a standalone local app; no Node.js build step is required.
