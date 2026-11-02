# Put LumiQuiz online — cloud hosting package

The app includes **`render.yaml`** for a Render-hosted FastAPI web service. Render assigns a publicly reachable HTTPS URL after you deploy, typically in the form `https://<service>.onrender.com`. **Do not assume a URL exists until the service is live and verified.**

## Steps

The checked Render workspace is connected, but no accessible GitHub source repository exists yet. Before the app can be deployed from this package, create a new GitHub repository at https://github.com/new (recommended name: `lumiquiz-pdf-mcq`).

1. Extract this ZIP and upload the **files directly from the extracted folder** (including `render.yaml`, `server.py`, `requirements.txt`, and the `static` directory) to the **new GitHub repository root**. Select **Add file → Upload files** in the GitHub repository page. Do **not** upload a `.env` file or an actual API key. The included `.gitignore` protects local `.env` files for Git command-line uploads, but check your upload manually.
2. Sign in to [Render](https://dashboard.render.com/) and authorize access to the GitHub repository if it is not already accessible.
3. Choose **New → Blueprint** and select the new repository. Render reads the included `render.yaml`, deploys in the **Singapore** region, installs Python dependencies, and starts `uvicorn server:app --host 0.0.0.0 --port $PORT`.
4. When prompted, set these **secret environment variables**:
   - `LUMIQUIZ_PASSWORD`: a long, unique password to protect your AI spending and uploaded PDFs. Required for production.
   - `OPENAI_API_KEY`: your OpenAI Platform API key (not your ChatGPT login). Without this, the built-in sample quiz works but uploaded-PDF AI generation and tutoring won't.
5. When Render reports **Live**, copy the verified `https://...onrender.com` link from its dashboard. Opening it displays a browser sign-in prompt: username `lumiquiz`, password the secret from step 4.
6. Upload a non-confidential test PDF, generate five questions, answer one, and check that the hint and tutor features work.

## Notes

- Render's free plan can spin down after inactivity and may have limited resources; PDF+vision workloads may require upgrading to an appropriately sized service.
- In this starter version, PDFs are held **in the server's memory** for up to 3 hours and **not shared across separate instances**. A service restart or free-plan spin-down deletes uploaded files; upload again after a restart.
- The code sends uploaded PDFs to the configured OpenAI API. Do not use identifiable patient records or restricted material without applicable authorization.
- Credentials **must be entered as host environment variables** and never placed in JavaScript, GitHub, public files, or the URL.
- The app uses HTTP Basic authentication for a single shared user; this is a private/small-group deployment, not a multi-user enterprise application.
- Other hosts that can run Python can use the same build command (`pip install -r requirements.txt`) and start command (`uvicorn server:app --host 0.0.0.0 --port $PORT`), with `PRODUCTION=true`, `LUMIQUIZ_PASSWORD`, and `OPENAI_API_KEY` in their secret settings.

## Verification

`GET /healthz` returns `{ "status": "ok" }` when the service has the required public-hosting password. All other endpoints require the configured username/password when that secret is set.

## If you only need to try the interface now

Open `LumiQuiz_Demo.html` from the provided separate link in ChatGPT. That is an offline demo with sample MCQs; it is **not** a publicly hosted AI service.