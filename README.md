# Audit Valeya

Website audit prototype by Valeya Studio. The main page runs a Google PageSpeed Insights / Lighthouse analysis for a single public URL and returns Performance, Accessibility, Best Practices and SEO category scores, selected findings, an action-oriented summary, and export options.

## Live pages

- `index.html`: Audit Valeya
- `revenue-leak.html`: preserved Revenue Leak interactive demo
- `audit.css` and `audit.js`: responsive interface and client-side report rendering
- `styles.css` and `app.js`: Revenue Leak demo assets

## Run locally

Open `index.html` in a browser, or serve the repository with a local static server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Current functionality

- Run Lighthouse via the PageSpeed Insights API for a single public page.
- Select mobile or desktop strategy.
- Display the four Lighthouse category scores.
- List selected audits with scores below 90/100, sorted by severity.
- Generate a short, transparent priority summary.
- Export a JSON report or print/save the report as PDF through the browser.
- Optionally supply a Google PageSpeed Insights API key for quota and reliability. The key is not persisted in local storage or included in exported reports.

## Important limitations

- This is a prototype, not a complete crawler or a certification service.
- It analyses one URL per run; it does not crawl every page of a site.
- PageSpeed Insights is a third-party service and may impose quotas or return transient errors.
- The optional API key is entered in the browser and sent to Google for the request. For a commercial multi-user product, move API calls to a backend and store a restricted key in server-side environment variables.
- Lighthouse lab scores do not prove real-world conversion, ranking or revenue impact.
- Accessibility and SEO scores are automated signals; important findings require manual verification.
- No customer account, history database, analytics integration or billing is implemented.

## Suggested next steps

1. Add a server-side API proxy with rate limits and request validation.
2. Add multi-page crawling with explicit crawl limits and robots.txt handling.
3. Store historical reports only after defining privacy, retention and consent requirements.
4. Add manual UX and conversion review as a separate, clearly labelled layer.
5. Add test coverage for score parsing, priority logic, URL validation and API failures.

**Status:** working MVP prototype; no customer analytics are connected.
