# Book Reader

A static, serverless EPUB reader. Sign in with Google, browse a folder of
books in your Google Drive, read them in the browser, and have progress and
preferences saved to a Google Sheet. No backend — everything runs client-side
and is hosted on GitHub Pages.

## One-time Google Cloud setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project (or reuse one).
2. **APIs & Services → Library**: enable **Google Drive API** and **Google Sheets API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: External.
   - Keep it in **Testing** mode — no verification needed for personal use.
   - Add your own Google account under **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: add `http://localhost:5173` and `https://<your-github-username>.github.io`.
   - No redirect URIs needed.
   - Copy the generated **Client ID**.

## Local development

```
cp .env.example .env.local
# paste your Client ID into .env.local
npm install
npm run dev
```

## Deploying

The app deploys to GitHub Pages automatically on push to `main` via
`.github/workflows/deploy.yml`.

One-time repo setup:
- **Settings → Pages**: set Source to "GitHub Actions".
- **Settings → Secrets and variables → Actions → Variables**: add a repository
  variable named `GOOGLE_CLIENT_ID` with your OAuth Client ID (it's public,
  not a secret, but repo *variables* — not *secrets* — are the right place
  for build-time values like this).

The site will be published at `https://<your-github-username>.github.io/book-reader/`.

## First run

After signing in, you'll pick (via the native Google Picker, not pasted links):
- The Drive folder containing your books (subfolders are supported).
- Either "create a new spreadsheet" (recommended) or an existing spreadsheet to store reading progress and preferences.

The Picker is authorized using your Google Cloud project number (the numeric prefix of your Client ID) — no separate API key is needed.

Both choices are remembered in the browser (`localStorage`), so you only do this once per browser. The spreadsheet itself is what makes progress portable — point another browser/device at the same spreadsheet to resume there too.
