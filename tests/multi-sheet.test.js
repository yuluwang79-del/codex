const {test}=require('node:test');const assert=require('node:assert/strict');
const {E,options,book,multiBook}=require('./fixtures');
const head=['DD号','物料','数量','喷粉','客户'];
const row=(q,mark='',customer='测试客户')=>['DD001','A',q,mark,customer];
async function stock(rows){return book('虚构厂内.xlsx',[['专案名称','图号','数量','喷粉','制造部门'],...rows.map((r,i)=>['DD001','A',r[0],r[1]||'',i?'二厂':'一厂'])]);}
const cfg={...options,allOrderSheets:true,orderMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E'}};
async function exportedRerun(result,settings=cfg){const files=await E.exportResult(result);const books=await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name)));const again=E.analyze(...books,settings);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[0].size+again.changes[1].size,0);return books;}
test('all factory worksheets share one ledger; identical row numbers preserve distinct identity, cells and quantities',async()=>{
 const m=await stock([[4],[6]]),o=await multiBook('虚构多厂订单.xlsx',[{name:'一厂',rows:[head,row(6)]},{name:'二厂',rows:[head,row(6)],state:'hidden'}]);
 const r=E.analyze(m,o,cfg);assert.equal(r.stats.newQuantity,'10');assert.deepEqual(r.results.map(x=>[x.orderSheet,x.added,x.remaining]),[['一厂','6','0'],['二厂','4','2']]);assert.notEqual(r.results[0].id,r.results[1].id);assert.deepEqual(r.flows.map(f=>[f.orderSheet,f.orderCell,f.materialRow,f.quantity]),[['一厂','D2',3,'6'],['二厂','D2',2,'4']]);assert.equal(r.diagnostics.orderSheets.length,2);
 const out=await exportedRerun(r);assert.equal(out[1].sheets[1].state,'hidden');assert.equal(out[1].sheets[0].byRow.get(2).values.D,'10月已对');assert.equal(out[1].sheets[1].byRow.get(2).values.D,'只能对4件');
 for(let i=0;i<2;i++)for(const part of Object.keys([m,o][i].zip.files)){
  if([m,o][i].zip.files[part].dir)continue;
  const changes=r.sheetChanges[i].get(part);
  if(!changes?.size)assert.deepEqual(await out[i].zip.file(part).async('uint8array'),await [m,o][i].zip.file(part).async('uint8array'));
  else {const mask=xml=>xml.replace(/<c\b([^>]*r="([A-Z]+\d+)"[^>]*)>[\s\S]*?<\/c>/g,(cell,attrs,ref)=>changes.has(ref)?'<ALLOWED '+ref+'/>':cell);assert.equal(mask(await out[i].zip.file(part).async('string')),mask(await [m,o][i].zip.file(part).async('string')));}
 }
});
test('history is deducted once globally and existing factory orders are compared against the combined history',async()=>{
 const m=await stock([[10,'8月厂内1'],[6]]),o=await multiBook('订单.xlsx',[{name:'一厂',rows:[head,row(8)]},{name:'三厂',rows:[head,row(8)]}]);const r=E.analyze(m,o,cfg);assert.equal(r.stats.newQuantity,'15');assert.deepEqual(r.results.map(x=>x.added),['8','7']);await exportedRerun(r);
 const existing=await stock([[10,'10月厂内4']]),orders=await multiBook('已核订单.xlsx',[{name:'一厂',rows:[head,row(4,'10月已对')]},{name:'二厂',rows:[head,row(8)]}]);const r2=E.analyze(existing,orders,cfg);assert.equal(r2.stats.newQuantity,'6');assert.equal(r2.results[0].status,'unchanged');assert.equal(r2.results[1].added,'6');await exportedRerun(r2);
});
test('columns are identified per factory sheet; priority refers to the selected sheet, not equal row numbers elsewhere',async()=>{
 const m=await stock([[8]]),o=await multiBook('错位列.xlsx',[{name:'一厂',rows:[head,row(3)]},{name:'四厂',rows:[['序号','日期','客户','DD号','物料号','数量','金额','喷粉核销'],[1,'2026-10-01','测试客户','DD001','A',8,100,'']]}]);
 let r=E.analyze(m,o,cfg);assert.equal(r.results[1].added,'8');assert.equal(r.results[1].cell,'H2');assert.equal(r.results[0].added,'0');
 r=E.analyze(m,o,{...cfg,priorityRows:[2]});assert.deepEqual(r.results.map(x=>x.added),['3','5']);await exportedRerun(r,{...cfg,priorityRows:[2]});
});
test('customers remain isolated across factories; factory/customer-header semantics must be explicitly supplied',async()=>{
 const m=await stock([[5]]),headFactory=['DD号','物料','数量','已对数量','厂区'];const o=await multiBook('客户厂区.xlsx',[{name:'一厂',rows:[headFactory,row(3)]},{name:'二厂',rows:[headFactory,row(3)]},{name:'三厂',rows:[headFactory,row(8,'','其他客户')]}]);
 const settings={...cfg,orderMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E',factory:'E'},orderFactoryIsCustomer:true};const r=E.analyze(m,o,settings);assert.equal(r.stats.newQuantity,'5');assert.deepEqual(r.results.map(x=>x.added),['3','2','0']);assert.equal(r.results[2].status,'review');assert(!r.sheetChanges[1].get(o.sheets[2].path).size);await exportedRerun(r,settings);
});
test('summary sheets are retained and listed, never consumed along with detail; invalid detail targets block the batch',async()=>{
 const m=await stock([[5]]),o=await multiBook('汇总及明细.xlsx',[{name:'汇总',rows:[head,row(99)]},{name:'五厂',rows:[head,row(5)]},{name:'说明',rows:[['使用说明']]}]);
 const r=E.analyze(m,o,cfg);assert.equal(r.stats.totalOrders,1);assert.equal(r.stats.newQuantity,'5');assert.equal(r.diagnostics.skippedOrderSheets.length,2);assert.equal(r.results[0].orderSheet,'五厂');await exportedRerun(r);
 const bad=await multiBook('未识别列.xlsx',[{name:'一厂',rows:[head,row(1)]},{name:'六厂',rows:[['DD号','物料','数量','备注','客户'],row(1)]}]);assert.throws(()=>E.analyze(m,bad,cfg),/六厂.*缺少字段.*核销/);
 const damaged=await multiBook('表头错误.xlsx',[{name:'一厂',rows:[head,row(1)]},{name:'六厂',rows:[['未知表头'],['DD001','A',1]]}]);assert.throws(()=>E.analyze(m,damaged,cfg),/六厂.*含DD记录.*确认映射/);
});
test('visiting another factory mapping does not lose confirmed factory-as-customer semantics; explicit sheet customer overrides stay intact',async()=>{
 const m=await stock([[5]]),o=await multiBook('访问过映射的订单.xlsx',[{name:'一厂',rows:[['DD号','物料','数量','已对数量','厂区'],row(3)]},{name:'二厂',rows:[['DD号','物料','数量','已对数量','厂区'],row(3)]}]);
 const second=o.sheets[1].path,settings={...cfg,orderFactoryIsCustomer:true,orderConfigs:{[second]:{header:1,map:{dd:'A',code:'B',quantity:'C',mark:'D',factory:'E'},customer:''}}};const r=E.analyze(m,o,settings);assert.equal(r.stats.newQuantity,'5');assert.equal(r.diagnostics.orderSheets[1].map.customer,'E');
 const explicit=E.analyze(m,o,{...settings,orderConfigs:{[second]:{...settings.orderConfigs[second],customer:'其他客户'}}});assert.equal(explicit.stats.newQuantity,'3');assert.equal(explicit.results[1].customer,'其他客户');assert.equal(explicit.results[1].added,'0');
});
