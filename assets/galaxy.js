/* =========================================================
   408 知识星云 · 3D 引擎 v2
   Canvas 2D + 手写透视投影：无依赖
   空间结构 = 目录结构：
     学科核（黄道环 4 座）→ 章节轨道（每科独立倾角）→ 考点（章节小环，聚焦时展开）
   标签策略：默认只画 4 个学科名；聚焦后画该科章节名；考点名只在悬停时出现
   ========================================================= */

(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const FOCAL = 900;
  const CAMZ = 1050;
  const R_SUB = 300;   // 学科环半径
  const R_CH = 132;    // 章节轨道半径
  const R_PT = 46;     // 考点小环半径

  const SIDS = ['ds', 'co', 'os', 'net'];
  const cvs = () => document.getElementById('galaxy');

  let canvas, ctx, dpr = 1, W = 0, H = 0, ZF = 1;
  let nodes = [], links = [], byId = new Map();
  let crossLinks = [];
  const anchors = {};
  const basis = {};        // 每科的章节轨道基向量
  let raf = null, running = false;
  let sprites = {};
  let onNode = null, onHover = null, onFocus = null;
  let lastFocus = null;

  const S = {
    yaw: -0.62, pitch: 0.52, zoom: 1,
    tYaw: null, tPitch: null, tZoom: null,
    focus: null, hover: null, drag: false,
    auto: true, px: 0, py: 0, moved: 0,
    pulse: null, pulseT: 0, hoverLink: null
  };

  /* ---------------- 颜色 ---------------- */
  const cssHex = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function hexRgb(h) {
    h = (h || '').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6) return [140, 140, 140];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgbOf = (sid) => hexRgb(cssHex('--' + sid));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const INK = [237, 234, 224];

  function makeSprite(c) {
    const size = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, rgba(c, 0.9));
    gr.addColorStop(0.16, rgba(c, 0.5));
    gr.addColorStop(0.4, rgba(c, 0.15));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return cv;
  }

  function buildSprites() {
    sprites = {};
    SIDS.forEach((s) => { sprites[s] = makeSprite(rgbOf(s)); });
  }

  /* ---------------- 布局 ---------------- */
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function resolve(ref) {
    const at = ATLAS.find((a) => a.id === ref.s);
    if (!at) return null;
    for (let ci = 0; ci < at.chapters.length; ci++) {
      const pts = at.chapters[ci].points;
      for (let pi = 0; pi < pts.length; pi++) {
        if (pts[pi].t === ref.t) return `P:${ref.s}:${ci}:${pi}`;
      }
    }
    for (let ci = 0; ci < at.chapters.length; ci++) {
      const pts = at.chapters[ci].points;
      for (let pi = 0; pi < pts.length; pi++) {
        if (pts[pi].t.includes(ref.t) || ref.t.includes(pts[pi].t)) return `P:${ref.s}:${ci}:${pi}`;
      }
    }
    return null;
  }

  function build() {
    nodes = []; links = []; byId = new Map(); crossLinks = [];
    const add = (n) => { n.idx = nodes.length; nodes.push(n); byId.set(n.id, n); return n.idx; };

    ATLAS.forEach((at, si) => {
      const sid = at.id;
      // 学科核：稳定地排成一圈（俯视四个象限）
      const th = si * (TAU / 4) + 0.42;
      const cx = Math.cos(th) * R_SUB;
      const cz = Math.sin(th) * R_SUB;
      const cy = 0;
      anchors[sid] = { x: cx, y: cy, z: cz, th };
      basis[sid] = { e1: [1, 0, 0], e2: [0, 0, 1] };

      const info = SUBJECTS.find((x) => x.id === sid);
      const subjIdx = add({
        id: 'S:' + sid, kind: 'subject', s: sid, label: info.name, short: info.name.slice(0, 2),
        x: cx, y: cy, z: cz, r: 15, radial: [Math.cos(th), 0, Math.sin(th)]
      });

      at.chapters.forEach((ch, ci) => {
        const phi = (ci / at.chapters.length) * TAU - Math.PI / 2;
        const px = cx + R_CH * Math.cos(phi);
        const py = (ci % 2 ? 7 : -7);
        const pz = cz + R_CH * Math.sin(phi);

        const cIdx = add({
          id: `C:${sid}:${ci}`, kind: 'chapter', s: sid, ci, label: ch.title,
          x: px, y: py, z: pz, r: 5.2, phi
        });
        links.push({ kind: 'orbit', a: subjIdx, b: cIdx });

        // 考点：章节上方的小环，略高于章节平面，避免与章节点重叠
        ch.points.forEach((p, pi) => {
          const a2 = (pi / ch.points.length) * TAU + ci * 0.7;
          const rr = R_PT + (pi % 2 ? 5 : 0);
          const qx = px + rr * Math.cos(a2);
          const qy = py + 17 + (pi % 2 ? 3 : 0);
          const qz = pz + rr * Math.sin(a2);
          const pIdx = add({
            id: `P:${sid}:${ci}:${pi}`, kind: 'point', s: sid, ci, pi, label: p.t,
            x: qx, y: qy, z: qz, r: 2.7, tag: p.tag
          });
          links.push({ kind: 'spoke', a: cIdx, b: pIdx });
        });
      });
    });

    // 跨科关联
    STAR.links.forEach((l) => {
      const a = resolve(l.a), b = resolve(l.b);
      if (a && b && byId.has(a) && byId.has(b) && a !== b) {
        const link = { kind: 'cross', id: l.id, a: byId.get(a).idx, b: byId.get(b).idx, title: l.title };
        links.push(link); crossLinks.push(link);
      }
    });
  }

  /* ---------------- 投影 ---------------- */
  let cosY = 1, sinY = 0, cosP = 1, sinP = 0;
  let OX = 0, OY = 0;          // 聚焦时的相机平移（像素）
  let tOX = 0, tOY = 0;

  function projectRaw(x, y, z) {
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y1 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;
    const s = FOCAL / Math.max(FOCAL + z2 + CAMZ, 140);
    return { x: W / 2 + x1 * s * ZF, y: H / 2 + y1 * s * ZF, s, z: z2 };
  }

  function projectPoint(x, y, z) {
    const p = projectRaw(x, y, z);
    p.x += OX; p.y += OY;
    return p;
  }

  /* 聚焦时把该学科平移到画面中心，避免环被裁切 */
  function updatePan(immediate) {
    if (S.focus) {
      const a = anchors[S.focus];
      const p = projectRaw(a.x, a.y, a.z);
      tOX = W / 2 - p.x;
      tOY = H / 2 - p.y;
    } else { tOX = 0; tOY = 0; }
    if (immediate || !running) { OX = tOX; OY = tOY; }
    else { OX += (tOX - OX) * 0.09; OY += (tOY - OY) * 0.09; }
  }

  function project() {
    updatePan(false);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const p = projectPoint(n.x, n.y, n.z);
      n._x = p.x; n._y = p.y; n._s = p.s; n._z = p.z;
      n._r2 = Math.max(0.7, n.r * p.s * ZF);
      // 近处亮、远处淡（深度雾），并把范围压到 0.15~1
      n._near = Math.max(0, Math.min(1, 1 - (p.z + 380) / 760));
    }
  }

  /* ---------------- 可见性策略 ---------------- */
  function pointsVisible(sid) {
    return S.focus ? S.focus === sid : S.zoom >= 1.45;
  }
  function chaptersLabeled(sid) {
    return S.focus === sid || S.zoom >= 1.75;
  }

  /* ---------------- 绘制 ---------------- */
  function drawBg() {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.44, 0, W * 0.5, H * 0.44, Math.max(W, H) * 0.8);
    g.addColorStop(0, 'rgba(31,39,31,0.97)');
    g.addColorStop(0.52, 'rgba(18,23,17,0.99)');
    g.addColorStop(1, 'rgba(11,14,10,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 远景星尘：固定种子，随视角轻微视差
    ctx.save();
    for (let i = 0; i < 80; i++) {
      const t = i * 0.618;
      const x = (((Math.sin(t * 12.9898) * 43758.5453) % 1) + 1) % 1 * W;
      const y = (((Math.sin(t * 78.233) * 12345.6789) % 1) + 1) % 1 * H;
      const px = x + Math.sin(S.yaw + i) * 12;
      const py = y + Math.cos(S.pitch + i * 0.7) * 7;
      ctx.globalAlpha = 0.04 + 0.09 * (((i * 37) % 10) / 10);
      ctx.fillStyle = 'rgb(237,234,224)';
      ctx.beginPath();
      ctx.arc(px, py, 0.65 + ((i % 3) * 0.3), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* 章节轨道环：把圆盘采样成折线，提供最直接的空间结构线索 */
  function drawOrbits() {
    SIDS.forEach((sid) => {
      const a = anchors[sid], b = basis[sid];
      const active = S.focus === sid;
      const dim = S.focus && !active;
      const rgb = rgbOf(sid);
      const N = 84;

      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        const phi = (k / N) * TAU;
        const x = a.x + R_CH * (Math.cos(phi) * b.e1[0] + Math.sin(phi) * b.e2[0]);
        const y = a.y + R_CH * (Math.cos(phi) * b.e1[1] + Math.sin(phi) * b.e2[1]);
        const z = a.z + R_CH * (Math.cos(phi) * b.e1[2] + Math.sin(phi) * b.e2[2]);
        const p = projectPoint(x, y, z);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.globalAlpha = (active ? 0.62 : 0.3) * (dim ? 0.28 : 1);
      ctx.strokeStyle = rgba(rgb, 0.9);
      ctx.lineWidth = active ? 1.3 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  function drawLinks() {
    const order = links.map((l) => ({ l, z: (nodes[l.a]._z + nodes[l.b]._z) / 2 }))
      .sort((p, q) => q.z - p.z);

    ctx.lineCap = 'round';
    for (const { l } of order) {
      const A = nodes[l.a], B = nodes[l.b];
      const dimSubj = S.focus && A.s !== S.focus && B.s !== S.focus;

      if (l.kind === 'orbit' || l.kind === 'spoke') {
        if (l.kind === 'spoke' && !pointsVisible(A.s)) continue;
        if (l.kind === 'spoke' && S.focus && A.s !== S.focus) continue;
        const base = l.kind === 'orbit' ? 0.05 : 0.10;
        ctx.globalAlpha = (base + Math.min(A._near, B._near) * 0.14) * (dimSubj ? 0.15 : 1);
        ctx.strokeStyle = '#EDEAE0';
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(A._x, A._y);
        ctx.lineTo(B._x, B._y);
        ctx.stroke();
        continue;
      }

      // 跨科关联：向中心弯折并抬升成拱桥，制造纵深
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, mz = (A.z + B.z) / 2;
      const cxp = mx * 0.55, cyp = my * 0.55 + 150, czp = mz * 0.55;
      const rgb = rgbOf(A.s);
      const active = S.hoverLink === l.id || (S.hover && (A === S.hover || B === S.hover));
      const near = (A._near + B._near) / 2;

      ctx.globalAlpha = (0.10 + near * 0.34) * (dimSubj ? 0.1 : 1) * (active ? 2.6 : 1);
      ctx.strokeStyle = active ? '#FFFFFF' : rgba(rgb, 0.95);
      ctx.lineWidth = active ? 1.9 : 0.95 + near * 0.35;

      const STEPS = 16;
      ctx.beginPath();
      for (let k = 0; k <= STEPS; k++) {
        const t = k / STEPS, u = 1 - t;
        const x = u * u * A.x + 2 * u * t * cxp + t * t * B.x;
        const y = u * u * A.y + 2 * u * t * cyp + t * t * B.y;
        const z = u * u * A.z + 2 * u * t * czp + t * t * B.z;
        const p = projectPoint(x, y, z);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawNodes() {
    const order = nodes.slice().sort((a, b) => b._z - a._z);
    const boxes = [];

    // 辉光
    ctx.globalCompositeOperation = 'lighter';
    for (const n of order) {
      if (n.kind === 'point' && !pointsVisible(n.s)) continue;
      const dim = S.focus && n.s !== S.focus;
      const r = n._r2;
      if (dim) {
        if (n.kind === 'subject') {
          const size = r * 8;
          ctx.globalAlpha = 0.09;
          ctx.drawImage(sprites[n.s], n._x - size / 2, n._y - size / 2, size, size);
        }
        continue;
      }
      ctx.globalAlpha = (0.18 + n._near * 0.5) * (n.kind === 'point' ? 0.5 : 1);
      const size = r * (n.kind === 'subject' ? 13 : n.kind === 'chapter' ? 9 : 6);
      ctx.drawImage(sprites[n.s], n._x - size / 2, n._y - size / 2, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 实心核
    for (const n of order) {
      if (n.kind === 'point' && !pointsVisible(n.s)) continue;
      const dim = S.focus && n.s !== S.focus;
      const c = rgbOf(n.s);
      const rr = n.kind === 'point'
        ? Math.max(1.1, n._r2 * 0.95)
        : Math.max(2.2, n._r2 * (dim ? 0.5 : 0.95));

      ctx.globalAlpha = (dim ? 0.22 : (n.kind === 'point' ? 0.42 : 0.55) + n._near * 0.42);
      ctx.beginPath();
      ctx.arc(n._x, n._y, rr, 0, TAU);
      if (n.kind === 'point') {
        ctx.fillStyle = rgba(c, 0.96);
        ctx.fill();
      } else {
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = rgba(c, 1);
        ctx.lineWidth = n.kind === 'subject' ? 1.8 : 1.3;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 悬停放大圈
    if (S.hover) {
      const n = S.hover;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = rgba(rgbOf(n.s), 1);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(n._x, n._y, n._r2 + 7, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 标签：按重要度依次放入，冲突则丢弃；带引线，避免压在节点上
    const put = (n, size, alpha, weight, opt) => {
      const o = opt || {};
      const pad = 7;
      const w = n.label.length * size * 0.95 + 12;
      const h = size * 1.5;
      let lx = n._x, ly = n._y, align = 'center';
      let leader = null;

      if (o.screen) {
        // 屏幕空间外置：永远朝「远离画面中心」的方向，避免被旋转到节点内侧
        const dx = n._x - W / 2, dy = n._y - H / 2;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const rad = o.off || 56;
        lx = n._x + ux * rad;
        ly = n._y + uy * rad * 0.62;
        align = ux > 0.38 ? 'left' : ux < -0.38 ? 'right' : 'center';
        if (align === 'center') ly = n._y + (uy >= 0 ? 1 : -1) * (n._r2 + size * 0.95);
        leader = { x: n._x, y: n._y };
      } else if (o.dir) {
        const off = o.off || 34;
        const p = projectPoint(
          n.x + o.dir[0] * off,
          n.y + (o.lift || 0),
          n.z + o.dir[2] * off
        );
        lx = p.x;
        ly = p.y;
        if (p.x - n._x > 4) align = 'left';
        else if (p.x - n._x < -4) align = 'right';
        if (align === 'center') { ly = n._y + Math.max(9, n._r2 + size * 0.85); }
        leader = { x: n._x, y: n._y };
      }

      const left = align === 'center' ? lx - w / 2 : align === 'left' ? lx : lx - w;
      const box = { l: left - pad, r: left + w + pad, t: ly - h * 0.6, b: ly + h * 0.6 };

      if (box.l < 2) { const d = 2 - box.l; box.l += d; box.r += d; lx += d; }
      if (box.r > W - 2) { const d = W - 2 - box.r; box.l += d; box.r += d; lx += d; }
      if (n.kind !== 'subject' && boxes.some((q) => !(box.r < q.l || box.l > q.r || box.b < q.t || box.t > q.b))) return;
      boxes.push(box);

      if (leader) {
        const sx = leader.x, sy = leader.y;
        const ex = align === 'left' ? lx - 3 : align === 'right' ? lx + 3 : lx;
        if (Math.hypot(ex - sx, ly - sy) > 16) {
          ctx.globalAlpha = alpha * 0.5;
          ctx.strokeStyle = 'rgba(237,234,224,.42)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ly);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${INK[0]},${INK[1]},${INK[2]})`;
      ctx.font = `${weight || 400} ${size}px "PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      const tx = align === 'center' ? lx : (align === 'left' ? lx + 2 : lx - 2);
      ctx.fillText(n.label, tx, ly);
      ctx.globalAlpha = 1;
    };

    const subjAnchor = (sid) => anchors[sid];

    // 1) 学科名常显：沿径向外置
    order.filter((n) => n.kind === 'subject' && S.focus !== n.s).forEach((n) => {
      const dim = !!S.focus;
      const size = Math.max(12, Math.min(15, 14 * n._s * 1.15));
      put(n, size, dim ? 0.22 : 0.96, 600, { screen: true, off: 58 });
    });

    // 2) 章节名：仅当前聚焦学科（或放大后），沿「学科核 → 章节」方向外置
    order
      .filter((n) => n.kind === 'chapter' && chaptersLabeled(n.s) && (!S.focus || n.s === S.focus))
      .sort((a, b) => b._near - a._near)
      .forEach((n) => {
        const a = subjAnchor(n.s);
        const dx = n.x - a.x, dz = n.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const small = W < 560;
        put(n, small ? 9.4 : 10.5, 0.5 + n._near * 0.42, 400, {
          dir: [dx / len, 0, dz / len], off: small ? 34 : 26, lift: 6
        });
      });

    // 3) 悬停提示
    if (S.hover) {
      const n = S.hover;
      const text = n.label;
      const size = 12;
      const w = ctx.measureText ? Math.max(60, text.length * size * 0.92 + 20) : 120;
      let bx = n._x - w / 2, by = n._y - n._r2 - 34;
      bx = Math.max(8, Math.min(W - w - 8, bx));
      by = Math.max(8, by);
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = 'rgba(16,20,15,0.95)';
      roundRect(bx, by, w, 26, 7);
      ctx.fill();
      ctx.strokeStyle = rgba(rgbOf(n.s), 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = `rgb(${INK[0]},${INK[1]},${INK[2]})`;
      ctx.font = `500 ${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + w / 2, by + 13.5);
      ctx.globalAlpha = 1;
    }

    // 4) 定位脉冲
    if (S.pulse && S.pulseT > 0) {
      const n = byId.get(S.pulse);
      if (n) {
        const t = 1 - S.pulseT / 90;
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.strokeStyle = rgba(rgbOf(n.s), 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(n._x, n._y, (n._r2 || 2) + 4 + t * 46, 0, TAU);
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
    // 全景：按整张星图取景；聚焦：只按单科轨道取景，小屏才不会缩成一团
    const fit = S.focus ? Math.min(W / 470, H / 430) : Math.min(W / 980, H / 520);
    ZF = S.zoom * fit * 1.85;
    cosY = Math.cos(S.yaw); sinY = Math.sin(S.yaw);
    cosP = Math.cos(S.pitch); sinP = Math.sin(S.pitch);
    project();
    drawBg();
    drawOrbits();
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
        S.yaw += d * 0.09;
        S.pitch += (S.tPitch - S.pitch) * 0.09;
        if (S.tZoom !== null) S.zoom += (S.tZoom - S.zoom) * 0.09;
        if (Math.abs(d) < 0.003) {
          S.yaw = S.tYaw; S.pitch = S.tPitch;
          if (S.tZoom !== null) S.zoom = S.tZoom;
          S.tYaw = null; S.tZoom = null;
        }
      } else if (S.auto && !S.hover && !S.focus) {
        S.yaw += 0.0014;
      }
    }

    if (S.pulseT > 0) S.pulseT--;
    render();
    raf = requestAnimationFrame(frame);
  }

  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

  /* ---------------- 交互 ---------------- */
  const pointers = new Map();
  let pinchStart = 0, pinchZoom = 1;

  function pick(mx, my) {
    let best = null, bs = 1e9;
    for (const n of nodes) {
      if (n.kind === 'point' && !pointsVisible(n.s)) continue;
      if (n.kind === 'point' && S.focus && n.s !== S.focus) continue;
      if (n._x === undefined) continue;
      const d = Math.hypot(n._x - mx, n._y - my);
      const r = Math.max(n.kind === 'point' ? 10 : 18, n._r2 * 2.4);
      if (d < r) {
        const score = d - n._near * 6 - (n.kind === 'subject' ? 14 : n.kind === 'chapter' ? 5 : 0);
        if (score < bs) { bs = score; best = n; }
      }
    }
    return best;
  }

  function bind() {
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = S.zoom;
        S.drag = true;
      } else {
        S.drag = true; S.moved = 0;
        S.px = e.clientX; S.py = e.clientY;
        S.tYaw = null; S.tZoom = null;
      }
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // 双指捏合
      if (pointers.size === 2 && pinchStart > 0) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0) S.zoom = Math.max(0.6, Math.min(2.8, pinchZoom * (d / pinchStart)));
        S.moved = 99;
        return;
      }

      if (S.drag) {
        const dx = e.clientX - S.px, dy = e.clientY - S.py;
        S.moved += Math.abs(dx) + Math.abs(dy);
        S.px = e.clientX; S.py = e.clientY;
        S.yaw += dx * 0.0062;
        S.pitch = Math.max(-1.2, Math.min(1.2, S.pitch + dy * 0.0045));
        return;
      }

      const n = pick(mx, my);
      if (n !== S.hover) {
        S.hover = n;
        canvas.style.cursor = n ? 'pointer' : 'grab';
        if (onHover) onHover(n);
      }
      // 跨科弧线悬停：取两端中点附近的最近弧
      S.hoverLink = null;
      let bestD = 30;
      for (const l of crossLinks) {
        const A = nodes[l.a], B = nodes[l.b];
        if (A._x === undefined) continue;
        const d = Math.hypot(mx - (A._x + B._x) / 2, my - (A._y + B._y) / 2);
        if (d < bestD) { bestD = d; S.hoverLink = l.id; }
      }
    });

    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
      if (!S.drag) return;
      S.drag = false;
      canvas.style.cursor = S.hover ? 'pointer' : 'grab';
      if (S.moved < 7 && pointers.size === 0) {
        const rect = canvas.getBoundingClientRect();
        const n = pick(e.clientX - rect.left, e.clientY - rect.top);
        if (n && onNode) onNode(n);
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); S.drag = false; });

    canvas.addEventListener('dblclick', (e) => {
      const rect = canvas.getBoundingClientRect();
      const n = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (n && n.kind === 'subject') { setFocus(n.s); return; }
      setFocus(null);
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.deltaY > 0 ? 0.9 : 1.1;
      S.zoom = Math.max(0.6, Math.min(2.8, S.zoom * k));
      S.tZoom = null;
    }, { passive: false });

    window.addEventListener('resize', resize);
  }

  /* ---------------- 尺寸 ---------------- */
  function resize() {
    if (!canvas) return;
    const box = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(280, Math.round(box.width));
    H = Math.max(300, Math.round(box.height));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    updatePan(true);
    if (!running) render();
  }

  /* ---------------- 聚焦 ---------------- */
  function setFocus(sid) {
    S.focus = sid;
    S.auto = !sid;
    S.hover = null;
    if (!sid) {
      S.tYaw = -0.62; S.tPitch = 0.52; S.tZoom = 1;
    } else {
      const a = anchors[sid];
      S.tYaw = -Math.PI / 2 - a.th;
      S.tPitch = 0.44;
      S.tZoom = 1.1;
    }
    if (sid !== lastFocus) {
      lastFocus = sid;
      if (onFocus) onFocus(sid);
    }
  }

  /* ---------------- API ---------------- */
  window.Galaxy = {
    init(opts) {
      canvas = document.getElementById('galaxy');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      onNode = opts && opts.onNode;
      onHover = opts && opts.onHover;
      onFocus = opts && opts.onFocus;
      build();
      buildSprites();
      resize();
      bind();
      start();
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) start(); else stop(); });
      }, { threshold: 0.02 });
      io.observe(canvas);
      window.addEventListener('resize', () => setTimeout(resize, 100));
    },
    focus(sid) { setFocus(sid || null); },
    reset() { setFocus(null); },
    zoom(d) {
      S.zoom = Math.max(0.6, Math.min(2.8, S.zoom + d));
      S.tZoom = null;
    },
    setAuto(on) { S.auto = on; },
    locate(nodeId) {
      const n = byId.get(nodeId);
      if (!n) return;
      if (S.focus !== n.s) setFocus(n.s);
      const a = anchors[n.s];
      S.tYaw = -Math.PI / 2 - a.th + (n.kind === 'chapter' ? 0.22 : 0.12);
      S.tPitch = n.kind === 'point' ? 0.36 : 0.44;
      S.tZoom = n.kind === 'point' ? 1.6 : 1.32;
      S.pulse = nodeId;
      S.pulseT = 96;
    },
    refresh() { buildSprites(); },
    isFocused: () => S.focus,
    stats() {
      return {
        nodes: nodes.length,
        chapters: nodes.filter((n) => n.kind === 'chapter').length,
        points: nodes.filter((n) => n.kind === 'point').length,
        links: crossLinks.length
      };
    }
  };
})();
