/* =========================================================
   408 · 应用层：渲染 / 交互 / 进度
   ========================================================= */

(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const subj = (id) => SUBJECTS.find((s) => s.id === id);
  const isDark = () => document.documentElement.dataset.theme === 'dark';

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
    if (tip) tip.title = `已掌握 ${done} / ${total} 个知识点`;

    SUBJECTS.forEach((s) => {
      const p = subjProgress(s.id);
      const bar = $(`[data-pbar="${s.id}"]`);
      if (bar) bar.style.width = p.pct + '%';
      const lab = $(`[data-ppct="${s.id}"]`);
      if (lab) lab.textContent = p.pct + '%';
    });

    const tab = $('.tab.on');
    if (tab) {
      const p = subjProgress(tab.dataset.s);
      const el = $('#atlasPct');
      if (el) el.textContent = `${p.done}/${p.total} 已掌握`;
    }
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
    initGalaxy();
    drawHeroStatic();
    const active = $('.lab-tab.on');
    if (active) mountLab(active.dataset.tab);
  }

  /* ==================== 首页四科卡 ==================== */
  function renderSubjects() {
    const box = $('#subjectStrip');
    box.innerHTML = SUBJECTS.map((s) => `
      <article class="subj-card" style="--c:var(${s.var})" data-jump="${s.id}">
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

    $$('[data-jump]').forEach((el) => el.addEventListener('click', () => {
      document.getElementById('atlas').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => switchSubject(el.dataset.jump), 380);
    }));
  }

  /* ==================== 知识星云 ==================== */
  let spinOn = true;

  function renderGalaxyFilters() {
    const box = $('#gFilters');
    if (!box) return;
    box.innerHTML = `<button class="gchip on" data-f="all">全部</button>` +
      SUBJECTS.map((s) => `<button class="gchip" data-f="${s.id}" style="--c:var(${s.var})"><i></i>${s.name}</button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.gchip');
      if (!b) return;
      box.querySelectorAll('.gchip').forEach((x) => x.classList.toggle('on', x === b));
      const all = b.dataset.f === 'all';
      window.Galaxy.focus(all ? null : b.dataset.f);
      // 聚焦时暂停自转，保持该学科正面朝向
      spinOn = all;
      const sp = $('#gSpin');
      if (sp) sp.classList.toggle('on', spinOn);
      window.Galaxy.setAuto(spinOn);
    });
  }

  function renderGalaxyLegend() {
    const box = $('#gLegend');
    if (!box) return;
    box.innerHTML = SUBJECTS.map((s) => `<span><i style="background:var(${s.var})"></i>${s.name}</span>`).join('')
      + `<span class="g-lg-link"><i class="g-dash"></i>跨科关联</span>`;
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

  function initGalaxy() {
    renderGalaxyFilters();
    renderGalaxyLegend();
    renderLinkIndex();

    window.Galaxy.init({
      onNode(n) {
        if (n.kind === 'subject') window.Pages.open('subject', n.s);
        else if (n.kind === 'chapter') window.Pages.open('chapter', n.s, n.ci);
        else window.Pages.open('point', n.s, n.ci, n.pi);
      }
    });

    const st = window.Galaxy.stats();
    const stats = $('#gStats');
    if (stats) stats.textContent = `${st.nodes} 个节点 · ${st.chapters} 个章节 · ${st.links} 条跨科关联`;

    const spin = $('#gSpin');
    if (spin) spin.addEventListener('click', () => {
      spinOn = !spinOn;
      spin.classList.toggle('on', spinOn);
      window.Galaxy.setAuto(spinOn);
    });

    const reset = $('#gReset');
    if (reset) reset.addEventListener('click', () => {
      window.Galaxy.focus(null);
      $$('.gchip').forEach((x) => x.classList.toggle('on', x.dataset.f === 'all'));
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
  let curSub = 'ds', curCh = 0;

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
          <span>${c.title}</span>
        </button>`).join('');

    $$('.cn-item').forEach((b) => b.addEventListener('click', () => {
      curCh = +b.dataset.ch;
      $$('.cn-item').forEach((x) => x.classList.toggle('on', x === b));
      renderChapter();
    }));

    renderChapter();
  }

  function renderChapter() {
    const s = subj(curSub);
    const data = ATLAS.find((a) => a.id === curSub);
    const ch = data.chapters[curCh];

    $('#chapterContent').innerHTML = `
      <div class="chapter-head" style="--c:var(${s.var})">
        <div class="ch-kicker">${s.name} · 第 ${curCh + 1} 章</div>
        <h3>${ch.title}</h3>
        <div class="ch-desc">${ch.desc}</div>
        <div style="margin-top:14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <span style="font-size:11.5px;color:var(--faint);font-family:var(--mono)" id="atlasPct"></span>
        </div>
      </div>
      <div class="point-grid">
        ${ch.points.map((p, pi) => {
          const pid = `${curSub}:${curCh}:${pi}`;
          const done = mastered.has(pid);
          return `<article class="point" style="--c:var(${s.var})">
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
              <button class="master-btn ${done ? 'done' : ''}" data-pid="${pid}" title="标记为已掌握">
                <span class="box"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6.2 4.6 9 10 3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                ${done ? '已掌握' : '标记'}
              </button>
            </div>
          </article>`;
        }).join('')}
      </div>`;

    $$('#chapterContent [data-link]').forEach((b) => b.addEventListener('click', () => {
      window.Pages.open('link', b.dataset.link);
    }));

    $$('#chapterContent [data-pid]').forEach((b) => b.addEventListener('click', () => {
      const pid = b.dataset.pid;
      if (mastered.has(pid)) mastered.delete(pid); else mastered.add(pid);
      saveMastery();
      b.classList.toggle('done', mastered.has(pid));
      b.innerHTML = b.classList.contains('done')
        ? '<span class="box"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6.2 4.6 9 10 3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>已掌握'
        : '<span class="box"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6.2 4.6 9 10 3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>标记';
      paintProgress();
    }));

    // 卡片淡入
    $$('#chapterContent .point').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(14px)';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity .5s cubic-bezier(.22,1,.36,1), transform .5s cubic-bezier(.22,1,.36,1)';
        el.style.transitionDelay = Math.min(i * 45, 400) + 'ms';
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
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
    });
  }

  function mountLab(id) {
    if (labCleanup) { try { labCleanup(); } catch (e) {} labCleanup = null; }
    const old = $('#labStage');
    if (!old) return;
    // 用全新的节点替换，彻底移除上一个实验残留的事件监听
    const stage = old.cloneNode(false);
    stage.classList.add('in'); // 节点已替换，需手动保持可见状态
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

  function drawHeroStatic() { /* 画布自循环，主题切换无需额外处理 */ }

  /* ==================== 导航 & 滚动 ==================== */
  function initNav() {
    const nav = $('.nav');
    const links = $$('.nav-links a');
    const secs = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);

    const onScroll = () => {
      nav.classList.toggle('stuck', window.scrollY > 12);
      let cur = null;
      secs.forEach((s) => { if (s && s.getBoundingClientRect().top <= 140) cur = s.id; });
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
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
    renderLabTabs();
    mountLab('journey');
    initHeroCanvas();
    initNav();
    initReveal();
    paintProgress();

    $('#themeToggle').addEventListener('click', toggleTheme);

    window.Pages.init({
      isMastered: (pid) => mastered.has(pid),
      toggleMaster: (pid) => {
        if (mastered.has(pid)) mastered.delete(pid); else mastered.add(pid);
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
