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
test('manufacturing department never excludes in-house work; shared residual ledger crosses departments',async()=>{
 const r=await run([m(5,'','制造一部')],[o(5)]);assert.equal(r.stats.full,1);assert.equal(r.diagnostics.matchedBeforeFilter,1);assert.equal(r.diagnostics.matchedAfterFilter,1);assert.equal(r.results[0].scopeEvidence[0].factory,'制造一部');await E.exportResult(r);
 const other=await run([m(5),m(20,'','二厂')],[o(10)]);assert.equal(other.stats.newQuantity,'10');assert.equal(other.stats.full,1);assert.deepEqual(other.flows.map(f=>[f.materialRow,f.quantity]),[[2,'5'],[3,'5']]);
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
test('customer is required even with DD+code match; an unrelated customer cannot supply or consume history',async()=>{
 const [mw,ow]=await pair([m(5)],[o(5)]);
 assert.throws(()=>E.analyze(mw,ow,{...options,materialCustomer:'',orderCustomer:''}),/未识别客户列/);
 const r=E.analyze(mw,ow,{...options,materialCustomer:'客户甲',orderCustomer:'客户乙'});assert.equal(r.stats.newQuantity,'0');assert.equal(r.stats.review,1);assert.equal(r.results[0].reasonCode,'customer-mismatch');assert.equal(r.changes[0].size+r.changes[1].size,0);
});
test('customer columns partition identical DD+code; equal customer spans departments but never other customers',async()=>{
 const mw=await book('客户物料.xlsx',[['专案名称','图号','数量','喷粉','厂区','客户'],['DD001','A',4,'','一厂','甲'],['DD001','A',6,'','二厂','甲'],['DD001','A',100,'','三厂','乙']]);
 const ow=await book('客户订单.xlsx',[['DD号','物料','数量','喷粉','客户'],['DD001','A',5,'','甲'],['DD001','A',7,'','乙']]);
 const cfg={...options,materialMap:{...options.materialMap,customer:'F'},orderMap:{...options.orderMap,customer:'E'}};
 assert.equal(E.detect(mw.sheets[0],'material','喷粉').map.customer,'F');assert.equal(E.detect(ow.sheets[0],'order','喷粉').map.customer,'E');
 const r=E.analyze(mw,ow,cfg);assert.deepEqual(r.flows.map(f=>[f.customer,f.materialRow,f.orderRow,f.quantity]),[['甲',2,2,'4'],['甲',3,2,'1'],['乙',4,3,'7']]);
 const exported=await E.exportResult(r);const again=E.analyze(...await Promise.all(exported.map(f=>E.readWorkbook(f.bytes,f.name))),cfg);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[0].size+again.changes[1].size,0);
});
test('numeric historical cell is preserved and reviewed without blocking unrelated valid work',async()=>{
 const [mw,ow]=await pair([m(5,'10'),['DD002','B',5,'','二厂']],[o(5),['DD002','B',5,'']]);
 const r=E.analyze(mw,ow,options);assert.equal(r.stats.review,1);assert.equal(r.stats.full,1);assert.equal(r.stats.newQuantity,'5');assert(!r.changes[0].has('D2'));assert(!r.changes[1].has('D2'));assert.match(r.results[0].reason,/第2行.*历史/);await E.exportResult(r);
});
test('delivery-date cell must not be inferred as factory; vertical merged customer cells resolve to their anchor',async()=>{
 const w=await book('表.xlsx',[['厂区：','送货日期：26年10月'],['专案名称','图号','数量','喷粉','客户'],['DD001','A',4,'','甲'],['DD001','A',6,'','']],'<mergeCells count="1"><mergeCell ref="E3:E4"/></mergeCells>');
 assert.equal(E.metadata(w,'喷粉').sheets[0].factory,'');
 const ow=await book('订单.xlsx',[['DD号','物料','数量','喷粉','客户'],['DD001','A',5,'','甲']]);
 const r=E.analyze(w,ow,{...options,materialHeader:2,materialMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E'},orderMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E'}});assert.equal(r.stats.newQuantity,'5');assert.deepEqual(r.flows.map(f=>f.quantity),['4','1']);
});
test('skip erroneous numeric history only for that source record; clear same-key rows still supply the order',async()=>{
 const r=await run([m(50,'10'),m(6,'','二厂')],[o(5)]);assert.equal(r.stats.full,1);assert.equal(r.stats.newQuantity,'5');assert.deepEqual(r.flows.map(f=>[f.materialRow,f.quantity]),[[3,'5']]);assert(!r.changes[0].has('D2'));const files=await E.exportResult(r);const again=E.analyze(...await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name))),options);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[0].size+again.changes[1].size,0);
});
test('selected customer restricts writes while matching all records for diagnostic evidence',async()=>{
 const mw=await book('物料.xlsx',[['专案名称','图号','数量','喷粉','客户'],['DD001','A',5,'','甲'],['DD001','A',7,'','乙']]);const ow=await book('需求.xlsx',[['DD号','物料','数量','喷粉','客户'],['DD001','A',5,'','甲'],['DD001','A',7,'','乙']]);
 const cfg={...options,customer:'甲',materialMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E'},orderMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E'}};
 const r=E.analyze(mw,ow,cfg);assert.equal(r.stats.newQuantity,'5');assert.equal(r.diagnostics.scopedOrderCount,1);assert.equal(r.results[1].reasonCode,'customer-filtered');assert.equal(r.results[0].scopeEvidence.length,2);assert(!r.changes[0].has('D3'));assert(!r.changes[1].has('D3'));assert.equal(r.flows[0].customer,'甲');await E.exportResult(r);
});
