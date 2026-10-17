/* =========================================================
   408 · 应用层：渲染 / 交互 / 进度
   ========================================================= */

(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const subj = (id) => SUBJECTS.find((s) => s.id === id);
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const isTouch = () => window.matchMedia('(hover: none)').matches;

  /* ==================== 掌握度存储 ==================== */
  const KEY = 'wb408.mastery.v1';
  let mastered = new Set();
  try { mastered = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { mastered = new Set(); }
  const saveMastery = () => { try { localStorage.setItem(KEY, JSON.stringify([...mastered])); } catch (e) {} };

  function allPointIds() {
    const out = [];
    ATLAS.forEach((s) => s.chapters.forEach((c, ci) => c.points.forEach((p, pi) => out.push(`${s.id}:${ci}:${pi}`))));
    return out;
  }
  const ALL_POINTS = allPointIds();
  const pid = (sid, ci, pi) => `${sid}:${ci}:${pi}`;

  function subjProgress(sid) {
    const list = ALL_POINTS.filter((p) => p.startsWith(sid + ':'));
    const done = list.filter((p) => mastered.has(p)).length;
    return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
  }

  function paintProgress() {
    const total = ALL_POINTS.length;
    const done = ALL_POINTS.filter((p) => mastered.has(p)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    const ring = $('#globalRing');
    if (ring) {
      const len = 2 * Math.PI * 8;
      ring.setAttribute('stroke-dasharray', `${(pct / 100) * len} ${len}`);
    }
    const lbl = $('#globalPct');
    if (lbl) lbl.textContent = pct + '%';
    const tip = $('#progressPill');
    if (tip) tip.title = `已掌握 ${done} / ${total} 个考点`;

    SUBJECTS.forEach((s) => {
      const p = subjProgress(s.id);
      const bar = $(`[data-pbar="${s.id}"]`);
      if (bar) bar.style.width = p.pct + '%';
      const lab = $(`[data-ppct="${s.id}"]`);
      if (lab) lab.textContent = p.pct + '%';
    });

    paintAtlasProgress();
    paintChapterNav();
  }

  function paintAtlasProgress() {
    const p = subjProgress(curSub);
    const box = $('#atlasProgress');
    if (box) {
      box.innerHTML = `
        <span class="ap-text">已掌握 <b>${p.done}</b> / ${p.total}</span>
        <span class="ap-bar"><i style="width:${p.pct}%"></i></span>
        <span class="ap-pct">${p.pct}%</span>`;
    }
  }

  function paintChapterNav() {
    const data = ATLAS.find((a) => a.id === curSub);
    if (!data) return;
    data.chapters.forEach((c, ci) => {
      const d = c.points.filter((p, pi) => mastered.has(pid(curSub, ci, pi))).length;
      const el = $(`.cn-item[data-ch="${ci}"] .cn-prog`);
      if (el) el.textContent = `${d}/${c.points.length}`;
    });
  }

  /* ==================== 主题 ==================== */
  function initTheme() {
    let t = 'light';
    try { t = localStorage.getItem('wb408.theme') || 'light'; } catch (e) {}
    document.documentElement.dataset.theme = t;
    updateThemeIcon();
  }
  function updateThemeIcon() {
    const b = $('#themeToggle');
    if (!b) return;
    b.innerHTML = isDark()
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" stroke-linejoin="round"/></svg>';
    b.setAttribute('aria-label', isDark() ? '切换到浅色' : '切换到深色');
  }
  function toggleTheme() {
    document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('wb408.theme', document.documentElement.dataset.theme); } catch (e) {}
    updateThemeIcon();
    if (window.Galaxy) window.Galaxy.refresh();
    const active = $('.lab-tab.on');
    if (active) mountLab(active.dataset.tab);
  }

  /* ==================== 首页四科卡 ==================== */
  function renderSubjects() {
    const box = $('#subjectStrip');
    box.innerHTML = SUBJECTS.map((s) => `
      <article class="subj-card" style="--c:var(${s.var})" data-jump="${s.id}" role="button" tabindex="0">
        <div class="sc-top">
          <div>
            <div class="sc-name">${s.name}</div>
            <div class="sc-en">${s.en}</div>
          </div>
          <span class="sc-score">${s.score} 分</span>
        </div>
        <div class="sc-bar"><i data-pbar="${s.id}"></i></div>
        <div class="sc-meta"><span>${s.chapters} 章 · ${s.note}</span><span data-ppct="${s.id}">0%</span></div>
      </article>`).join('');

    $$('[data-jump]').forEach((el) => {
      const go = () => {
        document.getElementById('atlas').scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => switchSubject(el.dataset.jump), 380);
      };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  /* ==================== 知识星云 ==================== */
  let spinOn = true;

  function renderGalaxyFilters() {
    const box = $('#gFilters');
    if (!box) return;
    box.innerHTML = `<button class="gchip on" data-f="all">全景</button>` +
      SUBJECTS.map((s) => `<button class="gchip" data-f="${s.id}" style="--c:var(${s.var})"><i></i>${s.name}</button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.gchip');
      if (!b) return;
      const all = b.dataset.f === 'all';
      window.Galaxy.focus(all ? null : b.dataset.f);
      if (all) { spinOn = true; }
      else { spinOn = false; }
      window.Galaxy.setAuto(spinOn);
      $('#gSpin').classList.toggle('on', spinOn);
    });
  }

  function renderGalaxyLegend() {
    const box = $('#gLegend');
    if (!box) return;
    box.innerHTML = SUBJECTS.map((s) => `<span><i style="background:var(${s.var})"></i>${s.name}</span>`).join('')
      + `<span class="g-lg-link"><i class="g-dash"></i>跨科关联</span>`;
  }

  /* 聚焦某个学科时，出现该科章节条 —— 把「空间导航」变成「列表导航」 */
  function renderChapterStrip(sid) {
    const box = $('#gChapters');
    if (!box) return;
    if (!sid) {
      box.classList.remove('on');
      box.innerHTML = '';
      return;
    }
    const data = ATLAS.find((a) => a.id === sid);
    const s = subj(sid);
    box.style.setProperty('--c', `var(${s.var})`);
    box.innerHTML = `<span class="gc-label">${s.name} · ${data.chapters.length} 章</span>` +
      data.chapters.map((c, ci) =>
        `<button class="gc-item" data-c="${ci}"><span class="gc-num">${String(ci + 1).padStart(2, '0')}</span>${c.title}</button>`
      ).join('') +
      `<button class="gc-detail" data-subject="${sid}">学科详情 →</button>`;
    box.classList.add('on');

    box.onclick = (e) => {
      const ch = e.target.closest('.gc-item');
      if (ch) {
        window.Galaxy.locate(`C:${sid}:${+ch.dataset.c}`);
        $$('.gc-item', box).forEach((x) => x.classList.toggle('on', x === ch));
        return;
      }
      const det = e.target.closest('.gc-detail');
      if (det) window.Pages.open('subject', det.dataset.subject);
    };
  }

  function renderHud(sid) {
    const hud = $('#gHud');
    if (!hud) return;
    if (!sid) {
      hud.classList.remove('on');
      hud.innerHTML = '';
      return;
    }
    const s = subj(sid);
    const data = ATLAS.find((a) => a.id === sid);
    const total = data.chapters.reduce((n, c) => n + c.points.length, 0);
    hud.style.setProperty('--c', `var(${s.var})`);
    hud.innerHTML = `
      <div class="hud-kicker">FOCUSED</div>
      <div class="hud-name">${s.name}</div>
      <div class="hud-meta">${data.chapters.length} 章 · ${total} 个考点 · ${s.score} 分</div>
      <button class="hud-back" id="gBack">← 返回全景</button>`;
    hud.classList.add('on');
    $('#gBack').onclick = () => window.Galaxy.reset();
  }

  function syncFocusUI(sid) {
    $$('.gchip').forEach((x) => x.classList.toggle('on', (x.dataset.f === 'all' && !sid) || x.dataset.f === sid));
    renderChapterStrip(sid);
    renderHud(sid);
    if (!sid) {
      spinOn = true;
      const sp = $('#gSpin');
      if (sp) sp.classList.add('on');
      window.Galaxy.setAuto(true);
    }
  }

  function renderLinkIndex() {
    const box = $('#linkIndex');
    if (!box) return;
    box.innerHTML = STAR.links.map((l) => {
      const sa = subj(l.a.s), sb = subj(l.b.s);
      return `<button class="li-item" data-link="${l.id}">
        <span class="li-dots"><i style="background:var(${sa.var})"></i><i style="background:var(${sb.var})"></i></span>
        <span class="li-t">${l.title}</span>
        <span class="li-arrow">→</span>
      </button>`;
    }).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.li-item');
      if (b) window.Pages.open('link', b.dataset.link);
    });
  }

  /* ---------- 搜索 ---------- */
  let searchIndex = [];
  function buildSearchIndex() {
    searchIndex = [];
    ATLAS.forEach((a) => a.chapters.forEach((c, ci) => {
      searchIndex.push({ kind: 'chapter', s: a.id, ci, label: c.title, sub: `${subj(a.id).name} · 第 ${ci + 1} 章`, key: c.title });
      c.points.forEach((p, pi) => {
        searchIndex.push({
          kind: 'point', s: a.id, ci, pi, label: p.t,
          sub: `${subj(a.id).name} · ${c.title}`,
          key: p.t + ' ' + (p.lines || []).join(' ')
        });
      });
    }));
  }

  function initSearch() {
    const input = $('#gSearch');
    const box = $('#gResults');
    if (!input || !box) return;

    const close = () => { box.hidden = true; box.innerHTML = ''; };

    function render(q) {
      q = q.trim();
      if (!q) return close();
      const low = q.toLowerCase();
      const hits = searchIndex
        .map((it) => {
          const inLabel = it.label.toLowerCase().indexOf(low);
          const inKey = it.key.toLowerCase().indexOf(low);
          if (inLabel < 0 && inKey < 0) return null;
          return { it, score: (inLabel === 0 ? 0 : inLabel > 0 ? 1 : 2) + (it.kind === 'point' ? 0.4 : 0) };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)
        .slice(0, 8)
        .map((x) => x.it);

      if (!hits.length) {
        box.hidden = false;
        box.innerHTML = `<div class="gr-empty">没有匹配「${q}」的考点</div>`;
        return;
      }

      box.hidden = false;
      box.innerHTML = hits.map((h, i) => `
        <button class="gr-item" data-i="${i}" style="--c:var(--${h.s})">
          <span class="gr-dot"></span>
          <span class="gr-main"><b>${h.label}</b><i>${h.sub}</i></span>
          <span class="gr-kind">${h.kind === 'point' ? '考点' : '章节'}</span>
        </button>`).join('');

      $$('.gr-item', box).forEach((b) => {
        const h = hits[+b.dataset.i];
        b.addEventListener('click', () => {
          close();
          input.value = '';
          input.blur();
          const nodeId = h.kind === 'point' ? `P:${h.s}:${h.ci}:${h.pi}` : `C:${h.s}:${h.ci}`;
          window.Galaxy.locate(nodeId);
          if (h.kind === 'point') window.Pages.open('point', h.s, h.ci, h.pi);
          else window.Pages.open('chapter', h.s, h.ci);
        });
      });
    }

    input.addEventListener('input', () => render(input.value));
    input.addEventListener('focus', () => { if (input.value.trim()) render(input.value); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
      if (e.key === 'Enter') { const first = $('.gr-item', box); if (first) first.click(); }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.g-search')) close();
    });
  }

  function initGalaxy() {
    renderGalaxyFilters();
    renderGalaxyLegend();
    renderLinkIndex();
    buildSearchIndex();

    window.Galaxy.init({
      onNode(n) {
        if (n.kind === 'subject') {
          window.Galaxy.focus(n.s);
        } else if (n.kind === 'chapter') {
          window.Pages.open('chapter', n.s, n.ci);
        } else {
          window.Pages.open('point', n.s, n.ci, n.pi);
        }
      },
      onFocus(sid) { syncFocusUI(sid); }
    });

    const st = window.Galaxy.stats();
    const stats = $('#gStats');
    if (stats) stats.textContent = `${st.points} 个考点 · ${st.chapters} 章 · ${st.links} 条跨科关联`;

    const tip = $('#gTip');
    if (tip) tip.textContent = isTouch() ? '单指旋转 · 双指缩放 · 点学科展开' : '拖拽旋转 · 滚轮缩放 · 双击学科聚焦';

    const spin = $('#gSpin');
    if (spin) spin.addEventListener('click', () => {
      spinOn = !spinOn;
      spin.classList.toggle('on', spinOn);
      window.Galaxy.setAuto(spinOn);
    });

    const reset = $('#gReset');
    if (reset) reset.addEventListener('click', () => window.Galaxy.reset());

    const zin = $('#gZoomIn');
    const zout = $('#gZoomOut');
    if (zin) zin.addEventListener('click', () => window.Galaxy.zoom(0.18));
    if (zout) zout.addEventListener('click', () => window.Galaxy.zoom(-0.18));

    initSearch();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && window.Galaxy.isFocused() && !document.body.classList.contains('pd-open')) {
        window.Galaxy.reset();
      }
    });
  }

  /* 跳转到实验室并可选预设场景 */
  function openLab(id, scen) {
    const sec = document.getElementById('labs');
    if (sec) sec.scrollIntoView({ behavior: 'smooth' });
    const tab = document.querySelector(`.lab-tab[data-tab="${id}"]`);
    if (tab) {
      $$('.lab-tab').forEach((x) => x.classList.toggle('on', x === tab));
      mountLab(id);
    }
    if (scen) {
      setTimeout(() => {
        const b = document.querySelector(`#labStage [data-s="${scen}"], #labStage [data-m="${scen}"], #labStage [data-a="${scen}"]`);
        if (b) b.click();
      }, 620);
    }
  }

  /* ==================== 学科图谱 ==================== */
  let curSub = 'ds', curCh = 0, curFilter = 'all';

  function renderTabs() {
    const box = $('#atlasTabs');
    box.innerHTML = SUBJECTS.map((s) => `
      <button class="tab ${s.id === 'ds' ? 'on' : ''}" data-s="${s.id}" style="--c:var(${s.var})">
        <i></i>${s.name}<span class="tab-score">${s.score}分</span>
      </button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.tab'); if (!b) return;
      switchSubject(b.dataset.s);
    });
  }

  function switchSubject(id) {
    curSub = id; curCh = 0;
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.s === id));
    renderAtlas();
    paintProgress();
  }

  function renderAtlas() {
    const s = subj(curSub);
    const data = ATLAS.find((a) => a.id === curSub);

    $('#chapterNav').innerHTML = `<div class="cn-title">CHAPTERS · ${s.chapters} 章</div>` +
      data.chapters.map((c, i) => `
        <button class="cn-item ${i === curCh ? 'on' : ''}" data-ch="${i}" style="--c:var(${s.var})">
          <span class="num">${String(i + 1).padStart(2, '0')}</span>
          <span class="cn-name">${c.title}</span>
          <span class="cn-prog"></span>
        </button>`).join('');

    $$('.cn-item').forEach((b) => b.addEventListener('click', () => goChapter(+b.dataset.ch)));

    // 移动端：下拉选择代替被截断的横向列表
    const sw = $('#chSwitch');
    if (sw) {
      sw.innerHTML = `<label class="cs-wrap">
        <span>章节</span>
        <select id="chSelect" aria-label="选择章节">
          ${data.chapters.map((c, i) => `<option value="${i}" ${i === curCh ? 'selected' : ''}>${String(i + 1).padStart(2, '0')} ${c.title}</option>`).join('')}
        </select>
      </label>`;
      const sel = $('#chSelect');
      if (sel) sel.addEventListener('change', () => goChapter(+sel.value));
    }

    renderChapter();
    paintChapterNav();
  }

  function goChapter(i) {
    const data = ATLAS.find((a) => a.id === curSub);
    if (i < 0 || i >= data.chapters.length) return;
    curCh = i;
    $$('.cn-item').forEach((x) => x.classList.toggle('on', +x.dataset.ch === i));
    const sel = $('#chSelect');
    if (sel && +sel.value !== i) sel.value = String(i);
    renderChapter();
  }

  function renderChapter() {
    const s = subj(curSub);
    const data = ATLAS.find((a) => a.id === curSub);
    const ch = data.chapters[curCh];
    const all = ch.points.map((p, pi) => ({ p, pi }));
    const hotCount = ch.points.filter((p) => p.tag === 'hot').length;
    const doneCount = ch.points.filter((p, pi) => mastered.has(pid(curSub, curCh, pi))).length;

    const shown = all.filter(({ p, pi }) => {
      if (curFilter === 'todo') return !mastered.has(pid(curSub, curCh, pi));
      if (curFilter === 'hot') return p.tag === 'hot';
      return true;
    });

    $('#chapterContent').innerHTML = `
      <div class="chapter-head" style="--c:var(${s.var})">
        <div class="ch-kicker">${s.name} · 第 ${curCh + 1} 章</div>
        <h3>${ch.title}</h3>
        <div class="ch-desc">${ch.desc}</div>
        <div class="ch-stats">
          <span class="chs"><b>${ch.points.length}</b> 考点</span>
          <span class="chs"><b>${hotCount}</b> 高频</span>
          <span class="chs done"><b>${doneCount}</b> / ${ch.points.length} 已掌握</span>
          <span class="chs-bar"><i style="width:${ch.points.length ? Math.round(doneCount / ch.points.length * 100) : 0}%"></i></span>
        </div>
      </div>
      ${shown.length ? `<div class="point-grid">
        ${shown.map(({ p, pi }) => {
          const id = pid(curSub, curCh, pi);
          const done = mastered.has(id);
          return `<article class="point ${done ? 'is-done' : ''}" style="--c:var(${s.var})">
            <div class="point-top">
              <h4>${p.t}</h4>
              <div class="point-tags">${p.tag ? `<span class="ptag ${p.tag}">${tagName(p.tag)}</span>` : ''}</div>
            </div>
            <ul>${p.lines.map((l) => `<li>${l}</li>`).join('')}</ul>
            <div class="point-foot">
              <div class="cross-chips">
                ${(p.cross || []).map((cid) => {
                  const L = STAR.links.find((x) => x.id === cid);
                  if (!L) return '';
                  const other = L.a.s === curSub ? L.b.s : L.a.s;
                  return `<button class="cross-chip" data-link="${cid}" title="${L.title}" style="--cc:var(${subj(other).var})"><i></i>${shortName(L.title)}</button>`;
                }).join('')}
              </div>
              <button class="master-btn ${done ? 'done' : ''}" data-pid="${id}" title="标记为已掌握">
                <span class="box"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6.2 4.6 9 10 3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                ${done ? '已掌握' : '标记'}
              </button>
            </div>
          </article>`;
        }).join('')}
      </div>` : `<div class="point-empty">这一章${curFilter === 'todo' ? '的考点都已掌握' : '没有匹配的考点'}。
        ${curFilter !== 'all' ? '<button class="pe-reset" data-reset-filter>查看全部考点</button>' : ''}</div>`}`;

    $$('#chapterContent [data-link]').forEach((b) => b.addEventListener('click', () => {
      window.Pages.open('link', b.dataset.link);
    }));

    $$('#chapterContent [data-pid]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.pid;
      if (mastered.has(id)) mastered.delete(id); else mastered.add(id);
      saveMastery();
      b.classList.toggle('done', mastered.has(id));
      const card = b.closest('.point');
      if (card) card.classList.toggle('is-done', mastered.has(id));
      b.innerHTML = b.classList.contains('done')
        ? '<span class="box"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6.2 4.6 9 10 3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>已掌握'
        : '<span class="box"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6.2 4.6 9 10 3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>标记';
      renderChapterStatsOnly();
      paintProgress();
    }));

    const rf = $('#chapterContent [data-reset-filter]');
    if (rf) rf.addEventListener('click', () => setAtlasFilter('all'));

    // 上一章 / 下一章
    const pager = $('#chPager');
    if (pager) {
      pager.innerHTML = `
        <button class="pg-btn" data-ch-prev ${curCh === 0 ? 'disabled' : ''}>← 上一章</button>
        <span class="pg-mid">${curCh + 1} / ${data.chapters.length}</span>
        <button class="pg-btn" data-ch-next ${curCh === data.chapters.length - 1 ? 'disabled' : ''}>下一章 →</button>`;
      const prev = $('[data-ch-prev]', pager), next = $('[data-ch-next]', pager);
      if (prev) prev.onclick = () => { goChapter(curCh - 1); scrollToChapterTop(); };
      if (next) next.onclick = () => { goChapter(curCh + 1); scrollToChapterTop(); };
    }

    // 卡片淡入
    $$('#chapterContent .point').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity .45s cubic-bezier(.22,1,.36,1), transform .45s cubic-bezier(.22,1,.36,1)';
        el.style.transitionDelay = Math.min(i * 40, 320) + 'ms';
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    });
  }

  function renderChapterStatsOnly() {
    const data = ATLAS.find((a) => a.id === curSub);
    const ch = data.chapters[curCh];
    const done = ch.points.filter((p, pi) => mastered.has(pid(curSub, curCh, pi))).length;
    const box = $('#chapterContent .ch-stats');
    if (!box) return;
    const doneEl = $('.chs.done b', box);
    if (doneEl) doneEl.textContent = done;
    const bar = $('.chs-bar i', box);
    if (bar) bar.style.width = (ch.points.length ? Math.round(done / ch.points.length * 100) : 0) + '%';
  }

  function scrollToChapterTop() {
    const el = $('#atlas');
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 78;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  function setAtlasFilter(f) {
    curFilter = f;
    $$('.afilter').forEach((b) => b.classList.toggle('on', b.dataset.f === f));
    renderChapter();
  }

  function initAtlasFilters() {
    const box = $('#atlasFilters');
    if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.afilter');
      if (b) setAtlasFilter(b.dataset.f);
    });
  }

  const tagName = (t) => ({ hot: '高频', err: '易错', calc: '计算' }[t] || t);
  const shortName = (t) => (t.length > 9 ? t.slice(0, 9) + '…' : t);

  /* ==================== 实验室 ==================== */
  let labCleanup = null;

  function renderLabTabs() {
    const box = $('#labTabs');
    box.innerHTML = LABS.map((l, i) => `
      <button class="lab-tab ${i === 0 ? 'on' : ''}" data-tab="${l.id}">
        <span class="lt-num">${l.num}</span>${l.name}
      </button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.lab-tab'); if (!b) return;
      $$('.lab-tab').forEach((x) => x.classList.toggle('on', x === b));
      mountLab(b.dataset.tab);
      b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
  }

  function mountLab(id) {
    if (labCleanup) { try { labCleanup(); } catch (e) {} labCleanup = null; }
    const old = $('#labStage');
    if (!old) return;
    const stage = old.cloneNode(false);
    stage.classList.add('in');
    old.replaceWith(stage);
    const fn = window.Labs[id];
    if (!fn) return;
    labCleanup = fn(stage) || null;
  }

  /* ==================== 首页画布 ==================== */
  let heroRAF = null, heroDots = [];

  function initHeroCanvas() {
    const cvs = $('#heroCanvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let mx = -999, my = -999;

    function resize() {
      const r = cvs.getBoundingClientRect();
      w = r.width; h = r.height;
      cvs.width = w * dpr; cvs.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(64, Math.round((w * h) / 26000));
      heroDots = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .24, vy: (Math.random() - .5) * .24,
        r: Math.random() * 1.7 + .6,
        c: Math.random()
      }));
    }

    function loop() {
      const dark = isDark();
      const base = dark ? '237,234,224' : '27,30,25';
      const accents = dark
        ? ['98,182,156', '217,146,87', '154,147,230', '107,175,214']
        : ['46,125,107', '176,96,42', '90,85,168', '43,110,158'];

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < heroDots.length; i++) {
        const d = heroDots[i];
        d.x += d.vx; d.y += d.vy;
        if (d.x < -20) d.x = w + 20; if (d.x > w + 20) d.x = -20;
        if (d.y < -20) d.y = h + 20; if (d.y > h + 20) d.y = -20;

        const dx = d.x - mx, dy = d.y - my;
        const near = Math.sqrt(dx * dx + dy * dy) < 170;

        ctx.beginPath();
        ctx.arc(d.x, d.y, near ? d.r * 1.7 : d.r, 0, Math.PI * 2);
        const acc = accents[Math.floor(d.c * 4) % 4];
        ctx.fillStyle = `rgba(${near ? acc : base},${near ? .62 : .27})`;
        ctx.fill();

        for (let j = i + 1; j < heroDots.length; j++) {
          const o = heroDots[j];
          const dd = Math.hypot(d.x - o.x, d.y - o.y);
          if (dd < 118) {
            ctx.beginPath();
            ctx.moveTo(d.x, d.y); ctx.lineTo(o.x, o.y);
            ctx.strokeStyle = `rgba(${base},${(1 - dd / 118) * (near ? .2 : .1)})`;
            ctx.lineWidth = .7;
            ctx.stroke();
          }
        }
      }
      heroRAF = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
    window.addEventListener('mouseout', () => { mx = -999; my = -999; });
    if (heroRAF) cancelAnimationFrame(heroRAF);
    loop();
  }

  /* ==================== 导航 & 滚动 ==================== */
  function initNav() {
    const nav = $('.nav');
    const links = $$('.nav-links a');
    const secs = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);

    const onScroll = () => {
      nav.classList.toggle('stuck', window.scrollY > 12);
      let cur = null;
      secs.forEach((s) => { if (s && s.getBoundingClientRect().top <= 150) cur = s.id; });
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 移动端目录
    const btn = $('#navToggle');
    const sheet = $('#navSheet');
    if (btn && sheet) {
      const close = () => {
        nav.classList.remove('menu-open');
        btn.setAttribute('aria-expanded', 'false');
      };
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !nav.classList.contains('menu-open');
        nav.classList.toggle('menu-open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
      sheet.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav')) close();
      });
    }
  }

  function initReveal() {
    if (!('IntersectionObserver' in window)) {
      $$('.reveal').forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: .08, rootMargin: '0px 0px 80px 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
  }

  /* ==================== 启动 ==================== */
  function boot() {
    initTheme();
    renderSubjects();
    initGalaxy();
    renderTabs();
    renderAtlas();
    initAtlasFilters();
    renderLabTabs();
    mountLab('journey');
    initHeroCanvas();
    initNav();
    initReveal();
    paintProgress();

    $('#themeToggle').addEventListener('click', toggleTheme);

    window.Pages.init({
      isMastered: (id) => mastered.has(id),
      toggleMaster: (id) => {
        if (mastered.has(id)) mastered.delete(id); else mastered.add(id);
        saveMastery(); paintProgress();
      },
      locate: (nodeId, sid) => {
        document.getElementById('constellation').scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
          if (nodeId) window.Galaxy.locate(nodeId);
          else if (Array.isArray(sid)) window.Galaxy.focus(sid[0]);
          else window.Galaxy.focus(sid);
        }, 420);
      },
      openLab
    });

    window.__openLink = (id) => window.Pages.open('link', id);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
