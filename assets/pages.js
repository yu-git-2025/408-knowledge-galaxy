/* =========================================================
   内嵌知识页 · 抽屉式页面系统
   学科 → 章节 → 考点 → 跨科关联，四级可回溯
   ========================================================= */

(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const subj = (id) => SUBJECTS.find((s) => s.id === id);
  const at = (id) => ATLAS.find((a) => a.id === id);
  const tagName = (t) => ({ hot: '高频', err: '易错', calc: '计算' }[t] || t);

  const LAB_HINT = {
    'Cache：映射与替换': ['journey', 'mem'],
    '虚拟存储器': ['journey', 'page'],
    '虚拟内存': ['journey', 'page'],
    '页面置换算法': ['replace'],
    '分页与分段': ['translate'],
    '流量控制与拥塞控制': ['tcp'],
    '可靠传输': ['tcp'],
    '插入类': ['sort', 'insert'],
    '交换类': ['sort', 'quick'],
    '选择类': ['sort', 'heap'],
    '指令流水线': ['pipe'],
    '指令周期': ['pipe'],
    '三种 ARQ': ['tcp']
  };

  let H = {};           // hooks: isMastered, toggleMaster, locate, openLab
  let stack = [];

  const NOTE_KEY = 'wb408.notes.v1';
  let notes = {};
  try { notes = JSON.parse(localStorage.getItem(NOTE_KEY) || '{}'); } catch (e) { notes = {}; }
  const saveNotes = () => { try { localStorage.setItem(NOTE_KEY, JSON.stringify(notes)); } catch (e) {} };
  let elMask, elPanel, elBody, elCrumb;

  /* ---------------- 工具 ---------------- */
  const pointId = (sid, ci, pi) => `${sid}:${ci}:${pi}`;

  function findPointIndex(sid, title) {
    const chapters = at(sid).chapters;
    for (let ci = 0; ci < chapters.length; ci++) {
      const pi = chapters[ci].points.findIndex((p) => p.t === title);
      if (pi >= 0) return { ci, pi };
    }
    return null;
  }

  /* ---------------- 页面：学科 ---------------- */
  function pageSubject(sid) {
    const s = subj(sid), a = at(sid);
    const total = a.chapters.reduce((n, c) => n + c.points.length, 0);
    const done = a.chapters.reduce((n, c, ci) => n + c.points.filter((p, pi) => H.isMastered(pointId(sid, ci, pi))).length, 0);
    const links = STAR.links.filter((l) => l.a.s === sid || l.b.s === sid);

    return `
      <div class="pg-kicker" style="color:var(${s.var})">${s.en}</div>
      <h2 class="pg-title">${s.name}</h2>
      <div class="pg-meta">
        <span class="pg-badge" style="color:var(${s.var});border-color:color-mix(in srgb, var(${s.var}) 35%, transparent)">${s.score} 分</span>
        <span>${a.chapters.length} 章 · ${total} 个考点</span>
        <span class="pg-dot"></span>
        <span>已掌握 ${done}/${total}</span>
      </div>

      <section class="pg-sec">
        <div class="pg-h">章节结构</div>
        <div class="pg-chlist">
          ${a.chapters.map((c, ci) => {
            const d = c.points.filter((p, pi) => H.isMastered(pointId(sid, ci, pi))).length;
            return `<button class="pg-ch" data-go="chapter" data-a="${sid}" data-b="${ci}">
              <span class="pg-chnum">${String(ci + 1).padStart(2, '0')}</span>
              <span class="pg-chmain">
                <b>${c.title}</b>
                <i>${c.desc}</i>
              </span>
              <span class="pg-chmeta">${d}/${c.points.length}</span>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section class="pg-sec">
        <div class="pg-h">参与的跨科关联 · ${links.length}</div>
        <div class="pg-links">
          ${links.map((l) => {
            const other = l.a.s === sid ? l.b : l.a;
            const os = subj(other.s);
            return `<button class="pg-link" data-go="link" data-a="${l.id}">
              <span class="pg-linktop">
                <span class="pg-badge" style="color:var(${os.var});border-color:color-mix(in srgb, var(${os.var}) 35%, transparent)">${os.name}</span>
                <span class="pg-arrow">→</span>
              </span>
              <b>${l.title}</b>
              <i>${l.chain.join(' · ')}</i>
            </button>`;
          }).join('')}
        </div>
      </section>`;
  }

  /* ---------------- 页面：章节 ---------------- */
  function pageChapter(sid, ci) {
    const s = subj(sid), ch = at(sid).chapters[ci];
    const links = STAR.links.filter((l) => {
      const mine = ch.points.map((p) => p.t);
      return (l.a.s === sid && mine.includes(l.a.t)) || (l.b.s === sid && mine.includes(l.b.t));
    });

    return `
      <div class="pg-kicker" style="color:var(${s.var})">${s.name} · 第 ${ci + 1} 章</div>
      <h2 class="pg-title">${ch.title}</h2>
      <p class="pg-lede">${ch.desc}</p>

      <section class="pg-sec">
        <div class="pg-h">考点 ${ch.points.length} 个</div>
        <div class="pg-points">
          ${ch.points.map((p, pi) => `
            <button class="pg-pt" data-go="point" data-a="${sid}" data-b="${ci}" data-c="${pi}">
              <span class="pg-pt-h">
                <b>${p.t}</b>
                ${p.tag ? `<em class="ptag ${p.tag}">${tagName(p.tag)}</em>` : ''}
              </span>
              <i>${p.lines[0]}</i>
            </button>`).join('')}
        </div>
      </section>

      ${links.length ? `
      <section class="pg-sec">
        <div class="pg-h">本章牵连到的其他学科</div>
        <div class="pg-links">
          ${links.map((l) => `
            <button class="pg-link" data-go="link" data-a="${l.id}">
              <span class="pg-linktop">
                <span class="pg-badge" style="color:var(--${l.a.s});border-color:color-mix(in srgb, var(--${l.a.s}) 35%, transparent)">${subj(l.a.s).name}</span>
                <span class="pg-tilde">↔</span>
                <span class="pg-badge" style="color:var(--${l.b.s});border-color:color-mix(in srgb, var(--${l.b.s}) 35%, transparent)">${subj(l.b.s).name}</span>
              </span>
              <b>${l.title}</b>
              <i>${l.chain.join(' · ')}</i>
            </button>`).join('')}
        </div>
      </section>` : ''}`;
  }

  /* ---------------- 页面：考点 ---------------- */
  function pagePoint(sid, ci, pi) {
    const s = subj(sid), ch = at(sid).chapters[ci], p = ch.points[pi];
    const pid = pointId(sid, ci, pi);
    const done = H.isMastered(pid);
    const links = STAR.links.filter((l) =>
      (l.a.s === sid && l.a.t === p.t) || (l.b.s === sid && l.b.t === p.t));
    const manual = (p.cross || []).map((id) => STAR.links.find((l) => l.id === id)).filter(Boolean);
    const allLinks = [...new Map([...links, ...manual].map((l) => [l.id, l])).values()];
    const hint = LAB_HINT[p.t];

    // 同章其他考点
    const siblings = ch.points.map((x, i) => ({ x, i })).filter((o) => o.i !== pi);

    return `
      <div class="pg-kicker" style="color:var(${s.var})">${s.name} · ${ch.title}</div>
      <h2 class="pg-title">${p.t}</h2>
      <p class="pg-lede">${ch.desc}</p>
      <div class="pg-meta">
        ${p.tag ? `<span class="ptag ${p.tag}">${tagName(p.tag)}</span>` : ''}
        <span>第 ${ci + 1} 章 · 考点 ${pi + 1}/${ch.points.length}</span>
      </div>

      <section class="pg-sec">
        <div class="pg-h">要点</div>
        <ul class="pg-ul">${p.lines.map((l) => `<li>${l}</li>`).join('')}</ul>
      </section>

      ${allLinks.length ? `
      <section class="pg-sec">
        <div class="pg-h">跨科关联 · ${allLinks.length}</div>
        <div class="pg-links">
          ${allLinks.map((l) => {
            const other = (l.a.s === sid && l.a.t === p.t) ? l.b : l.a;
            const os = subj(other.s);
            return `<button class="pg-link" data-go="link" data-a="${l.id}">
              <span class="pg-linktop">
                <span class="pg-badge" style="color:var(${os.var});border-color:color-mix(in srgb, var(${os.var}) 35%, transparent)">${os.name}</span>
                <span class="pg-arrow">${other.t} →</span>
              </span>
              <b>${l.title}</b>
              <i>${l.chain.join(' · ')}</i>
            </button>`;
          }).join('')}
        </div>
      </section>` : ''}

      ${hint ? `
      <section class="pg-sec">
        <div class="pg-h">相关实验</div>
        <button class="pg-lab" data-lab="${hint[0]}" data-scen="${hint[1] || ''}">
          <span class="pg-labplay">▶</span>
          <span><b>在动画里看一遍</b><i>${hint[0] === 'journey' ? '一次访存的旅程' : hint[0] === 'replace' ? '页面置换算法擂台' : hint[0] === 'tcp' ? 'TCP 拥塞窗口' : hint[0] === 'sort' ? '排序算法可视化' : hint[0] === 'pipe' ? '指令流水线时空图' : '地址翻译流水线'}</i></span>
        </button>
      </section>` : ''}

      ${siblings.length ? `
      <section class="pg-sec">
        <div class="pg-h">同章其他考点</div>
        <div class="pg-chips">
          ${siblings.map((o) => `<button class="pg-chip" data-go="point" data-a="${sid}" data-b="${ci}" data-c="${o.i}">${o.x.t}</button>`).join('')}
        </div>
      </section>` : ''}

      <section class="pg-sec">
        <div class="pg-h">我的笔记 <span class="pg-note-state" data-nstate>${notes[pid] ? '已保存' : '自动存本地'}</span></div>
        <textarea class="pg-note" data-note="${pid}" rows="4" placeholder="记一笔：这个考点我错在哪、和哪道题串起来了……">${notes[pid] || ''}</textarea>
      </section>

      <div class="pg-foot">
        <button class="pg-master ${done ? 'done' : ''}" data-master="${pid}">
          ${done ? '✓ 已掌握' : '标记为已掌握'}
        </button>
        <button class="pg-locate" data-locate="${sid}:${ci}:${pi}">在星图中定位 →</button>
      </div>`;
  }

  /* ---------------- 页面：跨科关联 ---------------- */
  function pageLink(id) {
    const l = STAR.links.find((x) => x.id === id);
    if (!l) return '';
    const sa = subj(l.a.s), sb = subj(l.b.s);
    return `
      <div class="pg-kicker">跨科关联 · ${id}</div>
      <h2 class="pg-title">${l.title}</h2>
      <div class="pg-meta">
        <span class="pg-badge" style="color:var(${sa.var});border-color:color-mix(in srgb, var(${sa.var}) 35%, transparent)">${sa.name}</span>
        <span class="pg-tilde">↔</span>
        <span class="pg-badge" style="color:var(${sb.var});border-color:color-mix(in srgb, var(${sb.var}) 35%, transparent)">${sb.name}</span>
      </div>

      <div class="pg-chain">
        ${l.chain.map((c, i) => `<span>${c}</span>${i < l.chain.length - 1 ? '<i>→</i>' : ''}`).join('')}
      </div>

      <section class="pg-sec">
        ${l.body.map((b) => `<div class="pg-block"><div class="pg-h">${b.k}</div><p>${b.v}</p></div>`).join('')}
      </section>

      <section class="pg-sec">
        <div class="pg-h">两端考点</div>
        <div class="pg-ends">
          ${[l.a, l.b].map((ref) => {
            const s = subj(ref.s);
            const pos = findPointIndex(ref.s, ref.t);
            return `<button class="pg-end" ${pos ? `data-go="point" data-a="${ref.s}" data-b="${pos.ci}" data-c="${pos.pi}"` : 'disabled'}>
              <span class="pg-badge" style="color:var(${s.var});border-color:color-mix(in srgb, var(${s.var}) 35%, transparent)">${s.name}</span>
              <b>${ref.t}</b>
            </button>`;
          }).join('')}
        </div>
      </section>

      <div class="pg-foot">
        <button class="pg-locate" data-locate="${l.a.s}" data-locate2="${l.b.s}">在星图中定位 →</button>
      </div>`;
  }

  /* ---------------- 路由 ---------------- */
  function render(entry) {
    const [kind, a, b, c] = entry;
    if (kind === 'subject') {
      elCrumb.innerHTML = `<span>${subj(a).name}</span>`;
      elBody.innerHTML = pageSubject(a);
    } else if (kind === 'chapter') {
      elCrumb.innerHTML = `<button data-go="subject" data-a="${a}">${subj(a).name}</button><i>/</i><span>第 ${+b + 1} 章</span>`;
      elBody.innerHTML = pageChapter(a, +b);
    } else if (kind === 'point') {
      elCrumb.innerHTML = `<button data-go="subject" data-a="${a}">${subj(a).name}</button><i>/</i><button data-go="chapter" data-a="${a}" data-b="${b}">${at(a).chapters[+b].title}</button>`;
      elBody.innerHTML = pagePoint(a, +b, +c);
    } else if (kind === 'link') {
      elCrumb.innerHTML = `<span>跨科关联</span>`;
      elBody.innerHTML = pageLink(a);
    }
    elBody.scrollTop = 0;
    bindBody();
  }

  function open(kind, a, b, c) {
    const entry = [kind, a, b, c];
    if (stack.length && stack[stack.length - 1][0] === kind && stack[stack.length - 1][1] === a &&
        stack[stack.length - 1][2] === b && stack[stack.length - 1][3] === c) {
      // 重复点击，不压栈
    } else {
      stack.push(entry);
    }
    render(entry);
    document.body.classList.add('pd-open');
    elPanel.setAttribute('aria-hidden', 'false');
  }

  function close() {
    document.body.classList.remove('pd-open');
    elPanel.setAttribute('aria-hidden', 'true');
  }

  function back() {
    stack.pop();
    const prev = stack[stack.length - 1];
    if (prev) render(prev);
    else close();
  }

  function bindBody() {
    elBody.querySelectorAll('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        open(btn.dataset.go, btn.dataset.a, btn.dataset.b, btn.dataset.c);
      });
    });
    elBody.querySelectorAll('[data-master]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.master;
        H.toggleMaster(pid);
        const done = H.isMastered(pid);
        btn.classList.toggle('done', done);
        btn.textContent = done ? '✓ 已掌握' : '标记为已掌握';
      });
    });
    elBody.querySelectorAll('[data-lab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        close();
        H.openLab(btn.dataset.lab, btn.dataset.scen);
      });
    });
    const noteEl = elBody.querySelector('[data-note]');
    if (noteEl) {
      const state = elBody.querySelector('[data-nstate]');
      let timer = null;
      noteEl.addEventListener('input', () => {
        notes[noteEl.dataset.note] = noteEl.value;
        clearTimeout(timer);
        timer = setTimeout(() => {
          saveNotes();
          if (state) { state.textContent = '已保存'; state.classList.add('on'); }
        }, 420);
      });
    }

    elBody.querySelectorAll('[data-locate]').forEach((btn) => {
      btn.addEventListener('click', () => {
        close();
        const sid = btn.dataset.locate;
        if (btn.dataset.locate2) {
          H.locate(null, [sid, btn.dataset.locate2]);
        } else if (sid.includes(':')) {
          const [s, ci, pi] = sid.split(':');
          H.locate(`P:${s}:${ci}:${pi}`, s);
        } else {
          H.locate(null, sid);
        }
      });
    });
  }

  window.Pages = {
    init(hooks) {
      H = hooks;
      elMask = $('#pdMask');
      elPanel = $('#pd');
      elBody = $('#pdBody');
      elCrumb = $('#pdCrumb');
      $('#pdClose').addEventListener('click', close);
      $('#pdBack').addEventListener('click', back);
      elMask.addEventListener('click', close);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('pd-open')) close();
      });
    },
    open,
    close,
    isOpen: () => document.body.classList.contains('pd-open')
  };
})();
