/* =========================================================
   408 知识星云 · 3D 引擎
   Canvas 2D + 手写透视投影：无依赖、可拖拽旋转、可拾取
   层级：学科(4) → 章节(25) → 考点(110)
   ========================================================= */

(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const ANG = { ds: Math.PI * 0.75, co: Math.PI * 0.25, os: Math.PI * 1.25, net: Math.PI * 1.75 };
  const FOCAL = 900;
  const CAMZ = 900;
  const R = 345;
  const GOLDEN = 2.399963;

  const cvs = () => document.getElementById('galaxy');
  const themeDark = () => true; // 星云舞台恒定深空配色，与页面主题解耦

  let canvas, ctx, dpr = 1, W = 0, H = 0, ZF = 1.6;
  let nodes = [], links = [], byId = new Map();
  const anchors = {};
  const spr = { ds: 1, co: 1, os: 1, net: 1 };
  let raf = null, running = false, visible = true;
  let sprites = {};
  let onNode = null, onHover = null;

  const S = {
    yaw: -0.42, pitch: 0.30, zoom: 1.12,
    tYaw: null, tPitch: null,
    focus: null, hover: null, drag: false,
    auto: true, idle: 0, moved: 0,
    px: 0, py: 0,
    pulse: null, pulseT: 0
  };

  /* ---------------- 颜色 ---------------- */
  function cssHex(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function hexRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbOf(sid) { return hexRgb(cssHex('--' + sid)); }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function makeSprite(c) {
    const size = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, rgba(c, 0.85));
    gr.addColorStop(0.18, rgba(c, 0.45));
    gr.addColorStop(0.42, rgba(c, 0.14));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return cv;
  }

  function buildSprites() {
    sprites = {};
    ['ds', 'co', 'os', 'net'].forEach((s) => { sprites[s] = makeSprite(rgbOf(s)); });
  }

  /* ---------------- 布局 ---------------- */
  function fib(i, n, radius, cx, cy, cz, flat) {
    const t = (i + 0.5) / n;
    const phi = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * t)));
    const th = i * GOLDEN;
    return {
      x: cx + radius * Math.sin(phi) * Math.cos(th),
      y: cy + radius * Math.cos(phi) * (flat ? 0.55 : 0.9),
      z: cz + radius * Math.sin(phi) * Math.sin(th)
    };
  }

  function resolve(ref) {
    const at = ATLAS.find((a) => a.id === ref.s);
    if (!at) return null;
    for (let ci = 0; ci < at.chapters.length; ci++) {
      const ch = at.chapters[ci];
      for (let pi = 0; pi < ch.points.length; pi++) {
        if (ch.points[pi].t === ref.t) return `P:${ref.s}:${ci}:${pi}`;
      }
    }
    // 容错：包含匹配
    for (let ci = 0; ci < at.chapters.length; ci++) {
      const ch = at.chapters[ci];
      for (let pi = 0; pi < ch.points.length; pi++) {
        if (ch.points[pi].t.includes(ref.t) || ref.t.includes(ch.points[pi].t)) return `P:${ref.s}:${ci}:${pi}`;
      }
    }
    return null;
  }

  function build() {
    nodes = []; links = []; byId = new Map();
    const add = (n) => { n.idx = nodes.length; nodes.push(n); byId.set(n.id, n); return n.idx; };

    ATLAS.forEach((at, si) => {
      const sid = at.id;
      const a = ANG[sid];
      const ax = Math.cos(a) * R, az = Math.sin(a) * R, ay = (si % 2 ? 46 : -34);
      anchors[sid] = { x: ax, y: ay, z: az };
      const subjIdx = add({
        id: 'S:' + sid, kind: 'subject', s: sid, label: SUBJECTS.find((x) => x.id === sid).name,
        x: ax, y: ay, z: az, r: 16, short: SUBJECTS.find((x) => x.id === sid).name.slice(0, 2)
      });

      at.chapters.forEach((ch, ci) => {
        const n = ch.points.length;
        const cpos = fib(ci, at.chapters.length, 168, ax, ay, az, false);
        const cIdx = add({
          id: `C:${sid}:${ci}`, kind: 'chapter', s: sid, ci, label: ch.title,
          x: cpos.x, y: cpos.y, z: cpos.z, r: 7
        });
        links.push({ kind: 'spoke', a: subjIdx, b: cIdx });

        ch.points.forEach((p, pi) => {
          const ppos = fib(pi, n, 60 + (ci % 3) * 9, cpos.x, cpos.y, cpos.z, true);
          const pIdx = add({
            id: `P:${sid}:${ci}:${pi}`, kind: 'point', s: sid, ci, pi, label: p.t,
            x: ppos.x, y: ppos.y, z: ppos.z, r: 3.6, tag: p.tag
          });
          links.push({ kind: 'spoke', a: cIdx, b: pIdx });
        });
      });
    });

    nodes.forEach((n) => {
      if (n.kind === 'subject') { n.bx = 0; n.by = 0; n.bz = 0; return; }
      const a = anchors[n.s];
      n.bx = n.x - a.x; n.by = n.y - a.y; n.bz = n.z - a.z;
    });

    STAR.links.forEach((l) => {
      const a = resolve(l.a), b = resolve(l.b);
      if (a && b && byId.has(a) && byId.has(b)) {
        links.push({ kind: 'cross', id: l.id, a: byId.get(a).idx, b: byId.get(b).idx, title: l.title });
      }
    });
  }

  /* ---------------- 投影 ---------------- */
  let cosY = 1, sinY = 0, cosP = 1, sinP = 0;

  function project() {
    const cx = W / 2, cy = H / 2;
    const zf = ZF;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const x1 = n.x * cosY - n.z * sinY;
      const z1 = n.x * sinY + n.z * cosY;
      const y1 = n.y * cosP - z1 * sinP;
      const z2 = n.y * sinP + z1 * cosP;
      const s = FOCAL / Math.max(FOCAL + z2 + CAMZ, 120);
      n._x = cx + x1 * s * zf;
      n._y = cy + y1 * s * zf;
      n._s = s;
      n._z = z2;
      n._r2 = n.r * s * zf;
      n._near = Math.max(0, Math.min(1, 1 - (z2 + 460) / 920));
    }
  }

  /* ---------------- 绘制 ---------------- */
  function drawBg() {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.46, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(30,38,30,0.96)');
    g.addColorStop(0.5, 'rgba(19,24,18,0.98)');
    g.addColorStop(1, 'rgba(13,16,12,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 远景星尘（随视角轻微视差）
    ctx.save();
    for (let i = 0; i < 90; i++) {
      const t = i * 0.618;
      const x = ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) % 1 * W;
      const y = ((Math.sin(t * 78.233) * 12345.6789) % 1 + 1) % 1 * H;
      const px = x + Math.sin(S.yaw + i) * 14;
      const py = y + Math.cos(S.pitch + i * 0.7) * 8;
      ctx.globalAlpha = 0.04 + 0.10 * (((i * 37) % 10) / 10);
      ctx.fillStyle = 'rgb(237,234,224)';
      ctx.beginPath();
      ctx.arc(px, py, 0.7 + ((i % 3) * 0.35), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function linkAlpha(n, boost) {
    let a = 0.06 + n._near * 0.2;
    if (S.focus) {
      const on = (nodes[arguments[2]] && nodes[arguments[2]].s === S.focus) || (nodes[arguments[3]] && nodes[arguments[3]].s === S.focus);
      a *= on ? 1 : 0.18;
    }
    return a * (boost || 1);
  }

  function drawLinks() {
    const order = links
      .map((l) => ({ l, z: (nodes[l.a]._z + nodes[l.b]._z) / 2 }))
      .sort((p, q) => q.z - p.z);

    ctx.lineCap = 'round';
    for (const { l } of order) {
      const A = nodes[l.a], B = nodes[l.b];
      if (l.kind === 'spoke') {
        const dim = S.focus && A.s !== S.focus && B.s !== S.focus;
        ctx.globalAlpha = (0.05 + Math.min(A._near, B._near) * 0.11) * (dim ? 0.2 : 1);
        ctx.strokeStyle = '#EDEAE0';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(A._x, A._y);
        ctx.lineTo(B._x, B._y);
        ctx.stroke();
        continue;
      }
      // 跨科关联：向中心弯折的弧线
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, mz = (A.z + B.z) / 2;
      const cxp = mx * 0.74, cyp = my * 0.74, czp = mz * 0.74;
      const rgb = rgbOf(A.s);
      const dim = S.focus && A.s !== S.focus && B.s !== S.focus;
      const active = S.hoverLink === l.id;
      const near = (A._near + B._near) / 2;

      ctx.globalAlpha = (0.16 + near * 0.42) * (dim ? 0.14 : 1) * (active ? 1.8 : 1);
      ctx.strokeStyle = active ? '#FFFFFF' : rgba(rgb, 0.9);
      ctx.lineWidth = active ? 2.1 : 1.15 + near * 0.5;

      const STEPS = 18;
      ctx.beginPath();
      for (let k = 0; k <= STEPS; k++) {
        const t = k / STEPS, u = 1 - t;
        const x = u * u * A.x + 2 * u * t * cxp + t * t * B.x;
        const y = u * u * A.y + 2 * u * t * cyp + t * t * B.y;
        const z = u * u * A.z + 2 * u * t * czp + t * t * B.z;
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y1 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;
        const sc = FOCAL / Math.max(FOCAL + z2 + CAMZ, 120);
        const px = W / 2 + x1 * sc * ZF, py = H / 2 + y1 * sc * ZF;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function labelBox(text, x, y, size, align) {
    const w = text.length * size * 0.92;
    const left = align === 'center' ? x - w / 2 : x;
    return { l: left, r: left + w, t: y, b: y + size * 1.25 };
  }
  function hit(boxes, b) {
    return boxes.some((o) => !(b.r < o.l - 2 || b.l > o.r + 2 || b.b < o.t - 1 || b.t > o.b + 1));
  }

  function drawNodes() {
    const ink = [237, 234, 224];
    const boxes = [];
    const order = nodes.slice().sort((a, b) => b._z - a._z);

    // 辉光
    const light = !themeDark();
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    for (const n of order) {
      const r = Math.max(0.6, n._r2);
      const dim = S.focus && n.s !== S.focus;
      if (dim && n.kind !== 'subject') continue;
      const sp = sprites[n.s];
      if (dim) {
        // 被弱化的学科只留一点微光，避免大块模糊圆斑
        const size = r * 3.2;
        ctx.globalAlpha = 0.10;
        ctx.drawImage(sp, n._x - size / 2, n._y - size / 2, size, size);
        continue;
      }
      ctx.globalAlpha = (light ? 0.30 + n._near * 0.34 : 0.24 + n._near * 0.58) * (n.kind === 'point' ? 0.85 : 1);
      const size = r * (n.kind === 'subject' ? 11 : n.kind === 'chapter' ? 8 : 5.5);
      ctx.drawImage(sp, n._x - size / 2, n._y - size / 2, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 实心核
    for (const n of order) {
      const dim = S.focus && n.s !== S.focus;
      const c = rgbOf(n.s);
      const a = (0.55 + n._near * 0.45) * (dim ? 0.16 : 1);
      ctx.globalAlpha = a;
      ctx.beginPath();
      const rr = dim ? Math.max(0.9, n._r2 * 0.34) : Math.max(0.8, n._r2 * (n.kind === 'point' ? 0.7 : 0.85));
      ctx.arc(n._x, n._y, rr, 0, TAU);
      ctx.fillStyle = n.kind === 'point' ? rgba(c, 0.95) : '#fff';
      if (n.kind !== 'point') {
        ctx.fill();
        ctx.strokeStyle = rgba(c, 0.95);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else {
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // 标签：学科 → 章节 → 悬停点
    const put = (n, size, alpha, weight) => {
      const half = n.label.length * size * 0.47;
      const lx = Math.max(8 + half, Math.min(W - 8 - half, n._x));
      const ly = n._y + n._r2 + 7;
      const box = labelBox(n.label, lx, ly, size, 'center');
      if (n.kind !== 'subject' && hit(boxes, box)) return;
      boxes.push(box);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
      ctx.font = `${weight || 400} ${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(n.label, lx, ly);
      ctx.globalAlpha = 1;
    };

    order.filter((n) => n.kind === 'subject').forEach((n) => {
      const dim = S.focus && n.s !== S.focus;
      put(n, 13.5 * Math.min(1.25, Math.max(0.85, n._s * 1.5)), dim ? 0.35 : 0.92, 600);
    });

    if (S.zoom > 0.78 || S.focus) {
      order
        .filter((n) => n.kind === 'chapter' && (!S.focus || n.s === S.focus))
        .sort((a, b) => b._near - a._near)
        .forEach((n) => {
          if (n._near < 0.3 && !S.focus) return;
          put(n, 10, 0.22 + n._near * 0.55, 400);
        });
    }

    if (S.hover && S.hover.kind !== 'subject') {
      const n = S.hover;
      const box = labelBox(n.label, n._x, n._y - n._r2 - 26, 12, 'center');
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(18,22,17,0.94)';
      const w = box.r - box.l + 18;
      roundRect(box.l - 9, box.t - 4, w, 22, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(237,234,224,.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
      ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(n.label, n._x, box.t + 2);
      ctx.globalAlpha = 1;
    }

    // 定位脉冲
    if (S.pulse) {
      const n = nodes.find((x) => x.id === S.pulse);
      if (n && S.pulseT > 0) {
        const t = 1 - S.pulseT / 90;
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.strokeStyle = rgba(rgbOf(n.s), 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(n._x, n._y, n._r2 + 4 + t * 44, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------- 主循环 ---------------- */
  function render() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ZF = S.zoom * Math.min(W / 900, H / 470) * 1.72;
    cosY = Math.cos(S.yaw); sinY = Math.sin(S.yaw);
    cosP = Math.cos(S.pitch); sinP = Math.sin(S.pitch);
    project();
    drawBg();
    drawLinks();
    drawNodes();
  }

  function frame() {
    if (!running) return;
    if (!S.drag) {
      if (S.tYaw !== null) {
        let d = S.tYaw - S.yaw;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        S.yaw += d * 0.08;
        S.pitch += (S.tPitch - S.pitch) * 0.08;
        if (Math.abs(d) < 0.004) { S.yaw = S.tYaw; S.pitch = S.tPitch; S.tYaw = null; }
      } else if (S.auto && !S.hover) {
        S.yaw += 0.0016;
      }
    }
    if (S.pulseT > 0) S.pulseT--;
    let spread = false;
    ['ds', 'co', 'os', 'net'].forEach((sid) => {
      const target = S.focus === sid ? 1.34 : 1;
      if (Math.abs(spr[sid] - target) > 0.002) {
        spr[sid] += (target - spr[sid]) * 0.075;
        spread = true;
      } else spr[sid] = target;
    });
    if (spread) {
      for (const n of nodes) {
        if (n.kind === 'subject') continue;
        const a = anchors[n.s], k = spr[n.s];
        n.x = a.x + n.bx * k;
        n.y = a.y + n.by * k;
        n.z = a.z + n.bz * k;
      }
    }
    render();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
  }

  /* ---------------- 交互 ---------------- */
  function pick(mx, my) {
    let best = null, bs = 1e9;
    for (const n of nodes) {
      const d = Math.hypot(n._x - mx, n._y - my);
      const r = Math.max(9, n._r2 * 2.2);
      if (d < r) {
        const score = d - n._near * 5 - (n.kind === 'point' ? 0 : 3);
        if (score < bs) { bs = score; best = n; }
      }
    }
    return best;
  }

  function bind() {
    canvas.addEventListener('pointerdown', (e) => {
      S.drag = true;
      S.moved = 0;
      S.px = e.clientX; S.py = e.clientY;
      S.tYaw = null;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (S.drag) {
        const dx = e.clientX - S.px, dy = e.clientY - S.py;
        S.moved += Math.abs(dx) + Math.abs(dy);
        S.px = e.clientX; S.py = e.clientY;
        S.yaw += dx * 0.0062;
        S.pitch = Math.max(-1.15, Math.min(1.15, S.pitch + dy * 0.0045));
        return;
      }
      const n = pick(mx, my);
      if (n !== S.hover) {
        S.hover = n;
        canvas.style.cursor = n ? 'pointer' : 'grab';
        if (onHover) onHover(n);
      }
      S.hoverLink = null;
      for (const l of links) {
        if (l.kind !== 'cross') continue;
        const A = nodes[l.a], B = nodes[l.b];
        if (Math.abs(mx - (A._x + B._x) / 2) < 46 && Math.abs(my - (A._y + B._y) / 2) < 34) { S.hoverLink = l.id; break; }
      }
    });

    const end = (e) => {
      if (!S.drag) return;
      S.drag = false;
      canvas.style.cursor = S.hover ? 'pointer' : 'grab';
      if (S.moved < 7) {
        const rect = canvas.getBoundingClientRect();
        const n = pick(e.clientX - rect.left, e.clientY - rect.top);
        if (n && onNode) onNode(n);
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', () => { S.drag = false; });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.deltaY > 0 ? 0.9 : 1.11;
      S.zoom = Math.max(0.62, Math.min(2.6, S.zoom * k));
    }, { passive: false });

    window.addEventListener('resize', resize);
  }

  /* ---------------- 尺寸 ---------------- */
  function resize() {
    if (!canvas) return;
    const box = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(300, box.width);
    H = Math.max(320, box.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    if (!running) render();
  }

  /* ---------------- API ---------------- */
  window.Galaxy = {
    init(opts) {
      canvas = document.getElementById('galaxy');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      onNode = opts && opts.onNode;
      onHover = opts && opts.onHover;
      build();
      buildSprites();
      resize();
      bind();
      start();
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) start(); else stop(); });
      }, { threshold: 0.05 });
      io.observe(canvas);
      window.addEventListener('resize', () => setTimeout(resize, 80));
    },
    focus(sid) {
      S.focus = sid;
      S.auto = !sid;
      if (!sid) { S.tYaw = -0.42; S.tPitch = 0.30; S.zoom = 1.12; return; }
      const a = ANG[sid];
      S.tYaw = -Math.PI / 2 - a;
      S.tPitch = 0.22;
      S.zoom = 1.18;
    },
    zoom(d) { S.zoom = Math.max(0.62, Math.min(2.6, S.zoom + d)); },
    spin(on) { S.auto = on; },
    setAuto(on) { S.auto = on; },
    locate(nodeId) {
      const n = byId.get(nodeId);
      if (!n) return;
      S.focus = n.s;
      S.auto = false;
      S.tYaw = -Math.PI / 2 - ANG[n.s] + 0.18;
      S.tPitch = 0.18;
      S.zoom = 1.55;
      S.pulse = nodeId;
      S.pulseT = 90;
    },
    refresh() { buildSprites(); },
    screenPos(sid) {
      const n = byId.get('S:' + sid);
      if (!n) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + n._x, y: r.top + n._y, r: n._r2 };
    },
    stats() { return { nodes: nodes.length, chapters: nodes.filter((n) => n.kind === 'chapter').length, links: links.filter((l) => l.kind === 'cross').length }; }
  };
})();
