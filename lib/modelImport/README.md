# Model link import

`POST /api/models/import` accepts JSON `{ "url": "https://…", "selectionUrl": "https://…" }`. The selection is optional and is accepted only after rediscovering that exact download URL in the original public page.

- One file returns actual model bytes, never HTML or a success placeholder. `X-Model-Filename`, `X-Model-Source-Url` and `X-Model-Attribution` are URI-encoded; `X-Model-Format` is `stl`, `obj` or `3mf`.
- Multiple files return `{ status: "select_file", source, files: [{ url, name, format }] }`. The client resubmits the original page URL with a selected file URL.
- An inaccessible source returns HTTP 422 with `{ status: "upload_required", code, message, source, supportedFormats }`. Invalid URLs use 400; throttling uses 429; unavailable rate enforcement or an unexpected service failure uses 503. Preserve the source URL when the user uploads the model manually.

Anonymous visitors can preview models. Production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; missing, failed or timed-out enforcement stops imports. Limits are five attempts per client per minute and 60 total per minute. The existing `TRUST_PROXY_HEADERS` setting must be enabled only behind an edge that overwrites client-supplied forwarding headers. Otherwise anonymous traffic intentionally shares one bucket. Local development uses a bounded in-memory limiter.

Only public HTTPS on port 443 is fetched. Credentials in URLs are rejected, and cookies, authorization and browser headers are not forwarded. Every destination and redirect resolves all DNS addresses; any private/reserved result rejects the destination. The HTTPS socket uses only those checked addresses, retaining hostname-based TLS validation. Limits: three redirects per fetch, six total network requests, 20 seconds total network time, 2 MiB per HTML document, 4 MiB per model and 8 MiB cumulative response bytes. Compressed HTTP responses are declined; 3MF archives have separate bounded decompression checks. Request JSON is limited to 8 KiB and three seconds.

STL and OBJ geometry is checked before delivery. A 3MF must be a bounded ZIP package containing a model mesh and the 3MF content type; encrypted, oversized, malformed and suspiciously compressed archives are rejected. This is a file-format check, not a printability or license decision. No model is published or stored by this route.

## Source access

Discovery reads only public HTML anchors and JSON data already included in a MakerWorld, Printables or Thingiverse response. It can follow one observed file tab belonging to the same design. It does not synthesize undocumented API endpoints, extract access tokens, execute scripts, solve verification challenges or bypass paid access. Direct STL/OBJ/3MF HTTPS links are supported from other public hosts.

[Prusa's Printables Store announcement](https://blog.prusa3d.com/printables-store_87810/) states that free models remain downloadable without a login, while Store and Club models have separate paid access. It also distinguishes personal and commercial-print licenses. That public availability does not guarantee that a server-side importer can read a file link through the site's current protection.

[MakerBot's official, archived Thingiverse client](https://github.com/makerbot/thingiverse-php/blob/master/thingiverse.php) documents an OAuth access-token integration. This importer has no Thingiverse application credentials and does not borrow tokens from a browser or third-party app. A dedicated approved API integration is separate work. The current developer reference could not be read through the research browser, so no claim is made that the archived client represents current API availability.

Attribution is retained as source metadata, not interpreted as instructions or as permission to sell prints. The original model's applicable license still governs use.

## Checks on 23 September 2026

The native HTTPS importer was exercised against these URLs from the local development machine. These are observations, not availability guarantees for another deployment or date.

| Source | Result |
| --- | --- |
| `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/stl/ascii/slotted_disk.stl` | Imported a valid STL, 80,861 bytes. |
| `https://www.printables.com/model/3161-3d-benchy` | HTTP 403; `source_restricted` upload fallback. |
| `https://www.thingiverse.com/thing:763622` | HTTP 200 HTML, 26,276 bytes, no exposed STL/OBJ/3MF link; `no_public_download` fallback. |
| `https://makerworld.com/en/models/15106-benchy` | Public HTML did not expose a usable model link; `no_public_download` fallback. A later diagnostic request was also denied. No login or browser challenge was bypassed. |

64 targeted tests passed across `modelImportNetwork`, `modelImport`, `modelImportRoute` and `modelImportRateLimit`, including private/reserved targets, mixed DNS, socket pinning, malicious redirects, size/time budgets, HTML masquerading as a model, archive bombs, gated sources, selection membership and production rate-limit failures. Targeted ESLint passed.
