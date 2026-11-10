// Invented data using public header layouts only. Never copy business rows here.
const {test}=require('node:test');const assert=require('node:assert/strict');const {E,options,multiBook}=require('./fixtures');
test('sales-order DD headers and product names support name/quantity priority and preserve original cells',async()=>{
 for(const ddTitle of ['销售订单','销售订单号']){
  const m=await multiBook('合成销售订单物料.xlsx',[{name:'测试客户',rows:[['厂区',ddTitle,'图号','存货名称','数量','喷粉消单'],['一厂','DD001','001-A.V2','甲',5,''],['一厂','DD001','001-A.V2','乙',5,'']]}]);
  const o=await multiBook('合成产品名称订单.xlsx',[{name:'一厂',rows:[['供应商：测试商'],['送货日期：26年10月'],['序号','日期','客户','DD号','物料号','产品名称','数量','单重','颜色','备注','核销标注列'],[1,'2026-10-01','测试客户','DD001','001-A.V2','乙',5,1,'白色','',''],[2,'2026-10-02','测试客户','DD001','001-A.V2','甲',5,1,'白色','','']]}]);
  const md=E.detect(m.sheets[0],'material','喷粉'),od=E.detect(o.sheets[0],'order','喷粉');assert.equal(md.map.dd,'B');assert.equal(md.map.name,'D');assert.equal(od.map.name,'F');assert.equal(od.map.mark,'K');
  const cfg={...options,materialHeader:md.headerEnd,orderHeader:od.headerEnd,materialMap:md.map,orderMap:od.map};const r=E.analyze(m,o,cfg);assert.deepEqual(r.flows.map(f=>[f.orderRow,f.materialRow]),[[4,3],[5,2]]);assert(r.flows.every(f=>f.rule==='DD号图号名称余量一致优先'));
  const files=await E.exportResult(r),out=await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name)));assert.equal(out[0].sheets[0].byRow.get(2).values.B,'DD001');assert.equal(out[1].sheets[0].byRow.get(4).values.G,'5');const again=E.analyze(...out,cfg);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[0].size+again.changes[1].size,0);
 }
});
test('customer order reference remains distinct from DD/sales order and is never chosen as a DD field',async()=>{
 const m=await multiBook('合成客户订单号.xlsx',[{name:'测试客户',rows:[['客户订单号','图号','数量','喷粉'],['ORDER001','A',5,'']]}]);assert.equal(E.detect(m.sheets[0],'material','喷粉').map.dd,undefined);
});
test('multiple DD numbers in one cell remain pending even when repeated DD values or the same malformed material key exist',async()=>{
 const mixed=['DD001\nDD002','DD001\nDD001','DD001/DD002'];
 const m=await multiBook('合成多DD物料.xlsx',[{name:'测试客户',rows:[['专案名称','图号','数量','喷粉'],['DD001','A',4,''],...mixed.map(dd=>[dd,'A',9,''])]}]);
 const o=await multiBook('合成多DD订单.xlsx',[{name:'一厂',rows:[['DD号','物料','数量','喷粉'],['DD001','A',1,''],...mixed.map(dd=>[dd,'A',1,''])]}]);
 const cfg={...options,materialMap:{dd:'A',code:'B',quantity:'C',mark:'D'},orderMap:{dd:'A',code:'B',quantity:'C',mark:'D'}};const r=E.analyze(m,o,cfg);assert.equal(r.stats.newQuantity,'1');assert.equal(r.stats.missing,0);assert(r.results.slice(1).every(row=>row.status==='review'&&row.after===''&&!row.changed&&/多个DD号/.test(row.reason)));
 const files=await E.exportResult(r),out=await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name)));for(const book of out)for(const i of [3,4,5])assert.equal(book.sheets[0].byRow.get(i).values.D,undefined);const again=E.analyze(...out,cfg);assert.equal(again.stats.newQuantity,'0');
});
test('unselected material sheets provide matching evidence but never inventory, including a same key belonging to another customer',async()=>{
 for(const customer of ['其他客户','测试客户']){
  const m=await multiBook('合成未选来源.xlsx',[{name:'项目甲',rows:[['专案名称','图号','数量','喷粉','客户'],['DD002','A',5,'','测试客户']]},{name:'项目乙',rows:[['专案名称','图号','数量','喷粉','客户'],['DD001','A',3,'',customer]]}]);
  const o=await multiBook('合成跨表证据.xlsx',[{name:'一厂',rows:[['DD号','物料','数量','喷粉','客户'],['DD001','A',2,'','测试客户']]}]);
  const cfg={...options,materialMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E'},orderMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E'},selectedProjects:['项目甲'],materialSheetPaths:[m.sheets[0].path]};
  const r=E.analyze(m,o,cfg);assert.equal(r.stats.newQuantity,'0');assert.equal(r.results[0].status,'review');assert.equal(r.results[0].after,'');assert.equal(r.results[0].reasonCode,customer==='其他客户'?'customer-mismatch':'material-source-deferred');assert.equal(r.results[0].scopeEvidence[0].sheet,'项目乙');assert.equal(r.results[0].scopeEvidence[0].selected,false);assert.equal(r.changes[0].size+r.changes[1].size,0);
 }
});
