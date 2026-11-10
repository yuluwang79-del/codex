(function (root) {
  'use strict';
  const Catalog = root.WorkbenchCatalog || (typeof require === 'function' ? require('./catalog.js') : null);
  const customerKey = Catalog.customerKey;
  const SCALE = 1000000n;
  const norm = v => String(v ?? '').replace(/\s+/g, '').toUpperCase();
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dec = s => String(s).replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (m, x, d, n) => x ? String.fromCodePoint(parseInt(x, 16)) : d ? String.fromCodePoint(+d) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[n.toLowerCase()]);
  const attr = (s, key) => { const m = s.match(new RegExp('(?:^|\\s)' + key.replace(':', '\\:') + '\\s*=\\s*(["\'])(.*?)\\1')); return m ? dec(m[2]) : ''; };
  const txt = s => [...String(s).replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '').matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m => dec(m[1])).join('');
  const colNo = s => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
  const colName = n => { let s = ''; while (n) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); } return s; };
  const quantityMarkHeader = value => /^(?:(?:\d{1,2}月)?(?:喷粉|喷漆|丝印|组装|压铆|打胶))?(?:已对数量|已核数量|已核销数量|核销数量|消单数量)$/.test(norm(value));
  const keyOf = (dd, code) => norm(dd) + '\u001f' + norm(code);
  const validDD = value => /^DD[0-9A-Z]+$/.test(norm(value)) && (norm(value).match(/DD(?=[0-9])/g)||[]).length === 1;
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
  function parseRows(xml, strings, zeroFormats = []) {
    const rows = []; const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
    let m;
    while ((m = rowRe.exec(xml))) {
      const r = +attr(m[1], 'r'); const values = {}; const formulas = new Set(); const cells = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g; let c;
      while ((c = cells.exec(m[2] || ''))) {
        const ref = attr(c[1], 'r'); const col = ref.replace(/\d/g, ''); const body = c[2] || ''; const type = attr(c[1], 't'); const vm = body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/); let value = vm ? dec(vm[1]) : type === 'inlineStr' ? txt(body) : '';
        if (type === 's') { if (!/^\d+$/.test(value) || strings[+value] === undefined) throw Error('共享字符串引用损坏：' + ref); value = strings[+value]; }
        if ((!type || type === 'n') && /^\d+$/.test(value)) { const format = zeroFormats[+attr(c[1], 's') || 0]; if (format) value = value.padStart(format, '0'); }
        if (/<(?:\w+:)?f\b/.test(body)) formulas.add(col);
        if (value !== '') values[col] = value;
      }
      if (Object.keys(values).length || formulas.size) rows.push({ row: r, values, formulas });
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
    dd: ['DD号', 'DD單號', 'DD单号', '专案名称', '專案名稱', '专案号', '销售订单', '销售订单号', '厂内订单号'],
    code: ['图号', '圖號', '物料', '物料号', '物料编码', '物料編碼', '物料编号'],
    name: ['物料名称', '物料描述', '产品名称', '存货名称', '名称', '品名'],
    quantity: ['订单数量', '訂單數量', '数量', '數量'],
    customer: ['所属客户', '所属客户名称', '客户全称', '客户名', '需求客户名称', '客户', '客户名称', '客户简称', '客戶', '客戶名稱', '客戶簡稱', '需求客户'],
    factory: ['制造部门', '製造部門', '厂区', '廠區', '厂别'], unit: ['单位', '單位']
  };
  function detect(sheet, role, process) {
    let best = null;
    for (const r of sheet.rows.slice(0, 40)) {
      const cells = Object.entries(r.values); const headers = Object.fromEntries(cells.map(([c, v]) => [norm(v).replace(/[：:]/g, ''), c])); const map = {};
      for (const [k, words] of Object.entries(aliases)) for (const word of words) if (!map[k] && headers[norm(word)]) map[k] = headers[norm(word)];
      const specific = role === 'material' ? (headers['专案名称'] ? 8 : 0) + (headers['图号'] ? 6 : 0) + (headers['订单数量'] ? 4 : 0) : (headers['DD号'] ? 6 : 0) + (headers['物料'] ? 5 : 0) + (headers['日期'] || headers['外发日期'] ? 3 : 0);
      const score = (map.dd ? 5 : 0) + (map.code ? 5 : 0) + (map.quantity ? 5 : 0) + specific;
      if (!best || score > best.score) best = { headerRow: r.row, score, map, headers: r.values };
    }
    if (!best) return { headerRow: 1, score: 0, map: {}, headers: {}, candidates: [] };
    // Preserve the literal header paths, including merged parent headers.
    const headerRows = sheet.rows.filter(r => r.row >= best.headerRow - 2 && r.row <= best.headerRow + 2 &&
      (r.row <= best.headerRow || ((!r.values[best.map.dd] || aliases.dd.some(v => norm(v) === norm(r.values[best.map.dd]))) &&
       !/^[+-]?\d+(?:\.\d+)?$/.test(String(r.values[best.map.quantity] || '')) && Object.values(r.values).some(v => /核销|核銷|消单|消單|备注|備註|日期|数量|數量|DD号|图号|物料/.test(v)))));
    const paths = {};
    for (const row of headerRows) {
      const values = { ...row.values };
      for (const merge of sheet.merges || []) if (merge.r1 === row.row) {
        const value = row.values[colName(merge.c1)];
        if (value) for (let c = merge.c1; c <= merge.c2; c++) values[colName(c)] ||= value;
      }
      for (const [c, value] of Object.entries(values)) (paths[c] ||= []).push(String(value));
    }
    const customerCandidates = Object.entries(paths).map(([column, parts]) => ({ column, header: parts.join(' / '), leaf: sheet.byRow.get(best.headerRow)?.values[column] || parts.at(-1) || '' }))
      .filter(c => /客户|客戶|CUSTOMER/i.test(norm(c.leaf)) && !/订单|訂單|单号|單號|DD|图号|圖號|物料|数量|數量|价格|價格|金额|金額|日期|地址|电话|電話|联系人|聯繫人|消单|消單|核销|核銷|喷粉|喷漆/i.test(c.leaf))
      .map(({ column, header }) => ({ column, header }));
    best.map.customer = customerCandidates.length === 1 ? customerCandidates[0].column : '';
    best.customerCandidates = customerCandidates;
    const protectedHeader = value => !quantityMarkHeader(value) && /数量|數量|价格|價格|金额|金額|单价|單價|日期|DD|图号|圖號|物料|编码|編碼|名称|名稱|单位|單位|厂区|廠區|制造|製造/i.test(value);
    const candidates = Object.entries(paths).map(([column, parts]) => ({ column, header: parts.join(' / '), leaf: sheet.byRow.get(best.headerRow)?.values[column] || parts.at(-1) || '' }))
      .filter(v => !protectedHeader(v.leaf) && (quantityMarkHeader(v.leaf) || /核销|核銷|消单|消單|备注|備註|喷粉|喷漆|丝印|组装|压铆|打胶/.test(v.header)));
    const explicit = candidates.filter(v => norm(v.header).includes(norm(process)));
    const generic = candidates.filter(v => (/核销|核銷|消单|消單/.test(v.header) || quantityMarkHeader(v.leaf)) && !/喷粉|喷漆|丝印|组装|压铆|打胶/.test(v.header));
    const eligible = explicit.length ? explicit : generic;
    best.map.mark = eligible.length === 1 ? eligible[0].column : '';
    best.candidates = candidates;
    best.headers = Object.fromEntries(Object.entries(paths).map(([c, values]) => [c, values.join(' / ')]));
    best.headerEnd = Math.max(best.headerRow, ...headerRows.map(r => r.row));
    return best;
  }

  async function readWorkbook(data, name) {
    if (!/\.xlsx$/i.test(name)) throw Error('请使用 .xlsx 文件；旧版 .xls 请先另存为 .xlsx。');
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const zip = await root.JSZip.loadAsync(bytes, { checkCRC32: true });
    if (!zip.file('xl/workbook.xml')) throw Error('文件不是可识别的 Excel 工作簿。');
    const wbxml = await zip.file('xl/workbook.xml').async('string'); const relxml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string') || '';
    const rels = new Map([...relxml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)(?:\/>|>)/g)].map(m => [attr(m[1], 'Id'), attr(m[1], 'Target')]));
    const sxml = await zip.file('xl/sharedStrings.xml')?.async('string') || '';
    const styleXml = await zip.file('xl/styles.xml')?.async('string') || '';
    const formats = new Map([...styleXml.matchAll(/<(?:\w+:)?numFmt\b([^>]*?)(?:\/>|>)/g)].map(m => [attr(m[1], 'numFmtId'), attr(m[1], 'formatCode')]));
    const cellXfs = styleXml.match(/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/)?.[1] || '';
    const zeroFormats = [...cellXfs.matchAll(/<(?:\w+:)?xf\b([^>]*?)(?:\/>|>)/g)].map(m => { const f = formats.get(attr(m[1], 'numFmtId')) || ''; return /^0+$/.test(f) ? f.length : 0; });
    const strings = [...sxml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m => txt(m[1])); const sheets = [];
    for (const m of wbxml.matchAll(/<(?:\w+:)?sheet\b([^>]*?)(?:\/>|>)/g)) {
      const target = rels.get(attr(m[1], 'r:id')); if (!target) continue;
      const path = pathJoin('xl', target); const entry = zip.file(path); if (!entry) continue;
      const xml = await entry.async('string'); if (xml.length > 130000000) throw Error('单张表过大，请拆成较小的业务文件。');
      const rows = parseRows(xml, strings, zeroFormats); const merges = [...xml.matchAll(/<(?:\w+:)?mergeCell\b[^>]*ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].map(m => ({ c1: colNo(m[1]), r1: +m[2], c2: colNo(m[3]), r2: +m[4] })); const sheet = { merges, name: attr(m[1], 'name'), state: attr(m[1], 'state') || 'visible', path, xml, rows, byRow: new Map(rows.map(r => [r.row, r])) };
      sheets.push(sheet);
    }
    if (!sheets.length) throw Error('没有找到可读取的工作表。');
    return { name, bytes, zip, sheets, strings, zeroFormats, signed: Object.keys(zip.files).some(p => p.startsWith('_xmlsignatures/')), meta: metadata({ name, sheets }, '喷粉') };
  }
  function metadata(wb, process) {
    return { name: wb.name, sheets: wb.sheets.map(s => {
      const material = detect(s, 'material', process), order = detect(s, 'order', process);
      const preamble = s.rows.slice(0, 4).flatMap(r => Object.values(r.values)).join(' ');
      const factory = s.rows.slice(0, 4).flatMap(r => Object.values(r.values)).map(v => String(v).trim().match(/^(?:厂区|廠區)[：:]\s*([^：:]+)$/)?.[1]?.trim()).find(Boolean) || '';
      const period = preamble.match(/(20\d{2}|\d{2})年\s*(\d{1,2})月/);
      const factories = [...new Set(s.rows.filter(r => r.row > material.headerRow).map(r => r.values[material.map.factory]).filter(Boolean))];
      const customerColumn = material.map.customer || order.map.customer;
      const customers = [...new Set(s.rows.filter(r => r.row > Math.max(material.headerRow, order.headerRow)).map(r => r.values[customerColumn]).filter(Boolean))];
      const maxCol = Math.max(15, ...s.rows.slice(0, 20).flatMap(r => Object.keys(r.values).map(colNo)));
      return { name: s.name, path: s.path, state: s.state, producer:Catalog.sheetProducer(s), rowCount: s.rows.length, material, order, factory, factories, customers, period: period ? { year: +period[1] < 100 ? 2000 + +period[1] : +period[1], month: +period[2] } : null, columns: Array.from({ length: Math.min(maxCol + 3, 16384) }, (_, i) => colName(i + 1)), sample: s.rows.slice(0, 6).map(r => ({ row: r.row, values: r.values })) };
    }) };
  }
  function numberMonth(text) {
    const names = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    return text.replace(/(^|[,，;；])(十二|十一|十|九|八|七|六|五|四|三|二|一)月/g, (_, prefix, n) => prefix+(names.indexOf(n)+1)+'月').replace(/(^|[,，;；])(\d{1,2})內厂/g, '$1$2月厂');
  }
  function parseHistory(text, total, month, continuous, unit = '', process = '', suppliers = [], currentVendor = '厂内') {
    const raw = numberMonth(norm(text)); if (!raw) return { used: 0n, current: 0n, entries: [] };
    const vendors = Catalog.unique(['厂内',currentVendor,...Catalog.defaultSuppliers,...suppliers]).map(norm);
    const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const suffix = '(?:喷粉|喷漆|喷|丝印|组装|压铆|打胶)?(?:以对|已对|对)?([\\d.]+)?(?:件|张|套)?';
    const pattern = new RegExp('^(\\d{1,2})月(' + vendors.map(escapePattern).sort((a,b)=>b.length-a.length).join('|') + ')' + suffix + '$');
    const tailPattern = new RegExp('^' + suffix + '$');
    const parts = raw.split(/[,，;；\n]+/).filter(Boolean); let used = 0n, current = 0n, last = null; const entries = [];
    for (const part of parts) {
      let m = part.match(pattern);
      if (m) {const tail=part.slice((m[1]+'月').length);if(vendors.filter(v=>tail.startsWith(v)&&tailPattern.test(tail.slice(v.length))).length>1)throw Error('历史供应商名称与数量边界不明确：'+text);}
      if (!m && continuous && last && /^[\d.]+(?:件|张|套)?$/.test(part)) m = ['', last.month, last.vendor, part.replace(/[件张套]/g, '')];
      if (!m) throw Error('历史标注无法确定数量：' + text);
      const historyTail = part.startsWith(m[1]+'月'+m[2]) ? part.slice((m[1]+'月'+m[2]).length) : part;
      const writtenProcess = historyTail.match(/喷粉|喷漆|丝印|组装|压铆|打胶/)?.[0];
      if (process && writtenProcess && writtenProcess !== process) throw Error('历史原文明示其他工序，需核实：' + text);
      const writtenUnit = historyTail.match(/(件|张|套)$/)?.[1];
      if (writtenUnit && ((unit && norm(unit) !== writtenUnit) || (!unit && writtenUnit !== '件'))) throw Error('历史单位与原数量单位不明或不一致：' + text);
      const mo = +m[1]; if (mo < 1 || mo > 12 || mo > month) throw Error('历史月份超出本次口径：' + text);
      const q = m[3] ? qty(m[3]) : total; if (q < 0n) throw Error('历史数量异常');
      used += q; if (mo === month && norm(m[2]) === norm(currentVendor)) current += q;
      last = { month: m[1], vendor: m[2] }; entries.push({ month: mo, vendor: m[2], quantity: fmt(q), full: !m[3] });
    }
    if (used > total) throw Error('历史已核销数量超过原数量');
    return { used, current, entries };
  }
  function parseOrderMark(text, total, month, currentVendor='厂内', suppliers=[], allowNotes=false) {
    let s=numberMonth(norm(text));if(!s||s==='无此订单')return {applied:0n,recognized:false,current:0n};
    const vendors=Catalog.unique(['厂内',currentVendor,...Catalog.defaultSuppliers,...suppliers]).map(norm);
    const escapePattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const names=vendors.map(escapePattern).sort((a,b)=>b.length-a.length).join('|'),tag='(?:'+names+')';
    if(allowNotes){
      const start=new RegExp('(?:^|[,，;；])(?=(?:\\d{1,2}月(?:'+tag+'|已对|以对|补对)|只能对|可对))');
      const found=s.match(start);
      if(found)s=s.slice(found.index+found[0].length);
      else if(!/\d{1,2}月|已对|以对|只能对|可对|核销|核銷|消单|消單|已喷|已噴/.test(s)&&!/^[-+]?\d+(?:\.\d+)?$/.test(s))return {applied:0n,recognized:false,current:0n,metadata:true};
    }
    const checkMonth=mo=>{if(+mo<1||+mo>12||+mo>month)throw Error('订单历史月份超出本次口径');};
    const segments=s.split(new RegExp('[,，;；](?=\\d{1,2}月(?:'+tag+')?补对)'));
    const first=segments.shift();let applied=0n,current=0n;
    let m=first.match(new RegExp('^(?:(\\d{1,2})月('+names+'))?(?:只能对|可对)([\\d.]+)(?:件|张|套)$'));
    if(m){if(m[1])checkMonth(m[1]);applied=qty(m[3]);if((!m[1]||+m[1]===month)&&(!m[2]||norm(m[2])===norm(currentVendor)))current=applied;}
    else{
      m=first.match(new RegExp('^(\\d{1,2})月(?:('+names+')(?:以对|已对|对)?|已对|以对)([\\d.]+)?(?:件|张|套)?$'));
      if(!m)throw Error('订单标注含未确认历史，需核实：'+text);
      checkMonth(m[1]);applied=m[3]?qty(m[3]):total;if(+m[1]===month&&(!m[2]||norm(m[2])===norm(currentVendor)))current=applied;
    }
    for(const segment of segments){
      m=segment.match(new RegExp('^(\\d{1,2})月('+names+')?补对([\\d.]+)件[（(]累计([\\d.]+)件[,，](?:已对|尚余[\\d.]+件)[）)]$'));
      if(!m)throw Error('订单补对历史无法确认：'+text);checkMonth(m[1]);const added=qty(m[3]);applied+=added;
      if(applied!==qty(m[4]))throw Error('订单补对数量与累计不一致');
      if(+m[1]===month&&(!m[2]||norm(m[2])===norm(currentVendor)))current+=added;
    }
    if(applied<0n||applied>total)throw Error('订单累计核销超出数量');return {applied,current,recognized:true};
  }

  function special(row, map) {
    const text = [row.values[map.dd], row.values[map.name], row.values[map.mark]].filter(Boolean).join(' ');
    if (/返喷|返修|退货|补料|不良/.test(text) || /取消/.test([row.values[map.dd], row.values[map.mark]].filter(Boolean).join(' '))) return '返喷、返修或其他异常业务，需单独核实';
    if (/左右各|门板.*共|只能对\d+张/.test(text) && !/可对|只能对.*件/.test(row.values[map.mark] || '')) return '套件、左右件或指定可对数量需要明确依据';
    return '';
  }
  function validateSheetMapping(sheet, map, header, label, process, fixedCustomer) {
    const missing=['dd','code','quantity','mark'].filter(key=>!map?.[key]);if(missing.length){const names={dd:'DD号',code:'图号／物料号',quantity:'数量',mark:'核销标注列'},error=Error(label+'缺少字段：'+missing.map(key=>names[key]).join('、'));error.code='MISSING_MAPPING';error.field=missing[0];error.fields=missing;throw error;}
    if (new Set(['dd','code','quantity','mark'].map(key => map[key])).size !== 4) throw Error(label + '的关键字段不能映射到同一列。');
    if (!Number.isInteger(+header) || +header < 1) throw Error(label + '表头行无效');
    for (const column of Object.values(map).filter(Boolean)) if (!/^[A-Z]{1,3}$/.test(column)) throw Error(label + '字段列号无效');
    const detected = detect(sheet, 'order', process);
    if (map.customer) {
      const title = sheet.byRow.get(+header)?.values[map.customer] || detected.headers[map.customer] || '';
      if (['dd','code','quantity','mark','name','unit'].some(key => map[key] === map.customer) || /消单|消單|核销|核銷|喷粉|喷漆|丝印|组装|压铆|打胶|备注|備註|数量|數量|价格|價格|金额|金額|单价|單價|日期|图号|圖號|物料|DD/i.test(title)) throw Error(label + '“客户”误选为' + map.customer + '列“' + title + '”。请改选真实客户列；本工序核销列保持' + map.mark + '列不变，原表无需改列。');
    } else if (!norm(fixedCustomer)) throw Error(label + '未识别客户列。请在字段映射中选择客户列；也可为当前工作表明确指定统一客户，不改原表。');
    const title = sheet.byRow.get(+header)?.values[map.mark] || detected.headers[map.mark] || '';
    if ((!quantityMarkHeader(title) && /数量|數量|价格|價格|金额|金額|单价|單價|日期|DD|图号|圖號|物料|编码|編碼/i.test(title)) || Object.entries(map).some(([key,value]) => key !== 'mark' && value === map.mark)) throw Error(label + '核销列属于原始数据，禁止写入：' + title);
    if (sheet.rows.some(row => row.row > +header && row.formulas.has(map.mark))) throw Error(label + '核销列含公式，禁止写入');
    if (detected.candidates.some(c => c.column === map.mark && /喷粉|喷漆|丝印|组装|压铆|打胶/.test(c.header) && !norm(c.header).includes(norm(process)))) throw Error(label + '核销列属于其他工序');
    if ((sheet.merges || []).some(m => colNo(map.mark) >= m.c1 && colNo(map.mark) <= m.c2 && m.r2 > +header)) throw Error(label + '核销目标含合并数据格，需人工确认');
  }
  function inferCustomerColumn(sheet,map,header,customers) {
    const known=new Set(customers.map(customerKey).filter(Boolean));if(!known.size)return '';
    const counts=new Map(),titles=sheet.byRow.get(+header)?.values||{};
    const excluded=new Set(['dd','code','quantity','mark','name','unit'].map(key=>map[key]).filter(Boolean));
    for(const row of sheet.rows)if(row.row>+header&&(row.values[map.dd]||row.values[map.code]))for(const [column,value] of Object.entries(row.values)){
      if(excluded.has(column)||/消单|消單|核销|核銷|喷粉|喷漆|丝印|组装|压铆|打胶|备注|備註|数量|數量|价格|價格|金额|金額|单价|單價|日期|图号|圖號|物料|DD/i.test(titles[column]||''))continue;
      if(known.has(customerKey(value)))counts.set(column,(counts.get(column)||0)+1);
    }
    if(counts.size>1){const error=Error('订单“'+sheet.name+'”存在多个可能的客户列：'+[...counts.keys()].map(c=>c+'列“'+(titles[c]||'空白表头')+'”').join('、')+'，本次跳过，确认后可另批核对。');error.code='CUSTOMER_AMBIGUOUS';throw error;}
    return counts.keys().next().value||'';
  }
  function orderContexts(wb, cfg, selected) {
    const included = [], skipped = [],fileOwner=Catalog.fileProducer(wb.sheets);
    let wanted = null;
    if (cfg.orderSheetPaths !== undefined) {
      if (!Array.isArray(cfg.orderSheetPaths) || !cfg.orderSheetPaths.length) throw Error('请至少选择一个要核对的厂区工作表。');
      if (new Set(cfg.orderSheetPaths).size !== cfg.orderSheetPaths.length || cfg.orderSheetPaths.some(path=>typeof path!=='string'||!wb.sheets.some(s=>s.path===path))) throw Error('所选厂区工作表无效或重复，请重新选择。');
      wanted = new Set(cfg.orderSheetPaths);
    }
    for (const sheet of wb.sheets) {
      if (cfg.targetKind === 'factories' && !Catalog.isFactory(sheet.name)) {skipped.push({name:sheet.name,path:sheet.path,reason:Catalog.isAuxiliary(sheet.name)?'汇总或说明页原样保留':'供应商工作表，本次厂内核销不参与',reasonCode:'not-factory'});continue;}
      if (wanted ? !wanted.has(sheet.path) : !cfg.allOrderSheets && sheet !== selected) {skipped.push({name:sheet.name,path:sheet.path,reason:'本次未选择该厂区，原样保留',reasonCode:'not-selected'});continue;}

      const d = detect(sheet, 'order', cfg.process), saved = cfg.orderConfigs?.[sheet.path];
      if((cfg.targetKind==='producer'||cfg.enforceProducer)&&!Catalog.orderSheetAllowed(sheet,cfg.producer,cfg.producerNames||cfg.suppliers,fileOwner)){
        skipped.push({name:sheet.name,path:sheet.path,rows:sheet.rows.filter(r=>r.row>d.headerEnd&&(r.values[d.map.dd]||r.values[d.map.code]||r.values[d.map.quantity])).length,reason:'工作表制作商与本次“'+cfg.producer+'”不一致或未确认，原样保留',reasonCode:'producer-mismatch'});continue;
      }
      const isSelected = sheet === selected;
      const coreCount = ['dd','code','quantity'].filter(key => d.map[key]).length;
      const summary = (cfg.allOrderSheets || wanted) && /汇总|统计|说明|封面|合计/.test(sheet.name);
      if (summary || (!isSelected && !saved && coreCount === 0)) {
        const hasDD = sheet.rows.some(r=>Object.values(r.values).some(v=>/^DD[0-9]/i.test(norm(v))));
        if(!summary&&hasDD){skipped.push({name:sheet.name,path:sheet.path,rows:Math.max(0,sheet.rows.length-1),reason:'含DD记录但表头和关键字段不齐，本次跳过并列为待审核',reasonCode:'order-fields-incomplete'});continue;}
        skipped.push({name:sheet.name,path:sheet.path,reason:summary?'汇总或说明工作表，不与明细重复抵扣':'未识别订单字段，作为非订单工作表保留'});continue;
      }
      const map = {...(isSelected ? cfg.orderMap : saved?.map || d.map)};
      const header = isSelected ? cfg.orderHeader : saved?.header || d.headerEnd || d.headerRow;
      const customer = isSelected ? cfg.orderCustomer : saved?.customer || '';
      let customerSource=map.customer?'column':customer?'worksheet':'';
      if (!map.customer && !customer && cfg.orderFactoryIsCustomer) {map.customer=d.map.factory||'';if(map.customer)customerSource='factory-column';}
      const deferredRows=()=>sheet.rows.filter(row=>row.row>+header&&(row.values[map.dd]||row.values[map.code]||row.values[map.quantity]||!map.dd&&!map.code&&!map.quantity&&row.values[map.customer])).length;
      if(!map.customer&&!customer){
        try{map.customer=inferCustomerColumn(sheet,map,header,[...(cfg.customers||[]),cfg.materialCustomer||'']);if(map.customer)customerSource='customer-values';}
        catch(error){if(error.code!=='CUSTOMER_AMBIGUOUS')throw error;skipped.push({name:sheet.name,path:sheet.path,rows:deferredRows(),reason:error.message,reasonCode:'customer-ambiguous'});continue;}
      }
      if(!map.customer&&!norm(customer)){skipped.push({name:sheet.name,path:sheet.path,rows:deferredRows(),reason:'客户未识别，本次跳过；保留原表，待相应客户资料提供后另批核对',reasonCode:'customer-unidentified'});continue;}

      try{validateSheetMapping(sheet,map,header,'订单“'+sheet.name+'”',cfg.process,customer);}catch(error){if(error.code!=='MISSING_MAPPING')throw error;skipped.push({name:sheet.name,path:sheet.path,rows:deferredRows(),reason:error.message+'；本次跳过，原表保留待审核',reasonCode:'order-fields-incomplete'});continue;}
      included.push({sheet,map,header,customer,customerSource});
    }
    if (!included.length&&!skipped.some(s=>/^customer-|^producer-|^order-fields-incomplete$/.test(s.reasonCode||''))) throw Error('没有可核对的订单明细工作表，请检查工作表与字段。');
    return {included,skipped};
  }
  function deferredMaterialResult(materialWb,orderWb,cfg,ms,os,error,deferredSources){
    const reason=error.message+'；本次跳过，原表保留待审核';
    const skippedOrderSheets=orderWb.sheets.filter(s=>(cfg.targetKind!=='factories'||Catalog.isFactory(s.name))&&(cfg.orderSheetPaths?cfg.orderSheetPaths.includes(s.path):cfg.allOrderSheets||s===os)).map(s=>({name:s.name,path:s.path,rows:Math.max(0,s.rows.length-1),reason:'本次厂内资料关键字段不齐，未核销、原样保留',reasonCode:'material-fields-incomplete'}));
    const stats={full:0,partial:0,missing:0,review:0,unchanged:0,newQuantity:'0',materialChanges:0,orderChanges:0,groups:0,totalOrders:0,totalMaterial:0,deferredSheets:skippedOrderSheets.length,deferredRows:skippedOrderSheets.reduce((n,s)=>n+s.rows,0)};
    const diagnostics={producer:cfg.producer,deferredMaterialSheets:deferredSources||[{name:ms.name,path:ms.path,reason,reasonCode:'material-fields-incomplete'}],deferredOrderSheets:skippedOrderSheets,orderSheets:[],skippedOrderSheets,allCustomersDeferred:false,allDataDeferred:true,sharedMaterialLedger:true,blockers:[],customers:[],reasonCounts:{},matchedBeforeFilter:0,matchedAfterFilter:0,scopedOrderCount:0,materialFile:materialWb.name,orderFile:orderWb.name,materialSheet:ms.name,orderSheet:os.name,materialHeader:cfg.materialHeader,orderHeader:cfg.orderHeader,materialMap:cfg.materialMap,orderMap:cfg.orderMap,customer:cfg.customer||'',month:cfg.month,process:cfg.process};
    return {config:cfg,stats,diagnostics,results:[],flows:[],changes:[new Map(),new Map()],sheetChanges:[new Map(),new Map()],materialWb,orderWb,sheets:[ms,os],verified:true,exportVerified:false};
  }
  function materialContexts(wb,cfg,selected){
    const multiple=cfg.materialSheetPaths!==undefined,paths=multiple?cfg.materialSheetPaths:[selected.path];
    if(!Array.isArray(paths)||new Set(paths).size!==paths.length||paths.some(path=>!wb.sheets.some(sh=>sh.path===path)))throw Error('项目对应的厂内工作表无效或重复。');
    const included=[],skipped=[];
    for(const sheet of wb.sheets)if(paths.includes(sheet.path)){
      if(paths.length>1&&Catalog.isAuxiliary(sheet.name)&&wb.sheets.some(other=>paths.includes(other.path)&&!Catalog.isAuxiliary(other.name))){skipped.push({name:sheet.name,path:sheet.path,reason:'本次已选明细资料，汇总/说明页保留原样，避免与明细重复抵扣',reasonCode:'material-auxiliary'});continue;}
      const d=detect(sheet,'material',cfg.process),saved=cfg.materialConfigs?.[sheet.path],current=sheet===selected;
      const map={...(current?cfg.materialMap:saved?.map||d.map)},header=current?cfg.materialHeader:saved?.header||d.headerEnd||d.headerRow;
      const declared=current?cfg.materialCustomer:saved?.customer||'',customer=map.customer?declared:Catalog.customerForSheet(sheet.name,declared||(current?'':sheet.name));
      try{validateSheetMapping(sheet,map,header,'厂内“'+sheet.name+'”',cfg.process,customer);included.push({sheet,map,header,customer});}
      catch(error){if(error.code!=='MISSING_MAPPING')throw error;skipped.push({name:sheet.name,path:sheet.path,reason:error.message+'；本次跳过待审核',reasonCode:'material-fields-incomplete',error});}
    }
    if(!paths.length)for(const name of cfg.selectedProjects||[])skipped.push({name,path:'',reason:'所选项目没有对应的厂内资料，本次跳过待审核',reasonCode:'material-project-not-provided'});
    return {included,skipped};
  }
  function analyze(materialWb, orderWb, options) {
    const cfg = { month: 9, year: 2026, process: '喷粉', producer:'厂内', factory: '', continuous: false, ...options };
    cfg.producer=Catalog.producerName(cfg.producer);cfg.suppliers=Catalog.unique([...(cfg.suppliers||[]),...(cfg.producer==='厂内'?[]:[cfg.producer])]);
    if (!Number.isInteger(cfg.month) || cfg.month < 1 || cfg.month > 12) throw Error('请选择有效核销月份。');
    const ms = materialWb.sheets.find(s => s.path === cfg.materialSheet), os = orderWb.sheets.find(s => s.path === cfg.orderSheet);
    if (!ms || !os) throw Error('请确认两份文件的工作表。');
    const mm = cfg.materialMap, om = cfg.orderMap;
    if (materialWb.bytes.length === orderWb.bytes.length && materialWb.bytes.every((b,i) => b === orderWb.bytes[i])) throw Error('两份文件内容完全相同，请上传厂内物料总表及对应订单，不能将同一份表互相核销。');
    const {included:materialSources,skipped:deferredMaterialSheets}=materialContexts(materialWb,cfg,ms);
    if(!materialSources.length){const error=deferredMaterialSheets[0]?.error||Error(deferredMaterialSheets[0]?.reason||'厂内项目资料未提供');return deferredMaterialResult(materialWb,orderWb,cfg,ms,os,error,deferredMaterialSheets.map(({error,...info})=>info));}
    const materialSheetChanges=new Map(materialSources.map(c=>[c.sheet.path,new Map()]));
    const materialChangeKey=m=>cfg.materialSheetPaths!==undefined?m.sheet.path+'!'+m.map.mark+m.row:m.map.mark+m.row;
    const projectNames=Array.isArray(cfg.selectedProjects)&&cfg.selectedProjects.length?new Set(cfg.selectedProjects.map(customerKey)):null;
    const inProjectScope=(sheetName,customer)=>!projectNames||projectNames.has(customerKey(customer))||!cfg.customerSelection&&projectNames.has(customerKey(sheetName));
    const orderChangeKey = o => cfg.allOrderSheets || cfg.orderSheetPaths !== undefined ? o.sheet.path + '!' + o.map.mark + o.row : o.map.mark + o.row;
    const customerOf = (row, map, fixed, sheet) => {
      if (!map.customer) return String(fixed || '').trim();
      let value = row.values[map.customer];
      if (!value) {
        const column = colNo(map.customer);
        const merge = (sheet.merges || []).find(m => m.c1 === column && m.c2 === column && m.r1 <= row.row && m.r2 >= row.row);
        if (merge) value = sheet.byRow.get(merge.r1)?.values[map.customer];
      }
      return String(value || '').trim();
    };
    const scopedKey = (customer, dd, code) => customerKey(customer) + '\u001e' + keyOf(dd, code);
    const allIndex = new Map(), excluded = [], blockers = [];
    const material = [], orders = [], index = new Map(), orderIndex = new Map(), changes = [new Map(), new Map()], flows = [];
    const monthText = cfg.month + '月', producerText=monthText+cfg.producer,orderProducer=cfg.producer==='厂内'?'':cfg.producer, stats = { full: 0, partial: 0, missing: 0, review: 0, unchanged: 0, newQuantity: '0', materialChanges: 0, orderChanges: 0, groups: 0 };
    // Matching evidence covers the uploaded workbook; only selected contexts supply inventory.
    for(const sheet of materialWb.sheets){
      const source=materialSources.find(c=>c.sheet===sheet),saved=cfg.materialConfigs?.[sheet.path];
      if(!source&&Catalog.isAuxiliary(sheet.name))continue;
      const detected=source?null:detect(sheet,'material',cfg.process),map=source?.map||saved?.map||detected.map;
      if(!map.dd||!map.code)continue;
      const header=source?.header||saved?.header||detected.headerEnd||detected.headerRow,fixed=source?.customer||Catalog.customerForSheet(sheet.name,saved?.customer||sheet.name);
      for(const row of sheet.rows){
        const dd=row.values[map.dd],code=row.values[map.code];if(row.row<=+header||!validDD(dd)||!norm(code))continue;
        const key=keyOf(dd,code),evidence={sheet:sheet.name,path:sheet.path,row:row.row,factory:row.values[map.factory]||'',customer:customerOf(row,map,fixed,sheet),cell:map.mark?map.mark+row.row:'',selected:!!source};
        if(!allIndex.has(key))allIndex.set(key,[]);allIndex.get(key).push(evidence);
      }
    }
    for(const source of materialSources){
     const {sheet:materialSheet,map:mm,header,customer:fixedCustomer}=source;
     for (const row of materialSheet.rows) {
      if (row.row <= +header || (!row.values[mm.dd] && !row.values[mm.code])) continue;
      const dd = row.values[mm.dd] || '', code = row.values[mm.code] || '';
      const customer = customerOf(row, mm, fixedCustomer, materialSheet), key = scopedKey(customer, dd, code);
      if(!inProjectScope(materialSheet.name,customer))continue;
      const t = { sheet:materialSheet,map:mm,unit:row.values[mm.unit]||'',id:materialSheet.path+'!'+row.row,row: row.row, values: row.values, customer, dd, code, key, name: row.values[mm.name] || '', old: row.values[mm.mark] || '', added: 0n, remaining: 0n, issue: '', total: 0n, used: 0n, current: 0n };
      t.skipHistory = /^[+-]?\d+(?:\.\d+)?$/.test(String(t.old).trim());
      try { if(!validDD(dd)||!norm(code))throw Error('DD号缺失、含多个DD号或异常业务标识，需核实'); t.total = qty(row.values[mm.quantity]); if (t.total <= 0n) throw Error('厂内数量非正数'); if (t.skipHistory) throw Error('纯数字错误历史按本次口径跳过，原格保留，不参与可用量'); const h = parseHistory(t.old, t.total, cfg.month, cfg.continuous, row.values[mm.unit] || '', cfg.process, cfg.suppliers || [],cfg.producer); Object.assign(t, h); t.remaining = t.total - t.used; } catch (e) { t.issue = e.message; }
      if (!norm(customer)) t.issue = '厂内客户缺失，不能跨客户借量';
      if (row.formulas.has(mm.mark)) t.issue = '核销目标格含公式，不允许覆盖';
      material.push(t); if (!index.has(key)) index.set(key, []); index.get(key).push(t);
    }
    }
    const materialCustomers=new Set([...material.map(m=>customerKey(m.customer)),...materialSources.filter(c=>!c.map.customer&&inProjectScope(c.sheet.name,c.customer)).map(c=>customerKey(c.customer))].filter(Boolean));
    const projectCustomers=projectNames?new Set([...projectNames,...materialCustomers]):null;
    const {included:contexts,skipped:skippedOrderSheets}=orderContexts(orderWb,{...cfg,customers:[...(cfg.customers||[]),...materialCustomers]},os);
    const orderSheetChanges=new Map(contexts.map(c=>[c.sheet.path,new Map()]));
    const customerDeferred=o=>['customer-unidentified','customer-data-not-provided','customer-filtered'].includes(o.issueCode);
    for (const context of contexts) {
     const {sheet:orderSheet,map:om,header,customer:fixedCustomer} = context;
     for (const row of orderSheet.rows) {
      if (row.row <= +header || (!row.values[om.dd] && !row.values[om.code] && !row.values[om.quantity])) continue;
      const dd = row.values[om.dd] || '', code = row.values[om.code] || '', customer = customerOf(row, om, fixedCustomer, orderSheet), key = scopedKey(customer, dd, code); const t = { sheet: orderSheet, map: om, unit: row.values[om.unit] || '', id: orderSheet.path + '!' + row.row, customer, row: row.row, values: row.values, dd, code, key, name: row.values[om.name] || '', old: row.values[om.mark] || '', total: 0n, applied: 0n, current: 0n, remaining: 0n, added: 0n, issue: '', flows: [] };
      try { t.total = qty(row.values[om.quantity]); if (t.total <= 0n) throw Error('订单数量非正数'); Object.assign(t, parseOrderMark(t.old,t.total,cfg.month,cfg.producer,cfg.suppliers,/^(?:备注|備註)$/.test(norm(orderSheet.byRow.get(+header)?.values[om.mark]||'')))); t.remaining = t.total - t.applied; } catch (e) { t.issue = e.message; }
      if (!validDD(dd) || !norm(code)) t.issue = 'DD号缺失、含多个DD号、带附注或异常业务标识，需核实';
      const sp = special(row, om); if (sp) t.issue = sp;
      if (row.formulas.has(om.mark)) t.issue = '核销目标格含公式，不允许覆盖';
      if(!norm(customer)){t.issue='客户未识别，本次跳过，保留原标注';t.issueCode='customer-unidentified';}
      else if(projectCustomers?!projectCustomers.has(customerKey(customer)):cfg.customer&&customerKey(customer)!==customerKey(cfg.customer)){t.issue='不在本次勾选项目或客户范围，本次跳过，保留原状';t.issueCode='customer-filtered';}
      else if(!materialCustomers.has(customerKey(customer))){t.issue='客户“'+customer+'”的厂内资料本次未提供，已跳过；保留原标注，待后续资料再核对';t.issueCode='customer-data-not-provided';}
      orders.push(t); if (!orderIndex.has(key)) orderIndex.set(key, []); orderIndex.get(key).push(t);
    }
    }
    // Existing confirmed orders may not exceed matching material entries already marked for this month.
    for (const [key, group] of orderIndex) {
      if(group.every(customerDeferred))continue;
      const marked = group.reduce((q, t) => q + t.current, 0n); const supply = (index.get(key) || []).filter(t => !t.issue).reduce((q, t) => q + t.current, 0n);
      if (marked > supply) { group.forEach(t => { t.issue = '已有本月订单核销量大于厂内同键本月记录，保留整组核实'; }); (index.get(key) || []).forEach(t => { t.issue = '两表已有本月记录不一致'; }); }
    }
    for (const [key, group] of orderIndex) {
      const mats = index.get(key) || []; const mu = new Set(mats.map(t => norm(t.unit)).filter(Boolean)), ou = new Set(group.map(t => norm(t.unit)).filter(Boolean));
      if (mu.size && ou.size && new Set([...mu, ...ou]).size > 1) { group.forEach(t => { t.issue = '同键两表单位不一致，禁止自动换算'; }); mats.forEach(t => { t.issue = '同键单位不一致'; }); }
    }
    for (const [key, group] of orderIndex) {
      const mats = index.get(key) || [], evidence = allIndex.get(keyOf(group[0].dd, group[0].code)) || [];
      if (!mats.length && evidence.length) group.forEach(o => {
        const sameCustomer=evidence.some(m=>customerKey(m.customer)===customerKey(o.customer));
        o.issue ||= (sameCustomer?'同键厂内来源本次未选或字段待审核，未参与扣量：':'同DD号＋图号仅找到其他客户或客户缺失记录：') + evidence.map(m => m.sheet+' 第' + m.row + '行 客户“' + (m.customer || '空白') + '”').join('；');
        o.issueCode ||= sameCustomer?'material-source-deferred':'customer-mismatch';
      });
      if (mats.some(m => m.issue && !m.skipHistory)) group.forEach(o => { o.issue ||= '同键厂内历史或字段不明确：' + mats.filter(m => m.issue).map(m => '第' + m.row + '行 ' + m.issue).join('；'); });
    }
    const valid = t => !t.issue && t.remaining > 0n;
    function allocate(o, m, amount, rule='同客户DD号图号分配') {
      if (amount <= 0n || amount > o.remaining || amount > m.remaining || m.issue) throw Error('分配台账校验失败，已停止写入。');
      o.remaining -= amount; o.added += amount; m.remaining -= amount; m.added += amount;
      const f = { rule, producer:cfg.producer, customer: o.customer, canonicalCustomer: Catalog.customerName(o.customer), materialCustomer: m.customer, materialFile: materialWb.name, materialSheet: m.sheet.name, materialPath: m.sheet.path, materialCell: m.map.mark + m.row, orderFile: orderWb.name, orderSheet: o.sheet.name, orderPath: o.sheet.path, orderCell: o.map.mark + o.row, month: cfg.month, process: cfg.process, materialRow: m.row, orderRow: o.row, dd: o.dd, code: o.code, quantity: fmt(amount) }; flows.push(f); o.flows.push(f);
    }
    const prioritySheetDeferred=skippedOrderSheets.some(s=>s.path===os.path&&/^customer-|^order-fields-incomplete$/.test(s.reasonCode||''));
    if (!prioritySheetDeferred&&(cfg.priorityRows || []).length && !contexts.some(c=>c.sheet===os)) throw Error('优先行对应的工作表“'+os.name+'”本次未勾选，请勾选该厂区或清空优先行。');
    if (!prioritySheetDeferred&&(cfg.priorityRows || []).some(row => !orders.some(o => o.row === row && o.sheet === os))) throw Error('指定的优先行不在当前订单范围内，请核实原表行号。');
    // Explicitly prioritized order rows share the same residual ledger.
    for (const row of cfg.priorityRows || []) { const o = orders.find(t => t.row === row && t.sheet === os); if (!o || !valid(o)) continue; for (const m of index.get(o.key) || []) { if (m.issue) continue; const amount = min(o.remaining, m.remaining); if (amount > 0n) allocate(o, m, amount); if (!o.remaining) break; } }
    // User rule: matching name and remaining quantity precede all generic DD+code allocation.
    for (const o of orders.filter(valid)) {if(!norm(o.name))continue;const m=(index.get(o.key)||[]).find(t=>!t.issue&&norm(t.name)===norm(o.name)&&t.remaining===o.remaining);if(m)allocate(o,m,o.remaining,'DD号图号名称余量一致优先');}
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
      const unit=m.unit?(['件','张','套'].includes(norm(m.unit))?norm(m.unit):''):'件',withCount=producerText+'对'+fmt(m.added)+unit;
      const label = m.old ? append(m.old,cfg.producer==='厂内'?producerText+fmt(m.added):withCount) : m.added===m.total&&!/\d$/.test(cfg.producer)?producerText:withCount;
      const change={before:m.old,after:label,quantity:fmt(m.added),row:m.row};changes[0].set(materialChangeKey(m),change);materialSheetChanges.get(m.sheet.path).set(m.map.mark+m.row,change);
    }
    const results = [];
    for (const o of orders) {
      let status, reason, label = o.old;
      if (o.issue) { status = 'review'; reason = o.issue; }
      else if (o.added > 0n) {
        const cumulative = o.applied + o.added;
        const newLabel = o.remaining === 0n ? monthText + orderProducer + '已对' : (orderProducer?monthText+orderProducer:'')+'只能对' + fmt(cumulative) + '件';
        label = o.applied > 0n ? append(o.old, monthText + orderProducer + '补对' + fmt(o.added) + '件（累计' + fmt(cumulative) + '件，' + (o.remaining === 0n ? '已对' : '尚余' + fmt(o.remaining) + '件') + '）') : o.old && o.old !== '无此订单' ? append(o.old, newLabel) : newLabel;
        status = o.remaining === 0n ? 'full' : 'partial'; reason = o.remaining === 0n ? '客户、DD号、图号一致，本条订单已核完' : '厂内可用量不足整条订单，已核实际可对数量';
      } else if (o.applied > 0n) { status = o.remaining === 0n ? 'unchanged' : 'partial'; reason = o.remaining === 0n ? '已有核销正确，保持不变' : '已有部分核销，当前无新增可用量，不重复抵扣'; }
      else {
        const mats = index.get(o.key) || [];
        if (mats.some(t => t.issue)) { status = 'review'; reason = '同键厂内存在历史或数量不明：' + mats.filter(t => t.issue).map(t => '第' + t.row + '行 ' + t.issue).join('；'); }
        else { status = 'missing'; label = o.old && !o.old.includes('无此订单') ? append(o.old, '无此订单') : o.old || '无此订单'; reason = mats.length ? '同键厂内可确认余量已用完，本条已无可抵扣量' : '本次物料总表未找到同客户＋DD号＋图号'; }
      }
      if (label !== o.old && !o.issue) {const change={before:o.old,after:label,row:o.row,quantity:fmt(o.added)};changes[1].set(orderChangeKey(o),change);orderSheetChanges.get(o.sheet.path).set(o.map.mark+o.row,change);}
      stats[status]++;
      const mats = index.get(o.key) || [];
      results.push({ deferred:customerDeferred(o), id: o.id, orderSheet: o.sheet.name, orderPath: o.sheet.path, customer: o.customer, canonicalCustomer: Catalog.customerName(o.customer), scopeEvidence: (allIndex.get(keyOf(o.dd, o.code)) || []).map(m => ({ ...m, inScope: !!norm(o.customer) && customerKey(m.customer) === customerKey(o.customer) })), reasonCode: o.issue ? o.issueCode || 'history-or-fields-unclear' : !mats.length ? 'no-key' : o.added > 0n ? 'allocated' : o.applied > 0n ? 'existing' : 'exhausted', row: o.row, dd: o.dd, code: o.code, name: o.name, quantity: o.total > 0n ? fmt(o.total) : o.values[om.quantity] || '', previous: fmt(o.applied), added: fmt(o.added), remaining: fmt(o.remaining), status, reason, before: o.old, after: label, changed: changes[1].has(orderChangeKey(o)), cell: o.map.mark + o.row, allocations: o.flows, material: mats.map(m => ({ sheet:m.sheet.name,path:m.sheet.path,id:m.id,historyUsed: fmt(m.used), currentHistory: fmt(m.current), historyEntries: m.entries || [], row: m.row, name: m.name, quantity: m.total > 0n ? fmt(m.total) : m.values[m.map.quantity] || '', before: m.old, after: changes[0].get(materialChangeKey(m))?.after || m.old, added: fmt(m.added), remaining: fmt(m.remaining), issue: m.issue, cell: m.map.mark + m.row })) });
    }
    const sm = material.reduce((q, t) => q + t.added, 0n), so = orders.reduce((q, t) => q + t.added, 0n), sf = flows.reduce((q, f) => q + qty(f.quantity), 0n);
    if (sm !== so || so !== sf || material.some(m => !m.issue && (m.remaining < 0n || m.added + m.used > m.total)) || orders.some(o => !o.issue && o.added + o.applied > o.total)) throw Error('两表数量校验未通过，禁止导出。');
    for (const o of orders) if (!o.issue && o.remaining > 0n && (index.get(o.key) || []).some(m => !m.issue && m.remaining > 0n)) throw Error('仍有可核销余量未分配，禁止导出。');
    const affected = new Set(flows.map(f => scopedKey(f.customer, f.dd, f.code)));
    for (const key of affected) {
      const left = (index.get(key) || []).reduce((q, m) => q + m.added, 0n), right = (orderIndex.get(key) || []).reduce((q, o) => q + o.added, 0n); if (left !== right) throw Error('分组数量不一致');
    }
    Object.assign(stats, { newQuantity: fmt(sm), materialChanges: changes[0].size, orderChanges: changes[1].size, groups: affected.size, totalOrders: orders.length, totalMaterial: material.length });
    const scopedOrders = orders.filter(o=>(projectCustomers?projectCustomers.has(customerKey(o.customer)):!cfg.customer||customerKey(o.customer)===customerKey(cfg.customer))&&!customerDeferred(o));
    const deferredOrderSheets=skippedOrderSheets.filter(s=>/^customer-|^producer-|^order-fields-incomplete$/.test(s.reasonCode||''));
    Object.assign(stats,{deferredSheets:deferredOrderSheets.length,deferredRows:results.filter(r=>r.deferred).length+deferredOrderSheets.reduce((sum,s)=>sum+(s.rows||0),0)});
    if (scopedOrders.length >= 50 && scopedOrders.filter(o => index.has(o.key)).length / scopedOrders.length < 0.05) blockers.push('当前范围同键匹配率低于5%，请检查工作表、表头、DD号、图号及客户映射；尚未确认原因，禁止批量写入');
    const sheetStats = contexts.map(c => {const rows=results.filter(r=>r.orderPath===c.sheet.path);return {name:c.sheet.name,path:c.sheet.path,state:c.sheet.state,header:c.header,map:c.map,customer:c.customer,customerSource:c.customerSource,totalOrders:rows.length,full:rows.filter(r=>r.status==='full').length,partial:rows.filter(r=>r.status==='partial').length,review:rows.filter(r=>r.status==='review').length,deferred:rows.filter(r=>r.deferred).length,missing:rows.filter(r=>r.status==='missing').length,newQuantity:fmt(rows.reduce((sum,r)=>sum+qty(r.added),0n)),changes:orderSheetChanges.get(c.sheet.path).size};});
    const unavailableProjects=(cfg.selectedProjects||[]).filter(name=>!materialSources.some(c=>customerKey(c.sheet.name)===customerKey(name)||customerKey(c.customer)===customerKey(name))&&!materialCustomers.has(customerKey(name))&&!deferredMaterialSheets.some(c=>customerKey(c.name)===customerKey(name)));
    const diagnostics = {producer:cfg.producer,unavailableProjects,selectedProjects:cfg.selectedProjects||[],materialSheets:materialSources.map(c=>({name:c.sheet.name,path:c.sheet.path,header:c.header,map:c.map,customer:c.customer,newQuantity:fmt(material.filter(m=>m.sheet===c.sheet).reduce((sum,m)=>sum+m.added,0n)),changes:materialSheetChanges.get(c.sheet.path).size})),deferredMaterialSheets:deferredMaterialSheets.map(({error,...info})=>info),deferredOrderSheets,allCustomersDeferred:!scopedOrders.length&&(stats.deferredRows>0||stats.deferredSheets>0),deferredPriorityRows:prioritySheetDeferred?(cfg.priorityRows||[]):[],materialCustomers:[...materialCustomers],orderScope:cfg.orderSheetPaths!==undefined?'selected':cfg.allOrderSheets?'all':'current', orderSheets:sheetStats, skippedOrderSheets, sharedMaterialLedger:true, reasonCounts: results.reduce((counts, row) => { counts[row.reasonCode] = (counts[row.reasonCode] || 0) + 1; return counts; }, {}), year: cfg.year, matchedBeforeFilter: orders.filter(o => allIndex.has(keyOf(o.dd, o.code))).length, matchedAfterFilter: orders.filter(o => index.has(o.key)).length, excluded: results.flatMap(o => o.scopeEvidence.filter(m => !m.inScope).map(m => ({ orderSheet:o.orderSheet,orderPath:o.orderPath,orderRow: o.row, ...m }))), blockers, materialFile: materialWb.name, orderFile: orderWb.name, materialSheet: ms.name, orderSheet: os.name, materialHeader: cfg.materialHeader, orderHeader: cfg.orderHeader, materialMap: mm, orderMap: om, customers: [...new Set(orders.map(o => o.customer).filter(Boolean))], selectedCustomer: cfg.customer || '全部客户（逐客户隔离）', scopedOrderCount: scopedOrders.length, customerAliases:['后缀海天精工 → 海天精工','后缀海天塑机 → 海天塑机'], customerPolicy: '按确认的客户后缀归属匹配；海天精工与海天塑机分别隔离；制造部门仅供参考', materialCustomer: cfg.materialCustomer || '', orderCustomer: cfg.orderCustomer || '', month: cfg.month, process: cfg.process };
    return { sheetChanges:[materialSheetChanges,orderSheetChanges], diagnostics, config: cfg, stats, results, flows, changes, materialWb, orderWb, sheets: [ms, os], verified: true, exportVerified: false };
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
    if (result.diagnostics?.blockers.length) throw Error('范围或映射存在疑点，禁止批量写入。' + result.diagnostics.blockers.join('；'));
    const workbooks = [result.materialWb, result.orderWb], output = [];
    for (let i = 0; i < 2; i++) {
      const wb = workbooks[i], sheet = result.sheets[i]; onProgress?.('校验' + (i === 0 ? '物料总表' : '月度订单') + '的改动范围…');
      if (wb.signed && result.changes[i].size) throw Error('文件含数字签名，不能在保留签名的同时修改。请使用未签名副本。');
      if (!result.changes[i].size) { output.push({ name: wb.name.replace(/\.xlsx$/i, '') + '_核对后.xlsx', bytes: wb.bytes.slice() }); continue; }
      const plans = result.sheetChanges?.[i] || new Map([[sheet.path,result.changes[i]]]);
      const zip = await root.JSZip.loadAsync(wb.bytes,{checkCRC32:true}), patched = new Map();
      for (const [path,changes] of plans) if (changes.size) {
        const target = wb.sheets.find(s=>s.path===path);if(!target)throw Error('核销工作表不存在：'+path);
        const xml = replaceCells(target,changes,wb.strings);patched.set(path,xml);zip.file(path,xml,{date:zip.file(path).date});
      }
      const bytes = await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
      const verified = await root.JSZip.loadAsync(bytes, { checkCRC32: true });
      const names = Object.keys(wb.zip.files).sort(), otherNames = Object.keys(verified.files).sort(); if (names.join('\n') !== otherNames.join('\n')) throw Error('工作簿部件结构变化，禁止导出。');
      for (const path of names) {
        if (wb.zip.files[path].dir || patched.has(path)) continue;
        const [a, b] = await Promise.all([wb.zip.file(path).async('uint8array'), verified.file(path).async('uint8array')]);
        if (a.length !== b.length || !a.every((v, n) => v === b[n])) throw Error('非核销内容发生变化：' + path);
      }
      for (const [path,xml] of patched) if (await verified.file(path).async('string') !== xml) throw Error('工作表保存校验失败：'+path);
      output.push({ name: wb.name.replace(/\.xlsx$/i, '') + '_核对后.xlsx', bytes });
    }
    result.exportVerified = true; return output;
  }
  const API = { version: '2026.11.10.3', readWorkbook, metadata, detect, analyze, exportResult, qty, fmt, norm, parseHistory, parseOrderMark, replaceCells };
  root.ReconcileEngine = API; if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : self);
