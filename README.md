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

## Test it on your phone right now

Your Mac and iPhone must be on the same Wi-Fi.

1. On the Mac, run: `./serve.sh`
2. On the iPhone, open **Safari** (not Chrome) and go to the address it prints,
   e.g. `http://10.64.187.94:8080`
3. Tap the **Share** button, then **Add to Home Screen**.

It now opens full-screen from your home screen with its own icon.

**One catch with this quick method:** the app is being served from your Mac, so it only
loads while your Mac is on and running `serve.sh`, on your home Wi-Fi. That's fine for
testing. For everyday use, see below.

## Making it work everywhere, for free

Put the files on any free static host — no Apple developer account, no $99.
Drag this folder onto [app.netlify.com/drop](https://app.netlify.com/drop), or push it to
a GitHub repo and turn on GitHub Pages. Either gives you an `https://…` address. Add
*that* to your home screen instead and the app works offline, anywhere, forever.

Hosting the files publicly does **not** expose your data — the host only ever sees the
same HTML and JavaScript everyone else gets. Your expenses stay in your phone.

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
