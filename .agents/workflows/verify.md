# verify
Run these in order and show only the last 5 lines of each:
1. cd app && npm run type-check && npm run build
2. cd ../internal && npm run type-check && npm run build
3. cd ../site && npm run build
4. cd ../api && ruff check . && env -u GOOGLE_API_KEY uv run pytest -q 2>&1 | tail -5
Then run: git status --short
