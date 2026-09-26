# Public SEO artifact input

`published-routes.json` is the fail-closed handoff between verified publication
state and the static `robots.txt` / `sitemap.xml` artifacts.

Keep `routes` empty until both the production HTTPS origin and the actually
published, indexable routes are known. Each non-empty entry must have this
shape:

```json
{
  "path": "/catalog",
  "published": true,
  "indexable": true,
  "locale": "zh-CN",
  "lastModified": "2026-09-06"
}
```

Run the generator in strict deployment mode only with an immutable snapshot,
verified pre-render evidence, and all generated Nginx inputs:

```powershell
node scripts/generate-public-seo-artifacts.mjs --strict --manifest client/.release-seo/public-seo-snapshot.json --prerender-manifest client/dist/prerendered-routes.json --out-dir client/dist --nginx-map client/.release-seo/public-seo-routes.conf --nginx-policy client/.release-seo/public-seo-policy.conf --nginx-origin-redirect client/.release-seo/public-origin-redirect.conf --nginx-origin-host client/.release-seo/public-origin-host.conf
```

Use `--check` to verify that committed artifacts match the manifest. The
generator rejects private routes, queries, fragments, HTTP origins, unpublished
entries, and locales that are not currently available; it never infers routes
from React source or placeholder content.
