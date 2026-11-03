(function (root) {
  'use strict';
  const SCALE = 1000000n;
  const norm = v => String(v ?? '').replace(/\s+/g, '').toUpperCase();
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dec = s => String(s).replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (m, x, d, n) => x ? String.fromCodePoint(parseInt(x, 16)) : d ? String.fromCodePoint(+d) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[n.toLowerCase()]);
  const attr = (s, key) => { const m = s.match(new RegExp('(?:^|\\s)' + key.replace(':', '\\:') + '\\s*=\\s*(["\'])(.*?)\\1')); return m ? dec(m[2]) : ''; };
  const txt = s => [...String(s).replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '').matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m => dec(m[1])).join('');
  const colNo = s => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
  const colName = n => { let s = ''; while (n) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); } return s; };
  const keyOf = (dd, code) => norm(dd) + '\u001f' + norm(code);
  const qty = v => {
    const s = String(v ?? '').trim().replace(/,/g, '');
    const m = s.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
    if (!m) throw Error('数量不是有效数字');
    const exp = +(m[4] || 0); if (Math.abs(exp) > 15) throw Error('数量超出支持范围');
    let digits = m[2] + (m[3] || ''); let power = 6 + exp - (m[3] || '').length;
    if (power < 0) { if (!digits.endsWith('0'.repeat(-power))) throw Error('数量小数超过6位'); digits = digits.slice(0, power); power = 0; }
    return (m[1] === '-' ? -1n : 1n) * BigInt(digits || '0') * 10n ** BigInt(power);
  };
  const fmt = q => { const neg = q < 0n; if (neg) q = -q; const f = String(q % SCALE).padStart(6, '0').replace(/0+$/, ''); return (neg ? '-' : '') + String(q / SCALE) + (f ? '.' + f : ''); };
  const min = (a, b) => a < b ? a : b;
  function parseRows(xml, strings) {
    const rows = []; const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
    let m;
    while ((m = rowRe.exec(xml))) {
      const r = +attr(m[1], 'r'); const values = {}; const formulas = new Set(); const cells = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g; let c;
      while ((c = cells.exec(m[2] || ''))) {
        const ref = attr(c[1], 'r'); const col = ref.replace(/\d/g, ''); const body = c[2] || ''; const type = attr(c[1], 't'); const vm = body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/); let value = vm ? dec(vm[1]) : type === 'inlineStr' ? txt(body) : '';
        if (type === 's') { if (!/^\d+$/.test(value) || strings[+value] === undefined) throw Error('共享字符串引用损坏：' + ref); value = strings[+value]; }
        if (/<(?:\w+:)?f\b/.test(body)) formulas.add(col);
        if (value !== '') values[col] = value;
      }
      if (Object.keys(values).length) rows.push({ row: r, values, formulas });
    }
    return rows;
  }
  function pathJoin(base, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = (base + '/' + target).split('/'), out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
    return out.join('/');
  }
  const aliases = {
    dd: ['DD号', 'DD單號', 'DD单号', '专案名称', '專案名稱', '专案号'],
    code: ['图号', '圖號', '物料', '物料号', '物料编码', '物料編碼', '物料编号'],
    name: ['物料名称', '物料描述', '名称', '品名'],
    quantity: ['订单数量', '訂單數量', '数量', '數量'],
    factory: ['制造部门', '製造部門', '厂区', '廠區', '厂别'], unit: ['单位', '單位']
  };
  function detect(sheet, role, process) {
    let best = null;
    for (const r of sheet.rows.slice(0, 40)) {
      const cells = Object.entries(r.values); const headers = Object.fromEntries(cells.map(([c, v]) => [norm(v).replace(/[：:]/g, ''), c])); const map = {};
      for (const [k, words] of Object.entries(aliases)) for (const word of words) if (!map[k] && headers[norm(word)]) map[k] = headers[norm(word)];
      map.mark = cells.find(([, v]) => norm(v).includes(norm(process)) && /消单|消單|核销|核銷/.test(v))?.[0] || cells.find(([, v]) => norm(v) === norm(process))?.[0] || '';
      if (role === 'order' && !map.mark) map.mark = cells.find(([, v]) => ['备注', '核销备注', '消单备注'].includes(norm(v)))?.[0] || '';
      const specific = role === 'material' ? (headers['专案名称'] ? 8 : 0) + (headers['图号'] ? 6 : 0) + (headers['订单数量'] ? 4 : 0) : (headers['DD号'] ? 6 : 0) + (headers['物料'] ? 5 : 0) + (headers['日期'] || headers['外发日期'] ? 3 : 0);
      const score = (map.dd ? 5 : 0) + (map.code ? 5 : 0) + (map.quantity ? 5 : 0) + specific;
      if (!best || score > best.score) best = { headerRow: r.row, score, map, headers: r.values };
    }
    return best || { headerRow: 1, score: 0, map: {}, headers: {} };
  }
  async function readWorkbook(data, name) {
    if (!/\.xlsx$/i.test(name)) throw Error('请使用 .xlsx 文件；旧版 .xls 请先另存为 .xlsx。');
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const zip = await root.JSZip.loadAsync(bytes, { checkCRC32: true });
    if (!zip.file('xl/workbook.xml')) throw Error('文件不是可识别的 Excel 工作簿。');
    const wbxml = await zip.file('xl/workbook.xml').async('string'); const relxml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string') || '';
    const rels = new Map([...relxml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)(?:\/>|>)/g)].map(m => [attr(m[1], 'Id'), attr(m[1], 'Target')]));
    const sxml = await zip.file('xl/sharedStrings.xml')?.async('string') || '';
    const strings = [...sxml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m => txt(m[1])); const sheets = [];
    for (const m of wbxml.matchAll(/<(?:\w+:)?sheet\b([^>]*?)(?:\/>|>)/g)) {
      const target = rels.get(attr(m[1], 'r:id')); if (!target) continue;
      const path = pathJoin('xl', target); const entry = zip.file(path); if (!entry) continue;
      const xml = await entry.async('string'); if (xml.length > 130000000) throw Error('单张表过大，请拆成较小的业务文件。');
      const rows = parseRows(xml, strings); const sheet = { name: attr(m[1], 'name'), state: attr(m[1], 'state') || 'visible', path, xml, rows, byRow: new Map(rows.map(r => [r.row, r])) };
      sheets.push(sheet);
    }
    if (!sheets.length) throw Error('没有找到可读取的工作表。');
    return { name, bytes, zip, sheets, strings, signed: Object.keys(zip.files).some(p => p.startsWith('_xmlsignatures/')), meta: metadata({ name, sheets }, '喷粉') };
  }
  function metadata(wb, process) {
    return { name: wb.name, sheets: wb.sheets.map(s => {
      const material = detect(s, 'material', process), order = detect(s, 'order', process);
      const preamble = s.rows.slice(0, 4).flatMap(r => Object.values(r.values)).join(' ');
      const factory = preamble.match(/厂区[：:]\s*([^\s]+)/)?.[1] || '';
      const period = preamble.match(/(20\d{2}|\d{2})年\s*(\d{1,2})月/);
      const factories = [...new Set(s.rows.slice(material.headerRow).map(r => r.values[material.map.factory]).filter(Boolean))].slice(0, 20);
      const maxCol = Math.max(15, ...s.rows.slice(0, 20).flatMap(r => Object.keys(r.values).map(colNo)));
      return { name: s.name, path: s.path, state: s.state, rowCount: s.rows.length, material, order, factory, factories, period: period ? { year: +period[1] < 100 ? 2000 + +period[1] : +period[1], month: +period[2] } : null, columns: Array.from({ length: Math.min(maxCol + 3, 80) }, (_, i) => colName(i + 1)), sample: s.rows.slice(0, 6).map(r => ({ row: r.row, values: r.values })) };
    }) };
  }
  function numberMonth(text) {
    const names = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    return text.replace(/(十二|十一|十|九|八|七|六|五|四|三|二|一)月/g, (_, n) => (names.indexOf(n) + 1) + '月').replace(/(\d{1,2})內厂/g, '$1月厂');
  }
  function parseHistory(text, total, month, continuous) {
    const raw = numberMonth(norm(text)); if (!raw) return { used: 0n, current: 0n, entries: [] };
    const parts = raw.split(/[,，;；\n]+/).filter(Boolean); let used = 0n, current = 0n, last = null; const entries = [];
    for (const part of parts) {
      let m = part.match(/^(\d{1,2})月(厂内|达康|天跃|祺隆|众创)(?:喷粉|喷漆|喷)?(?:以对|已对|对)?([\d.]+)?(?:件|张|套)?$/);
      if (!m && continuous && last && /^[\d.]+(?:件|张|套)?$/.test(part)) m = ['', last.month, last.vendor, part.replace(/[件张套]/g, '')];
      if (!m) throw Error('历史标注无法确定数量：' + text);
      const mo = +m[1]; if (mo < 1 || mo > 12 || mo > month) throw Error('历史月份超出本次口径：' + text);
      const q = m[3] ? qty(m[3]) : total; if (q < 0n) throw Error('历史数量异常');
      used += q; if (mo === month && m[2] === '厂内') current += q;
      last = { month: m[1], vendor: m[2] }; entries.push({ month: mo, vendor: m[2], quantity: fmt(q), full: !m[3] });
    }
    if (used > total) throw Error('历史已核销数量超过原数量');
    return { used, current, entries };
  }
  function parseOrderMark(text, total, month) {
    const s = numberMonth(norm(text)); if (!s || s === '无此订单') return { applied: 0n, recognized: false, current: 0n };
    if ([...s.matchAll(/(\d{1,2})月/g)].some(m => +m[1] > month || +m[1] < 1)) throw Error('订单历史月份超出本次口径');
    let m = [...s.matchAll(/累计([\d.]+)件/g)].at(-1); if (m) { const q = qty(m[1]); if (q > total) throw Error('订单累计核销超出数量'); const past = s.match(/^(\d{1,2})月(?:厂内(?:以对|已对|对)|以对|已对)([\d.]+)/); return { applied: q, current: past && +past[1] !== month ? q - qty(past[2]) : q, recognized: true }; }
    m = s.match(/(?:只能对|可对)([\d.]+)(?:件|张|套)/) || s.match(/\d{1,2}月(?:厂内(?:以对|已对|对)|已对|以对)([\d.]+)(?:件|张|套)?/);
    if (m) { const q = qty(m[1]); if (q > total) throw Error('订单核销标注超出数量'); const dated = s.match(/^(\d{1,2})月(?:厂内|已对|以对)/); return { applied: q, current: dated && +dated[1] !== month ? 0n : q, recognized: true }; }
    m = s.match(/(\d{1,2})月(?:已对|以对|厂内)(?![\d对以已])/);
    if (m) return { applied: total, current: +m[1] === month ? total : 0n, recognized: true };
    if (/\d月.*(?:对|厂内)/.test(s)) throw Error('订单核销状态无法解析');
    return { applied: 0n, current: 0n, recognized: false };
  }
  function special(row, map) {
    const text = [row.values[map.dd], row.values[map.name], row.values[map.mark]].filter(Boolean).join(' ');
    if (/返喷|返修|退货|补料|不良/.test(text) || /取消/.test([row.values[map.dd], row.values[map.mark]].filter(Boolean).join(' '))) return '返喷、返修或其他异常业务，需单独核实';
    if (/左右各|门板.*共|只能对\d+张/.test(text) && !/可对|只能对.*件/.test(row.values[map.mark] || '')) return '套件、左右件或指定可对数量需要明确依据';
    return '';
  }
  function analyze(materialWb, orderWb, options) {
    const cfg = { month: 9, year: 2026, process: '喷粉', factory: '', continuous: false, ...options };
    if (!Number.isInteger(cfg.month) || cfg.month < 1 || cfg.month > 12) throw Error('请选择有效核销月份。');
    const ms = materialWb.sheets.find(s => s.path === cfg.materialSheet), os = orderWb.sheets.find(s => s.path === cfg.orderSheet);
    if (!ms || !os) throw Error('请确认两份文件的工作表。');
    const mm = cfg.materialMap, om = cfg.orderMap;
    for (const [label, map] of [['厂内物料', mm], ['月度订单', om]]) {
      for (const k of ['dd', 'code', 'quantity', 'mark']) if (!map?.[k]) throw Error(label + '缺少字段：' + ({ dd: 'DD号', code: '图号／物料号', quantity: '数量', mark: '核销标注列' })[k]);
      if (new Set(['dd', 'code', 'quantity', 'mark'].map(k => map[k])).size !== 4) throw Error(label + '的关键字段不能映射到同一列。');
    }
    if (materialWb.bytes.length === orderWb.bytes.length && materialWb.bytes.every((b, i) => b === orderWb.bytes[i])) throw Error('两份文件内容完全相同，请上传厂内物料总表及对应订单，不能将同一份表互相核销。');
    const material = [], orders = [], index = new Map(), orderIndex = new Map(), changes = [new Map(), new Map()], flows = [];
    const monthText = cfg.month + '月', stats = { full: 0, partial: 0, missing: 0, review: 0, unchanged: 0, newQuantity: '0', materialChanges: 0, orderChanges: 0, groups: 0 };
    for (const row of ms.rows) {
      if (row.row <= +cfg.materialHeader || (!row.values[mm.dd] && !row.values[mm.code])) continue;
      if (cfg.factory && mm.factory && row.values[mm.factory] && norm(row.values[mm.factory]) !== norm(cfg.factory)) continue;
      const dd = row.values[mm.dd] || '', code = row.values[mm.code] || '', key = keyOf(dd, code); const t = { row: row.row, values: row.values, dd, code, key, name: row.values[mm.name] || '', old: row.values[mm.mark] || '', added: 0n, remaining: 0n, issue: '', total: 0n, used: 0n, current: 0n };
      try { t.total = qty(row.values[mm.quantity]); if (t.total <= 0n) throw Error('厂内数量非正数'); const h = parseHistory(t.old, t.total, cfg.month, cfg.continuous); Object.assign(t, h); t.remaining = t.total - t.used; } catch (e) { t.issue = e.message; }
      if (row.formulas.has(mm.mark)) t.issue = '核销目标格含公式，不允许覆盖';
      material.push(t); if (!index.has(key)) index.set(key, []); index.get(key).push(t);
    }
    for (const row of os.rows) {
      if (row.row <= +cfg.orderHeader || (!row.values[om.dd] && !row.values[om.code] && !row.values[om.quantity])) continue;
      const dd = row.values[om.dd] || '', code = row.values[om.code] || '', key = keyOf(dd, code); const t = { row: row.row, values: row.values, dd, code, key, name: row.values[om.name] || '', old: row.values[om.mark] || '', total: 0n, applied: 0n, current: 0n, remaining: 0n, added: 0n, issue: '', flows: [] };
      try { t.total = qty(row.values[om.quantity]); if (t.total <= 0n) throw Error('订单数量非正数'); Object.assign(t, parseOrderMark(t.old, t.total, cfg.month)); t.remaining = t.total - t.applied; } catch (e) { t.issue = e.message; }
      if (!/^DD[0-9A-Z]+$/.test(norm(dd)) || !norm(code)) t.issue = 'DD号缺失、带附注或异常业务标识，需核实';
      const sp = special(row, om); if (sp) t.issue = sp;
      if (row.formulas.has(om.mark)) t.issue = '核销目标格含公式，不允许覆盖';
      orders.push(t); if (!orderIndex.has(key)) orderIndex.set(key, []); orderIndex.get(key).push(t);
    }
    // Existing confirmed orders may not exceed matching material entries already marked for this month.
    for (const [key, group] of orderIndex) {
      const marked = group.reduce((q, t) => q + t.current, 0n); const supply = (index.get(key) || []).filter(t => !t.issue).reduce((q, t) => q + t.current, 0n);
      if (marked > supply) { group.forEach(t => { t.issue = '已有本月订单核销量大于厂内同键本月记录，保留整组核实'; }); (index.get(key) || []).forEach(t => { t.issue = '两表已有本月记录不一致'; }); }
    }
    for (const [key, group] of orderIndex) {
      const mats = index.get(key) || []; const mu = new Set(mats.map(t => norm(t.values[mm.unit])).filter(Boolean)), ou = new Set(group.map(t => norm(t.values[om.unit])).filter(Boolean));
      if (mu.size && ou.size && new Set([...mu, ...ou]).size > 1) { group.forEach(t => { t.issue = '同键两表单位不一致，禁止自动换算'; }); mats.forEach(t => { t.issue = '同键单位不一致'; }); }
    }
    const valid = t => !t.issue && t.remaining > 0n;
    function allocate(o, m, amount) {
      if (amount <= 0n || amount > o.remaining || amount > m.remaining || m.issue) throw Error('分配台账校验失败，已停止写入。');
      o.remaining -= amount; o.added += amount; m.remaining -= amount; m.added += amount;
      const f = { materialRow: m.row, orderRow: o.row, dd: o.dd, code: o.code, quantity: fmt(amount) }; flows.push(f); o.flows.push(f);
    }
    if ((cfg.priorityRows || []).some(row => !orders.some(o => o.row === row))) throw Error('指定的优先行不在当前订单范围内，请核实原表行号。');
    // Explicitly prioritized order rows share the same residual ledger.
    for (const row of cfg.priorityRows || []) { const o = orders.find(t => t.row === row); if (!o || !valid(o)) continue; for (const m of index.get(o.key) || []) { if (m.issue) continue; const amount = min(o.remaining, m.remaining); if (amount > 0n) allocate(o, m, amount); if (!o.remaining) break; } }
    // 1. Balanced groups, 2. exact remaining row quantities, 3. cross-row residual allocation.
    for (const [key, group] of orderIndex) {
      const mats = index.get(key) || [], active = group.filter(valid); if (!active.length || mats.some(t => t.issue)) continue;
      const supply = mats.reduce((q, t) => q + t.remaining, 0n), demand = active.reduce((q, t) => q + t.remaining, 0n);
      if (!supply || supply !== demand) continue;
      for (const o of active) for (const m of mats) { const q = min(o.remaining, m.remaining); if (q > 0n) allocate(o, m, q); if (!o.remaining) break; }
    }
    for (const o of orders.filter(valid)) { const m = (index.get(o.key) || []).find(t => !t.issue && t.remaining === o.remaining); if (m) allocate(o, m, o.remaining); }
    for (const o of orders.filter(valid)) for (const m of index.get(o.key) || []) { if (m.issue) continue; const q = min(o.remaining, m.remaining); if (q > 0n) allocate(o, m, q); if (!o.remaining) break; }
    const append = (old, text) => old ? old + '，' + text : text;
    for (const m of material) if (m.added > 0n) {
      const label = m.old ? append(m.old, monthText + '厂内' + fmt(m.added)) : m.added === m.total ? monthText + '厂内' : monthText + '厂内对' + fmt(m.added) + '件';
      changes[0].set(mm.mark + m.row, { before: m.old, after: label, quantity: fmt(m.added), row: m.row });
    }
    const results = [];
    for (const o of orders) {
      let status, reason, label = o.old;
      if (o.issue) { status = 'review'; reason = o.issue; }
      else if (o.added > 0n) {
        const cumulative = o.applied + o.added;
        const newLabel = o.remaining === 0n ? monthText + '已对' : '只能对' + fmt(cumulative) + '件';
        label = o.applied > 0n ? append(o.old, monthText + '补对' + fmt(o.added) + '件（累计' + fmt(cumulative) + '件，' + (o.remaining === 0n ? '已对' : '尚余' + fmt(o.remaining) + '件') + '）') : o.old && o.old !== '无此订单' ? append(o.old, newLabel) : newLabel;
        status = o.remaining === 0n ? 'full' : 'partial'; reason = o.remaining === 0n ? 'DD号、图号一致，本条订单已核完' : '厂内可用量不足整条订单，已核实际可对数量';
      } else if (o.applied > 0n) { status = o.remaining === 0n ? 'unchanged' : 'partial'; reason = o.remaining === 0n ? '已有核销正确，保持不变' : '已有部分核销，当前无新增可用量，不重复抵扣'; }
      else {
        const mats = index.get(o.key) || [];
        if (mats.some(t => t.issue)) { status = 'review'; reason = '同键厂内存在历史或数量不明：' + mats.filter(t => t.issue).map(t => '第' + t.row + '行 ' + t.issue).join('；'); }
        else { status = 'missing'; label = o.old && !o.old.includes('无此订单') ? append(o.old, '无此订单') : o.old || '无此订单'; reason = mats.length ? '同键厂内可确认余量已用完，本条已无可抵扣量' : '本次物料总表未找到同DD号＋图号'; }
      }
      if (label !== o.old && !o.issue) changes[1].set(om.mark + o.row, { before: o.old, after: label, row: o.row, quantity: fmt(o.added) });
      stats[status]++;
      const mats = index.get(o.key) || [];
      results.push({ row: o.row, dd: o.dd, code: o.code, name: o.name, quantity: o.total > 0n ? fmt(o.total) : o.values[om.quantity] || '', previous: fmt(o.applied), added: fmt(o.added), remaining: fmt(o.remaining), status, reason, before: o.old, after: label, changed: changes[1].has(om.mark + o.row), cell: om.mark + o.row, allocations: o.flows, material: mats.map(m => ({ row: m.row, name: m.name, quantity: m.total > 0n ? fmt(m.total) : m.values[mm.quantity] || '', before: m.old, after: changes[0].get(mm.mark + m.row)?.after || m.old, added: fmt(m.added), remaining: fmt(m.remaining), issue: m.issue, cell: mm.mark + m.row })) });
    }
    const sm = material.reduce((q, t) => q + t.added, 0n), so = orders.reduce((q, t) => q + t.added, 0n), sf = flows.reduce((q, f) => q + qty(f.quantity), 0n);
    if (sm !== so || so !== sf || material.some(m => !m.issue && (m.remaining < 0n || m.added + m.used > m.total)) || orders.some(o => !o.issue && o.added + o.applied > o.total)) throw Error('两表数量校验未通过，禁止导出。');
    for (const o of orders) if (!o.issue && o.remaining > 0n && (index.get(o.key) || []).some(m => !m.issue && m.remaining > 0n)) throw Error('仍有可核销余量未分配，禁止导出。');
    const affected = new Set(flows.map(f => keyOf(f.dd, f.code)));
    for (const key of affected) {
      const left = (index.get(key) || []).reduce((q, m) => q + m.added, 0n), right = (orderIndex.get(key) || []).reduce((q, o) => q + o.added, 0n); if (left !== right) throw Error('分组数量不一致');
    }
    Object.assign(stats, { newQuantity: fmt(sm), materialChanges: changes[0].size, orderChanges: changes[1].size, groups: affected.size, totalOrders: orders.length, totalMaterial: material.length });
    return { config: cfg, stats, results, flows, changes, materialWb, orderWb, sheets: [ms, os], verified: true, exportVerified: false };
  }
  function replaceCells(sheet, changes, strings) {
    if (!changes.size) return sheet.xml;
    const byRow = new Map(); for (const [ref, c] of changes) { const row = +ref.replace(/\D/g, ''); if (!byRow.has(row)) byRow.set(row, []); byRow.get(row).push([ref, c]); }
    const seen = new Set();
    const xml = sheet.xml.replace(/(<(?:\w+:)?row\b[^>/]*?\br\s*=\s*"(\d+)"[^>/]*>)([\s\S]*?)(<\/(?:\w+:)?row>)/g, (whole, start, number, body, end) => {
      const list = byRow.get(+number); if (!list) return whole;
      for (const [ref, change] of list) {
        const source = sheet.byRow.get(+number); const column = ref.replace(/\d/g, '');
        if ((source?.values[column] || '') !== change.before || source.formulas.has(column)) throw Error('原文或目标格发生变化：' + sheet.name + '!' + ref);
        const re = new RegExp('<(?:\\w+:)?c\\b([^>]*?\\br\\s*=\\s*"' + ref + '"[^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:\\w+:)?c>)'); const m = body.match(re);
        let attributes = m ? m[1] : ' r="' + ref + '"'; attributes = attributes.replace(/\s+t\s*=\s*(["']).*?\1/g, '').replace(/\/$/, '');
        const prefix = start.match(/^<(\w+:)/)?.[1] || ''; const cell = '<' + prefix + 'c' + attributes + ' t="inlineStr"><' + prefix + 'is><' + prefix + 't>' + esc(change.after) + '</' + prefix + 't></' + prefix + 'is></' + prefix + 'c>';
        if (m) body = body.slice(0, m.index) + cell + body.slice(m.index + m[0].length);
        else {
          const cells = [...body.matchAll(/<(?:\w+:)?c\b[^>]*?\br\s*=\s*"([A-Z]+)\d+"/g)]; const after = cells.find(m => colNo(m[1]) > colNo(column)); const pos = after ? after.index : body.length; body = body.slice(0, pos) + cell + body.slice(pos);
        }
        seen.add(ref);
      }
      return start + body + end;
    });
    if (seen.size !== changes.size) throw Error('部分目标单元格未定位，禁止导出。');
    // Restore every allowed cell to its exact original bytes; all remaining XML must be identical.
    const originals = new Map(); const originalCells = [...sheet.xml.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>[\s\S]*?<\/(?:\w+:)?c>)/g)];
    for (const m of originalCells) { const ref = attr(m[1], 'r'); if (changes.has(ref)) originals.set(ref, m[0]); }
    const restored = xml.replace(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>[\s\S]*?<\/(?:\w+:)?c>)/g, (whole, attrs) => { const ref = attr(attrs, 'r'); return changes.has(ref) ? originals.get(ref) || '' : whole; });
    if (restored !== sheet.xml) throw Error('发现核销格之外的变更，已阻止导出。');
    const readback = parseRows(xml, strings); const lookup = new Map(readback.map(r => [r.row, r]));
    for (const [ref, c] of changes) if (lookup.get(+ref.replace(/\D/g, ''))?.values[ref.replace(/\d/g, '')] !== c.after) throw Error('导出标注回读失败：' + ref);
    return xml;
  }
  async function exportResult(result, onProgress) {
    if (!result.verified) throw Error('请先完成核对。');
    const workbooks = [result.materialWb, result.orderWb], output = [];
    for (let i = 0; i < 2; i++) {
      const wb = workbooks[i], sheet = result.sheets[i]; onProgress?.('校验' + (i === 0 ? '物料总表' : '月度订单') + '的改动范围…');
      if (wb.signed && result.changes[i].size) throw Error('文件含数字签名，不能在保留签名的同时修改。请使用未签名副本。');
      if (!result.changes[i].size) { output.push({ name: wb.name.replace(/\.xlsx$/i, '') + '_核对后.xlsx', bytes: wb.bytes.slice() }); continue; }
      const xml = replaceCells(sheet, result.changes[i], wb.strings); const zip = await root.JSZip.loadAsync(wb.bytes, { checkCRC32: true });
      zip.file(sheet.path, xml, { date: zip.file(sheet.path).date }); const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const verified = await root.JSZip.loadAsync(bytes, { checkCRC32: true });
      const names = Object.keys(wb.zip.files).sort(), otherNames = Object.keys(verified.files).sort(); if (names.join('\n') !== otherNames.join('\n')) throw Error('工作簿部件结构变化，禁止导出。');
      for (const path of names) {
        if (wb.zip.files[path].dir || path === sheet.path) continue;
        const [a, b] = await Promise.all([wb.zip.file(path).async('uint8array'), verified.file(path).async('uint8array')]);
        if (a.length !== b.length || !a.every((v, n) => v === b[n])) throw Error('非核销内容发生变化：' + path);
      }
      if (await verified.file(sheet.path).async('string') !== xml) throw Error('工作表保存校验失败');
      output.push({ name: wb.name.replace(/\.xlsx$/i, '') + '_核对后.xlsx', bytes });
    }
    result.exportVerified = true; return output;
  }
  const API = { version: '2026.10.21.2', readWorkbook, metadata, detect, analyze, exportResult, qty, fmt, norm, parseHistory, parseOrderMark, replaceCells };
  root.ReconcileEngine = API; if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : self);
