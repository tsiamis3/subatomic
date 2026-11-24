/* ΥποΑτομική Φυσική & Τεχνολογικές Εφαρμογές — εφαρμογή site.
 * Όλο το περιεχόμενο διαβάζεται από τα αρχεία του φακέλου content/ (Markdown).
 * Δεν χρειάζεται να αλλάξετε αυτό το αρχείο για να ενημερώσετε κείμενα.
 */
(function () {
  'use strict';

  const main = document.getElementById('main');
  const cache = {};
  let settings = {};

  /* ---------------- helpers ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/^﻿/, '');
  const MONTHS = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
  const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

  function parseDate(s) {
    const m = String(s || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || String(s || '').trim().match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (!m) return null;
    const [y, mo, d] = m[1].length === 4 ? [+m[1], +m[2], +m[3]] : [+m[3], +m[2], +m[1]];
    return new Date(y, mo - 1, d);
  }
  const fmtDate = (d) => (d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '');

  function hash(s) {
    let h = 5381;
    for (const ch of s) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0;
    return h.toString(36);
  }

  // Greek-aware, accent-insensitive normalisation for search
  const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ');

  async function load(name) {
    if (cache[name]) return cache[name];
    const res = await fetch(`content/${name}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Δεν βρέθηκε το αρχείο content/${name}`);
    cache[name] = stripComments(await res.text());
    return cache[name];
  }

  marked.setOptions({ gfm: true, breaks: false });
  function md(text) {
    const tpl = document.createElement('template');
    tpl.innerHTML = marked.parse(text || '');
    const root = tpl.content;
    root.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href');
      if (/^https?:/i.test(h) || /\.(pdf|docx?|xlsx?|pptx?|zip)$/i.test(h)) { a.target = '_blank'; a.rel = 'noopener'; }
      if (/\.pdf$/i.test(h)) a.classList.add('file-link');
    });
    root.querySelectorAll('img').forEach((img) => {
      img.loading = 'lazy';
      img.setAttribute('onerror', "this.closest('.img-link')?this.closest('.img-link').remove():this.remove()");
      if (!img.closest('a')) {
        const a = document.createElement('a');
        a.href = img.getAttribute('src'); a.target = '_blank'; a.rel = 'noopener'; a.className = 'img-link';
        a.title = 'Άνοιγμα εικόνας σε πλήρες μέγεθος';
        img.replaceWith(a); a.appendChild(img);
      }
    });
    root.querySelectorAll('table').forEach((t) => {
      const w = document.createElement('div'); w.className = 'table-wrap';
      t.replaceWith(w); w.appendChild(t);
    });
    const div = document.createElement('div');
    div.appendChild(root);
    return div.innerHTML;
  }

  // Splits "Κλειδί: τιμή" lines at the top of a block; returns {meta, body}
  function splitMeta(lines, keys) {
    const meta = {};
    let i = 0;
    for (; i < lines.length; i++) {
      const m = lines[i].match(/^\s*([^:]{2,30}):\s*(.*)$/);
      if (!m || !keys.includes(m[1].trim().toLowerCase())) break;
      meta[m[1].trim().toLowerCase()] = m[2].trim();
    }
    return { meta, body: lines.slice(i).join('\n').trim() };
  }

  // Split a markdown file into blocks starting at lines that begin with `marker`
  function splitBlocks(text, marker) {
    const re = new RegExp('^' + marker + '\\s+(.+)$', 'gm');
    const out = []; let m; let last = null; let intro = '';
    const idx = [];
    while ((m = re.exec(text))) idx.push({ start: m.index, end: re.lastIndex, title: m[1].trim() });
    intro = text.slice(0, idx.length ? idx[0].start : text.length).trim();
    idx.forEach((b, i) => {
      const body = text.slice(b.end, i + 1 < idx.length ? idx[i + 1].start : text.length);
      out.push({ title: b.title, raw: body.replace(/^\n/, '') });
    });
    return { intro, blocks: out };
  }

  /* ---------------- data parsers ---------------- */
  function parseSettings(text) {
    const s = { stats: [] };
    text.split('\n').forEach((line) => {
      const m = line.match(/^\s*([^:]+?):\s*(.+)$/);
      if (!m) return;
      const k = m[1].trim(); const v = m[2].trim();
      if (k === 'Αριθμός') { const [n, l] = v.split('|'); s.stats.push({ n: (n || '').trim(), l: (l || '').trim() }); }
      else s[k] = v;
    });
    return s;
  }

  async function getNews() {
    const { blocks } = splitBlocks(await load('news.md'), '#');
    return blocks.map((b) => {
      const { meta, body } = splitMeta(b.raw.split('\n'), ['ημερομηνία', 'καρφιτσωμένο', 'κατηγορία']);
      const date = parseDate(meta['ημερομηνία']);
      return {
        title: b.title, date, body,
        pinned: /^(ναι|nai|yes|true|1)$/i.test(meta['καρφιτσωμένο'] || ''),
        category: meta['κατηγορία'] || '',
        id: (date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : 'x') + '-' + hash(b.title),
      };
    }).sort((a, b) => (b.pinned - a.pinned) || ((b.date || 0) - (a.date || 0)));
  }

  function excerpt(body, n = 180) {
    const txt = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<(https?:[^>]+)>/g, '$1').replace(/[#*_>`|-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return txt.length > n ? txt.slice(0, n).replace(/\s\S*$/, '') + '…' : txt;
  }
  const firstImage = (body) => (body.match(/!\[[^\]]*\]\(([^)\s]+)/) || [])[1];
  const countImages = (body) => (body.match(/!\[[^\]]*\]\(/g) || []).length;

  /* ---------------- shared UI ---------------- */
  function pageHead(title, lead, kicker) {
    return `<section class="page-head"><div class="wrap">
      ${kicker ? `<p class="kicker">${kicker}</p>` : ''}
      <h1>${esc(title)}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}
    </div></section>`;
  }

  function newsCard(n) {
    const img = firstImage(n.body);
    const d = n.date;
    const ex = excerpt(n.body);
    const imgs = countImages(n.body);
    return `<a class="news-card${n.pinned ? ' is-pinned' : ''}" href="#/news/${n.id}">
      <div class="news-card__date" aria-hidden="true">${d ? `<span class="d">${d.getDate()}</span><span class="m">${MONTHS_SHORT[d.getMonth()]}</span><span class="y">${d.getFullYear()}</span>` : ''}</div>
      <div class="news-card__body">
        ${n.pinned ? '<span class="tag tag--pin">Καρφιτσωμένο</span>' : ''}${n.category ? `<span class="tag">${esc(n.category)}</span>` : ''}
        <h3>${esc(n.title)}</h3>
        ${ex ? `<p>${esc(ex)}</p>` : imgs ? `<p class="muted">${imgs > 1 ? imgs + ' εικόνες' : 'Εικόνα'} · πατήστε για προβολή</p>` : ''}
      </div>
      ${img ? `<div class="news-card__thumb"><img src="${esc(img)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></div>` : ''}
    </a>`;
  }

  /* ---------------- pages ---------------- */
  const pages = {
    async home() {
      const [home, news] = await Promise.all([load('home.md'), getNews()]);
      const count = parseInt(settings['Ανακοινώσεις στην αρχική'] || '3', 10);
      const stats = settings.stats || [];
      return `
      <section class="hero">
        <div class="hero__bg" style="background-image:url('${esc(settings['Εικόνα κεφαλίδας'] || 'assets/img/header.jpg')}')"></div>
        <div class="hero__glow"></div>
        <div class="wrap hero__inner">
          <p class="kicker kicker--light">${esc(settings['Υπότιτλος'] || '')}</p>
          <h1>${esc(settings['Τίτλος'] || '')}</h1>
          <p class="hero__en">${esc(settings['Αγγλικός τίτλος'] || '')}</p>
          <div class="hero__cta">
            <a class="btn btn--primary" href="#/curriculum">Πρόγραμμα Σπουδών</a>
            <a class="btn btn--ghost" href="#/news">Ανακοινώσεις</a>
          </div>
        </div>
      </section>
      ${stats.length ? `<section class="stats"><div class="wrap stats__grid">${stats.map((s) => `<div class="stat"><span class="stat__n">${esc(s.n)}</span><span class="stat__l">${esc(s.l)}</span></div>`).join('')}</div></section>` : ''}
      <section class="section">
        <div class="wrap">
          <div class="section__head"><h2>Τελευταίες ανακοινώσεις</h2><a class="more" href="#/news">Όλες οι ανακοινώσεις →</a></div>
          <div class="news-list">${news.slice(0, count).map(newsCard).join('') || '<p class="muted">Δεν υπάρχουν ανακοινώσεις.</p>'}</div>
        </div>
      </section>
      <section class="section section--alt">
        <div class="wrap prose prose--home">${md(home)}</div>
      </section>`;
    },

    async news(id) {
      const news = await getNews();
      if (id) {
        const i = news.findIndex((n) => n.id === id);
        const n = news[i];
        if (!n) return notFound('Η ανακοίνωση δεν βρέθηκε. Ίσως άλλαξε ο τίτλος ή η ημερομηνία της.');
        const prev = news[i + 1]; const next = news[i - 1];
        return `${pageHead(n.title, fmtDate(n.date), '<a href="#/news">← Ανακοινώσεις</a>')}
          <section class="section"><div class="wrap wrap--narrow">
            <article class="prose article">${md(n.body) || '<p class="muted">—</p>'}</article>
            <nav class="pager">
              ${prev ? `<a href="#/news/${prev.id}"><small>Παλαιότερη</small>${esc(prev.title)}</a>` : '<span></span>'}
              ${next ? `<a class="r" href="#/news/${next.id}"><small>Νεότερη</small>${esc(next.title)}</a>` : '<span></span>'}
            </nav>
          </div></section>`;
      }
      const years = [...new Set(news.map((n) => n.date && n.date.getFullYear()).filter(Boolean))].sort((a, b) => b - a);
      setTimeout(() => {
        const q = document.getElementById('newsSearch');
        const list = document.getElementById('newsList');
        let year = 'all';
        const render = () => {
          const f = fold(q.value.trim());
          const items = news.filter((n) => (year === 'all' || (n.date && n.date.getFullYear() === +year))
            && (!f || fold(n.title + ' ' + n.body).includes(f)));
          list.innerHTML = items.map(newsCard).join('') || '<p class="empty">Δεν βρέθηκαν ανακοινώσεις.</p>';
        };
        q.addEventListener('input', render);
        document.querySelectorAll('#yearChips button').forEach((b) => b.addEventListener('click', () => {
          document.querySelectorAll('#yearChips button').forEach((x) => x.classList.toggle('on', x === b));
          year = b.dataset.y; render();
        }));
        render();
      });
      return `${pageHead('Ανακοινώσεις', 'Νέα, ωρολόγια προγράμματα, εξεταστικές και προσκλήσεις του Π.Μ.Σ.')}
        <section class="section"><div class="wrap wrap--narrow">
          <div class="toolbar">
            <input id="newsSearch" class="search" type="search" placeholder="Αναζήτηση ανακοινώσεων…" aria-label="Αναζήτηση ανακοινώσεων">
            <div class="chips" id="yearChips"><button class="on" data-y="all">Όλα</button>${years.map((y) => `<button data-y="${y}">${y}</button>`).join('')}</div>
          </div>
          <div class="news-list" id="newsList"></div>
          <p class="note">Παλαιότερες ανακοινώσεις: <a href="http://subatomic.physics.auth.gr/" target="_blank" rel="noopener">αρχείο προηγούμενου ιστότοπου ↗</a></p>
        </div></section>`;
    },

    async curriculum() {
      const text = await load('curriculum.md');
      return `${pageHead('Πρόγραμμα Σπουδών', 'Κατανομή μαθημάτων και διπλωματικής εργασίας ανά εξάμηνο.')}
        <section class="section"><div class="wrap prose prose--wide">${md(text)}</div></section>`;
    },

    async courses() {
      const { intro, blocks } = splitBlocks(await load('courses.md'), '##');
      const SEM = { 'Α': 'Α', 'A': 'Α', 'Β': 'Β', 'B': 'Β', 'Γ': 'Γ', 'Δ': 'Δ' };
      const items = blocks.map((b) => {
        const m = b.title.match(/^([Α-ΩA-Z])(\d+)\)\s*(.*)$/);
        return { code: m ? SEM[m[1]] + m[2] : '', sem: m ? SEM[m[1]] || '' : '', name: m ? m[3] : b.title, body: b.raw };
      });
      setTimeout(() => {
        const q = document.getElementById('courseSearch');
        let sem = 'all';
        const apply = () => {
          const f = fold(q.value.trim()); let shown = 0;
          document.querySelectorAll('.course').forEach((el, i) => {
            const it = items[i];
            const ok = (sem === 'all' || it.sem === sem || (sem === 'other' && !it.sem)) && (!f || fold(it.code + ' ' + it.name + ' ' + it.body).includes(f));
            el.hidden = !ok; if (ok) shown++;
          });
          document.getElementById('courseEmpty').hidden = shown > 0;
        };
        q.addEventListener('input', apply);
        document.querySelectorAll('#semChips button').forEach((b) => b.addEventListener('click', () => {
          document.querySelectorAll('#semChips button').forEach((x) => x.classList.toggle('on', x === b));
          sem = b.dataset.s; apply();
        }));
        document.getElementById('expandAll').addEventListener('click', (e) => {
          const open = e.target.dataset.open !== '1';
          document.querySelectorAll('.course:not([hidden])').forEach((d) => { d.open = open; });
          e.target.dataset.open = open ? '1' : '0';
          e.target.textContent = open ? 'Σύμπτυξη όλων' : 'Ανάπτυξη όλων';
        });
      });
      const sems = [...new Set(items.map((i) => i.sem).filter(Boolean))];
      return `${pageHead('Μαθήματα', 'Αναλυτικό πρόγραμμα μαθημάτων: περιεχόμενο, φόρτος εργασίας και ECTS.')}
        <section class="section"><div class="wrap wrap--narrow">
          ${intro ? `<div class="prose intro">${md(intro)}</div>` : ''}
          <div class="toolbar">
            <input id="courseSearch" class="search" type="search" placeholder="Αναζήτηση μαθήματος ή θέματος…" aria-label="Αναζήτηση μαθημάτων">
            <div class="chips" id="semChips"><button class="on" data-s="all">Όλα</button>${sems.map((s) => `<button data-s="${s}">${s} Εξάμηνο</button>`).join('')}${items.some((i) => !i.sem) ? '<button data-s="other">Διπλωματική</button>' : ''}</div>
            <button class="linkbtn" id="expandAll">Ανάπτυξη όλων</button>
          </div>
          <div class="courses">
            ${items.map((it) => `<details class="course">
              <summary>${it.code ? `<span class="code code--${esc(it.sem)}">${esc(it.code)}</span>` : '<span class="code code--x">ΔΕ</span>'}<span class="course__name">${esc(it.name)}</span><span class="chev" aria-hidden="true"></span></summary>
              <div class="course__body prose">${md(it.body)}</div>
            </details>`).join('')}
          </div>
          <p class="empty" id="courseEmpty" hidden>Δεν βρέθηκαν μαθήματα.</p>
        </div></section>`;
    },

    async kanonismos() {
      const html = md(await load('kanonismos.md'));
      setTimeout(() => {
        const heads = [...document.querySelectorAll('.reg h2')];
        const toc = document.getElementById('toc');
        heads.forEach((h, i) => {
          h.id = 'sec-' + i;
          const b = document.createElement('button');
          const t = h.textContent.split('·');
          b.innerHTML = t.length > 1 ? `<b>${esc(t[0].trim())}</b>${esc(t.slice(1).join('·').trim())}` : esc(h.textContent);
          b.addEventListener('click', () => { h.scrollIntoView({ behavior: 'smooth', block: 'start' }); toc.classList.remove('open'); });
          toc.querySelector('.toc__list').appendChild(b);
        });
        document.getElementById('tocToggle').addEventListener('click', () => toc.classList.toggle('open'));
        const btns = toc.querySelectorAll('.toc__list button');
        const io = new IntersectionObserver((ents) => {
          ents.forEach((e) => { if (e.isIntersecting) { const i = heads.indexOf(e.target); btns.forEach((b, j) => b.classList.toggle('on', i === j)); } });
        }, { rootMargin: '-80px 0px -70% 0px' });
        heads.forEach((h) => io.observe(h));
        pageCleanup = () => io.disconnect();
      });
      return `${pageHead('Κανονισμός Μεταπτυχιακών Σπουδών', 'Κανονισμός του Π.Μ.Σ. «Υποατομική Φυσική και Τεχνολογικές Εφαρμογές» του Τμήματος Φυσικής, Σχολή Θετικών Επιστημών, Α.Π.Θ.')}
        <section class="section"><div class="wrap doc-layout">
          <aside class="toc" id="toc"><button class="toc__toggle" id="tocToggle">Περιεχόμενα</button><div class="toc__list"></div></aside>
          <article class="prose reg">${html}</article>
        </div></section>`;
    },

    async personnel() {
      const { intro, blocks } = splitBlocks(await load('personnel.md'), '#');
      const people = blocks.map((b) => {
        const { meta, body } = splitMeta(b.raw.split('\n'), ['ρόλος', 'email', 'τηλέφωνο', 'ιστοσελίδα', 'φωτογραφία']);
        return { name: b.title, ...meta, body };
      });
      const initials = (n) => n.replace(/^(Αν\.|Επ\.|Ομ\.)?\s*(Καθηγ\S*|Καθ\.)\s*/i, '').split(/\s+/).filter((w) => /^[Α-ΩA-Z]/.test(w)).map((w) => w[0]).slice(-2).join('');
      return `${pageHead('Προσωπικό', '')}
        <section class="section"><div class="wrap">
          ${intro ? `<div class="prose intro">${md(intro)}</div>` : ''}
          <div class="people">
            ${people.map((p) => `<article class="person">
              <div class="person__avatar">${p['φωτογραφία'] ? `<img src="${esc(p['φωτογραφία'])}" alt="">` : esc(initials(p.name))}</div>
              <div class="person__info">
                ${p['ρόλος'] ? `<p class="person__role">${esc(p['ρόλος'])}</p>` : ''}
                <h3>${esc(p.name)}</h3>
                <ul class="person__contact">
                  ${p.email ? `<li><a href="mailto:${esc(p.email)}">✉ ${esc(p.email)}</a></li>` : ''}
                  ${p['τηλέφωνο'] ? `<li><a href="tel:+30${esc(p['τηλέφωνο'].replace(/\D/g, ''))}">☎ ${esc(p['τηλέφωνο'])}</a></li>` : ''}
                  ${p['ιστοσελίδα'] ? `<li><a href="${esc(p['ιστοσελίδα'])}" target="_blank" rel="noopener">↗ Ιστοσελίδα</a></li>` : ''}
                </ul>
                ${p.body ? `<div class="prose small">${md(p.body)}</div>` : ''}
              </div>
            </article>`).join('')}
          </div>
        </div></section>`;
    },
  };

  function notFound(msg) {
    return `${pageHead('Η σελίδα δεν βρέθηκε', esc(msg || ''))}<section class="section"><div class="wrap"><a class="btn btn--primary" href="#/">Επιστροφή στην αρχική</a></div></section>`;
  }

  /* ---------------- router ---------------- */
  let pageCleanup = null;
  const TITLES = { home: '', news: 'Ανακοινώσεις', curriculum: 'Πρόγραμμα Σπουδών', courses: 'Μαθήματα', kanonismos: 'Κανονισμός', personnel: 'Προσωπικό' };

  async function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const name = parts[0] || 'home';
    if (pageCleanup) { pageCleanup(); pageCleanup = null; }
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
    closeMenu();
    let html;
    try {
      html = pages[name] ? await pages[name](parts[1] && decodeURIComponent(parts[1])) : notFound();
    } catch (err) {
      console.error(err);
      html = `${pageHead('Σφάλμα φόρτωσης', esc(err.message))}<section class="section"><div class="wrap"><p>Αν ανοίξατε το αρχείο απευθείας από τον υπολογιστή (file://), χρησιμοποιήστε το <code>προεπισκόπηση.bat</code> — δείτε το ΟΔΗΓΙΕΣ.md.</p></div></section>`;
    }
    main.innerHTML = `<div class="page">${html}</div>`;
    document.body.dataset.page = name;
    const t = settings['Τίτλος'] || 'ΥποΑτομική Φυσική';
    const sub = name === 'news' && parts[1] ? (main.querySelector('h1') || {}).textContent : TITLES[name];
    document.title = sub ? `${sub} · ${t}` : `${t} · Π.Μ.Σ. Τμήματος Φυσικής Α.Π.Θ.`;
    window.scrollTo(0, 0);
  }

  /* ---------------- chrome ---------------- */
  const menuBtn = document.getElementById('menuBtn');
  const nav = document.getElementById('nav');
  function closeMenu() { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', () => {
    const o = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(o));
  });
  window.addEventListener('scroll', () => document.getElementById('topbar').classList.toggle('scrolled', scrollY > 8), { passive: true });

  function applySettings() {
    document.querySelectorAll('[data-setting]').forEach((el) => { const v = settings[el.dataset.setting]; if (v) el.textContent = v; });
    document.querySelectorAll('[data-setting-href]').forEach((el) => { const v = settings[el.dataset.settingHref]; if (v) el.href = v; });
    document.querySelectorAll('[data-setting-mail]').forEach((el) => {
      const v = settings[el.dataset.settingMail];
      if (v) { el.href = 'mailto:' + v; el.textContent = '✉ ' + v; } else el.remove();
    });
  }

  (async function init() {
    try { settings = parseSettings(await load('settings.md')); } catch (e) { settings = { stats: [] }; }
    applySettings();
    window.addEventListener('hashchange', route);
    route();
  })();
})();
