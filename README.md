# Budget — a private, on-device budgeting app

A small web app you add to your iPhone home screen. It looks and opens like a normal
app, but it's just files. There is no account, no sign-in, and no server holding your
data — your expenses are saved in your phone's own browser storage and never sent
anywhere. There isn't a single line of networking code in it.

## Files

| File | What it is |
|---|---|
| `index.html` | The three screens: Spend, Budget, Summary |
| `styles.css` | All the styling (adapts to light/dark mode) |
| `app.js` | All the logic — categories, expenses, totals, backups |
| `manifest.webmanifest` | Tells iOS the name and icon to use on the home screen |
| `sw.js` | Caches the app so it opens with no connection |
| `icons/` | Home screen icons |
| `serve.sh` | Serves the folder to your phone over Wi-Fi, for testing |

## Getting it on your phone

The app lives at **https://tiffanyl9.github.io/**

On your iPhone, open that address in **Safari** (Chrome won't offer the install), tap the
**Share** button, then **Add to Home Screen**. It gets its own icon and opens full-screen
with no browser chrome, and works offline from then on.

## Publishing an update

From this folder:

    git add -A
    git commit -m "what changed"
    git push

GitHub Pages redeploys in a minute or so. On the phone, close the app fully (swipe it away
from the app switcher) and reopen it to pick up the new version.

## Testing on the Mac before you publish

    ./serve.sh

Then open http://localhost:8080 in a browser on this Mac.

## Is publishing it safe?

Yes. The repo is public, so anyone can read the HTML and JavaScript — but that's all there
is to read. There is no database and no server. Your expenses are written to your phone's
own local storage and never sent anywhere, so GitHub never sees them, and neither does
anyone else who visits the page. They just get a blank budgeting app of their own.

## About your data, and one real warning

Everything is stored in your browser's local storage on that one device.

- It does not sync between devices. That's the tradeoff for it never leaving the phone.
- **iOS can clear it.** Safari wipes stored data for sites you haven't opened in about
  7 days. Home-screen apps are usually spared, but "usually" is doing real work in that
  sentence. Use **Summary → Export backup** every so often; it saves a small `.json`
  file you can put in iCloud Drive, email yourself, or keep in Files. **Import backup**
  restores it.
- Deleting the app from your home screen, or clearing Safari data, erases it.

## Changing things

- **Currency**: change `CURRENCY` at the top of `app.js` (e.g. `'GBP'`, `'EUR'`).
- **Starting categories**: edit the `seed()` function in `app.js`. These only appear on
  a fresh install; once you've used the app, edit categories in the Budget tab instead.
- **Colors**: the `:root` block at the top of `styles.css`.

After editing, on your phone: close the app fully (swipe it away from the app switcher)
and reopen it, so it picks up the new files.
