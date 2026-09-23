# WPL7 catalog

Shared content for [WPL7](https://github.com/andyfo/wpl7) panels, the self-hosted WordPress
hosting panel. Today the catalog holds **plugin recipes**: how a panel supplies and activates
a plugin's license, what it redoes when a site's URL changes, and how it releases the
activation. More kinds of entries will follow.

Every panel fetches this catalog **hourly** and verifies its signature, so a corrected or new
recipe reaches every install without a software update. Entries a panel does not understand
yet are skipped and counted, which is the only case that calls for updating the panel.

- Published index: **https://andyfo.github.io/wpl7-catalog/v1/index.json**
- Signature: https://andyfo.github.io/wpl7-catalog/v1/index.json.sig
- Schema: https://andyfo.github.io/wpl7-catalog/schema/plugin-recipe.v1.schema.json

## Adding a recipe

1. Copy an existing file in `recipes/` and name the new one after its `id` (`<id>.json`).
2. `npm ci && npm run check` validates every file against the schema and the uniqueness
   rules (one recipe per plugin, one plugin per recipe).
3. Test it on a real site first: put the file in your panel's `panel/catalog/recipes/`,
   restart the panel, enter the key, press **Activate** on the site's WordPress tab and read
   the job log.
4. Open a pull request. CI runs the same check; a merge to `main` publishes within a minute.

Never put a license key in a recipe. Keys are entered in each panel and substituted at run time.

## What a recipe is

One JSON object per plugin. A recipe applies to a plugin that is **installed and active** on a
site, whatever way it got there. Every step runs inside that site's own container through
wp-cli, as the web server user, with no shell — a step can do what a site administrator
could, and nothing more.

```json
{
  "type": "plugin-recipe",
  "typeVersion": 1,
  "id": "example-pro",
  "name": "Example Pro",
  "plugin": "example-pro",
  "version": "1.0",
  "vendorUrl": "https://example.com/",
  "description": "Activates your Example Pro license on every new site and again when the site moves to its own domain.",
  "license": { "constant": "EXAMPLE_PRO_LICENSE", "hint": "Where to find the key." },
  "hooks": {
    "afterInstall": [
      { "run": "wp", "label": "Activating the Example Pro license",
        "args": ["example", "license", "activate", "{{key}}"], "expect": "activated" },
      { "run": "wp", "label": "Updating to the current release",
        "args": ["plugin", "update", "{{plugin}}"], "optional": true }
    ],
    "afterUrlChange": [
      { "run": "wp", "args": ["example", "license", "activate", "{{key}}"], "expect": "activated" }
    ],
    "beforeRemove": [
      { "run": "wp", "args": ["example", "license", "deactivate"], "optional": true }
    ],
    "verify": [
      { "run": "php", "label": "Checking the Example Pro license",
        "code": "if (!function_exists('example_license_is_active')) { fwrite(STDERR, \"plugin not loaded\\n\"); exit(1); }\nif (example_license_is_active()) { echo \"OK\\n\"; exit(0); }\nfwrite(STDERR, \"not active\\n\"); exit(1);",
        "expect": "^OK" }
    ]
  }
}
```

| Field | Meaning |
|---|---|
| `id` | The identity a panel files the stored license key under. Never change it once published. |
| `plugin` | The plugin directory name, as `wp plugin list` shows it. |
| `version` | For people: bump it when the recipe changes. Panels follow the catalog automatically; the version makes the change legible. |
| `description` | One plain sentence on what the recipe does for the operator — what gets activated when — not how. |
| `license` | Present when the plugin takes a key. `constant` makes the panel define that PHP constant on every site running the plugin (for vendors that read a wp-config constant); `hint` says where the key is found. A recipe without `license` can still automate things. |
| `hooks.afterInstall` | Runs right after a new site's plugins are installed, and on **Activate** in the panel. |
| `hooks.afterUrlChange` | Runs after the panel pointed WordPress at a new URL (go-live, restore under another hostname, move). |
| `hooks.beforeRemove` | Runs before a site is deleted — release the activation. Best effort. |
| `hooks.verify` | Runs after each of the above and on **Check**; decides the status the panel shows. |

Steps, in order, each either:

- `{ "run": "wp", "args": [...] }` — a wp-cli invocation, arguments verbatim (no shell), with
  `{{key}}`, `{{plugin}}`, `{{url}}` and — in `afterUrlChange` — `{{oldUrl}}` / `{{newUrl}}`
  substituted.
- `{ "run": "php", "code": "..." }` — PHP without an opening tag, run through `wp eval`. It
  receives the same values as environment variables (`WPL7_LICENSE_KEY`, `WPL7_SITE_URL`,
  `WPL7_OLD_URL`, `WPL7_NEW_URL`), so a key is never spliced into code. Exit non-zero to fail.

Both take `label` (shown in the job log), `expect` (a JavaScript regular expression, multiline,
that stdout must match — use it whenever a vendor's command exits 0 whatever it concludes) and
`optional` (a failure only warns; the first failing non-optional step ends the run for that
plugin). Without `verify` steps, a hook that ran through counts as active.

## How panels verify the catalog

The signature covers the exact bytes of `v1/index.json`, made with an Ed25519 key that only
the maintainers hold; CI signs on every publish. Panels carry the public key and refuse an
index that does not verify — a mirror, a CDN hiccup or a compromised host cannot feed them
content — and keep their last good copy plus their bundled recipes when a fetch fails.

```
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEANTy/HTx1/8UfqSeTf7eiLDl3A4lRAokEmfAcAzMZvzg=
-----END PUBLIC KEY-----```

Key id `ad71f84deb77499a` (first 16 hex characters of the SHA-256 of the DER public key). A
rotation publishes the new key here first.

## Layout and versioning

- `recipes/*.json` — one recipe per file.
- `schema/plugin-recipe.v1.schema.json` — generated from the panel's own definition of the
  format; do not edit by hand.
- `scripts/build.mjs` — validation, index assembly, signing, the published site.
- `v1/` in the published site is the index format version. Entries carry `type` and
  `typeVersion`; adding entries or new types is never a breaking change, a changed payload
  shape bumps `typeVersion`, a changed index format gets a new path.

## License

MIT — see [LICENSE](LICENSE). The catalog is data; the panel that consumes it is licensed
separately.
