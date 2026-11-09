const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../catalog');const {E,options,book,multiBook}=require('./fixtures');
const cfg={...options,materialMap:{dd:'A',code:'B',quantity:'C',mark:'D',name:'E',customer:'F'},orderMap:{dd:'A',code:'B',quantity:'C',mark:'D',name:'E',customer:'F'}};
async function named(mats,orders){return [await book('虚构物料.xlsx',[['专案名称','图号','数量','喷粉','名称','客户'],...mats]),await multiBook('虚构订单.xlsx',[{name:'一厂',rows:[['DD号','物料','数量','喷粉','名称','客户'],...orders]}])];}
const row=(n,name,history='',customer='测试客户')=>['DD001','A',n,history,name,customer];
test('factory list is exactly the six confirmed factories; supplier and customer additions survive serialization',()=>{
 assert.deepEqual([...C.factories],['一厂','二厂','三厂','五厂','六厂','总厂']);assert(C.isFactory(' 五 厂 '));assert(!C.isFactory('四厂'));assert(!C.isFactory('新协作商'));
 const registry=C.empty();C.add(registry,'suppliers','新协作商');C.add(registry,'customers','新客户');const restored=C.restore(JSON.stringify(registry));assert.deepEqual(restored.suppliers,['新协作商']);assert.deepEqual(restored.customers,['新客户']);assert.throws(()=>C.add(registry,'suppliers','一厂'),/不是供应商/);assert.throws(()=>C.add(registry,'suppliers','新协作商'),/已经添加/);assert.throws(()=>C.add(registry,'customers',''),/有效名称/);
});
test('name+remaining-quantity match takes precedence over balanced group allocation and earlier name mismatch',async()=>{
 let [m,o]=await named([row(5,'甲'),row(5,'乙')],[row(5,'乙'),row(5,'甲')]);let r=E.analyze(m,o,cfg);assert.deepEqual(r.flows.map(f=>[f.orderRow,f.materialRow,f.quantity]),[[2,3,'5'],[3,2,'5']]);assert(r.flows.every(f=>f.rule==='DD号图号名称余量一致优先'));
 [m,o]=await named([row(8,'甲')],[row(8,'乙'),row(8,'甲')]);r=E.analyze(m,o,cfg);assert.equal(r.results[0].added,'0');assert.equal(r.results[1].added,'8');const manual=E.analyze(m,o,{...cfg,priorityRows:[2]});assert.equal(manual.results[0].added,'8');
});
test('different names still allow ordinary same-customer DD+code cross-row allocation; other customers stay isolated',async()=>{
 const [m,o]=await named([row(4,'甲'),row(6,'乙')],[row(5,'丙'),row(5,'甲','','其他客户')]);const r=E.analyze(m,o,cfg);assert.equal(r.stats.newQuantity,'5');assert.deepEqual(r.flows.map(f=>f.quantity),['4','1']);assert.equal(r.results[1].added,'0');assert.equal(r.results[1].status,'review');
});
test('new supplier histories deduct once, preserve literal names and respect quantity ambiguity',async()=>{
 let h=E.parseHistory('8月新协作商2，10月厂内3',E.qty('10'),10,false,'','喷粉',['新协作商','新协作商']);assert.equal(E.fmt(h.used),'5');assert.equal(E.fmt(h.current),'3');
 h=E.parseHistory('8月新(甲)+商2',E.qty('10'),10,false,'','喷粉',['新(甲)+商']);assert.equal(E.fmt(h.used),'2');
 assert.throws(()=>E.parseHistory('8月供商123',E.qty('100'),10,false,'','喷粉',['供商1','供商12']),/边界不明确/);
 const [m,o]=await named([row(10,'侧板','8月新协作商2')],[row(9,'侧板')]);const settings={...cfg,suppliers:['新协作商']};const r=E.analyze(m,o,settings);assert.equal(r.stats.newQuantity,'8');const files=await E.exportResult(r);const out=await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name)));assert.equal(out[0].sheets[0].byRow.get(2).values.D,'8月新协作商2，10月厂内8');const again=E.analyze(...out,settings);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[0].size+again.changes[1].size,0);
});
test('supplier pages never participate in factory mode or get rewritten as internal factory orders',async()=>{
 const m=await book('厂内.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',10,'']]),head=['DD号','物料','数量','喷粉','客户'];const o=await multiBook('分类订单.xlsx',[{name:'一厂',rows:[head,['DD001','A',4,'','测试客户']]},{name:'五厂',rows:[head,['DD001','A',4,'','测试客户']]},{name:'新协作商',rows:[head,['DD001','A',99,'','测试客户']]},{name:'四厂',rows:[head,['DD001','A',99,'','测试客户']]}]);
 const settings={...options,allOrderSheets:true,targetKind:'factories',orderMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E'}};const r=E.analyze(m,o,settings);assert.equal(r.stats.newQuantity,'8');assert.deepEqual(r.diagnostics.orderSheets.map(s=>s.name),['一厂','五厂']);const files=await E.exportResult(r);const out=await E.readWorkbook(files[1].bytes,files[1].name);for(const i of [2,3])assert.equal(out.sheets[i].xml,o.sheets[i].xml);
});
test('missing customer header can use one uniquely matching customer-value column; ambiguous candidates stop the batch',async()=>{
 const m=await book('物料.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',10,'']]),head1=['DD号','物料','客户','数量','喷粉','名称'],head2=['DD号','物料','','数量','喷粉','名称'];const o=await multiBook('客户表头缺失.xlsx',[{name:'一厂',rows:[head1,['DD001','A','测试客户',3,'','侧板']]},{name:'二厂',rows:[head2,['DD001','A','测试客户',3,'','侧板']]}]);
 const settings={...options,allOrderSheets:true,targetKind:'factories',customers:['测试客户'],orderMap:{dd:'A',code:'B',quantity:'D',mark:'E',name:'F',customer:'C'}};const r=E.analyze(m,o,settings);assert.equal(r.stats.newQuantity,'6');assert.equal(r.diagnostics.orderSheets[1].map.customer,'C');assert.equal(r.diagnostics.orderSheets[1].customerSource,'customer-values');
 const bad=await multiBook('客户歧义.xlsx',[{name:'一厂',rows:[head1,['DD001','A','测试客户',3,'','侧板']]},{name:'二厂',rows:[[...head2,'归属'],['DD001','A','测试客户',3,'','侧板','测试客户']]}]);assert.throws(()=>E.analyze(m,bad,settings),/二厂.*多个可能的客户列/);
});
