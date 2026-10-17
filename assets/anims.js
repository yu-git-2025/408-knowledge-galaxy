/* =========================================================
   408 可视化实验室 · 六个交互引擎
   ========================================================= */

(function () {
  'use strict';

  const cv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const sleepers = new Set();

  function timers() {
    const bag = [];
    const api = {
      after(fn, ms) { const id = setTimeout(() => { bag.splice(bag.indexOf(id), 1); fn(); }, ms); bag.push(id); return id; },
      interval(fn, ms) { const id = setInterval(fn, ms); bag.push(id); return id; },
      clear() { bag.forEach((id) => { clearTimeout(id); clearInterval(id); }); bag.length = 0; }
    };
    sleepers.add(api);
    return api;
  }

  /* =========================================================
     LAB 01 · 一次访存的旅程
     ========================================================= */
  const LEVELS = [
    { name: '寄存器', sub: 'REG', size: '< 1 KB', lat: 1, show: '1', bar: 2 },
    { name: 'L1 Cache', sub: 'SRAM', size: '32 KB', lat: 4, show: '4', bar: 8 },
    { name: 'L2 Cache', sub: 'SRAM', size: '256 KB', lat: 12, show: '12', bar: 15 },
    { name: 'L3 Cache', sub: 'SRAM', size: '8 MB', lat: 40, show: '40', bar: 24 },
    { name: '主存', sub: 'DRAM', size: '16 GB', lat: 200, show: '200', bar: 40 },
    { name: '磁盘', sub: 'SSD', size: '1 TB', lat: 10000000, show: '10⁷', bar: 72 }
  ];

  const SCEN = {
    hit: {
      name: 'L1 命中',
      steps: [
        { i: 1, t: 'hit', c: 4, msg: '地址在 L1 中命中，一个时钟周期量级返回数据' }
      ]
    },
    mem: {
      name: '逐级缺失 → 主存',
      steps: [
        { i: 1, t: 'miss', c: 4, msg: 'L1 标记不匹配，未命中' },
        { i: 2, t: 'miss', c: 12, msg: 'L2 未命中，继续向下' },
        { i: 3, t: 'miss', c: 40, msg: 'L3 未命中，转主存' },
        { i: 4, t: 'hit', c: 200, msg: '主存命中，按 64B 整块搬入，逐级填充 Cache 行' },
        { i: 1, t: 'back', c: 0, msg: '下次访问同一 Cache 行的相邻元素即可命中' }
      ]
    },
    page: {
      name: '缺页 → 磁盘',
      steps: [
        { i: 1, t: 'miss', c: 4, msg: 'L1 未命中' },
        { i: 2, t: 'miss', c: 12, msg: 'L2 未命中' },
        { i: 3, t: 'miss', c: 40, msg: 'L3 未命中' },
        { i: 4, t: 'miss', c: 200, msg: '主存未命中：页表项存在位为 0' },
        { i: 0, t: 'trap', c: 0, msg: 'MMU 触发缺页异常，CPU 陷入内核态，执行缺页处理程序' },
        { i: 5, t: 'fault', c: 10000000, msg: '磁盘 I/O：把 4 KB 页面读入一个空闲页框（若满则先按 LRU 换出）' },
        { i: 4, t: 'fill', c: 200, msg: '更新页表项与 TLB，重新执行那条被中断的指令' },
        { i: 1, t: 'hit', c: 4, msg: '重新访存，这次命中的代价只有 4 个周期' }
      ]
    }
  };

  function mountJourney(el, reg) {
    const T = timers();
    let si = 'hit', k = -1, total = 0, playing = false, dead = false;
    const alive = () => !dead && el.isConnected;

    el.innerHTML = `
      <div class="lab-intro">
        <div>
          <h3>一次访存的旅程</h3>
          <p>同一次数据访问，穿透六层存储。注意看累计周期：绝大多数时间并不是"算"掉的，而是"等"掉的 —— 这就是存储层次存在的理由。</p>
        </div>
        <div class="li-formula">
          容量 ↑ &nbsp; 速度 ↓ &nbsp; 位成本 ↓<br>
          Ta = H·Tc + (1−H)·Tm
        </div>
      </div>
      <div class="ctrl-row">
        <span class="ctrl-label">场景</span>
        <button class="ctrl on" data-s="hit">L1 命中</button>
        <button class="ctrl" data-s="mem">逐级缺失 → 主存</button>
        <button class="ctrl" data-s="page">缺页 → 磁盘</button>
        <div class="ctrl-sep"></div>
        <button class="ctrl" data-act="play">▶ 播放</button>
        <button class="ctrl" data-act="step">单步</button>
        <button class="ctrl" data-act="reset">重置</button>
      </div>
      <div class="journey">
        <div class="journey-track">
          <div class="j-guide"></div>
          <div class="j-ladder">
            ${LEVELS.map((l, i) => `
              <div class="j-cell" data-i="${i}" style="--c:var(--co)">
                <span class="j-flag"></span>
                <div class="j-name">${l.name}</div>
                <div class="j-sub">${l.sub}</div>
                <div class="j-size">${l.size}</div>
                <div class="j-lat">${l.show}<small>cyc</small></div>
                <div class="j-bar"><i style="width:${l.bar}%"></i></div>
              </div>`).join('')}
          </div>
          <div class="j-chip">CPU</div>
        </div>
        <div class="j-readout">
          <div class="j-ro"><div class="k">累计周期</div><div class="v" data-ro="cyc">0<small>cyc</small></div></div>
          <div class="j-ro"><div class="k">当前层级</div><div class="v" data-ro="lv" style="font-size:15px">—</div></div>
          <div class="j-ro"><div class="k">状态</div><div class="v" data-ro="st" style="font-size:15px">待命</div></div>
          <div class="j-ro"><div class="k">相对 L1</div><div class="v" data-ro="rt">—</div></div>
        </div>
        <div class="j-log"></div>
      </div>`;

    const ladder = el.querySelector('.j-ladder');
    const chip = el.querySelector('.j-chip');
    const log = el.querySelector('.j-log');
    const cells = [...el.querySelectorAll('.j-cell')];

    function place(i) {
      if (!alive()) return;
      const cell = cells[i], tr = ladder.getBoundingClientRect(), cr = cell.getBoundingClientRect();
      chip.style.transform = `translate(${cr.left - tr.left + cr.width / 2 - 13}px, ${cr.top - tr.top - 34}px)`;
      chip.classList.add('show');
    }

    function reset() {
      if (!alive()) return;
      T.clear(); playing = false; k = -1; total = 0;
      cells.forEach((c) => { c.classList.remove('active', 'hit', 'miss', 'fault'); c.querySelector('.j-flag').className = 'j-flag'; c.querySelector('.j-flag').textContent = ''; });
      log.innerHTML = '';
      el.querySelector('[data-ro="cyc"]').innerHTML = '0<small>cyc</small>';
      el.querySelector('[data-ro="lv"]').textContent = '—';
      el.querySelector('[data-ro="st"]').textContent = '待命';
      el.querySelector('[data-ro="rt"]').textContent = '—';
      el.querySelector('[data-act="play"]').textContent = '▶ 播放';
    }

    function addLog(txt, cls) {
      const t = String(total).padStart(4, '0');
      const d = document.createElement('div');
      d.innerHTML = `<span class="t">t=${t}</span><span class="${cls}">${txt}</span>`;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }

    function step() {
      if (!alive()) return false;
      const sc = SCEN[si];
      if (k >= sc.steps.length - 1) { playing = false; el.querySelector('[data-act="play"]').textContent = '▶ 播放'; return false; }
      k++;
      const s = sc.steps[k];
      cells.forEach((c) => c.classList.remove('active'));
      const cell = cells[s.i];
      cell.classList.add('active');
      place(s.i);

      const flag = cell.querySelector('.j-flag');
      if (s.t === 'hit' || s.t === 'back') {
        cell.classList.remove('miss', 'fault'); cell.classList.add('hit');
        flag.className = 'j-flag show ok'; flag.textContent = 'HIT';
        el.querySelector('[data-ro="st"]').textContent = '命中';
      } else if (s.t === 'miss') {
        cell.classList.remove('hit', 'fault'); cell.classList.add('miss');
        flag.className = 'j-flag show no'; flag.textContent = 'MISS';
        el.querySelector('[data-ro="st"]').textContent = '未命中';
      } else if (s.t === 'fault' || s.t === 'trap') {
        cell.classList.remove('hit', 'miss'); cell.classList.add('fault');
        flag.className = 'j-flag show no'; flag.textContent = s.t === 'trap' ? 'TRAP' : 'PAGE IN';
        el.querySelector('[data-ro="st"]').textContent = s.t === 'trap' ? '陷入内核' : '调页';
      } else {
        el.querySelector('[data-ro="st"]').textContent = '回填';
      }

      total += s.c;
      el.querySelector('[data-ro="cyc"]').innerHTML = `${total.toLocaleString()}<small>cyc</small>`;
      if (s.t !== 'trap') el.querySelector('[data-ro="lv"]').textContent = LEVELS[s.i].name;
      el.querySelector('[data-ro="rt"]').textContent = total > 0 ? (total === 4 ? '1×' : '≈' + Math.round(total / 4) + '×') : '1×';
      addLog(s.msg, s.t === 'hit' || s.t === 'back' ? 'ok' : (s.t === 'miss' ? 'no' : 'dim'));

      if (s.t === 'trap') {
        T.after(() => place(5), 420);
      }
      return true;
    }

    function play() {
      if (!alive()) return;
      if (playing) { playing = false; T.clear(); el.querySelector('[data-act="play"]').textContent = '▶ 播放'; return; }
      if (k >= SCEN[si].steps.length - 1) reset();
      playing = true;
      el.querySelector('[data-act="play"]').textContent = '❚❚ 暂停';
      T.clear();
      const tick = () => {
        if (!playing) return;
        const more = step();
        if (!more) { playing = false; el.querySelector('[data-act="play"]').textContent = '▶ 播放'; return; }
        T.after(tick, SCEN[si].steps[k].t === 'trap' ? 1500 : 1150);
      };
      tick();
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.s) {
        el.querySelectorAll('[data-s]').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        si = b.dataset.s; reset();
      } else if (b.dataset.act === 'play') { play(); }
      else if (b.dataset.act === 'step') { if (playing) play(); step(); }
      else if (b.dataset.act === 'reset') { reset(); }
    });

    reset();
    T.after(() => { chip.classList.add('show'); place(0); }, 320);

    const onResize = () => { if (k >= 0) place(SCEN[si].steps[k].i); };
    window.addEventListener('resize', onResize);

    return () => { dead = true; playing = false; T.clear(); window.removeEventListener('resize', onResize); sleepers.delete(T); };
  }

  /* =========================================================
     LAB 02 · 地址翻译流水线
     ========================================================= */
  const TR_MODES = {
    hit: {
      name: 'TLB 命中',
      steps: [
        { n: 0, k: 'on', msg: '逻辑地址 0x00004A3C 拆成 页号 0x00004 + 页内偏移 0xA3C' },
        { n: 1, k: 'hit', msg: 'TLB 中有页号 4 的表项 → 页框号 0x1B，省去一次访存' },
        { n: 2, k: 'on', msg: '页表项有效位为 1（若为 0 则触发缺页），与 TLB 内容一致' },
        { n: 3, k: 'hit', msg: '物理地址 = 页框号 × 页大小 + 偏移 = 0x1B000 + 0xA3C = 0x1BA3C' },
        { n: 4, k: 'hit', msg: '拆成 标记 0xD / 组号 104 / 块内偏移 60，Cache 命中' }
      ]
    },
    miss: {
      name: 'TLB 未命中',
      steps: [
        { n: 0, k: 'on', msg: '逻辑地址 0x00004A3C 拆成 页号 0x00004 + 偏移 0xA3C' },
        { n: 1, k: 'bad', msg: 'TLB 未命中 → 必须访问主存中的页表（多一次访存）' },
        { n: 2, k: 'on', msg: '读页表项：页框号 0x1B，有效位 1；把该表项装入 TLB' },
        { n: 3, k: 'hit', msg: '物理地址 0x1BA3C，本次访存共需 2 次主存访问' },
        { n: 4, k: 'hit', msg: 'Cache 命中，块内偏移 60' }
      ]
    },
    page: {
      name: '缺页异常',
      steps: [
        { n: 0, k: 'on', msg: '逻辑地址 0x00004A3C 页号 4' },
        { n: 1, k: 'bad', msg: 'TLB 缺失' },
        { n: 2, k: 'bad', msg: '页表项有效位 = 0 → 该页不在内存，触发缺页中断' },
        { n: 3, k: 'bad', msg: 'OS 找空闲页框（或按 LRU 换出一页），启动磁盘 I/O 读入 4 KB' },
        { n: 4, k: 'on', msg: '更新页表与 TLB，重新执行指令 —— 这一次才真正取到数据' }
      ]
    }
  };

  function mountTranslate(el) {
    const T = timers();
    let mode = 'hit', k = -1;

    el.innerHTML = `
      <div class="lab-intro">
        <div>
          <h3>地址翻译流水线</h3>
          <p>一条访存指令要经过三次"拆位"：逻辑地址拆页号与偏移、页表换页框、物理地址再拆标记与组号。组成原理讲 Cache 结构，操作系统讲页表，真正的考题长在这条线上。</p>
        </div>
        <div class="li-formula">页大小 4 KB＝2¹²<br>32 位地址 → 20 位页号</div>
      </div>
      <div class="ctrl-row">
        <span class="ctrl-label">场景</span>
        <button class="ctrl on" data-m="hit">TLB 命中</button>
        <button class="ctrl" data-m="miss">TLB 未命中</button>
        <button class="ctrl" data-m="page">缺页异常</button>
        <div class="ctrl-sep"></div>
        <button class="ctrl" data-act="next">下一步 ▶</button>
        <button class="ctrl" data-act="reset">重置</button>
      </div>
      <div class="tr-flow">
        <div class="tr-node" data-n="0">
          <div class="tn-idx">STEP 01</div>
          <div class="tn-name">拆分逻辑地址</div>
          <div class="tn-val">0x00004A3C<br>页号 0x00004 · 偏移 0xA3C</div>
          <div class="bits">
            <div class="bit-group">0000 0000 0000 0000 0001<span class="bg-lab">页号 20 位</span></div>
            <div class="bit-group">1010 0011 1100<span class="bg-lab">偏移 12 位</span></div>
          </div>
        </div>
        <div class="tr-node" data-n="1">
          <div class="tn-idx">STEP 02</div>
          <div class="tn-name">查 TLB</div>
          <div class="tn-val">4 项全相联<br>VPN 4 → PFN 0x1B</div>
          <div class="bits">
            <div class="bit-group">VPN 4<span class="bg-lab">命中</span></div>
            <div class="bit-group">PFN 1B<span class="bg-lab">页框</span></div>
          </div>
        </div>
        <div class="tr-node" data-n="2">
          <div class="tn-idx">STEP 03</div>
          <div class="tn-name">页表项校验</div>
          <div class="tn-val">存在位 1 · 修改位 0<br>访问位 1 · 页框 0x1B</div>
          <div class="bits">
            <div class="bit-group">有效 1<span class="bg-lab">存在位</span></div>
            <div class="bit-group">R1 D0<span class="bg-lab">访问/修改</span></div>
          </div>
        </div>
        <div class="tr-node" data-n="3">
          <div class="tn-idx">STEP 04</div>
          <div class="tn-name">拼物理地址</div>
          <div class="tn-val">0x1B000 + 0xA3C<br>= 0x1BA3C</div>
          <div class="bits">
            <div class="bit-group">1B<span class="bg-lab">页框 20 位</span></div>
            <div class="bit-group">A3C<span class="bg-lab">偏移 12 位</span></div>
          </div>
        </div>
        <div class="tr-node" data-n="4">
          <div class="tn-idx">STEP 05</div>
          <div class="tn-name">查 Cache</div>
          <div class="tn-val">64B 行 · 128 组 · 4 路<br>标记 0xD · 组 104 · 偏移 60</div>
          <div class="bits">
            <div class="bit-group">0xD<span class="bg-lab">标记 19 位</span></div>
            <div class="bit-group">104<span class="bg-lab">组号 7 位</span></div>
            <div class="bit-group">60<span class="bg-lab">块内 6 位</span></div>
          </div>
        </div>
      </div>
      <div class="j-log" data-log style="margin-top:18px"></div>`;

    const nodes = [...el.querySelectorAll('.tr-node')];
    const log = el.querySelector('[data-log]');

    function reset() {
      k = -1;
      nodes.forEach((n) => n.classList.remove('on', 'hit', 'bad'));
      log.innerHTML = '';
      log.appendChild(Object.assign(document.createElement('div'), { className: 'dim', innerHTML: '<span class="t">tip</span><span>点击「下一步」，跟着地址走完全程。</span>' }));
    }

    function next() {
      const steps = TR_MODES[mode].steps;
      if (k >= steps.length - 1) return;
      k++;
      if (k === 0) log.innerHTML = '';
      const s = steps[k];
      nodes.forEach((n) => n.classList.remove('on'));
      const node = nodes[s.n];
      node.classList.add(s.k === 'on' ? 'on' : s.k);
      const d = document.createElement('div');
      const cls = s.k === 'bad' ? 'no' : (s.k === 'hit' ? 'ok' : 'dim');
      d.innerHTML = `<span class="t">0${k + 1}</span><span class="${cls}">${s.msg}</span>`;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.m) {
        el.querySelectorAll('[data-m]').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        mode = b.dataset.m; reset();
        const node = nodes[1];
        node.classList.toggle('bad', mode !== 'hit');
      } else if (b.dataset.act === 'next') next();
      else reset();
    });

    reset();
    return () => { T.clear(); sleepers.delete(T); };
  }

  /* =========================================================
     LAB 03 · 页面置换算法擂台
     ========================================================= */
  const REF = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];

  function simulate(algo, refs, n) {
    let frames = new Array(n).fill(null);
    let faults = 0, ptr = 0, steps = [];
    const lastUse = new Map();
    const refBits = new Array(n).fill(0);
    const loadedAt = new Array(n).fill(-1);

    for (let t = 0; t < refs.length; t++) {
      const p = refs[t];
      let hit = frames.includes(p);
      let victim = -1;

      if (hit) {
        const i = frames.indexOf(p);
        lastUse.set(p, t);
        refBits[i] = 1;
      } else {
        faults++;
        if (frames.includes(null)) {
          victim = frames.indexOf(null);
        } else if (algo === 'fifo') {
          victim = ptr % n;
        } else if (algo === 'lru') {
          let min = Infinity;
          frames.forEach((f, i) => { const u = lastUse.get(f) ?? -1; if (u < min) { min = u; victim = i; } });
        } else if (algo === 'opt') {
          let far = -1;
          frames.forEach((f, i) => {
            let nx = refs.indexOf(f, t + 1);
            if (nx === -1) nx = Infinity;
            if (nx > far) { far = nx; victim = i; }
          });
        } else if (algo === 'clock') {
          let guard = 0;
          while (guard++ < n * 4) {
            if (refBits[ptr] === 0) { victim = ptr; break; }
            refBits[ptr] = 0;
            ptr = (ptr + 1) % n;
          }
          if (victim === -1) victim = ptr;
        }
        if (algo === 'fifo') ptr = (ptr + 1) % n;
        frames[victim] = p;
        lastUse.set(p, t);
        refBits[victim] = 1;
        loadedAt[victim] = t;
      }
      steps.push({ frames: frames.slice(), hit, fault: !hit, victim: hit ? -1 : victim });
    }
    return { steps, faults };
  }

  function mountReplace(el) {
    const T = timers();
    const algos = [
      { id: 'fifo', name: 'FIFO', sub: '先进先出' },
      { id: 'lru', name: 'LRU', sub: '最近最久未用' },
      { id: 'clock', name: 'CLOCK', sub: '时钟 / 二次机会' },
      { id: 'opt', name: 'OPT', sub: '最优（理论）' }
    ];
    const res = algos.map((a) => simulate(a.id, REF, 3));
    let k = -1, playing = false;

    el.innerHTML = `
      <div class="lab-intro">
        <div>
          <h3>页面置换算法擂台</h3>
          <p>同一串页面访问序列（3 个页框），四种算法逐个位置对比。<b>FIFO 会出现 Belady 异常</b> —— 页框增多反而缺页更多，因为它不看"未来也不看最近"，只看谁先进来。</p>
        </div>
        <div class="li-formula">缺页率 = 缺页次数 / 访问次数<br>Belady 异常仅 FIFO 有</div>
      </div>
      <div class="ctrl-row">
        <button class="ctrl" data-act="play">▶ 播放</button>
        <button class="ctrl" data-act="step">单步</button>
        <button class="ctrl" data-act="reset">重置</button>
        <button class="ctrl" data-act="all">直接看结果</button>
        <div class="ctrl-sep"></div>
        <span class="ctrl-label">访问序列：7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1</span>
      </div>
      <div class="pv-grid">
        <div class="pv-row pv-head">
          <div class="pv-name" style="font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;color:var(--faint)">访问序列</div>
          <div class="pv-cells">
            ${REF.map((p, ci) => `<div class="pv-col hd" data-hc="${ci}"><div class="pv-ref">${p}</div></div>`).join('')}
          </div>
          <div class="pv-stat"></div>
        </div>
        ${algos.map((a, ri) => `
          <div class="pv-row" data-row="${ri}">
            <div class="pv-name">${a.name}<span class="pv-sub">${a.sub}</span></div>
            <div class="pv-cells">
              ${REF.map((p, ci) => `
                <div class="pv-col" data-c="${ci}">
                  ${[0, 1, 2].map((s) => `<div class="pv-slot" data-s="${s}"></div>`).join('')}
                </div>`).join('')}
            </div>
            <div class="pv-stat"><b data-faults="0">–</b><span class="pv-lab">/20 缺页</span></div>
          </div>`).join('')}
      </div>`;

    const rows = [...el.querySelectorAll('.pv-row[data-row]')];
    const hcols = [...el.querySelectorAll('[data-hc]')];

    function reset() {
      T.clear(); playing = false; k = -1;
      el.querySelector('[data-act="play"]').textContent = '▶ 播放';
      hcols.forEach((c) => c.classList.remove('now'));
      rows.forEach((r, ri) => {
        r.classList.remove('best');
        r.querySelector('[data-faults]').textContent = '–';
        [...r.querySelectorAll('.pv-col')].forEach((c) => {
          c.classList.remove('on', 'fault', 'hit', 'now');
          [...c.querySelectorAll('.pv-slot')].forEach((s) => { s.textContent = ''; s.className = 'pv-slot'; });
        });
      });
    }

    function step() {
      if (!el.isConnected) { playing = false; return false; }
      if (k >= REF.length - 1) { playing = false; el.querySelector('[data-act="play"]').textContent = '▶ 播放'; return false; }
      k++;
      hcols.forEach((c, ci) => c.classList.toggle('now', ci === k));
      rows.forEach((r, ri) => {
        const st = res[ri].steps[k];
        const col = r.querySelector(`[data-c="${k}"]`);
        col.classList.add('on');
        [...r.querySelectorAll('.pv-col')].forEach((c) => c.classList.toggle('now', c === col));
        col.classList.toggle('fault', st.fault);
        col.classList.toggle('hit', !st.fault);
        [...col.querySelectorAll('.pv-slot')].forEach((s, si) => {
          const v = st.frames[si];
          s.textContent = v === null ? '' : v;
          s.className = 'pv-slot' + (v === null ? '' : ' fill') + (st.victim === si ? ' new' : '');
        });
        r.querySelector('[data-faults]').textContent = res[ri].steps.slice(0, k + 1).filter((x) => x.fault).length;
      });
      return true;
    }

    function finish() {
      while (step()) {}
      const min = Math.min(...res.map((r) => r.faults));
      rows.forEach((r, ri) => {
        r.querySelector('[data-faults]').textContent = res[ri].faults;
        if (res[ri].faults === min) r.classList.add('best');
      });
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'step') { if (playing) { playing = false; T.clear(); } step(); }
      else if (a === 'reset') reset();
      else if (a === 'all') { reset(); finish(); }
      else if (a === 'play') {
        if (playing) { playing = false; T.clear(); b.textContent = '▶ 播放'; return; }
        playing = true; b.textContent = '❚❚ 暂停';
        if (k >= REF.length - 1) reset();
        T.clear();
        const tick = () => {
          if (!playing) return;
          if (!step()) { playing = false; b.textContent = '▶ 播放'; finish(); return; }
          T.after(tick, 420);
        };
        tick();
      }
    });

    reset();
    return () => { T.clear(); sleepers.delete(T); };
  }

  /* =========================================================
     LAB 04 · TCP 拥塞窗口
     ========================================================= */
  const CWND = [1, 2, 4, 8, 16, 17, 18, 19, 20, 10, 11, 12, 13, 14, 15, 16, 1, 2, 4, 8, 9, 10, 11, 12];
  const PHASES = [
    { from: 0, to: 4, name: '慢开始', color: '--ds', desc: '每过一个 RTT，cwnd 翻倍（指数增长），直到达到 ssthresh。' },
    { from: 5, to: 8, name: '拥塞避免', color: '--co', desc: '每经过一个 RTT 只加 1（线性增长），谨慎探测带宽上限。' },
    { from: 9, to: 15, name: '快重传 / 快恢复', color: '--os', desc: '收到 3 个重复 ACK：ssthresh 减半，cwnd 降到新 ssthresh，直接进入拥塞避免。' },
    { from: 16, to: 23, name: '超时重传', color: '--net', desc: '超时：ssthresh 减半，cwnd 回到 1，重新慢开始 —— 代价比快恢复大得多。' }
  ];
  const EVENTS = [
    { i: 8, type: 'dup', label: '3 个重复 ACK' },
    { i: 15, type: 'timeout', label: '超时' }
  ];

  function mountTcp(el) {
    const T = timers();
    let k = 0, playing = false, raf = null;

    el.innerHTML = `
      <div class="lab-intro">
        <div>
          <h3>TCP 拥塞窗口曲线</h3>
          <p>把 cwnd 随 RTT 的变化画出来，四个阶段就清楚了：慢开始是指数、拥塞避免是线性、快恢复是减半、超时是从 1 重来。注意 ssthresh 每次都在"事故现场"减半。</p>
        </div>
        <div class="li-formula">ssthresh = cwnd / 2<br>cwnd &lt; ssthresh → 指数</div>
      </div>
      <div class="ctrl-row">
        <button class="ctrl" data-act="play">▶ 播放</button>
        <button class="ctrl" data-act="reset">重置</button>
        <div class="ctrl-sep"></div>
        <span class="ctrl-label" data-clock>RTT 0 · cwnd 1</span>
      </div>
      <div class="tcp-wrap">
        <canvas id="tcpCanvas" width="1440" height="700"></canvas>
        <div class="tcp-legend">
          ${PHASES.map((p, i) => `
            <div class="tl-item" data-ph="${i}">
              <span class="tl-dot" style="background:var(${p.color})"></span>
              <div><div class="tl-t">${p.name}</div><div class="tl-d">${p.desc}</div></div>
            </div>`).join('')}
        </div>
      </div>`;

    const cvs = el.querySelector('#tcpCanvas');
    const ctx = cvs.getContext('2d');
    const clockEl = el.querySelector('[data-clock]');
    const items = [...el.querySelectorAll('.tl-item')];

    const PAD = { l: 78, r: 30, t: 44, b: 82 };
    const W = 1440, H = 700;

    function draw() {
      if (!cvs.isConnected) return;
      const ink = cv('--ink'), muted = cv('--muted'), line = cv('--line'), faint = cv('--faint');
      ctx.clearRect(0, 0, W, H);
      const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
      const maxC = 22, N = CWND.length;
      const X = (i) => PAD.l + (i / (N - 1)) * iw;
      const Y = (v) => PAD.t + ih - (v / maxC) * ih;

      // 阶段色带
      PHASES.forEach((p) => {
        const x0 = X(p.from) - (p.from === 0 ? 0 : 13), x1 = X(p.to) + 13;
        ctx.save();
        ctx.globalAlpha = isDark() ? .10 : .07;
        ctx.fillStyle = cv(p.color);
        ctx.fillRect(x0, PAD.t, x1 - x0, ih);
        ctx.restore();

      });

      // 网格
      ctx.strokeStyle = line; ctx.lineWidth = 1.6;
      ctx.font = '28px ui-monospace, monospace';
      ctx.fillStyle = faint;
      for (let v = 0; v <= maxC; v += 4) {
        ctx.beginPath(); ctx.moveTo(PAD.l, Y(v)); ctx.lineTo(W - PAD.r, Y(v)); ctx.stroke();
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(String(v), PAD.l - 14, Y(v));
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i < N; i += 2) ctx.fillText(String(i + 1), X(i), H - PAD.b + 12);

      ctx.save();
      ctx.translate(26, PAD.t + ih / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.fillStyle = muted;
      ctx.font = '28px ui-monospace, monospace'; ctx.fillText('cwnd (MSS)', 0, 0);
      ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = muted;
      ctx.font = '28px ui-monospace, monospace';
      ctx.fillText('传输轮次 RTT', PAD.l + iw / 2, H - 10);

      // 幽灵曲线：整条走势的底稿
      ctx.save();
      ctx.globalAlpha = .2; ctx.strokeStyle = ink; ctx.lineWidth = 3;
      ctx.beginPath();
      CWND.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
      ctx.stroke(); ctx.restore();

      // ssthresh 参考线
      const ssth = [[0, 16], [9, 10], [16, 8]];
      ctx.setLineDash([5, 6]); ctx.lineWidth = 1.2;
      ssth.forEach(([st, v], idx) => {
        const e = idx === 0 ? 9 : (idx === 1 ? 16 : N - 1);
        ctx.save();
        ctx.globalAlpha = .5; ctx.strokeStyle = cv('--os');
        ctx.beginPath(); ctx.moveTo(X(st), Y(v)); ctx.lineTo(X(e), Y(v)); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = cv('--os'); ctx.font = '24px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('ssthresh ' + v, X(st) + 10, Y(v) - 5);
      });
      ctx.setLineDash([]);

      // 已走过的曲线
      const upto = Math.min(k, N - 1);
      for (let i = 0; i < upto; i++) {
        const ph = PHASES.find((p) => i >= p.from && i <= p.to) || PHASES[0];
        ctx.strokeStyle = cv(ph.color); ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(X(i), Y(CWND[i])); ctx.lineTo(X(i + 1), Y(CWND[i + 1])); ctx.stroke();
      }
      for (let i = 0; i <= upto; i++) {
        const ph = PHASES.find((p) => i >= p.from && i <= p.to) || PHASES[0];
        ctx.beginPath(); ctx.arc(X(i), Y(CWND[i]), 6.5, 0, Math.PI * 2);
        ctx.fillStyle = cv('--surface'); ctx.fill();
        ctx.strokeStyle = cv(ph.color); ctx.lineWidth = 3.4; ctx.stroke();
      }

      // 事件标注
      EVENTS.forEach((ev) => {
        if (ev.i > upto) return;
        const x = X(ev.i), y = Y(CWND[ev.i]);
        ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.strokeStyle = ink; ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = ink;
        ctx.font = '26px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(ev.label, x, y - 28);
      });

      // 当前游标
      if (upto >= 0) {
        const x = X(upto), y = Y(CWND[upto]);
        ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2);
        ctx.save(); ctx.globalAlpha = .14; ctx.fillStyle = ink; ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = ink; ctx.fill();
        clockEl.textContent = `RTT ${upto + 1} · cwnd ${CWND[upto]}`;
        const ph = PHASES.find((p) => upto >= p.from && upto <= p.to) || PHASES[0];
        items.forEach((it, i) => it.classList.toggle('on', PHASES[i] === ph));
      }
    }

    function tickLoop() {
      if (!playing) return;
      if (k >= CWND.length - 1) { playing = false; el.querySelector('[data-act="play"]').textContent = '▶ 播放'; return; }
      k++; draw();
      raf = setTimeout(tickLoop, 260);
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'play') {
        if (playing) { playing = false; clearTimeout(raf); b.textContent = '▶ 播放'; return; }
        if (k >= CWND.length - 1) k = 0;
        playing = true; b.textContent = '❚❚ 暂停'; tickLoop();
      } else {
        playing = false; clearTimeout(raf); k = 0;
        el.querySelector('[data-act="play"]').textContent = '▶ 播放';
        draw();
      }
    });

    T.after(draw, 60);
    k = 0; draw();
    return () => { T.clear(); clearTimeout(raf); sleepers.delete(T); };
  }

  /* =========================================================
     LAB 05 · 排序可视化
     ========================================================= */
  function makeSteps(algo, arr) {
    const a = arr.slice(), ops = [];
    const cmp = (i, j) => ops.push(['c', i, j]);
    const swap = (i, j) => { const t = a[i]; a[i] = a[j]; a[j] = t; ops.push(['s', i, j]); };

    if (algo === 'bubble') {
      for (let i = 0; i < a.length - 1; i++) {
        for (let j = 0; j < a.length - 1 - i; j++) {
          cmp(j, j + 1);
          if (a[j] > a[j + 1]) swap(j, j + 1);
        }
      }
    } else if (algo === 'insert') {
      for (let i = 1; i < a.length; i++) {
        let j = i;
        while (j > 0) { cmp(j - 1, j); if (a[j - 1] > a[j]) { swap(j - 1, j); j--; } else break; }
      }
    } else if (algo === 'quick') {
      const qs = (lo, hi) => {
        if (lo >= hi) return;
        const p = a[hi]; let i = lo;
        for (let j = lo; j < hi; j++) { cmp(j, hi); if (a[j] < p) { swap(i, j); i++; } }
        swap(i, hi);
        qs(lo, i - 1); qs(i + 1, hi);
      };
      qs(0, a.length - 1);
    } else if (algo === 'heap') {
      const sift = (n, i) => {
        let m = i, l = 2 * i + 1, r = 2 * i + 2;
        if (l < n) { cmp(l, m); if (a[l] > a[m]) m = l; }
        if (r < n) { cmp(r, m); if (a[r] > a[m]) m = r; }
        if (m !== i) { swap(i, m); sift(n, m); }
      };
      for (let i = Math.floor(a.length / 2) - 1; i >= 0; i--) sift(a.length, i);
      for (let i = a.length - 1; i > 0; i--) { swap(0, i); sift(i, 0); }
    }
    return { ops, sorted: a };
  }

  function mountSort(el) {
    const T = timers();
    const N = 24;
    const newData = () => {
      const a = [...Array(N).keys()].map((i) => 14 + i * 3.3);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    };
    let base = newData();
    let algo = 'quick', ops = [], arr = [], k = 0, timer = null, speed = 26;
    const ALGOS = [{ id: 'bubble', n: '冒泡' }, { id: 'insert', n: '插入' }, { id: 'quick', n: '快排' }, { id: 'heap', n: '堆排' }];

    el.innerHTML = `
      <div class="lab-intro">
        <div>
          <h3>排序算法可视化</h3>
          <p>橙色是"正在比较的两个元素"，交换会立刻反映在高度上。看快排的枢轴如何把区间切成两半，看堆排如何先建出一棵大根堆。</p>
        </div>
        <div class="li-formula">快排平均 O(n log n)<br>最坏 O(n²)</div>
      </div>
      <div class="ctrl-row">
        <span class="ctrl-label">算法</span>
        ${ALGOS.map((a) => `<button class="ctrl ${a.id === 'quick' ? 'on' : ''}" data-a="${a.id}">${a.n}</button>`).join('')}
        <div class="ctrl-sep"></div>
        <button class="ctrl" data-act="play">▶ 播放</button>
        <button class="ctrl" data-act="new">换一组数据</button>
        <div class="ctrl-sep"></div>
        <span class="ctrl-label">速度</span>
        <button class="ctrl" data-sp="60">慢</button>
        <button class="ctrl on" data-sp="26">中</button>
        <button class="ctrl" data-sp="8">快</button>
      </div>
      <div class="sort-box" data-box></div>
      <div class="sort-meta">
        <span>比较 <b data-m="cmp">0</b> 次</span>
        <span>交换 <b data-m="swp">0</b> 次</span>
        <span>规模 n = ${N}</span>
        <span data-m="state">就绪</span>
      </div>`;

    const box = el.querySelector('[data-box]');
    const cmpEl = el.querySelector('[data-m="cmp"]');
    const swpEl = el.querySelector('[data-m="swp"]');
    const stEl = el.querySelector('[data-m="state"]');

    function render() {
      box.innerHTML = arr.map((v) => `<div class="sort-bar" style="height:${v}%"></div>`).join('');
    }
    function paint() {
      [...box.children].forEach((b, i) => { b.style.height = arr[i] + '%'; });
    }
    function build() {
      clearInterval(timer); timer = null;
      arr = base.slice();
      const r = makeSteps(algo, base);
      ops = r.ops; k = 0;
      cmpEl.textContent = 0; swpEl.textContent = 0;
      stEl.textContent = '就绪 · 共 ' + ops.length + ' 步';
      el.querySelector('[data-act="play"]').textContent = '▶ 播放';
      render();
    }

    function stepOnce() {
      if (k >= ops.length) return false;
      const [t, i, j] = ops[k++];
      const bars = box.children;
      [...bars].forEach((b) => b.classList.remove('cmp'));
      if (t === 'c') {
        bars[i].classList.add('cmp'); bars[j].classList.add('cmp');
        cmpEl.textContent = +cmpEl.textContent + 1;
      } else {
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        paint(); swpEl.textContent = +swpEl.textContent + 1;
      }
      if (k >= ops.length) { [...bars].forEach((b) => b.classList.add('done')); stEl.textContent = '完成'; return false; }
      return true;
    }

    function play() {
      if (timer) { clearInterval(timer); timer = null; el.querySelector('[data-act="play"]').textContent = '▶ 播放'; return; }
      if (k >= ops.length) build();
      el.querySelector('[data-act="play"]').textContent = '❚❚ 暂停';
      timer = setInterval(() => {
        if (!box.isConnected) { clearInterval(timer); timer = null; return; }
        if (!stepOnce()) { clearInterval(timer); timer = null; el.querySelector('[data-act="play"]').textContent = '▶ 播放'; }
      }, speed);
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a) {
        el.querySelectorAll('[data-a]').forEach((x) => x.classList.remove('on'));
        b.classList.add('on'); algo = b.dataset.a; build();
      } else if (b.dataset.sp) {
        el.querySelectorAll('[data-sp]').forEach((x) => x.classList.remove('on'));
        b.classList.add('on'); speed = +b.dataset.sp;
        if (timer) { clearInterval(timer); timer = setInterval(() => { if (!stepOnce()) { clearInterval(timer); timer = null; } }, speed); }
      } else if (b.dataset.act === 'play') play();
      else { base = newData(); build(); }
    });

    build();
    return () => { clearInterval(timer); T.clear(); sleepers.delete(T); };
  }

  /* =========================================================
     LAB 06 · 流水线时空图
     ========================================================= */
  function mountPipe(el) {
    const T = timers();
    let forward = false, cyc = 0, timer = null;
    const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
    const TOTAL = 11;

    function schedule() {
      const rows = [];
      if (!forward) {
        rows.push([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]]);
        rows.push([[2, 0], [3, 1], [4, -2], [5, 2], [6, 3], [7, 4]]);
        rows.push([[3, 0], [4, -1], [5, 1], [6, 2], [7, 3], [8, 4]]);
        rows.push([[5, 0], [6, 1], [7, 2], [8, 3], [9, 4]]);
        rows.push([[6, 0], [7, 1], [8, 2], [9, 3], [10, 4]]);
      } else {
        rows.push([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]]);
        rows.push([[2, 0], [3, 1], [4, 2], [5, 3], [6, 4]]);
        rows.push([[3, 0], [4, 1], [5, 2], [6, 3], [7, 4]]);
        rows.push([[4, 0], [5, 1], [6, 2], [7, 3], [8, 4]]);
        rows.push([[5, 0], [6, 1], [7, 2], [8, 3], [9, 4]]);
      }
      return rows;
    }

    el.innerHTML = `
      <div class="lab-intro">
        <div>
          <h3>指令流水线时空图</h3>
          <p>五段流水线，五条指令。<b>数据相关</b>让第 2 条指令必须等第 1 条算出结果：不开转发就要停顿一拍，形成气泡（红色斜纹）；开转发则没有气泡，但总周期仍受限于最慢的一段。</p>
        </div>
        <div class="li-formula">T = (k + n − 1)·Δt<br>S = nk / (k + n − 1)</div>
      </div>
      <div class="ctrl-row">
        <button class="ctrl" data-act="play">▶ 播放</button>
        <button class="ctrl" data-act="reset">重置</button>
        <div class="ctrl-sep"></div>
        <button class="ctrl" data-act="fwd">开启数据转发</button>
        <div class="ctrl-sep"></div>
        <span class="ctrl-label" data-info>时钟 0 · 总周期 —</span>
      </div>
      <div class="pipe-grid">
        <div class="pipe-head">
          <span>指令 / 时钟</span>
          ${Array.from({ length: TOTAL }, (_, i) => `<span>${i + 1}</span>`).join('')}
        </div>
        <div data-rows></div>
      </div>`;

    const rowsBox = el.querySelector('[data-rows]');
    const info = el.querySelector('[data-info]');
    const cmap = ['var(--co)', 'var(--ds)', 'var(--os)', 'var(--net)', 'var(--faint)'];

    function render() {
      const sch = schedule();
      rowsBox.innerHTML = sch.map((r, ri) => `
        <div class="pipe-row">
          <div class="pr-name" title="I${ri + 1}">I${ri + 1}${ri === 1 ? ' ←I1' : ''}</div>
          ${Array.from({ length: TOTAL }, (_, c) => {
            const cell = r.find((x) => x[0] === c + 1);
            if (!cell) return '<div class="pipe-cell"></div>';
            const st = cell[1];
            if (st < 0) return `<div class="pipe-cell bubble" data-c="${c}" title="气泡（停顿）">${st === -1 ? 'stall' : '·'}</div>`;
            return `<div class="pipe-cell fill" data-c="${c}" style="background:${cmap[st]}">${STAGES[st]}</div>`;
          }).join('')}
        </div>`).join('');
      const last = Math.max(...sch.flat().map((x) => x[0]));
      info.textContent = `时钟 0 · 总周期 ${last}`;
    }

    function reset() { clearInterval(timer); timer = null; cyc = 0; render(); el.querySelector('[data-act="play"]').textContent = '▶ 播放'; }

    function play() {
      if (timer) { clearInterval(timer); timer = null; el.querySelector('[data-act="play"]').textContent = '▶ 播放'; return; }
      if (cyc >= TOTAL) cyc = 0;
      el.querySelector('[data-act="play"]').textContent = '❚❚ 暂停';
      timer = setInterval(() => {
        if (!rowsBox.isConnected) { clearInterval(timer); timer = null; return; }
        cyc++;
        rowsBox.querySelectorAll('.pipe-cell.now').forEach((c) => c.classList.remove('now'));
        rowsBox.querySelectorAll(`[data-c="${cyc - 1}"]`).forEach((c) => c.classList.add('now'));
        info.textContent = `时钟 ${cyc} · 正在第 ${cyc} 拍`;
        if (cyc >= TOTAL) { clearInterval(timer); timer = null; el.querySelector('[data-act="play"]').textContent = '▶ 播放'; info.textContent = `时钟 ${TOTAL} · 完成`; }
      }, 420);
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'play') play();
      else if (b.dataset.act === 'reset') reset();
      else if (b.dataset.act === 'fwd') {
        forward = !forward;
        b.textContent = forward ? '关闭数据转发' : '开启数据转发';
        b.classList.toggle('on', forward);
        reset();
      }
    });

    render();
    return () => { clearInterval(timer); T.clear(); sleepers.delete(T); };
  }

  window.Labs = {
    journey: mountJourney,
    translate: mountTranslate,
    replace: mountReplace,
    tcp: mountTcp,
    sort: mountSort,
    pipe: mountPipe,
    cleanupAll() { sleepers.forEach((s) => s.clear()); sleepers.clear(); }
  };
})();
