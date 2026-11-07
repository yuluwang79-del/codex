const {test}=require('node:test'); const assert=require('node:assert/strict');
const {E,options,book,pair}=require('./fixtures');
const m=(n,h='',f='一厂',code='001-A.V2')=>['DD001',code,n,h,f];
const o=(n,h='',code='001-A.V2')=>['DD001',code,n,h];
async function run(ms,os,cfg={}) {return E.analyze(...await pair(ms,os),{...options,...cfg});}
test('4+6 supplies 5 with exact allocation coordinates and preserved workbook parts; rerun adds zero',async()=>{
 const r=await run([m(4),m(6)],[o(5)]);
 assert.deepEqual(r.flows.map(f=>[f.materialCell,f.orderCell,f.quantity]),[['D2','D2','4'],['D3','D2','1']]);
 assert.equal(r.results[0].remaining,'0');assert.equal(r.results[0].material[1].remaining,'5');
 const files=await E.exportResult(r); const reread=await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name)));
 const again=E.analyze(...reread,options);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[0].size+again.changes[1].size,0);
});
test('10+6 minus historical 1 supplies 15, never credits another order history',async()=>{
 const r=await run([m(10,'8月厂内1'),m(6)],[o(16)]);assert.deepEqual(r.flows.map(f=>f.quantity),['9','6']);
 assert.equal(r.results[0].after,'只能对15件');assert.equal(r.changes[0].get('D2').after,'8月厂内1，10月厂内9');
 const files=await E.exportResult(r);const again=E.analyze(...await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name))),options);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[1].size,0);
});
test('same month other supplier and this month history are deducted once',async()=>{
 const r=await run([m(10,'10月达康2，10月厂内3')],[o(8,'只能对3件')]);assert.equal(r.stats.newQuantity,'5');assert.equal(r.results[0].previous,'3');
 const files=await E.exportResult(r); const again=E.analyze(...await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name))),options);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[1].size,0);
});
test('duplicates retained; exact row beats sequence; explicit priority beats exact row',async()=>{
 let r=await run([m(8)],[o(3),o(8)]);assert.equal(r.flows[0].orderRow,3);assert.equal(r.results[0].reasonCode,'exhausted');
 r=await run([m(8)],[o(3),o(8)],{priorityRows:[2]});assert.deepEqual(r.flows.map(f=>f.quantity),['3','5']);
 r=await run([m(1)],[o(1),o(1)]);assert.equal(r.results.length,2);assert.equal(r.results[1].status,'missing');
});
test('excluded factory key is review and blocks entire export; explicit confirmed alias recovers it',async()=>{
 const r=await run([m(5,'','制造一部')],[o(5)]);assert.equal(r.stats.missing,0);assert.equal(r.diagnostics.matchedBeforeFilter,1);assert.equal(r.diagnostics.matchedAfterFilter,0);assert.equal(r.results[0].scopeEvidence[0].factory,'制造一部');
 await assert.rejects(E.exportResult(r),/禁止批量/);
 const fixed=await run([m(5,'','制造一部')],[o(5)],{factoryAliases:[['制造一部','一厂']]});assert.equal(fixed.stats.full,1);
 const other=await run([m(5),m(20,'','二厂')],[o(10)]);assert.equal(other.stats.newQuantity,'5');assert.equal(other.stats.partial,1);assert.equal(other.flows.length,1);assert.equal(other.flows[0].materialRow,2);assert.equal(other.results[0].remaining,'5');
});
test('version suffix and DD are preserved; only true absent keys get no-key',async()=>{
 const r=await run([m(4)],[o(4,'','001-A.V3'),['DD002','001-A.V2',1,'']]);assert.equal(r.stats.missing,2);assert.equal(r.stats.newQuantity,'0');
});
test('unclear material/order history never consumed or overwritten',async()=>{
 for(const [ms,os] of [[[m(5,'待确认')],[o(5)]],[[m(5)],[o(5,'供应商待核')]]]) {const r=await run(ms,os);assert.equal(r.stats.review,1);assert.equal(r.stats.newQuantity,'0');assert.equal(r.changes[1].size,0);}
});
test('name cancellation is not order cancellation; quantities, prices and formulas are protected in engine',async()=>{
 const [mw,ow]=await pair([m(5)],[o(5)]);ow.sheets[0].rows[1].values.F='原图号取消';assert.equal(E.analyze(mw,ow,{...options,orderMap:{...options.orderMap,name:'F'}}).stats.full,1);
 assert.throws(()=>E.analyze(mw,ow,{...options,orderMap:{...options.orderMap,mark:'C'}}),/同一列|原始数据/);
 ow.sheets[0].rows[1].formulas.add('D');assert.throws(()=>E.analyze(mw,ow,options),/公式/);
});
test('missing/ambiguous/process-specific/newline/merged headers: no arbitrary write-column fallback',async()=>{
 let w=await book('表.xlsx',[['DD号','物料','数量','备注']]);assert.equal(E.detect(w.sheets[0],'order','喷粉').map.mark,'');
 w=await book('表.xlsx',[['DD号','物料','数量','喷粉\n核销','喷粉消单']]);assert.equal(E.detect(w.sheets[0],'order','喷粉').map.mark,'');
 w=await book('表.xlsx',[['DD号','物料','数量','喷粉\n核销','喷漆消单']]);assert.equal(E.detect(w.sheets[0],'order','喷粉').map.mark,'D');
 w=await book('表.xlsx',[['','','','喷粉'],['DD号','物料','数量','日期','核销']],'<mergeCells count="1"><mergeCell ref="D1:E1"/></mergeCells>');
 assert.equal(E.detect(w.sheets[0],'order','喷粉').map.mark,'E');
});
test('multi-month topups credit only explicitly dated amounts in the current month',()=>{
 const parsed=E.parseOrderMark('8月已对3件，9月补对2件（累计5件，尚余5件），10月补对1件（累计6件，尚余4件）',E.qty('10'),10);
 assert.equal(E.fmt(parsed.applied),'6');assert.equal(E.fmt(parsed.current),'1');
 assert.throws(()=>E.parseOrderMark('审批10月已对',E.qty('10'),10),/未确认/);
 assert.throws(()=>E.parseOrderMark('只能对3件，10月补对2件（累计8件，尚余2件）',E.qty('10'),10),/累计不一致/);
 assert.throws(()=>E.parseHistory('8月厂内1套',E.qty('10'),10,false),/单位/);
});
test('numeric zero-padded drawing code retains Excel display leading zeros',async()=>{
 const w=await book('零.xlsx',[['DD号','物料','数量','喷粉'],['DD001','PLACEHOLDER',5,'']]);
 w.zip.file('xl/styles.xml','<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="00000"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>');
 w.zip.file(w.sheets[0].path,w.sheets[0].xml.replace('<c r="B2" t="inlineStr"><is><t>PLACEHOLDER</t></is></c>','<c r="B2" s="1"><v>123</v></c>'));
 const r=await E.readWorkbook(await w.zip.generateAsync({type:'uint8array'}),'零.xlsx');assert.equal(r.sheets[0].byRow.get(2).values.B,'00123');
});
test('low match rate blocks mass missing labels even when keys were mapped incorrectly',async()=>{
 const r=await run([m(5)],Array.from({length:60},(_,i)=>['DD'+(100+i),'B',1,'']));assert.equal(r.stats.missing,60);assert.match(r.diagnostics.blockers[0],/匹配率/);await assert.rejects(E.exportResult(r),/禁止批量/);
});
test('export independently preserves formulas, styles, columns, merges, filter and all other ZIP parts',async()=>{
 const [mw,ow]=await pair([m(5)],[o(5)]);
 for(const wb of [mw,ow]) {
 const s=wb.sheets[0];const xml=s.xml.replace('<sheetData>','<cols><col min="7" max="7" hidden="1" width="18" customWidth="1"/></cols><sheetData>').replace('<c r="D2"','<c s="3" r="D2"').replace('</row></sheetData>','<c r="G2"><f>C2*2</f><v>10</v></c></row></sheetData>')+'<!--preserve literal bytes-->';
 wb.zip.file(s.path,xml);
 }
 const books=await Promise.all([mw,ow].map(async w=>E.readWorkbook(await w.zip.generateAsync({type:'uint8array'}),w.name)));
 const r=E.analyze(...books,options);const exported=await E.exportResult(r);
 for(let i=0;i<2;i++) {
 const after=await E.readWorkbook(exported[i].bytes,exported[i].name);const before=books[i];
 assert.deepEqual(Object.keys(after.zip.files).sort(),Object.keys(before.zip.files).sort());
 for(const path of Object.keys(before.zip.files)){
 if(before.zip.files[path].dir)continue;
 if(path!==before.sheets[0].path)assert.deepEqual(await after.zip.file(path).async('uint8array'),await before.zip.file(path).async('uint8array'));
 else {
 const mask=s=>s.replace(/<c\b[^>]*r="D2"[^>]*>[\s\S]*?<\/c>/,'<ALLOWED/>');assert.equal(mask(after.sheets[0].xml),mask(before.sheets[0].xml));assert.match(after.sheets[0].xml,/<c s="3" r="D2"/);
 }
 }
 }
});
test('historical quantity credits an order only when its own annotation confirms it',async()=>{
 const r=await run([m(10,'8月厂内1'),m(6)],[o(16,'8月已对1件')]);assert.equal(r.stats.newQuantity,'15');assert.equal(r.results[0].status,'full');assert.equal(r.results[0].previous,'1');
 assert.throws(()=>E.parseHistory('8月厂内喷漆1',E.qty('10'),10,false,'','喷粉'),/其他工序/);
});
test('fully consumed historical material is exhausted, without rewriting prior material evidence',async()=>{
 const r=await run([m(5,'9月厂内')],[o(5)]);assert.equal(r.stats.missing,1);assert.equal(r.results[0].reasonCode,'exhausted');assert.equal(r.changes[0].size,0);assert.equal(r.results[0].after,'无此订单');
 const files=await E.exportResult(r);const again=E.analyze(...await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name))),options);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[0].size+again.changes[1].size,0);
});
