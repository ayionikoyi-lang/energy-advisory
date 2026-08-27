# Energy Advisory — Browser Edition

This edition is designed for a work PC with no administrator rights.

It is a single Cloudflare Worker:
- browser UI
- secure server-side Anthropic API call
- live Claude web search
- live advisory analysis
- no Node/Python installation on the work PC

## One-time deployment

1. Create/sign in to a Cloudflare account.
2. Open Workers & Pages.
3. Create a Worker.
4. Open the Worker code editor.
5. Replace the starter code with `worker.js` from this folder.
6. Save/deploy.
7. In the Worker Settings, add a Secret:
   Name: ANTHROPIC_API_KEY
   Value: your Anthropic API key
8. Deploy again.
9. Open the Worker URL in Edge/Chrome and bookmark it.

After that, the work PC only needs a browser.

## Security

The Anthropic key is stored as a Cloudflare Worker Secret, not in the browser code.
Do not paste your API key into the React page or share it with anyone.

## What it does

Tool 1:
- current European gas/power/carbon/LNG/renewables/PPA/grid/geopolitics intelligence
- current web research
- source links
- advisory analysis
- fundamental drivers
- risks to the view
- procurement signals
- confidence and time horizon

Tool 2:
- current EU and national energy/building/regulatory developments
- current web research
- advisory/compliance implications
- evidence links
Energy Advisory live research tool.
The UI uses current online information; it does not depend on a static market-news database.
