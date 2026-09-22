# Contributing

Recipes are the whole content of this repository, so a contribution is one JSON file.

1. Copy an existing recipe in `recipes/` and name yours after its `id`.
2. Run `npm ci && npm run check`.
3. Try it on a real site through a panel (put the file in the panel's bundled catalog
   directory, restart, enter the key, press **Activate**, read the job log) and say so in the
   pull request — which plugin version, which vendor CLI or function the recipe relies on.
4. Never include a license key, a site URL of a customer, or a vendor's private endpoint
   details that are not already in the plugin itself.

Keep steps declarative: wp-cli arguments or a short PHP snippet that calls the plugin's own
activation function. If a plugin only offers a button in wp-admin, look for the function
behind it — it almost always exists — rather than scripting a browser.

The recipe format is defined in the WP Offgrid panel and exported here as JSON Schema
(`schema/`). A change to the format lands there first and is regenerated here.
