/* Budget — a local-only PWA. No network calls anywhere in this file, by design. */
(() => {
  'use strict';

  const KEY = 'budget.v1';
  const CURRENCY = 'USD';           // change this one string to use another currency
  const LOCALE = undefined;         // undefined = follow the phone's locale

  const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
  const money0 = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
  const fmt = n => money.format(n);
  const fmtShort = n => (Math.abs(n % 1) < 0.005 ? money0 : money).format(n);
  const currencySign = (money.formatToParts(0).find(p => p.type === 'currency') || {}).value || '$';

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ── dates (all local, never UTC — avoids the "logged yesterday" bug) ──
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthOf = iso => iso.slice(0, 7);
  const today = () => isoOf(new Date());
  const monthName = key => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
  };
  const daysInMonth = key => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };
  const shiftMonth = (key, delta) => {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };

  // ── state ──
  const seed = () => ({
    version: 1,
    meta: { lastBackup: null },
    categories: [
      { id: uid(), name: 'Groceries',      budget: 400 },
      { id: uid(), name: 'Eating out',     budget: 150 },
      { id: uid(), name: 'Transport',      budget: 100 },
      { id: uid(), name: 'Fun',            budget: 120 },
      { id: uid(), name: 'Everything else', budget: 200 }
    ],
    expenses: []
  });

  let state = load();
  let month = monthOf(today());

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      const d = JSON.parse(raw);
      if (!d || !Array.isArray(d.categories) || !Array.isArray(d.expenses)) return seed();
      if (!d.meta) d.meta = { lastBackup: null };   // upgrade older saves
      return d;
    } catch (e) {
      console.warn('Could not read saved data, starting fresh.', e);
      return seed();
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save — storage may be full');
    }
  }

  // ── derived ──
  const catById = id => state.categories.find(c => c.id === id);
  const expensesIn = key => state.expenses.filter(e => monthOf(e.date) === key);
  const spentBy = (key, catId) =>
    expensesIn(key).reduce((s, e) => s + (e.categoryId === catId ? e.amount : 0), 0);
  const totalSpent = key => expensesIn(key).reduce((s, e) => s + e.amount, 0);
  const totalBudget = () => state.categories.reduce((s, c) => s + c.budget, 0);

  const level = ratio => (ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : '');

  // ── usage ranking ──
  // Things you use often, and recently, should come first. Every past use is worth a
  // point that decays by half every three weeks, so last month's habits outrank a
  // category you leaned on in the spring and haven't touched since.
  const HALF_LIFE_DAYS = 21;
  const recencyWeight = dateIso => {
    const days = Math.max(0, (Date.now() - new Date(dateIso + 'T00:00:00').getTime()) / 86400000);
    return Math.pow(0.5, days / HALF_LIFE_DAYS);
  };

  function categoriesByUse() {
    const score = new Map();
    for (const e of state.expenses)
      score.set(e.categoryId, (score.get(e.categoryId) || 0) + recencyWeight(e.date));
    // Categories you've never used keep their original order, below the ones you have.
    return state.categories
      .map((c, i) => ({ c, i, s: score.get(c.id) || 0 }))
      .sort((a, b) => (b.s - a.s) || (a.i - b.i))
      .map(x => x.c);
  }

  // Notes you've written before, ranked the same way, weighted heavily toward the
  // category currently selected — picking "Groceries" should suggest your shops.
  function noteSuggestions(query, categoryId, limit = 6) {
    const q = query.trim().toLowerCase();
    const seen = new Map();
    for (const e of state.expenses) {
      const note = (e.note || '').trim();
      if (!note) continue;
      const key = note.toLowerCase();
      if (q && !key.includes(q)) continue;
      let rec = seen.get(key);
      if (!rec) { rec = { note, score: 0, cats: new Map() }; seen.set(key, rec); }
      let w = recencyWeight(e.date);
      if (e.categoryId === categoryId) w *= 3;      // same category, far likelier
      if (q && key.startsWith(q)) w *= 1.5;         // a prefix match beats mid-word
      rec.score += w;
      rec.cats.set(e.categoryId, (rec.cats.get(e.categoryId) || 0) + 1);
    }
    return [...seen.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => {
        let top = null, n = -1;
        for (const [cid, count] of r.cats) if (count > n) { n = count; top = cid; }
        const cat = catById(top);
        return { note: r.note, cat: cat ? cat.name : '' };
      });
  }

  // ── search / tag filter ──
  const filter = { text: '', catId: null, allMonths: false };
  const filterActive = () => !!(filter.text.trim() || filter.catId);

  function filteredExpenses() {
    const q = filter.text.trim().toLowerCase();
    const base = (filterActive() && filter.allMonths) ? state.expenses : expensesIn(month);
    return base.filter(e => {
      if (filter.catId && e.categoryId !== filter.catId) return false;
      if (q) {
        const cat = catById(e.categoryId);
        const hay = ((e.note || '') + ' ' + (cat ? cat.name : '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function parseAmount(raw) {
    const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }

  // ── toast ──
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ── render ──
  function render() {
    $('monthLabel').textContent = monthName(month);
    renderCatOptions();
    renderTx();
    renderChips();
    renderBudget();
    renderSummary();
  }

  function renderCatOptions() {
    const sel = $('exCat');
    const keep = sel.value;
    sel.innerHTML = '';
    if (!state.categories.length) {
      sel.appendChild(el('option', null, 'Add a category first →'));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    for (const c of categoriesByUse()) {
      const o = el('option', null, c.name);
      o.value = c.id;
      sel.appendChild(o);
    }
    if (state.categories.some(c => c.id === keep)) sel.value = keep;
  }

  function renderTx() {
    const list = $('txList');
    list.innerHTML = '';
    const active = filterActive();
    const spanning = active && filter.allMonths;

    const rows = filteredExpenses().slice().sort((a, b) =>
      a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date));

    $('txHeading').textContent = !active ? 'This month'
      : spanning ? 'Matches, all months' : 'Matches this month';
    $('scopeRow').hidden = !active;
    $('txClear').hidden = !filter.text;

    const sum = rows.reduce((t, e) => t + e.amount, 0);
    $('txCount').textContent = rows.length ? `${rows.length} · ${fmt(sum)}` : '';

    if (!rows.length) {
      const li = el('li');
      li.style.cssText = 'display:block;background:none;border:0;box-shadow:none;padding:0';
      li.appendChild(el('div', 'empty', active
        ? (spanning ? 'Nothing matches that.' : 'Nothing matches this month — try All months.')
        : 'No expenses logged this month yet.'));
      list.appendChild(li);
      return;
    }

    for (const e of rows) {
      const li = el('li');
      const main = el('div', 'tx-main');
      const cat = catById(e.categoryId);
      main.appendChild(el('div', 'tx-note', e.note || (cat ? cat.name : 'Uncategorised')));
      const when = new Date(e.date + 'T00:00:00').toLocaleDateString(LOCALE,
        spanning ? { month: 'short', day: 'numeric', year: 'numeric' }
                 : { month: 'short', day: 'numeric' });
      main.appendChild(el('div', 'tx-meta', `${cat ? cat.name : 'Uncategorised'} · ${when}`));
      li.appendChild(main);
      li.appendChild(el('div', 'tx-amt', fmt(e.amount)));

      const del = el('button', 'tx-del', '×');
      del.setAttribute('aria-label', 'Delete expense');
      del.onclick = () => {
        state.expenses = state.expenses.filter(x => x.id !== e.id);
        save(); render(); toast('Expense deleted');
      };
      li.appendChild(del);
      list.appendChild(li);
    }
  }

  function renderChips() {
    const wrap = $('catChips');
    wrap.innerHTML = '';
    const pool = (filterActive() && filter.allMonths) ? state.expenses : expensesIn(month);
    const q = filter.text.trim().toLowerCase();

    const countFor = catId => pool.filter(e => {
      if (catId && e.categoryId !== catId) return false;
      if (q) {
        const cat = catById(e.categoryId);
        return ((e.note || '') + ' ' + (cat ? cat.name : '')).toLowerCase().includes(q);
      }
      return true;
    }).length;

    const chip = (label, catId, n) => {
      const b = el('button', 'chip' + (filter.catId === catId ? ' is-on' : ''));
      b.type = 'button';
      b.appendChild(document.createTextNode(label));
      if (n != null) b.appendChild(el('span', 'n', String(n)));
      b.onclick = () => {
        filter.catId = (filter.catId === catId) ? null : catId;   // tap again to clear
        renderTx(); renderChips();
      };
      wrap.appendChild(b);
    };

    chip('All', null, countFor(null));
    for (const c of categoriesByUse()) {
      const n = countFor(c.id);
      if (n === 0 && filter.catId !== c.id) continue;   // hide tags with nothing to show
      chip(c.name, c.id, n);
    }
  }

  function renderBudget() {
    const spent = totalSpent(month);
    const budget = totalBudget();
    const ratio = budget > 0 ? spent / budget : 0;

    $('totalSpent').textContent = fmt(spent);
    $('totalBudget').textContent = fmt(budget);
    const fill = $('totalFill');
    fill.style.width = Math.min(ratio, 1) * 100 + '%';
    fill.className = 'fill ' + level(ratio);

    const left = budget - spent;
    $('totalFoot').innerHTML = budget === 0
      ? 'Set a budget on a category to track progress.'
      : left >= 0
        ? `<b>${fmt(left)}</b> left · ${Math.round(ratio * 100)}% of budget used`
        : `<b style="color:var(--over)">${fmt(-left)} over</b> · ${Math.round(ratio * 100)}% of budget used`;

    const list = $('catList');
    list.innerHTML = '';
    if (!state.categories.length) {
      const li = el('li');
      li.style.cssText = 'background:none;border:0;box-shadow:none;padding:0';
      li.appendChild(el('div', 'empty', 'No categories yet — add one below.'));
      list.appendChild(li);
      return;
    }

    for (const c of state.categories) {
      const s = spentBy(month, c.id);
      const r = c.budget > 0 ? s / c.budget : 0;
      const li = el('li');

      const head = el('div', 'cathead');
      head.appendChild(el('div', 'catname', c.name));
      const fig = el('div', 'catfig');
      fig.innerHTML = `<b>${fmt(s)}</b> / ${fmt(c.budget)}`;
      head.appendChild(fig);
      li.appendChild(head);

      const bar = el('div', 'bar');
      const f = el('div', 'fill ' + level(r));
      f.style.width = Math.min(r, 1) * 100 + '%';
      bar.appendChild(f);
      li.appendChild(bar);

      const foot = el('div', 'catfoot');
      const rem = c.budget - s;
      foot.appendChild(el('span', null,
        rem >= 0 ? `${fmt(rem)} left` : `${fmt(-rem)} over`));

      const acts = el('div', 'acts');
      const edit = el('button', 'linkbtn', 'Edit');
      edit.onclick = () => editCategory(c);
      const del = el('button', 'linkbtn del', 'Delete');
      del.onclick = () => deleteCategory(c);
      acts.append(edit, del);
      foot.appendChild(acts);
      li.appendChild(foot);

      list.appendChild(li);
    }
  }

  // Name and budget together in one sheet — no more answering two questions in a row.
  let editing = null;

  function editCategory(c) {
    editing = c;
    $('edCurSign').textContent = currencySign;
    $('edName').value = c.name;
    $('edBudget').value = String(c.budget);
    $('catModal').hidden = false;
    setTimeout(() => { $('edName').focus(); $('edName').select(); }, 60);
  }

  function closeEditor() {
    $('catModal').hidden = true;
    editing = null;
  }

  function saveEditor() {
    if (!editing) return;
    const name = $('edName').value.trim();
    const budget = parseAmount($('edBudget').value);
    if (!name) return toast('Give the category a name');
    if (budget === null) return toast('Enter a budget above zero');
    if (state.categories.some(c => c !== editing && c.name.toLowerCase() === name.toLowerCase()))
      return toast('Another category already has that name');
    editing.name = name;
    editing.budget = budget;
    closeEditor();
    save(); render(); toast('Category updated');
  }

  function deleteCategory(c) {
    const n = state.expenses.filter(e => e.categoryId === c.id).length;
    const msg = n
      ? `Delete "${c.name}" and its ${n} expense${n > 1 ? 's' : ''} (all months)? This can't be undone.`
      : `Delete "${c.name}"?`;
    if (!confirm(msg)) return;
    state.categories = state.categories.filter(x => x.id !== c.id);
    state.expenses = state.expenses.filter(e => e.categoryId !== c.id);
    if (filter.catId === c.id) filter.catId = null;
    save(); render(); toast('Category deleted');
  }

  function renderSummary() {
    const body = $('summaryBody');
    body.innerHTML = '';

    const rows = expensesIn(month);
    const spent = totalSpent(month);
    const budget = totalBudget();
    const left = budget - spent;

    const grid = el('div', 'sumgrid');
    const stat = (k, v, cls) => {
      const s = el('div', 'stat');
      s.appendChild(el('div', 'k', k));
      s.appendChild(el('div', 'v' + (cls ? ' ' + cls : ''), v));
      return s;
    };
    grid.appendChild(stat('Spent', fmtShort(spent)));
    grid.appendChild(stat(left >= 0 ? 'Left to spend' : 'Over budget',
      fmtShort(Math.abs(left)), left >= 0 ? 'good' : 'over'));
    grid.appendChild(stat('Expenses logged', String(rows.length)));

    const dim = daysInMonth(month);
    const isCurrent = month === monthOf(today());
    const elapsed = isCurrent ? new Date().getDate() : dim;
    grid.appendChild(stat('Average / day', fmtShort(elapsed ? spent / elapsed : 0)));
    body.appendChild(grid);

    // pace — only meaningful for the month in progress
    if (isCurrent && budget > 0) {
      const paceCard = el('div', 'card');
      const throughMonth = elapsed / dim;
      const throughBudget = spent / budget;
      const onPaceFor = throughMonth > 0 ? spent / throughMonth : 0;
      const diff = onPaceFor - budget;
      paceCard.appendChild(el('h3', 'cardtitle', 'Pace'));
      const p = el('p', 'small');
      p.innerHTML =
        `Day ${elapsed} of ${dim} — you're ${Math.round(throughMonth * 100)}% through the month ` +
        `and have used ${Math.round(throughBudget * 100)}% of your budget.<br>` +
        `At this rate you'd finish the month at <b>${fmtShort(onPaceFor)}</b>, ` +
        (diff > 0
          ? `<b style="color:var(--over)">${fmtShort(diff)} over</b>.`
          : `<b style="color:var(--good)">${fmtShort(-diff)} under</b>.`);
      paceCard.appendChild(p);
      body.appendChild(paceCard);
    }

    // per-category breakdown
    const breakdown = el('div', 'card');
    breakdown.appendChild(el('h3', 'cardtitle', 'By category'));
    const withSpend = state.categories
      .map(c => ({ c, s: spentBy(month, c.id) }))
      .sort((a, b) => b.s - a.s);

    if (!withSpend.length || spent === 0) {
      breakdown.appendChild(el('p', 'muted small', 'Nothing spent this month.'));
    } else {
      for (const { c, s } of withSpend) {
        const r = c.budget > 0 ? s / c.budget : 0;
        const row = el('div', 'sumrow');
        row.appendChild(el('div', 'nm', c.name));
        const mb = el('div', 'minibar');
        const i = el('i', level(r));
        i.style.width = Math.min(r, 1) * 100 + '%';
        mb.appendChild(i);
        row.appendChild(mb);
        row.appendChild(el('div', 'pct', c.budget > 0 ? Math.round(r * 100) + '%' : '—'));
        row.appendChild(el('div', 'amt', fmt(s)));
        breakdown.appendChild(row);
      }
    }
    body.appendChild(breakdown);

    // biggest single expense
    if (rows.length) {
      const top = rows.reduce((a, b) => (b.amount > a.amount ? b : a));
      const c = catById(top.categoryId);
      const note = el('div', 'card');
      note.appendChild(el('h3', 'cardtitle', 'Biggest single expense'));
      note.appendChild(el('p', 'small',
        `${fmt(top.amount)} — ${top.note || (c ? c.name : 'Uncategorised')} on ` +
        new Date(top.date + 'T00:00:00').toLocaleDateString(LOCALE, { month: 'long', day: 'numeric' })));
      body.appendChild(note);
    }
  }

  // ── note autocomplete ──
  const suggestBox = $('noteSuggest');
  let suggestOpen = false;

  function hideSuggestions() {
    suggestBox.hidden = true;
    suggestBox.innerHTML = '';
    suggestOpen = false;
  }

  function showSuggestions() {
    const input = $('exNote');
    const items = noteSuggestions(input.value, $('exCat').value);
    // Nothing to offer, or the only match is exactly what's typed — stay out of the way.
    if (!items.length || (items.length === 1 && items[0].note.toLowerCase() === input.value.trim().toLowerCase()))
      return hideSuggestions();

    suggestBox.innerHTML = '';
    for (const it of items) {
      const li = el('li');
      li.appendChild(el('span', 's-txt', it.note));
      if (it.cat) li.appendChild(el('span', 's-cat', it.cat));
      // pointerdown, not click: it fires before the input loses focus, so the tap
      // isn't swallowed by the list closing on blur.
      li.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        input.value = it.note;
        hideSuggestions();
        $('exAmount').focus();
      });
      suggestBox.appendChild(li);
    }
    suggestBox.hidden = false;
    suggestOpen = true;
  }

  $('exNote').addEventListener('focus', showSuggestions);
  $('exNote').addEventListener('input', showSuggestions);
  $('exNote').addEventListener('blur', () => setTimeout(hideSuggestions, 120));
  $('exNote').addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && suggestOpen) { ev.preventDefault(); hideSuggestions(); }
  });
  $('exCat').addEventListener('change', () => { if (suggestOpen) showSuggestions(); });

  // ── search ──
  $('txSearch').addEventListener('input', ev => {
    filter.text = ev.target.value;
    renderTx(); renderChips();
  });
  $('txClear').onclick = () => {
    filter.text = '';
    $('txSearch').value = '';
    renderTx(); renderChips();
  };
  document.querySelectorAll('.scopebtn').forEach(b => {
    b.onclick = () => {
      filter.allMonths = b.dataset.scope === 'all';
      document.querySelectorAll('.scopebtn').forEach(x => x.classList.toggle('is-on', x === b));
      renderTx(); renderChips();
    };
  });

  // ── category editor ──
  $('edSave').onclick = saveEditor;
  $('edCancel').onclick = closeEditor;
  $('catModal').addEventListener('click', ev => { if (ev.target === $('catModal')) closeEditor(); });
  $('edBudget').addEventListener('keydown', ev => { if (ev.key === 'Enter') saveEditor(); });
  $('edName').addEventListener('keydown', ev => { if (ev.key === 'Enter') $('edBudget').focus(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !$('catModal').hidden) closeEditor();
  });

  // ── storage protection ──
  // iOS clears script-written storage for sites left unopened for ~7 days. Two things
  // push back on that: launching from the Home Screen (which iOS treats as an installed
  // app rather than a casual site visit), and the Storage API's persistence grant, where
  // supported. Neither is an absolute guarantee, so we also nag gently about backups.

  const isInstalled = () =>
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  async function refreshStorageStatus() {
    const dotI = $('dotInstall'), valI = $('valInstall');
    const dotP = $('dotPersist'), valP = $('valPersist');
    const note = $('persistNote'), btn = $('persistBtn');

    const installed = isInstalled();
    dotI.className = 'dot ' + (installed ? 'ok' : 'no');
    valI.textContent = installed ? 'Yes' : 'Not yet';

    const supported = !!(navigator.storage && navigator.storage.persist);
    let persisted = false;
    if (supported) {
      try { persisted = await navigator.storage.persisted(); } catch (e) { /* ignore */ }
    }

    if (!supported) {
      dotP.className = 'dot';
      valP.textContent = 'Not offered';
      btn.hidden = true;
    } else {
      dotP.className = 'dot ' + (persisted ? 'ok' : 'no');
      valP.textContent = persisted ? 'Yes' : 'Not granted';
      btn.hidden = persisted;
    }

    note.innerHTML = installed
      ? (persisted || !supported
          ? 'Running from your Home Screen, which is the setting that matters most here. Your data should stick around — but iOS makes no promise, so keep a backup.'
          : 'Running from your Home Screen, which is the main protection. Tapping below asks for an extra guarantee on top.')
      : "You're in a browser tab. Tap Share \u2192 <b>Add to Home Screen</b> and open it from there instead — iOS is far more willing to keep data for an installed app than for a tab.";

    // last backup
    const last = state.meta && state.meta.lastBackup;
    const bn = $('backupNote');
    if (!last) {
      bn.innerHTML = state.expenses.length
        ? "<b>You've never made a backup.</b> It saves one small file you can drop in iCloud Drive — the only way to be truly certain nothing is lost."
        : 'A backup saves one small file you can keep in iCloud Drive or Files, and restore from later.';
    } else {
      const days = Math.floor((Date.now() - new Date(last + 'T00:00:00').getTime()) / 86400000);
      const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
      bn.innerHTML = days >= 30
        ? `Last backup <b>${when}</b> — worth doing another.`
        : `Last backup ${when}.`;
    }
  }

  async function askForPersistence() {
    if (!(navigator.storage && navigator.storage.persist)) return;
    try {
      const granted = await navigator.storage.persist();
      toast(granted ? 'Protection granted' : 'iOS declined for now — keep backing up');
    } catch (e) {
      toast('Could not request protection');
    }
    refreshStorageStatus();
  }

  // Ask once, quietly, on the first real interaction — browsers are likelier to say yes
  // to an app the user is actively using than to one that just loaded.
  let askedOnce = false;
  function quietlyAsk() {
    if (askedOnce || !(navigator.storage && navigator.storage.persist)) return;
    askedOnce = true;
    navigator.storage.persisted()
      .then(ok => { if (!ok) return navigator.storage.persist(); })
      .then(() => refreshStorageStatus())
      .catch(() => {});
  }

  // ── events ──
  $('curSign').textContent = currencySign;
  $('exDate').value = today();

  $('expenseForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const amount = parseAmount($('exAmount').value);
    if (amount === null) return toast('Enter an amount above zero');
    const categoryId = $('exCat').value;
    if (!categoryId || !catById(categoryId)) return toast('Add a category first');
    const date = $('exDate').value || today();

    state.expenses.push({ id: uid(), categoryId, amount, date, note: $('exNote').value.trim() });
    save();
    $('exAmount').value = '';
    $('exNote').value = '';
    hideSuggestions();
    if (monthOf(date) !== month) month = monthOf(date);   // jump to the month you just logged into
    render();
    quietlyAsk();
    toast(`Added ${fmt(amount)}`);
  });

  $('catForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('catName').value.trim();
    const budget = parseAmount($('catBudget').value);
    if (!name) return toast('Give the category a name');
    if (budget === null) return toast('Enter a budget above zero');
    if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase()))
      return toast('You already have that category');
    state.categories.push({ id: uid(), name, budget });
    save();
    $('catName').value = ''; $('catBudget').value = '';
    render();
    toast(`Added ${name}`);
  });

  $('prevMonth').onclick = () => { month = shiftMonth(month, -1); render(); };
  $('nextMonth').onclick = () => { month = shiftMonth(month, 1); render(); };

  document.querySelectorAll('.tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b === btn));
      for (const v of ['spend', 'budget', 'summary'])
        $('view-' + v).hidden = v !== btn.dataset.view;
      if (btn.dataset.view === 'summary') refreshStorageStatus();
      window.scrollTo(0, 0);
    };
  });

  // ── backup / restore (stays on the device: share sheet or a normal file save) ──
  $('persistBtn').onclick = askForPersistence;

  function markBackedUp() {
    state.meta.lastBackup = today();
    save();
    refreshStorageStatus();
  }

  $('exportBtn').onclick = async () => {
    const json = JSON.stringify(state, null, 2);
    const name = `budget-backup-${today()}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); markBackedUp(); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    markBackedUp();
    toast('Backup saved');
  };

  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').addEventListener('change', async ev => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.categories) || !Array.isArray(d.expenses))
        return toast("That file isn't a budget backup");
      if (!confirm(`Replace everything with this backup? ${d.categories.length} categories, ${d.expenses.length} expenses.`)) return;
      if (!d.meta) d.meta = { lastBackup: null };
      state = d; save(); render(); refreshStorageStatus(); toast('Backup restored');
    } catch (e) {
      toast("Couldn't read that file");
    }
  });

  $('wipeBtn').onclick = () => {
    if (!confirm('Erase every category and expense? This cannot be undone.')) return;
    if (!confirm('Really erase everything?')) return;
    state = seed(); save(); render(); toast('Erased');
  };

  render();
  refreshStorageStatus();

  // Offline cache. Needs https:// or localhost — over plain http on your LAN it is
  // skipped and the app simply runs online-only. Everything else still works.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW skipped', e));
    });
  }
})();
