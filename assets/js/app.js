/* Partidas — visualizações das bolsas FAPESP no exterior.
   Lê data/bepe.json (gerado por scripts/prepare_data.py) e o mapa-múndi do world-atlas. */
(() => {
  'use strict';

  const L = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['R$ ', ''] });
  const fN = L.format(',d');
  const fP0 = L.format('.0%');
  const fP1 = L.format('.1%');
  const fD1 = L.format(',.1f');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SP = [-46.63, -23.55];
  const TODO = 'Todo o período';
  const CURTO = {
    'Pesquisa': 'Pesquisa', 'BEPE Pós-doutorado': 'Pós-doutorado', 'BEPE Doutorado': 'Doutorado',
    'BEPE Mestrado': 'Mestrado', 'BEPE Iniciação Científica': 'Iniciação científica', 'Outras': 'Outras',
  };
  const SIGLA_PAIS = {
    'Estados Unidos': 'EUA', 'Reino Unido': 'R. Unido', 'França': 'França', 'Espanha': 'Espanha',
    'Alemanha': 'Alemanha', 'Portugal': 'Portugal', 'Canadá': 'Canadá', 'Itália': 'Itália', 'Outros': 'Outros',
  };

  const docEl = document.documentElement;
  const cssv = (name, node) => getComputedStyle(node instanceof Element ? node : docEl).getPropertyValue(name).trim();
  const state = {
    ritmo: 'abs', grupoCal: 'Todas', periodo: TODO,
    temas: ['Aprendizado computacional', 'Inteligência artificial', 'Mudança climática', 'COVID-19'],
  };
  let DATA = null;
  let WORLD = null;

  const grupoCor = (g) => cssv('--c' + (DATA.meta.grupos.indexOf(g) + 1));
  const areaCor = (a) => cssv('--a' + (DATA.meta.grandes_areas.indexOf(a) + 1));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const sigla = (nome) => {
    const m = nome.match(/\(([^()]+)\)\s*$/);
    if (nome === 'Pessoa Física') return 'Pessoa Física (até 2008)';
    return m ? m[1] : nome;
  };
  const corta = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  /* ---------- tooltip ---------- */
  const tipEl = document.getElementById('tip');
  function tip(event, title, rows) {
    tipEl.replaceChildren(el('div', 'h', title));
    for (const r of rows) {
      const row = el('div', 'r');
      const left = el('span');
      if (r.color) { const i = el('i'); i.style.background = r.color; left.append(i); }
      left.append(r.label);
      row.append(left, el('b', '', r.value));
      tipEl.append(row);
    }
    tipEl.hidden = false;
    moveTip(event);
  }
  function moveTip(event) {
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = event.clientX + 14, y = event.clientY - h - 12;
    if (x + w > innerWidth - 8) x = event.clientX - w - 14;
    if (y < 8) y = event.clientY + 16;
    tipEl.style.left = Math.max(8, x) + 'px';
    tipEl.style.top = y + 'px';
  }
  const hideTip = () => { tipEl.hidden = true; };
  addEventListener('scroll', hideTip, { passive: true });

  function dodge(items, gap, lo, hi) {
    items.sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    const over = items.length ? items[items.length - 1].y - hi : 0;
    if (over > 0) {
      items[items.length - 1].y -= over;
      for (let i = items.length - 2; i >= 0; i--) if (items[i + 1].y - items[i].y < gap) items[i].y = items[i + 1].y - gap;
    }
    if (items.length && items[0].y < lo) {
      items[0].y = lo;
      for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    }
    return items;
  }

  function segmented(container, options, current, onPick) {
    container.replaceChildren();
    for (const o of options) {
      const b = el('button', '', o.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(o.value === current));
      b.addEventListener('click', () => {
        for (const x of container.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
        onPick(o.value);
      });
      container.append(b);
    }
  }

  /* ---------- interface: cabeçalho, menu, mosaico, revelações ---------- */
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const head = document.getElementById('head');
  const heroEl = document.getElementById('topo');
  const menuBtn = document.getElementById('menu-btn');
  const solidez = () => head.classList.toggle('solid', heroEl.getBoundingClientRect().bottom < 72);
  addEventListener('scroll', solidez, { passive: true });
  solidez();
  const fechaMenu = () => {
    head.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Abrir menu');
    document.body.style.overflow = '';
  };
  menuBtn.addEventListener('click', () => {
    const aberto = head.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(aberto));
    menuBtn.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    document.body.style.overflow = aberto ? 'hidden' : '';
  });
  for (const a of document.querySelectorAll('#menu a')) a.addEventListener('click', fechaMenu);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') fechaMenu(); });

  // mosaico de fotos no fundo da abertura
  const FOTOS = d3.range(1, 13).map((i) => `assets/img/bepe-${String(i).padStart(2, '0')}.jpg`);
  const mosaic = document.getElementById('mosaic');
  const tiles = [];
  for (let c = 0; mosaic && c < 4; c++) {
    const col = el('div', 'mosaic-col');
    for (let r = 0; r < 4; r++) {
      const t = el('div', 'tile');
      const a = el('img'), b = el('img');
      a.alt = ''; b.alt = '';
      a.decoding = 'async'; b.decoding = 'async';
      const k = (c * 3 + r * 5) % FOTOS.length;
      a.src = FOTOS[k];
      a.className = 'on';
      t.append(a, b);
      col.append(t);
      tiles.push({ a, b, k });
    }
    mosaic.append(col);
  }
  if (!reduz && tiles.length) {
    let passo = 0;
    setInterval(() => {
      if (document.hidden || heroEl.getBoundingClientRect().bottom < 0) return;
      const s = tiles[(passo * 7) % tiles.length];
      passo++;
      const vis = s.a.classList.contains('on') ? s.a : s.b;
      const oculto = vis === s.a ? s.b : s.a;
      s.k = (s.k + 5) % FOTOS.length;
      oculto.onload = () => { oculto.classList.add('on'); vis.classList.remove('on'); };
      oculto.src = FOTOS[s.k];
    }, 2200);
  }

  // frase-resumo: palavras acendem conforme a rolagem
  const big = document.getElementById('big');
  function quebraPalavras(node) {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const parte of ch.textContent.split(/(\s+)/)) {
          if (!parte) continue;
          frag.append(/^\s+$/.test(parte) ? parte : el('span', 'w', parte));
        }
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1 && ch.tagName.toLowerCase() !== 'svg') {
        if (ch.dataset.k) ch.classList.add('w');
        else quebraPalavras(ch);
      }
    }
  }
  function acende() {
    const ws = big.querySelectorAll('.w');
    const r = big.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.3)));
    const n = reduz ? ws.length : Math.round(p * ws.length);
    ws.forEach((w, i) => w.classList.toggle('lit', i < n));
    document.getElementById('circled').classList.toggle('drawn', n >= ws.length * 0.7);
  }
  let fraseOk = false;
  function preparaFrase() {
    if (fraseOk) return;
    fraseOk = true;
    quebraPalavras(big);
    addEventListener('scroll', acende, { passive: true });
    acende();
  }

  // blocos que sobem ao entrar na tela
  const ioRise = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in', 'seen');
      ioRise.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  for (const n of document.querySelectorAll('.rise')) ioRise.observe(n);

  // paralaxe nas faixas de foto
  const bandas = [...document.querySelectorAll('[data-parallax]')];
  function paralaxe() {
    for (const img of bandas) {
      const r = img.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      img.style.transform = `translate3d(0, ${(p * -7).toFixed(2)}%, 0)`;
    }
  }
  if (!reduz) { addEventListener('scroll', paralaxe, { passive: true }); paralaxe(); }

  /* ---------- registro de desenhos ---------- */
  const renders = [];
  const reg = (fn) => { renders.push(fn); try { fn(); } catch (e) { console.error(e); } };
  function redraw() { for (const f of renders) { try { f(); } catch (e) { console.error(e); } } }
  let lastW = innerWidth, timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 4) { lastW = innerWidth; redraw(); } }, 160);
  });

  /* ---------- navegação ---------- */
  const navLinks = [...document.querySelectorAll('#menu a')].filter((a) => a.getAttribute('href').startsWith('#'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of navLinks) a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id);
    }
  }, { rootMargin: '-35% 0px -60% 0px' });
  for (const a of navLinks) { const s = document.querySelector(a.getAttribute('href')); if (s) io.observe(s); }

  /* ---------- números no texto ---------- */
  function fillNumbers() {
    const m = DATA.meta;
    for (const n of document.querySelectorAll('[data-k]')) {
      const v = m[n.dataset.k];
      if (v === undefined) continue;
      n.textContent = typeof v === 'number' && !/ano/.test(n.dataset.k) ? fN(v) : String(v);
    }
    for (const n of document.querySelectorAll('[data-y]')) {
      const row = DATA.anos.find((d) => d.ano === +n.dataset.y);
      if (row) n.textContent = fN(d3.sum(m.grupos, (g) => row[g]));
    }
    for (const n of document.querySelectorAll('[data-pico]')) {
      const v = DATA.meses[n.dataset.pico];
      n.textContent = MESES_L[v.indexOf(d3.max(v))];
    }
    for (const n of document.querySelectorAll('[data-share]')) {
      const [pais, per] = n.dataset.share.split('|');
      const p = DATA.paises.find((d) => d.pais === pais);
      if (p) n.textContent = fP0(p.periodos[per] / DATA.tot_periodos[per]);
    }
    const kids = DATA.arvore.children;
    const val = (s) => (kids.find((k) => k.name.includes(s)) || { value: 0 }).value;
    const k3 = { estaduais: (val('(USP)') + val('(UNESP)') + val('(UNICAMP)')) / m.total, usp: val('(USP)') / m.total };
    for (const n of document.querySelectorAll('[data-k3]')) n.textContent = fP0(k3[n.dataset.k3]);
    const meses = DATA.meses.Todas;
    const topTema = d3.greatest(DATA.temas.lista, (d) => d.n);
    const cresc = DATA.ascensao.filter((d) => d.antes >= 5)[0];
    const F = {
      set_share: fP0(d3.max(meses) / d3.sum(meses)),
      top_tema: topTema.tema, top_tema_n: fN(topTema.n),
      top_cresc: cresc.tema, top_cresc_x: L.format('.1f')(cresc.razao) + ' vezes',
      top_area: DATA.areas[0].area, top_area_n: fN(DATA.areas[0].n),
      top_host: DATA.anfitrias[0].nome, top_host_n: fN(DATA.anfitrias[0].n),
      pt_top10: String(DATA.anfitrias.slice(0, 10).filter((h) => h.pais === 'Portugal').length),
    };
    for (const n of document.querySelectorAll('[data-f]')) if (F[n.dataset.f] !== undefined) n.textContent = F[n.dataset.f];
  }

  /* ---------- herói: rotas a partir de São Paulo ---------- */
  function drawBoard() {
    const ol = document.getElementById('board-list');
    ol.replaceChildren();
    DATA.paises.slice(0, 8).forEach((p, i) => {
      const li = el('li');
      li.append(el('span', 'k', String(i + 1).padStart(2, '0')), el('span', '', p.pais), el('span', 'n', fN(p.n)));
      ol.append(li);
    });
  }

  function worldFeatures() {
    const all = topojson.feature(WORLD, WORLD.objects.countries).features;
    return all.filter((f) => f.id !== '010');
  }

  function drawHero() {
    const box = document.getElementById('hero-map');
    box.replaceChildren();
    if (!WORLD) return;
    const v = (n) => cssv(n, box);
    const feats = worldFeatures();
    const W = box.clientWidth || 800;
    const H = Math.round(W * 0.5);
    const proj = d3.geoEqualEarth().fitSize([W, H], { type: 'FeatureCollection', features: feats });
    const path = d3.geoPath(proj);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    svg.append('g').selectAll('path').data(feats).join('path')
      .attr('d', path).attr('fill', (f) => (f.id === '076' ? v('--paper-2') : v('--land')))
      .attr('stroke', v('--land-line')).attr('stroke-width', 0.5);
    const paises = [...DATA.paises].sort((a, b) => a.n - b.n);
    const w = d3.scaleSqrt([1, d3.max(paises, (p) => p.n)], [0.5, Math.max(4, W / 160)]);
    const arcs = svg.append('g').attr('fill', 'none').attr('stroke-linecap', 'round');
    paises.forEach((p, i) => {
      const d = path({ type: 'LineString', coordinates: [SP, [p.lon, p.lat]] });
      if (!d) return;
      const a = arcs.append('path').attr('d', d).attr('class', 'route-arc')
        .attr('stroke', v('--blue'))
        .attr('stroke-opacity', p.n > 900 ? 0.85 : 0.45)
        .attr('stroke-width', w(p.n));
      const len = a.node().getTotalLength();
      a.style('--len', len).style('--d', ((paises.length - i) * 0.012).toFixed(3) + 's');
    });
    const dots = svg.append('g');
    for (const p of DATA.paises.slice(0, 8)) {
      const [x, y] = proj([p.lon, p.lat]);
      dots.append('circle').attr('cx', x).attr('cy', y).attr('r', Math.max(2.5, w(p.n) * 0.7)).attr('fill', v('--red'));
    }
    const [sx, sy] = proj(SP);
    dots.append('circle').attr('cx', sx).attr('cy', sy).attr('r', 9).attr('fill', 'none').attr('stroke', v('--red')).attr('stroke-width', 1.5);
    dots.append('circle').attr('cx', sx).attr('cy', sy).attr('r', 4).attr('fill', v('--red'));
    svg.append('text').attr('x', sx + 14).attr('y', sy + 4).attr('fill', v('--ink')).attr('font-family', v('--label'))
      .attr('font-size', 13).attr('font-weight', 600).text('São Paulo');
  }

  /* ---------- trecho 1: ritmo ---------- */
  function drawLegendGrupos() {
    const box = document.getElementById('legend-grupos');
    box.replaceChildren();
    for (const g of DATA.meta.grupos) {
      const s = el('span'); const i = el('i'); i.style.background = grupoCor(g);
      s.append(i, CURTO[g]); box.append(s);
    }
  }

  function drawRitmo() {
    const box = document.getElementById('chart-ritmo');
    box.replaceChildren();
    const keys = DATA.meta.grupos;
    const rows = DATA.anos;
    const W = box.clientWidth || 800;
    const H = Math.max(300, Math.min(460, Math.round(W * 0.48)));
    const m = { t: 46, r: 6, b: 26, l: state.ritmo === 'pct' ? 40 : 46 };
    const pct = state.ritmo === 'pct';
    const series = d3.stack().keys(keys).offset(pct ? d3.stackOffsetExpand : d3.stackOffsetNone)(rows);
    const x = d3.scaleBand(rows.map((d) => d.ano), [m.l, W - m.r]).paddingInner(0.16);
    const tot = (d) => d3.sum(keys, (k) => d[k]);
    const y = d3.scaleLinear([0, pct ? 1 : d3.max(rows, tot)], [H - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const ticks = y.ticks(5);
    svg.append('g').selectAll('line').data(ticks).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y)
      .attr('stroke', cssv('--rule')).attr('stroke-dasharray', (d) => (d === 0 ? null : '2 3'));
    svg.append('g').selectAll('text').data(ticks).join('text')
      .attr('x', m.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => (pct ? fP0(d) : fN(d)));
    svg.append('g').selectAll('g').data(series).join('g').attr('fill', (s) => grupoCor(s.key))
      .selectAll('rect').data((s) => s).join('rect')
      .attr('x', (d) => x(d.data.ano)).attr('width', x.bandwidth())
      .attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])));
    const step = Math.max(1, Math.ceil(38 / x.step()));
    const anosTick = rows.map((d) => d.ano).filter((a) => (a - rows[0].ano) % step === 0 || a === rows[rows.length - 1].ano);
    svg.append('g').selectAll('text').data(anosTick).join('text')
      .attr('x', (a) => x(a) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((a) => a)
      .attr('opacity', (a, i, all) => (a === rows[rows.length - 1].ano && i > 0 && a - anosTick[i - 1] < step ? 0 : 1));
    // marcos
    // em tela estreita os rótulos de 2020 e do recorde trocam de linha para não se sobreporem
    const estreito = W < 560;
    const marcos = [
      { ano: 2011, txt: 'BEPE criado', nivel: 0 },
      { ano: 2020, txt: 'Pandemia', nivel: estreito ? 1 : 0 },
      { ano: DATA.meta.ano_recorde, txt: 'Recorde: ' + fN(DATA.meta.recorde), nivel: estreito ? 0 : 1 },
    ];
    const g = svg.append('g');
    for (const mk of marcos) {
      const row = rows.find((d) => d.ano === mk.ano);
      if (!row) continue;
      const cx = x(mk.ano) + x.bandwidth() / 2;
      const top = pct ? m.t : y(tot(row));
      const ly = 12 + mk.nivel * 16;
      g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', ly + 4).attr('y2', top - 3).attr('stroke', cssv('--ink')).attr('stroke-width', 1);
      const t = g.append('text').attr('x', cx).attr('y', ly).attr('class', 'lbl-strong').text(mk.txt);
      const tw = t.node().getComputedTextLength();
      const anchor = cx + tw / 2 > W ? 'end' : cx - tw / 2 < 0 ? 'start' : 'middle';
      t.attr('text-anchor', anchor);
    }
    const hl = svg.append('rect').attr('fill', 'none').attr('stroke', cssv('--ink')).attr('stroke-width', 1.2).attr('visibility', 'hidden');
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', (d) => x(d.ano) - (x.step() - x.bandwidth()) / 2).attr('width', x.step())
      .attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (event, d) => {
        const t = tot(d);
        hl.attr('visibility', 'visible').attr('x', x(d.ano) - 1).attr('width', x.bandwidth() + 2)
          .attr('y', pct ? y(1) : y(t)).attr('height', pct ? y(0) - y(1) : y(0) - y(t));
        tip(event, `${d.ano} · ${fN(t)} bolsas`, [...keys].reverse().filter((k) => d[k]).map((k) => ({
          color: grupoCor(k), label: CURTO[k], value: pct ? fP0(d[k] / t) : fN(d[k]),
        })));
      })
      .on('pointerleave', () => { hl.attr('visibility', 'hidden'); hideTip(); });
  }

  function drawFicha() {
    const t = document.getElementById('ficha');
    t.replaceChildren();
    const head = el('thead'); const hr = el('tr');
    for (const [txt, num] of [['Modalidade'], ['Bolsas', 1], ['% do total', 1], ['Desde', 1], ['Duração (meses)', 1], ['Mês de pico'], ['Principal destino']]) {
      const th = el('th', num ? 'num' : '', txt); hr.append(th);
    }
    head.append(hr); t.append(head);
    const body = el('tbody');
    for (const d of DATA.modalidades) {
      const tr = el('tr');
      const c0 = el('td'); const sw = el('span', 'sw'); sw.style.background = grupoCor(d.grupo); c0.append(sw, CURTO[d.grupo]);
      tr.append(c0, el('td', 'num', fN(d.n)), el('td', 'num', fP1(d.share)), el('td', 'num', String(d.desde)),
        el('td', 'num', d.mediana_meses ? fD1(d.mediana_meses) : '—'), el('td', '', d.mes_pico),
        el('td', '', `${d.destino} (${fP0(d.destino_share)})`));
      body.append(tr);
    }
    t.append(body);
  }

  /* ---------- trecho 2: calendário ---------- */
  function drawRadial() {
    const box = document.getElementById('chart-radial');
    box.replaceChildren();
    const vals = DATA.meses[state.grupoCal];
    const total = d3.sum(vals);
    const shares = vals.map((v) => v / total);
    const maxAll = d3.max(Object.entries(DATA.meses).filter(([k]) => k !== 'Outras'), ([, v]) => d3.max(v) / d3.sum(v));
    const S = Math.min(box.clientWidth || 420, 460);
    const r0 = S * 0.2, r1 = S / 2 - 30;
    const r = d3.scaleLinear([0, Math.ceil(maxAll * 20) / 20], [r0, r1]);
    const svg = d3.select(box).append('svg').attr('viewBox', `${-S / 2} ${-S / 2} ${S} ${S}`).attr('width', S).attr('height', S);
    const guias = [0.05, 0.1, 0.15].filter((v) => v <= r.domain()[1]);
    svg.append('g').selectAll('circle').data(guias).join('circle')
      .attr('r', r).attr('fill', 'none').attr('stroke', cssv('--rule')).attr('stroke-dasharray', '2 3');
    svg.append('g').selectAll('text').data(guias).join('text')
      .attr('x', 3).attr('y', (v) => -r(v) - 3).text((v) => fP0(v)).attr('font-size', 10);
    const pico = shares.indexOf(d3.max(shares));
    const step = (2 * Math.PI) / 12;
    const arc = d3.arc().innerRadius(r0).outerRadius((d) => r(d.v))
      .startAngle((d) => d.i * step + 0.03).endAngle((d) => (d.i + 1) * step - 0.03).cornerRadius(2);
    const data = shares.map((v, i) => ({ v, i, n: vals[i] }));
    svg.append('g').selectAll('path').data(data).join('path')
      .attr('d', arc).attr('fill', (d) => (d.i === pico ? cssv('--red') : cssv('--blue')))
      .attr('fill-opacity', (d) => (d.i === pico ? 1 : 0.35 + 0.6 * (d.v / d3.max(shares))))
      .on('pointermove', (event, d) => tip(event, MESES_L[d.i], [{ label: 'Inícios', value: fN(d.n) }, { label: 'Fatia', value: fP1(d.v) }]))
      .on('pointerleave', hideTip);
    svg.append('g').selectAll('text').data(MESES).join('text')
      .attr('x', (m, i) => Math.sin((i + 0.5) * step) * (r1 + 16))
      .attr('y', (m, i) => -Math.cos((i + 0.5) * step) * (r1 + 16) + 4)
      .attr('text-anchor', 'middle').attr('class', (m, i) => (i === pico ? 'lbl-strong' : null)).text((m) => m);
    svg.append('text').attr('text-anchor', 'middle').attr('y', -4).attr('fill', cssv('--ink'))
      .attr('font-family', cssv('--display')).attr('font-size', Math.round(S * 0.07)).attr('font-weight', 700)
      .text(MESES[pico]);
    svg.append('text').attr('text-anchor', 'middle').attr('y', Math.round(S * 0.055)).text(`${fP1(shares[pico])} dos inícios`);
  }

  function drawHeat() {
    const box = document.getElementById('chart-heat');
    box.replaceChildren();
    const rows = DATA.heat;
    const W = box.clientWidth || 520;
    const m = { t: 22, r: 4, b: 4, l: 42 };
    const cw = (W - m.l - m.r) / 12;
    const ch = Math.max(18, Math.min(26, cw * 0.7));
    const H = m.t + rows.length * ch + m.b;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    svg.append('g').selectAll('text').data(MESES).join('text')
      .attr('x', (d, i) => m.l + i * cw + cw / 2).attr('y', 12).attr('text-anchor', 'middle').text((d) => d);
    const cells = rows.flatMap((r, j) => {
      const t = d3.sum(r.meses);
      return r.meses.map((n, i) => ({ ano: r.ano, i, j, n, s: t ? n / t : 0 }));
    });
    const max = d3.max(cells, (c) => c.s);
    svg.append('g').selectAll('text').data(rows).join('text')
      .attr('x', m.l - 8).attr('y', (r, j) => m.t + j * ch + ch / 2 + 4).attr('text-anchor', 'end').text((r) => r.ano);
    svg.append('g').selectAll('rect').data(cells).join('rect')
      .attr('x', (c) => m.l + c.i * cw + 1).attr('y', (c) => m.t + c.j * ch + 1)
      .attr('width', Math.max(0, cw - 2)).attr('height', ch - 2)
      .attr('fill', cssv('--blue')).attr('fill-opacity', (c) => 0.05 + 0.95 * Math.pow(c.s / max, 1.2))
      .on('pointermove', (event, c) => tip(event, `${MESES_L[c.i]} de ${c.ano}`, [{ label: 'Inícios', value: fN(c.n) }, { label: 'Fatia do ano', value: fP1(c.s) }]))
      .on('pointerleave', hideTip);
  }

  /* ---------- trecho 3: destinos ---------- */
  function valorPais(p) {
    if (state.periodo === TODO) return { n: p.n, s: p.n / DATA.meta.total, rank: DATA.paises.indexOf(p) + 1 };
    const n = p.periodos[state.periodo];
    return { n, s: n / DATA.tot_periodos[state.periodo], rank: p.rank[state.periodo] };
  }

  function drawMap() {
    const box = document.getElementById('chart-map');
    box.replaceChildren();
    const key = document.getElementById('map-key');
    key.replaceChildren();
    if (!WORLD) { box.append(el('p', 'fig-note', 'Não foi possível carregar o mapa-múndi.')); return; }
    const feats = worldFeatures();
    const W = box.clientWidth || 900;
    const H = Math.round(W * 0.48);
    const proj = d3.geoEqualEarth().fitSize([W, H], { type: 'FeatureCollection', features: feats });
    const path = d3.geoPath(proj);
    const porIso = new Map(DATA.paises.map((p) => [p.iso, p]));
    const max = d3.max(DATA.paises, (p) => valorPais(p).s);
    const op = d3.scaleSqrt([0, max], [0.06, 1]);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const show = (event, p) => {
      const v = valorPais(p);
      tip(event, p.pais, [
        { label: state.periodo === TODO ? '1992–2026' : state.periodo, value: fN(v.n) + ' bolsas' },
        { label: 'Fatia do período', value: fP1(v.s) },
        { label: 'Posição', value: v.rank ? v.rank + 'º' : '—' },
      ]);
    };
    svg.append('g').selectAll('path').data(feats).join('path')
      .attr('d', path).attr('fill', cssv('--land')).attr('stroke', cssv('--land-line')).attr('stroke-width', 0.5);
    svg.append('g').selectAll('path').data(feats.filter((f) => porIso.has(f.id) && valorPais(porIso.get(f.id)).n > 0)).join('path')
      .attr('d', path).attr('fill', cssv('--blue')).attr('fill-opacity', (f) => op(valorPais(porIso.get(f.id)).s))
      .attr('stroke', cssv('--land-line')).attr('stroke-width', 0.5)
      .on('pointermove', (event, f) => show(event, porIso.get(f.id)))
      .on('pointerleave', hideTip);
    const comForma = new Set(feats.map((f) => f.id));
    const pequenos = DATA.paises.filter((p) => !comForma.has(p.iso) && valorPais(p).n > 0);
    svg.append('g').selectAll('circle').data(pequenos).join('circle')
      .attr('cx', (p) => proj([p.lon, p.lat])[0]).attr('cy', (p) => proj([p.lon, p.lat])[1]).attr('r', 3.5)
      .attr('fill', cssv('--blue')).attr('fill-opacity', (p) => op(valorPais(p).s)).attr('stroke', cssv('--blue'))
      .on('pointermove', show).on('pointerleave', hideTip);
    const br = feats.find((f) => f.id === '076');
    if (br) svg.append('path').attr('d', path(br)).attr('fill', cssv('--paper-2')).attr('stroke', cssv('--muted')).attr('stroke-width', 0.6);
    const [sx, sy] = proj(SP);
    svg.append('circle').attr('cx', sx).attr('cy', sy).attr('r', 4).attr('fill', cssv('--red'));
    // destaque dos três maiores do período
    const top = [...DATA.paises].sort((a, b) => valorPais(b).n - valorPais(a).n).slice(0, W < 560 ? 1 : 3);
    for (const p of top) {
      const [x, y] = proj([p.lon, p.lat]);
      svg.append('text').attr('x', x).attr('y', y + 4).attr('text-anchor', 'middle').attr('class', 'lbl-strong')
        .attr('paint-order', 'stroke').attr('stroke', cssv('--paper')).attr('stroke-width', 3)
        .text(fP0(valorPais(p).s));
    }
    // legenda
    const bar = el('div');
    bar.style.cssText = `height:10px;width:min(240px,60vw);background:linear-gradient(90deg, color-mix(in srgb, ${cssv('--blue')} 8%, ${cssv('--land')}), ${cssv('--blue')})`;
    key.style.cssText = 'display:flex;align-items:center;gap:10px;font-family:var(--label);font-size:.84rem;color:var(--muted)';
    key.append(el('span', '', '0%'), bar, el('span', '', fP0(max) + ' das bolsas do período'));
  }

  function drawBump() {
    const box = document.getElementById('chart-bump');
    box.replaceChildren();
    const pers = DATA.meta.periodos;
    const top = DATA.paises.slice(0, 10);
    const W = box.clientWidth || 520;
    const largo = W >= 520;
    const m = { t: 30, r: 104, b: 12, l: largo ? 104 : 18 };
    const maxRank = d3.max(top, (p) => d3.max(pers, (k) => p.rank[k] || 0));
    const H = m.t + maxRank * 30 + m.b;
    const x = d3.scalePoint(pers, [m.l, W - m.r]);
    const y = d3.scaleLinear([1, maxRank], [m.t + 10, H - m.b - 10]);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const curto = x.step() < 72;
    svg.append('g').selectAll('text').data(pers).join('text')
      .attr('x', (k) => x(k)).attr('y', 12).attr('text-anchor', 'middle')
      .text((k) => (curto ? k.replace(/(\d\d)(\d\d)–(\d\d)(\d\d)/, '$2–$4') : k));
    const cor = (p) => (p.pais === 'Estados Unidos' ? cssv('--red') : p.pais === 'Espanha' || p.pais === 'Portugal' ? cssv('--blue') : cssv('--c6'));
    const line = d3.line().defined((d) => d.r).x((d) => x(d.k)).y((d) => y(d.r));
    const grupos = svg.append('g').selectAll('g').data(top).join('g').attr('class', 'bump');
    grupos.append('path').attr('d', (p) => line(pers.map((k) => ({ k, r: p.rank[k] }))))
      .attr('fill', 'none').attr('stroke', cor).attr('stroke-width', 3).attr('stroke-linejoin', 'round');
    grupos.selectAll('circle').data((p) => pers.filter((k) => p.rank[k]).map((k) => ({ p, k }))).join('circle')
      .attr('cx', (d) => x(d.k)).attr('cy', (d) => y(d.p.rank[d.k])).attr('r', 9)
      .attr('fill', cssv('--paper')).attr('stroke', (d) => cor(d.p)).attr('stroke-width', 2);
    grupos.selectAll('text.rk').data((p) => pers.filter((k) => p.rank[k]).map((k) => ({ p, k }))).join('text')
      .attr('class', 'rk').attr('x', (d) => x(d.k)).attr('y', (d) => y(d.p.rank[d.k]) + 4).attr('text-anchor', 'middle')
      .attr('font-size', 10).text((d) => d.p.rank[d.k]);
    const last = pers[pers.length - 1], first = pers[0];
    grupos.append('text').attr('x', W - m.r + 14).attr('y', (p) => y(p.rank[last]) + 4).attr('class', 'lbl-strong').text((p) => p.pais);
    if (largo) {
      grupos.filter((p) => p.rank[first]).append('text').attr('x', m.l - 14).attr('y', (p) => y(p.rank[first]) + 4)
        .attr('text-anchor', 'end').text((p) => p.pais);
    }
    grupos.on('pointerenter', function (event, p) {
      grupos.attr('opacity', (q) => (q === p ? 1 : 0.18));
      tip(event, p.pais, pers.map((k) => ({ label: k, value: p.rank[k] ? `${p.rank[k]}º · ${fP1(p.periodos[k] / DATA.tot_periodos[k])}` : '—' })));
    }).on('pointermove', moveTip).on('pointerleave', () => { grupos.attr('opacity', 1); hideTip(); });
  }

  function drawMatrix() {
    const t = document.getElementById('matrix');
    t.replaceChildren();
    const cols = [...DATA.meta.top_paises, 'Outros'];
    const head = el('thead'); const hr = el('tr');
    hr.append(el('th', '', 'Grande área'));
    for (const c of cols) { const th = el('th', '', SIGLA_PAIS[c] || c); th.title = c; hr.append(th); }
    head.append(hr); t.append(head);
    const max = d3.max(DATA.matriz, (r) => d3.max(DATA.meta.top_paises, (c) => r[c]));
    const body = el('tbody');
    for (const r of DATA.matriz) {
      const tr = el('tr');
      tr.append(el('td', '', r.grande_area));
      for (const c of cols) {
        const v = r[c];
        const td = el('td', 'cell', fP0(v));
        if (c !== 'Outros') {
          const k = Math.round((v / max) * 85);
          td.style.background = `color-mix(in srgb, ${cssv('--blue')} ${k}%, transparent)`;
          if (k > 50) td.style.color = cssv('--paper');
        } else td.style.color = cssv('--muted');
        tr.append(td);
      }
      body.append(tr);
    }
    t.append(body);
  }

  /* ---------- trecho 4: origem ---------- */
  function drawTree() {
    const box = document.getElementById('chart-tree');
    box.replaceChildren();
    const W = box.clientWidth || 900, H = box.clientHeight || 560;
    const root = d3.hierarchy(DATA.arvore).sum((d) => (d.children ? 0 : d.value)).sort((a, b) => b.value - a.value);
    d3.treemap().size([W, H]).paddingOuter(2).paddingTop(20).paddingInner(1).round(true)(root);
    const cores = ['--a1', '--a4', '--a2', '--a3', '--a5', '--a6', '--a7', '--a9'];
    const corDe = new Map(root.children.map((c, i) => [c.data.name, c.data.name === 'Outras instituições' ? cssv('--c6') : cssv(cores[i] || '--a8')]));
    for (const g of root.children) {
      const lab = el('div', 'tm-group', `${sigla(g.data.name)} · ${fN(g.value)}`);
      Object.assign(lab.style, { left: g.x0 + 'px', top: g.y0 + 2 + 'px', width: Math.max(0, g.x1 - g.x0) + 'px' });
      if (g.x1 - g.x0 < 40) lab.textContent = '';
      box.append(lab);
    }
    for (const leaf of root.leaves()) {
      const w = leaf.x1 - leaf.x0, h = leaf.y1 - leaf.y0;
      const d = el('div', 'tm-node tm-leaf');
      const uni = leaf.parent.data.name;
      Object.assign(d.style, { left: leaf.x0 + 'px', top: leaf.y0 + 'px', width: w + 'px', height: h + 'px', background: corDe.get(uni), color: cssv('--paper') });
      d.style.opacity = leaf.data.name === 'Demais unidades' ? 0.55 : 1;
      if (w > 64 && h > 34) {
        const nome = leaf.data.name === uni ? sigla(uni) : leaf.data.name.replace(/^Campus de [^.]+\. /, '');
        d.append(el('span', '', corta(nome, Math.max(12, Math.floor((w / 6.2) * Math.max(1, Math.floor((h - 18) / 14)))))));
        d.append(el('b', '', fN(leaf.value)));
      }
      const show = (event) => tip(event, sigla(uni), [{ label: leaf.data.name, value: fN(leaf.value) }]);
      d.addEventListener('pointermove', show);
      d.addEventListener('pointerleave', hideTip);
      box.append(d);
    }
  }

  function barras(boxId, rows, { label, value, sub, color }) {
    const box = document.getElementById(boxId);
    box.replaceChildren();
    const max = d3.max(rows, (r) => r[value]);
    for (const r of rows) {
      const row = el('div', 'bar-row');
      const l = el('div', 'l', r[label]);
      if (sub) l.append(el('small', '', r[sub]));
      const t = el('div', 't'); const f = el('div', 'f');
      f.style.width = (r[value] / max) * 100 + '%';
      f.style.background = color ? color(r) : cssv('--blue');
      t.append(f);
      row.append(l, t, el('div', 'v', fN(r[value])));
      box.append(row);
    }
  }

  /* ---------- trecho 5: temas ---------- */
  function drawLegendAreas(onHover) {
    const box = document.getElementById('legend-areas');
    box.replaceChildren();
    for (const a of DATA.meta.grandes_areas) {
      const s = el('span'); const i = el('i'); i.style.background = areaCor(a);
      s.append(i, a);
      s.addEventListener('pointerenter', () => onHover(a));
      s.addEventListener('pointerleave', () => onHover(null));
      box.append(s);
    }
  }

  function drawStream() {
    const box = document.getElementById('chart-stream');
    box.replaceChildren();
    const keys = DATA.meta.grandes_areas;
    const rows = DATA.ga_ano;
    const W = box.clientWidth || 900;
    const H = Math.max(280, Math.min(420, Math.round(W * 0.4)));
    const m = { t: 8, r: 6, b: 26, l: 40 };
    const series = d3.stack().keys(keys).offset(d3.stackOffsetExpand)(rows);
    const x = d3.scaleLinear(d3.extent(rows, (d) => d.ano), [m.l, W - m.r]);
    const y = d3.scaleLinear([0, 1], [H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const area = d3.area().x((d) => x(d.data.ano)).y0((d) => y(d[0])).y1((d) => y(d[1]));
    const paths = svg.append('g').selectAll('path').data(series).join('path')
      .attr('d', area).attr('fill', (s) => areaCor(s.key)).attr('stroke', cssv('--paper')).attr('stroke-width', 0.6);
    svg.append('g').selectAll('text').data([0, 0.25, 0.5, 0.75, 1]).join('text')
      .attr('x', m.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(fP0);
    const ticks = x.ticks(Math.max(3, Math.floor(W / 90))).filter(Number.isInteger);
    svg.append('g').selectAll('text').data(ticks).join('text')
      .attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => d);
    const rule = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', cssv('--ink')).attr('visibility', 'hidden');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (event) => {
        const ano = Math.round(x.invert(d3.pointer(event)[0]));
        const d = rows.find((r) => r.ano === ano);
        if (!d) return;
        const t = d3.sum(keys, (k) => d[k]);
        rule.attr('x1', x(ano)).attr('x2', x(ano)).attr('visibility', 'visible');
        tip(event, `${ano} · ${fN(t)} bolsas`, [...keys].reverse().map((k) => ({ color: areaCor(k), label: k, value: fP0(d[k] / t) })));
      })
      .on('pointerleave', () => { rule.attr('visibility', 'hidden'); hideTip(); });
    drawLegendAreas((a) => paths.attr('fill-opacity', (s) => (!a || s.key === a ? 1 : 0.18)));
  }

  function drawExplorer() {
    const box = document.getElementById('chart-temas');
    box.replaceChildren();
    const chips = document.getElementById('tema-chips');
    chips.replaceChildren();
    const T = DATA.temas;
    const i0 = T.anos.indexOf(2002);
    const anos = T.anos.slice(i0);
    const palette = ['--a1', '--a4', '--a2', '--a5', '--a3', '--a6'].map(cssv);
    const sel = state.temas.map((nome) => T.lista.find((d) => d.tema === nome)).filter(Boolean);
    sel.forEach((d, i) => {
      const c = el('span', 'chip'); const dot = el('i'); dot.style.background = palette[i];
      const rm = el('button', '', '×'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remover ' + d.tema);
      rm.addEventListener('click', () => { state.temas = state.temas.filter((t) => t !== d.tema); drawExplorer(); });
      c.append(dot, d.tema, rm); chips.append(c);
    });
    const W = box.clientWidth || 520;
    const H = Math.max(260, Math.min(360, Math.round(W * 0.62)));
    const labW = W < 420 ? 0 : 128;
    const m = { t: 10, r: labW + 8, b: 26, l: 40 };
    const series = sel.map((d, i) => ({ d, cor: palette[i], v: anos.map((a, j) => ({ a, n: d.serie[i0 + j], s: d.serie[i0 + j] / T.totais_ano[i0 + j] })) }));
    const x = d3.scaleLinear([anos[0], anos[anos.length - 1]], [m.l, W - m.r]);
    const y = d3.scaleLinear([0, d3.max(series, (s) => d3.max(s.v, (p) => p.s)) || 0.01], [H - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const yt = y.ticks(4);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y)
      .attr('stroke', cssv('--rule')).attr('stroke-dasharray', (d) => (d ? '2 3' : null));
    svg.append('g').selectAll('text').data(yt).join('text').attr('x', m.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(fP1);
    svg.append('g').selectAll('text').data(x.ticks(Math.max(3, Math.floor((W - m.r) / 80))).filter(Number.isInteger)).join('text')
      .attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => d);
    const line = d3.line().x((p) => x(p.a)).y((p) => y(p.s));
    svg.append('g').selectAll('path').data(series).join('path').attr('d', (s) => line(s.v))
      .attr('fill', 'none').attr('stroke', (s) => s.cor).attr('stroke-width', 2.2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    if (labW) {
      const labs = dodge(series.map((s) => ({ s, y: y(s.v[s.v.length - 1].s) })), 14, m.t + 4, H - m.b);
      svg.append('g').selectAll('text').data(labs).join('text')
        .attr('x', W - m.r + 8).attr('y', (l) => l.y + 4).attr('fill', (l) => l.s.cor).attr('font-weight', 600)
        .text((l) => corta(l.s.d.tema, 20));
    }
    const rule = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', cssv('--ink')).attr('visibility', 'hidden');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', Math.max(0, W - m.l - m.r)).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (event) => {
        const a = Math.round(x.invert(d3.pointer(event)[0]));
        const j = anos.indexOf(a);
        if (j < 0 || !series.length) return;
        rule.attr('x1', x(a)).attr('x2', x(a)).attr('visibility', 'visible');
        tip(event, String(a), series.map((s) => ({ color: s.cor, label: corta(s.d.tema, 26), value: `${fP1(s.v[j].s)} · ${fN(s.v[j].n)}` })));
      })
      .on('pointerleave', () => { rule.attr('visibility', 'hidden'); hideTip(); });
  }

  function setupExplorer() {
    const list = document.getElementById('tema-list');
    for (const d of DATA.temas.lista) { const o = el('option'); o.value = d.tema; list.append(o); }
    const input = document.getElementById('tema-input');
    const add = () => {
      const q = input.value.trim().toLowerCase();
      const hit = DATA.temas.lista.find((d) => d.tema.toLowerCase() === q);
      if (!hit) { input.style.borderColor = cssv('--red'); return; }
      input.style.borderColor = '';
      if (!state.temas.includes(hit.tema)) state.temas = [...state.temas, hit.tema].slice(-6);
      input.value = '';
      drawExplorer();
    };
    document.getElementById('tema-add').addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    input.addEventListener('change', () => { if (DATA.temas.lista.some((d) => d.tema === input.value)) add(); });
  }

  function drawSlope() {
    const box = document.getElementById('chart-slope');
    box.replaceChildren();
    const rows = DATA.ascensao.filter((d) => d.antes >= 5).slice(0, 12);
    const W = box.clientWidth || 520;
    const labW = Math.min(230, Math.max(150, W * 0.42));
    const m = { t: 28, r: labW, b: 12, l: 46 };
    const H = 420;
    const y = d3.scaleLinear([0, d3.max(rows, (d) => d.share_depois)], [H - m.b, m.t]).nice();
    const x0 = m.l, x1 = W - m.r - 10;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    svg.append('text').attr('x', x0).attr('y', 12).attr('text-anchor', 'middle').attr('class', 'lbl-strong').text('2012–17');
    svg.append('text').attr('x', x1).attr('y', 12).attr('text-anchor', 'middle').attr('class', 'lbl-strong').text('2021–26');
    for (const xx of [x0, x1]) svg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', m.t - 6).attr('y2', H - m.b).attr('stroke', cssv('--rule'));
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text')
      .attr('x', x0 - 10).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(fP1);
    const g = svg.append('g').selectAll('g').data(rows).join('g');
    g.append('line').attr('x1', x0).attr('x2', x1).attr('y1', (d) => y(d.share_antes)).attr('y2', (d) => y(d.share_depois))
      .attr('stroke', (d, i) => (i < 3 ? cssv('--red') : cssv('--blue'))).attr('stroke-width', 1.8).attr('stroke-opacity', 0.8);
    g.append('circle').attr('cx', x0).attr('cy', (d) => y(d.share_antes)).attr('r', 3).attr('fill', cssv('--muted'));
    g.append('circle').attr('cx', x1).attr('cy', (d) => y(d.share_depois)).attr('r', 3.5).attr('fill', (d, i) => (i < 3 ? cssv('--red') : cssv('--blue')));
    const labs = dodge(rows.map((d) => ({ d, y: y(d.share_depois) })), 15, m.t, H - m.b);
    const maxChars = Math.floor((labW - 16) / 6.4);
    svg.append('g').selectAll('text').data(labs).join('text')
      .attr('x', x1 + 10).attr('y', (l) => l.y + 4).attr('fill', cssv('--ink'))
      .text((l) => `${corta(l.d.tema, maxChars - 6)} ${L.format('.1f')(l.d.razao)}×`);
    g.on('pointermove', (event, d) => tip(event, d.tema, [
      { label: '2012–2017', value: `${fN(d.antes)} · ${fP1(d.share_antes)}` },
      { label: '2021–2026', value: `${fN(d.depois)} · ${fP1(d.share_depois)}` },
      { label: 'Crescimento da fatia', value: L.format('.1f')(d.razao) + '×' },
    ])).on('pointerleave', hideTip);
  }

  function drawNovos() {
    const box = document.getElementById('novos');
    box.replaceChildren();
    for (const d of DATA.ascensao.filter((r) => r.antes === 0).sort((a, b) => b.depois - a.depois)) {
      const c = el('span', 'chip');
      c.append(d.tema + ' ', el('b', '', fN(d.depois)));
      box.append(c);
    }
  }

  function drawTemasArea() {
    const box = document.getElementById('temas-area');
    box.replaceChildren();
    for (const a of DATA.meta.grandes_areas) {
      const card = el('div', 'area-card');
      const h = el('h3'); h.style.color = areaCor(a); h.append(el('span', '', a));
      const ol = el('ol');
      for (const t of DATA.temas_area[a] || []) ol.append(el('li', '', t));
      card.append(h, ol);
      box.append(card);
    }
  }

  /* ---------- trecho 6: anfitriãs ---------- */
  function drawHosts() {
    const tbody = document.querySelector('#hosts tbody');
    const q = document.getElementById('host-search').value.trim().toLowerCase();
    tbody.replaceChildren();
    const max = DATA.anfitrias[0].n;
    DATA.anfitrias.forEach((h, i) => {
      if (q && !`${h.nome} ${h.pais} ${h.area}`.toLowerCase().includes(q)) return;
      const tr = el('tr');
      const nc = el('td', 'num', fN(h.n));
      const bar = el('span', 'bar'); bar.style.width = Math.round((h.n / max) * 64) + 'px';
      nc.prepend(bar);
      tr.append(el('td', 'num', String(i + 1)), el('td', 'name', h.nome), el('td', '', h.pais), el('td', '', h.area),
        el('td', 'num', h.primeiro === h.ultimo ? String(h.primeiro) : `${h.primeiro}–${h.ultimo}`), nc);
      tbody.append(tr);
    });
    if (!tbody.children.length) {
      const tr = el('tr'); const td = el('td', '', 'Nenhuma instituição encontrada entre as cem mais frequentes.');
      td.colSpan = 6; tr.append(td); tbody.append(tr);
    }
  }

  /* ---------- gestão e assessoria ---------- */
  const pessoa = (nome, url) => {
    if (!url) return el('span', 'p-name', nome);
    const a = el('a', 'p-name', nome); a.href = url; a.target = '_blank'; a.rel = 'noopener';
    return a;
  };

  function drawGestao(rows) {
    const box = document.getElementById('gestao-lista');
    box.replaceChildren();
    for (const [orgao, lista] of d3.group(rows, (r) => r.orgao)) {
      const col = el('div', 'people');
      col.append(el('h3', '', orgao));
      const ul = el('ul');
      for (const r of lista) {
        const li = el('li');
        li.append(el('span', 'p-name', r.nome), el('span', 'p-role', r.cargo));
        ul.append(li);
      }
      col.append(ul);
      box.append(col);
    }
  }

  let ASSESSORIA = [];
  function drawAssessoria() {
    const box = document.getElementById('assessoria-lista');
    const q = document.getElementById('assessoria-search').value.trim().toLowerCase();
    box.replaceChildren();
    const rows = q ? ASSESSORIA.filter((r) => `${r.nome} ${r.area} ${r.grupo} ${r.papel} ${r.coordenadoria}`.toLowerCase().includes(q)) : ASSESSORIA;
    for (const [coord, porArea] of d3.group(rows, (r) => r.coordenadoria, (r) => r.area)) {
      const det = el('details', 'coord');
      det.open = true;
      const n = d3.sum([...porArea.values()], (l) => l.length);
      const sum = el('summary');
      sum.append(el('span', '', coord), el('b', '', fN(n)));
      det.append(sum);
      const grid = el('div', 'dir-grid');
      for (const [area, lista] of porArea) {
        const card = el('div', 'dir-card');
        card.append(el('h4', '', area));
        for (const [grupo, gl] of d3.group(lista, (r) => r.grupo)) {
          if (grupo) card.append(el('p', 'dir-group', grupo));
          const ul = el('ul');
          for (const r of gl) {
            const li = el('li');
            li.append(pessoa(r.nome, r.perfil_url), el('span', 'p-role', r.papel));
            ul.append(li);
          }
          card.append(ul);
        }
        grid.append(card);
      }
      det.append(grid);
      box.append(det);
    }
    if (!rows.length) box.append(el('p', 'fig-note', 'Ninguém encontrado na Assessoria Científica.'));
  }

  function startPessoas() {
    Promise.all([d3.csv('data/fapesp_gestao.csv'), d3.csv('data/fapesp_assessoria_cientifica.csv')]).then(([gestao, assessoria]) => {
      drawGestao(gestao);
      ASSESSORIA = assessoria;
      document.getElementById('n-assessoria').textContent = fN(assessoria.length);
      drawAssessoria();
      document.getElementById('assessoria-search').addEventListener('input', drawAssessoria);
    }).catch(() => {
      document.getElementById('assessoria-lista').append(el('p', 'fig-note', 'Não foi possível carregar as listas. Use os links de CSV abaixo.'));
    });
  }

  /* ---------- aba BEPE hoje ---------- */
  let H = null;
  const fData = (s) => (s ? s.split('-').reverse().join('/') : '—');
  const varP = (a, b) => {
    if (!b) return '—';
    const v = a / b - 1;
    return (v >= 0 ? '+' : '−') + fP0(Math.abs(v));
  };

  function textoAreas() {
    const q = H.areas_corte.filter((d) => d.depois_ant >= 20).map((d) => ({ ...d, v: d.depois / d.depois_ant - 1 })).sort((a, b) => a.v - b.v);
    if (!q.length) return '';
    const nome = (d) => d.modalidade;
    const todas = H.areas_corte.every((d) => d.depois < d.depois_ant);
    const f = (d) => `${nome(d)} (${varP(d.depois, d.depois_ant)})`;
    return `Entre os pedidos do processo ${fN(H.kpis.corte)} em diante, ${todas ? 'todas as grandes áreas caem' : 'a maioria das grandes áreas cai'}. As maiores quedas, entre as áreas com ao menos 20 bolsas no mesmo trecho de ${H.kpis.ano_anterior}, são em ${q.slice(0, 3).map(f).join(', ').replace(/, ([^,]*)$/, ' e $1')}; as menores, em ${q.slice(-2).map(f).join(' e ')}.`;
  }

  function fillHoje() {
    const k = H.kpis;
    const ic = H.modalidades.find((m) => m.modalidade === 'Iniciação científica');
    const dp = H.duracao.filter((d) => d.modalidade === 'Doutorado' || d.modalidade === 'Pós-doutorado');
    const V = {
      ...k,
      var_mesmo_ponto: varP(k.pedidos_ano, k.pedidos_ant_mesmo_ponto),
      var_depois: varP(k.depois_corte, k.depois_corte_ant),
      var_antes: varP(k.antes_corte, k.antes_corte_ant),
      corte_inicio: fData(k.corte_inicio_min),
      var_ic: ic ? varP(ic.depois, ic.depois_ant) : '—',
      atuais: k.no_exterior + k.a_iniciar,
      acima6_pct: fP0(d3.sum(dp, (d) => d.acima6) / d3.sum(dp, (d) => d.n)),
      top_pais: H.agora.paises[0][0], top_pais_n: H.agora.paises[0][1],
      var_ini: varP(k.ini_ate_ref, k.ini_ate_ref_ant),
      pd_depois_pct: k.pd_depois_n ? fP0(k.pd_depois_acima6 / k.pd_depois_n) : '—',
      areas_texto: textoAreas(),
    };
    for (const n of document.querySelectorAll('[data-h]')) {
      const v = V[n.dataset.h];
      if (v === undefined) continue;
      n.textContent = typeof v === 'number' && !/^ano/.test(n.dataset.h) ? fN(v) : String(v);
    }
    for (const n of document.querySelectorAll('[data-h-data]')) n.textContent = fData(H[n.dataset.hData]);
  }

  function drawAcum() {
    const box = document.getElementById('chart-acum');
    box.replaceChildren();
    const anos = Object.keys(H.acumulado).sort();
    const atual = String(H.kpis.ano);
    const W = box.clientWidth || 800;
    const Hh = W < 560 ? 300 : 400;
    const m = { t: 16, r: W < 560 ? 64 : 96, b: 40, l: 46 };
    const xmax = d3.max(anos, (a) => d3.max(H.acumulado[a], (p) => p[0]));
    const ymax = d3.max(anos, (a) => d3.max(H.acumulado[a], (p) => p[1]));
    const x = d3.scaleLinear([0, xmax], [m.l, W - m.r]);
    const y = d3.scaleLinear([0, ymax], [Hh - m.b, m.t]).nice();
    const cor = (a) => (a === atual ? cssv('--red') : a === String(H.kpis.ano_anterior) ? cssv('--ink') : cssv('--muted'));
    const op = (a) => (a === atual || a === String(H.kpis.ano_anterior) ? 1 : 0.45);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${Hh}`).attr('width', W).attr('height', Hh);
    svg.append('g').selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y)
      .attr('stroke', cssv('--rule')).attr('stroke-dasharray', (d) => (d ? '2 3' : null));
    svg.append('g').selectAll('text').data(y.ticks(5)).join('text')
      .attr('x', m.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('class', 'lbl').text(fN);
    svg.append('g').selectAll('text').data(x.ticks(W < 560 ? 3 : 6)).join('text')
      .attr('x', x).attr('y', Hh - m.b + 18).attr('text-anchor', 'middle').attr('class', 'lbl').text(fN);
    svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', Hh - 4).attr('text-anchor', 'middle').attr('class', 'lbl')
      .text('número do processo (ordem do pedido no ano)');
    // início da faixa em que 2026 fica abaixo da metade de 2025
    const xc = x(H.kpis.corte);
    svg.append('rect').attr('x', xc).attr('y', m.t).attr('width', Math.max(0, x(H.kpis.max_seq) - xc)).attr('height', Hh - m.b - m.t)
      .attr('fill', cssv('--red')).attr('fill-opacity', 0.06);
    svg.append('line').attr('x1', xc).attr('x2', xc).attr('y1', m.t).attr('y2', Hh - m.b)
      .attr('stroke', cssv('--red')).attr('stroke-dasharray', '4 3');
    svg.append('text').attr('x', xc - 6).attr('y', m.t + 12).attr('text-anchor', 'end').attr('class', 'lbl-strong')
      .attr('fill', cssv('--red')).text('nº ' + fN(H.kpis.corte));
    const line = d3.line().x((p) => x(p[0])).y((p) => y(p[1])).curve(d3.curveStepAfter);
    const labels = [];
    for (const a of anos) {
      const pts = H.acumulado[a];
      svg.append('path').attr('d', line(pts)).attr('fill', 'none').attr('stroke', cor(a)).attr('stroke-opacity', op(a))
        .attr('stroke-width', a === atual ? 3 : 1.6);
      const last = pts[pts.length - 1];
      labels.push({ a, x: x(last[0]), y: y(last[1]), n: last[1] });
      if (a === atual) svg.append('circle').attr('cx', x(last[0])).attr('cy', y(last[1])).attr('r', 4.5).attr('fill', cssv('--red'));
    }
    // rótulos: o ano atual no fim da própria linha; os demais na margem direita
    const fim = labels.filter((l) => l.a !== atual).map((l) => ({ ...l, x: W - m.r + 8 }));
    dodge(fim, 15, m.t + 6, Hh - m.b);
    const estreito = W < 560;
    const cur = labels.filter((l) => l.a === atual).map((l) => (estreito ? { ...l, x: l.x, y: l.y + 22, anchor: 'end' } : { ...l, x: l.x + 8 }));
    for (const l of [...fim, ...cur]) {
      svg.append('text').attr('x', l.x).attr('y', l.y + 4).attr('class', 'lbl-strong').attr('fill', cor(l.a))
        .attr('text-anchor', l.anchor || 'start').attr('fill-opacity', op(l.a)).text(`${l.a} · ${fN(l.n)}`);
    }
    // leitura no passar do mouse
    const rule = svg.append('line').attr('y1', m.t).attr('y2', Hh - m.b).attr('stroke', cssv('--ink')).attr('visibility', 'hidden');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', Hh - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (event) => {
        const [px] = d3.pointer(event);
        const s = x.invert(px);
        rule.attr('x1', px).attr('x2', px).attr('visibility', 'visible');
        tip(event, `Até o processo ${fN(Math.round(s / 100) * 100)}`, anos.slice().reverse().map((a) => {
          const pts = H.acumulado[a];
          const p = pts[Math.min(pts.length - 1, d3.bisector((q) => q[0]).left(pts, s))];
          const fora = a === atual && s > H.kpis.max_seq;
          return { label: a, value: fora ? 'ainda sem dados' : fN(p[1]), color: cor(a) };
        }));
      })
      .on('pointerleave', () => { rule.attr('visibility', 'hidden'); hideTip(); });
    const lg = document.getElementById('legend-acum');
    lg.replaceChildren();
    for (const a of anos.slice().reverse()) {
      const sp = el('span'); const i = el('i'); i.style.background = cor(a); i.style.opacity = op(a);
      sp.append(i, a); lg.append(sp);
    }
  }

  function drawModsHoje(id = 'mods-hoje', dados = H.modalidades) {
    const box = document.getElementById(id);
    box.replaceChildren();
    const k = H.kpis;
    const head = el('div', 'mods-row mods-head');
    head.append(el('span', '', ''), el('span', '', 'Antes do processo ' + fN(k.corte)), el('span', '', 'Do ' + fN(k.corte) + ' em diante'));
    box.append(head);
    const maxA = d3.max(dados, (d) => Math.max(d.antes, d.antes_ant));
    const maxD = d3.max(dados, (d) => Math.max(d.depois, d.depois_ant));
    const celula = (atual, ant, max) => {
      const c = el('div', 'mods-cell');
      for (const [ano, v, cls] of [[k.ano_anterior, ant, 'b-ant'], [k.ano, atual, 'b-atual']]) {
        const r = el('div', 'mods-bar ' + cls);
        const t = el('span', 't'); const f = el('span', 'f'); f.style.width = (v / max) * 100 + '%';
        t.append(f);
        r.append(el('span', 'y', String(ano)), t, el('b', '', fN(v)));
        c.append(r);
      }
      const v = varP(atual, ant);
      const chip = el('span', 'mods-var' + (atual < ant * 0.8 ? ' neg' : ''), v);
      c.append(chip);
      return c;
    };
    for (const d of dados) {
      const row = el('div', 'mods-row');
      const c1 = celula(d.antes, d.antes_ant, maxA); c1.dataset.label = 'Antes do processo ' + fN(k.corte);
      const c2 = celula(d.depois, d.depois_ant, maxD); c2.dataset.label = 'Do ' + fN(k.corte) + ' em diante';
      row.append(el('span', 'mods-name', d.modalidade), c1, c2);
      box.append(row);
    }
  }

  function drawInicios() {
    const box = document.getElementById('chart-inicios');
    box.replaceChildren();
    const rows = H.inicios;
    const W = box.clientWidth || 800;
    const Hh = 260;
    const m = { t: 22, r: 8, b: 42, l: 40 };
    const x = d3.scaleBand(rows.map((r) => r[0]), [m.l, W - m.r]).padding(0.22);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => r[1])], [Hh - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${Hh}`).attr('width', W).attr('height', Hh);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', cssv('--rule')).attr('stroke-dasharray', (d) => (d ? '2 3' : null));
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text')
      .attr('x', m.l - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('class', 'lbl').text(fN);
    const lbl = (s) => { const [a, mm] = s.split('-'); return MESES[+mm - 1] + (mm === '01' || s === rows[0][0] ? '/' + a.slice(2) : ''); };
    const passo = W < 560 ? 3 : 1;
    svg.append('g').selectAll('text').data(rows.filter((r, i) => i % passo === 0)).join('text')
      .attr('x', (r) => x(r[0]) + x.bandwidth() / 2).attr('y', Hh - m.b + 16).attr('text-anchor', 'middle').attr('class', 'lbl').text((r) => lbl(r[0]));
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', (r) => x(r[0])).attr('width', x.bandwidth()).attr('y', (r) => y(r[1])).attr('height', (r) => y(0) - y(r[1]))
      .attr('rx', 3).attr('fill', (r) => (r[2] ? 'transparent' : cssv('--blue')))
      .attr('stroke', (r) => (r[2] ? cssv('--red') : 'none')).attr('stroke-width', 1.6)
      .on('pointermove', (event, r) => tip(event, lbl(r[0]).replace(/\/\d+$/, '') + ' de ' + r[0].slice(0, 4), [{ label: r[2] ? 'Partidas marcadas' : 'Estágios iniciados', value: fN(r[1]) }]))
      .on('pointerleave', hideTip);
    const futuro = rows.findIndex((r) => r[2]);
    if (futuro > 0) {
      const xf = x(rows[futuro][0]) - (x.step() * x.paddingInner()) / 2;
      svg.append('line').attr('x1', xf).attr('x2', xf).attr('y1', m.t - 10).attr('y2', Hh - m.b).attr('stroke', cssv('--ink')).attr('stroke-dasharray', '3 3');
      svg.append('text').attr('x', xf + 6).attr('y', m.t - 2).attr('class', 'lbl-strong').text('dados de ' + fData(H.dados_de));
    }
  }

  const FAIXAS = ['até 3 meses', '3 a 6', '6 a 9', '9 a 12'];
  function drawDur() {
    const box = document.getElementById('dur-hoje');
    box.replaceChildren();
    const cores = ['#dcd7ce', '#b0aa9f', '#93a3ee', cssv('--blue')];
    const lg = document.getElementById('legend-dur');
    lg.replaceChildren();
    FAIXAS.forEach((f, i) => { const sp = el('span'); const ii = el('i'); ii.style.background = cores[i]; sp.append(ii, f); lg.append(sp); });
    for (const d of H.duracao) {
      const row = el('div', 'dur-row');
      const track = el('div', 'dur-track');
      d.faixas.forEach((v, i) => {
        if (!v) return;
        const s = el('span', 'dur-seg'); s.style.width = (v / d.n) * 100 + '%'; s.style.background = cores[i];
        s.addEventListener('pointermove', (e) => tip(e, `${d.modalidade}: ${FAIXAS[i]}`, [{ label: 'Bolsas', value: `${fN(v)} · ${fP0(v / d.n)}` }]));
        s.addEventListener('pointerleave', hideTip);
        track.append(s);
      });
      const seis = el('i', 'dur-six'); seis.style.left = ((d.faixas[0] + d.faixas[1]) / d.n) * 100 + '%';
      track.append(seis);
      const l = el('div', 'l', d.modalidade); l.append(el('small', '', fN(d.n) + ' bolsas'));
      row.append(l, track, el('div', 'v', d.acima6 ? fP0(d.acima6 / d.n) + ' > 6 m' : '0% > 6 m'));
      box.append(row);
    }
  }

  function drawTimeline() {
    const ol = document.getElementById('timeline');
    ol.replaceChildren();
    const hoje = new Date().toISOString().slice(0, 10);
    for (const e of H.eventos) {
      const li = el('li', e.data <= hoje ? 'past' : 'future');
      const quando = el('time', '', e.rotulo || fData(e.data)); quando.dateTime = e.data;
      const corpo = el('div');
      const h = el('h3', '', e.titulo);
      const p = el('p', '', e.texto + ' ');
      if (e.ref) { const a = el('a', '', `[${e.ref}]`); a.href = `#ref-${e.ref}`; p.append(a); }
      corpo.append(h, p);
      li.append(quando, corpo);
      ol.append(li);
    }
  }

  function drawChangelog() {
    const ol = document.getElementById('changelog');
    ol.replaceChildren();
    for (const u of H.atualizacoes.slice().reverse()) {
      const li = el('li'); const t = el('time', '', fData(u.data)); t.dateTime = u.data;
      li.append(t, el('span', '', u.texto)); ol.append(li);
    }
  }

  /* ---------- BEPE hoje: mês a mês ---------- */
  const MODS_MES = [['todas', 'Todas'], ['ic', 'Iniciação científica'], ['me', 'Mestrado'], ['do', 'Doutorado'], ['pd', 'Pós-doutorado']];
  const estMes = { mod: 'todas', dur: 'pd' };
  const somaMod = (o, mod) => (mod === 'todas' ? o.ic + o.me + o.do + o.pd : o[mod]);
  const legenda = (id, itens) => {
    const lg = document.getElementById(id);
    lg.replaceChildren();
    for (const [txt, fill, stroke] of itens) {
      const sp = el('span'); const i = el('i');
      i.style.background = fill; if (stroke) i.style.boxShadow = `inset 0 0 0 1.6px ${stroke}`;
      sp.append(i, txt); lg.append(sp);
    }
  };

  function drawMensal() {
    const box = document.getElementById('chart-mensal');
    box.replaceChildren();
    const k = H.kpis;
    const rows = H.mensal.map((d) => ({ mes: d.mes, a: somaMod(d.atual, estMes.mod), b: somaMod(d.ant, estMes.mod), futuro: d.futuro }));
    legenda('legend-mensal', [[String(k.ano_anterior), cssv('--muted')], [String(k.ano), cssv('--red')], [k.ano + ', ainda por começar', 'transparent', cssv('--red')]]);
    const W = box.clientWidth || 800;
    const Hh = W < 560 ? 240 : 300;
    const m = { t: 18, r: 6, b: 30, l: 38 };
    const x = d3.scaleBand(rows.map((r) => r.mes), [m.l, W - m.r]).padding(0.24);
    const xi = d3.scaleBand(['b', 'a'], [0, x.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r.a, r.b)) || 1], [Hh - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${Hh}`).attr('width', W).attr('height', Hh);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', cssv('--rule')).attr('stroke-dasharray', (d) => (d ? '2 3' : null));
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text')
      .attr('x', m.l - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('class', 'lbl').text(fN);
    svg.append('g').selectAll('text').data(rows).join('text')
      .attr('x', (r) => x(r.mes) + x.bandwidth() / 2).attr('y', Hh - m.b + 16).attr('text-anchor', 'middle').attr('class', 'lbl')
      .text((r) => MESES[r.mes - 1]);
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r) => `translate(${x(r.mes)},0)`);
    g.append('rect').attr('x', xi('b')).attr('width', xi.bandwidth()).attr('y', (r) => y(r.b)).attr('height', (r) => y(0) - y(r.b))
      .attr('rx', 2).attr('fill', cssv('--muted'));
    g.append('rect').attr('x', xi('a')).attr('width', xi.bandwidth()).attr('y', (r) => y(r.a)).attr('height', (r) => y(0) - y(r.a))
      .attr('rx', 2).attr('fill', (r) => (r.futuro ? 'transparent' : cssv('--red')))
      .attr('stroke', cssv('--red')).attr('stroke-width', (r) => (r.futuro ? 1.6 : 0));
    g.append('rect').attr('width', x.bandwidth()).attr('y', m.t).attr('height', Hh - m.b - m.t).attr('fill', 'transparent')
      .on('pointermove', (event, r) => tip(event, MESES_L[r.mes - 1], [
        { label: k.ano + (r.futuro ? ' (marcadas até ' + fData(H.dados_de) + ')' : ''), value: fN(r.a) },
        { label: String(k.ano_anterior), value: fN(r.b) },
        { label: 'Diferença', value: varP(r.a, r.b) }]))
      .on('pointerleave', hideTip);
    const f = rows.findIndex((r) => r.futuro);
    if (f > 0) {
      const xf = x(rows[f].mes) - (x.step() * x.paddingInner()) / 2;
      svg.append('line').attr('x1', xf).attr('x2', xf).attr('y1', m.t - 8).attr('y2', Hh - m.b).attr('stroke', cssv('--ink')).attr('stroke-dasharray', '3 3');
      svg.append('text').attr('x', xf - 6).attr('y', m.t).attr('text-anchor', 'end').attr('class', 'lbl-strong').text('dados de ' + fData(H.dados_de));
    }
  }

  function drawDurMes() {
    const box = document.getElementById('chart-durmes');
    box.replaceChildren();
    const curto = '#c9c3b8';
    legenda('legend-durmes', [['Até 6 meses', curto], ['Mais de 6 meses', cssv('--blue')], ['Ainda por começar', 'transparent', cssv('--ink-2')]]);
    const rows = H.duracao_mensal.map((d) => ({ mes: d.mes, n: d[estMes.dur][0], acima: d[estMes.dur][1], futuro: d.futuro }));
    const W = box.clientWidth || 800;
    const Hh = W < 560 ? 240 : 280;
    const m = { t: 22, r: 6, b: 30, l: 34 };
    const x = d3.scaleBand(rows.map((r) => r.mes), [m.l, W - m.r]).padding(0.2);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => r.n) || 1], [Hh - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${Hh}`).attr('width', W).attr('height', Hh);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', cssv('--rule')).attr('stroke-dasharray', (d) => (d ? '2 3' : null));
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text')
      .attr('x', m.l - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('class', 'lbl').text(fN);
    const passo = W < 560 ? 3 : 1;
    const lbl = (s) => { const [a, mm] = s.split('-'); return mm === '01' ? a : (passo > 1 ? '' : MESES[+mm - 1]); };
    svg.append('g').selectAll('text').data(rows).join('text')
      .attr('x', (r) => x(r.mes) + x.bandwidth() / 2).attr('y', Hh - m.b + 16).attr('text-anchor', 'middle')
      .attr('class', (r) => (r.mes.endsWith('-01') ? 'lbl-strong' : 'lbl')).text((r) => lbl(r.mes));
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r) => `translate(${x(r.mes)},0)`).attr('opacity', (r) => (r.futuro ? 0.55 : 1));
    g.append('rect').attr('width', x.bandwidth()).attr('y', (r) => y(r.acima)).attr('height', (r) => y(0) - y(r.acima)).attr('fill', cssv('--blue'));
    g.append('rect').attr('width', x.bandwidth()).attr('y', (r) => y(r.n)).attr('height', (r) => y(r.acima) - y(r.n)).attr('fill', curto);
    g.filter((r) => r.futuro).append('rect').attr('width', x.bandwidth()).attr('y', (r) => y(r.n)).attr('height', (r) => y(0) - y(r.n))
      .attr('fill', 'none').attr('stroke', cssv('--ink-2')).attr('stroke-width', 1.2);
    g.append('rect').attr('width', x.bandwidth()).attr('y', m.t).attr('height', Hh - m.b - m.t).attr('fill', 'transparent')
      .on('pointermove', (event, r) => {
        const [a, mm] = r.mes.split('-');
        tip(event, MESES_L[+mm - 1] + ' de ' + a + (r.futuro ? ' (marcadas)' : ''), [
          { label: 'Estágios', value: fN(r.n) },
          { label: 'Mais de 6 meses', value: fN(r.acima) + (r.n ? ' (' + fP0(r.acima / r.n) + ')' : '') }]);
      })
      .on('pointerleave', hideTip);
    const corte = String(H.kpis.ano) + '-09';
    if (x(corte) !== undefined) {
      const xc = x(corte) - (x.step() * x.paddingInner()) / 2;
      svg.append('line').attr('x1', xc).attr('x2', xc).attr('y1', m.t - 14).attr('y2', Hh - m.b).attr('stroke', cssv('--red')).attr('stroke-dasharray', '4 3');
      svg.append('text').attr('x', xc - 6).attr('y', m.t - 6).attr('text-anchor', 'end').attr('class', 'lbl-strong').attr('fill', cssv('--red')).text('norma nova, 01/09');
    }
  }

  const estFaixa = { mod: 'todas' };
  function drawFaixas() {
    const box = document.getElementById('chart-faixas');
    box.replaceChildren();
    const k = H.kpis;
    const rows = H.faixas.map((f) => ({ ...f, a: somaMod(f.atual, estFaixa.mod), b: somaMod(f.ant, estFaixa.mod) }));
    legenda('legend-faixas', [[String(k.ano_anterior), cssv('--muted')], [String(k.ano), cssv('--red')]]);
    const W = box.clientWidth || 800;
    const estreito = W < 560;
    const Hh = estreito ? 260 : 320;
    const m = { t: 34, r: 6, b: estreito ? 40 : 34, l: 38 };
    const nome = (f) => fN(f.de / 1000) + '–' + ((f.ate + 1) % 1000 === 0 ? fN((f.ate + 1) / 1000) : L.format(',.1f')(f.ate / 1000)) + ' mil';
    const x = d3.scaleBand(rows.map((r) => r.de), [m.l, W - m.r]).padding(0.22);
    const xi = d3.scaleBand(['b', 'a'], [0, x.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r.a, r.b)) || 1], [Hh - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${Hh}`).attr('width', W).attr('height', Hh);
    const xc = x(k.corte) - (x.step() * x.paddingInner()) / 2;
    svg.append('rect').attr('x', xc).attr('y', m.t - 26).attr('width', W - m.r - xc).attr('height', Hh - m.b - m.t + 26)
      .attr('fill', cssv('--red')).attr('fill-opacity', 0.06);
    svg.append('text').attr('x', xc + 6).attr('y', m.t - 12).attr('class', 'lbl-strong').attr('fill', cssv('--red'))
      .text(estreito ? 'queda' : 'menos da metade de ' + k.ano_anterior);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', cssv('--rule')).attr('stroke-dasharray', (d) => (d ? '2 3' : null));
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text')
      .attr('x', m.l - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('class', 'lbl').text(fN);
    svg.append('g').selectAll('text').data(rows).join('text')
      .attr('x', (r) => x(r.de) + x.bandwidth() / 2).attr('y', Hh - m.b + 16).attr('text-anchor', 'middle').attr('class', 'lbl')
      .text((r) => (estreito ? fN(r.de / 1000) : nome(r)));
    if (estreito) {
      svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', Hh - 4).attr('text-anchor', 'middle').attr('class', 'lbl').text('início da faixa, em milhares');
    }
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r) => `translate(${x(r.de)},0)`);
    g.append('rect').attr('x', xi('b')).attr('width', xi.bandwidth()).attr('y', (r) => y(r.b)).attr('height', (r) => y(0) - y(r.b)).attr('rx', 2).attr('fill', cssv('--muted'));
    g.append('rect').attr('x', xi('a')).attr('width', xi.bandwidth()).attr('y', (r) => y(r.a)).attr('height', (r) => y(0) - y(r.a)).attr('rx', 2).attr('fill', cssv('--red'));
    if (!estreito) {
      g.append('text').attr('x', x.bandwidth() / 2).attr('y', (r) => y(Math.max(r.a, r.b)) - 6).attr('text-anchor', 'middle')
        .attr('class', 'lbl').text((r) => (r.b ? varP(r.a, r.b) : ''));
    }
    g.append('rect').attr('width', x.bandwidth()).attr('y', m.t).attr('height', Hh - m.b - m.t).attr('fill', 'transparent')
      .on('pointermove', (event, r) => tip(event, 'Processos ' + fN(r.de) + ' a ' + fN(r.ate), [
        { label: String(k.ano), value: fN(r.a) }, { label: String(k.ano_anterior), value: fN(r.b) }, { label: 'Diferença', value: varP(r.a, r.b) }]))
      .on('pointerleave', hideTip);
  }

  function startMes() {
    segmented(document.getElementById('seg-mensal'), MODS_MES.map(([value, label]) => ({ value, label })), estMes.mod,
      (v) => { estMes.mod = v; drawMensal(); });
    segmented(document.getElementById('seg-durmes'), [{ value: 'pd', label: 'Pós-doutorado' }, { value: 'do', label: 'Doutorado' }], estMes.dur,
      (v) => { estMes.dur = v; drawDurMes(); });
    reg(drawMensal);
    reg(drawDurMes);
    drawModsHoje('areas-hoje', H.areas_corte);
  }

  function startHoje() {
    d3.json('data/painel_bepe_hoje.json').then((d) => {
      H = d;
      fillHoje();
      reg(drawAcum);
      segmented(document.getElementById('seg-faixas'), MODS_MES.map(([value, label]) => ({ value, label })), estFaixa.mod,
        (v) => { estFaixa.mod = v; drawFaixas(); });
      reg(drawFaixas);
      startMes();
      reg(drawInicios);
      reg(drawDur);
      drawTimeline();
      drawChangelog();
      const pares = (lista) => lista.map(([k, v]) => ({ k, v }));
      reg(() => barras('bars-paises-hoje', pares(H.agora.paises), { label: 'k', value: 'v' }));
      reg(() => barras('bars-areas-hoje', pares(H.agora.areas), { label: 'k', value: 'v', color: () => cssv('--a1') }));
      reg(() => barras('bars-inst-hoje', pares(H.agora.instituicoes), { label: 'k', value: 'v', color: () => cssv('--ink-2') }));
    }).catch((e) => {
      console.error(e);
      document.querySelector('main').prepend(el('p', 'wrap fig-note', 'Não foi possível carregar os dados do painel. Recarregue a página.'));
    });
  }

  /* ---------- montagem ---------- */
  function start() {
    fillNumbers();
    preparaFrase();
    drawBoard();
    reg(drawHero);
    reg(drawLegendGrupos);
    reg(drawRitmo);
    reg(drawFicha);
    for (const b of document.querySelectorAll('[data-ritmo]')) {
      b.addEventListener('click', () => {
        state.ritmo = b.dataset.ritmo;
        for (const x of document.querySelectorAll('[data-ritmo]')) x.setAttribute('aria-pressed', String(x === b));
        drawRitmo();
      });
    }
    segmented(document.getElementById('seg-calendario'),
      ['Todas', ...DATA.meta.grupos.filter((g) => g !== 'Outras')].map((g) => ({ value: g, label: g === 'Todas' ? 'Todas' : CURTO[g] })),
      state.grupoCal, (v) => { state.grupoCal = v; drawRadial(); });
    reg(drawRadial);
    reg(drawHeat);
    segmented(document.getElementById('seg-periodo'),
      [TODO, ...DATA.meta.periodos].map((p) => ({ value: p, label: p })),
      state.periodo, (v) => { state.periodo = v; drawMap(); });
    reg(drawMap);
    reg(drawBump);
    reg(drawMatrix);
    reg(drawTree);
    reg(() => barras('bars-cidades', DATA.cidades, { label: 'cidade', value: 'n' }));
    reg(drawStream);
    reg(() => barras('bars-areas', DATA.areas, { label: 'area', value: 'n', sub: 'grande_area', color: (r) => areaCor(r.grande_area) }));
    setupExplorer();
    reg(drawExplorer);
    reg(drawSlope);
    drawNovos();
    reg(drawTemasArea);
    drawHosts();
    document.getElementById('host-search').addEventListener('input', drawHosts);
  }

  if (document.body.dataset.page === 'hoje') { startHoje(); return; }
  startPessoas();
  Promise.allSettled([
    d3.json('data/bepe.json'),
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json'),
  ]).then(([dados, mundo]) => {
    if (dados.status !== 'fulfilled') {
      document.querySelector('main').prepend(el('p', 'wrap fig-note', 'Não foi possível carregar os dados. Recarregue a página.'));
      preparaFrase();
      return;
    }
    DATA = dados.value;
    WORLD = mundo.status === 'fulfilled' ? mundo.value : null;
    start();
  });
})();
