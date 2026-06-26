---
name: update-data
description: Refresh public/data/locations.json with the latest data from the kabinka.by API.
---

Re-fetch the full dataset (locations + details + comments) from the kabinka.by API and write it to the app's data file.

```bash
node scripts/build-data.mjs
```

Env vars:
- `LIMIT` — process only the first N locations (handy for a quick test sample).
- `OUT` — output path (default `public/data/locations.json`, resolved from the project root).

Examples:
```bash
node scripts/build-data.mjs                                  # full refresh → public/data/locations.json
LIMIT=3 OUT=public/data/_sample.json node scripts/build-data.mjs   # 3-location sample
```

What it does:
1. `GET /api/v1/locations?...&per_page=500` for the summary list.
2. For each location: `GET /locations/{id}` (detail) + `GET /locations/{id}/comments`.
3. Merges detail + summary, inlines comments, builds `photos[].{remote,url,thumb}`.
4. Overwrites `OUT` (default `public/data/locations.json`).

The required `X-Device-ID` header is handled automatically: the script persists a device id in `scripts/.device_id` (gitignored) and reuses it across runs.

Notes:
- This refreshes the JSON only. The thumbnail bundle (`public/thumbs/thumbs.bin` + index) is produced separately by `node scripts/pack-thumbs.mjs`; re-run that if photo references changed.
- After refreshing, the dataset has ~263 locations. Verify with the `run` skill, and run `npx vitest run` (the repository/filter tests load this shape).
