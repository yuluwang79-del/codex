const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../catalog');const {E,options,book,multiBook}=require('./fixtures');
const cfg={...options,producer:'达康'};
async function checkRoundtrip(r,settings){const files=await E.exportResult(r),out=await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name)));const next=E.analyze(...out,settings);assert.equal(next.stats.newQuantity,'0');assert.equal(next.changes[0].size+next.changes[1].size,0);return out;}
test('selected producer deducts all historical makers once and attributes current-month history only to itself',async()=>{
 const history='8月天跃1，10月厂内4，10月达康2';const h=E.parseHistory(history,E.qty(20),10,false,'','喷粉',[],'达康');assert.equal(E.fmt(h.used),'7');assert.equal(E.fmt(h.current),'2');
 const m=await book('虚构总表.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',20,history]]),o=await book('虚构达康.xlsx',[['DD号','物料','数量','喷粉'],['DD001','A',10,'']]);const r=E.analyze(m,o,cfg);assert.equal(r.stats.newQuantity,'10');assert.equal(r.results[0].after,'10月达康已对');assert.equal(r.changes[0].get('D2').after,history+'，10月达康对10件');assert.equal(r.flows[0].producer,'达康');await checkRoundtrip(r,cfg);
});
test('internal and external batches share the same residual and old internal labels stay unchanged',async()=>{
 const m=await book('虚构共享总表.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',10,'']]),internal=await book('虚构厂内订单.xlsx',[['DD号','物料','数量','喷粉'],['DD001','A',4,'']]);const first=E.analyze(m,internal,options),out=await checkRoundtrip(first,options);assert.equal(out[0].sheets[0].byRow.get(2).values.D,'10月厂内对4件');
 const external=await book('虚构达康订单.xlsx',[['DD号','物料','数量','喷粉'],['DD001','A',6,'']]);const next=E.analyze(out[0],external,cfg);assert.equal(next.stats.newQuantity,'6');const out2=await checkRoundtrip(next,cfg);assert.equal(out2[0].sheets[0].byRow.get(2).values.D,'10月厂内对4件，10月达康对6件');assert.equal(out[1].sheets[0].byRow.get(2).values.D,'10月已对');
 const third=E.analyze(out2[0],external,{...cfg,producer:'新制作商'});assert.equal(third.stats.newQuantity,'0');assert.equal(third.stats.missing,1);
});
test('confirmed remark targets preserve business text, supplier partial quantities and later cumulative supplements',async()=>{
 const m=await book('虚构备注总表.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',10,'10月厂内3']]),o=await book('虚构备注订单.xlsx',[['DD号','物料','数量','备注'],['DD001','A',12,'素材']]);let r=E.analyze(m,o,cfg);assert.equal(r.stats.newQuantity,'7');assert.equal(r.results[0].after,'素材，10月达康只能对7件');const out=await checkRoundtrip(r,cfg);
 const extra=await book('虚构新增余量.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',10,out[0].sheets[0].byRow.get(2).values.D],['DD001','A',2,'']]);r=E.analyze(extra,out[1],cfg);assert.equal(r.stats.newQuantity,'2');assert.equal(r.results[0].after,'素材，10月达康只能对7件，10月达康补对2件（累计9件，尚余3件）');await checkRoundtrip(r,cfg);
});
test('another maker already reconciled on an order is preserved without claiming selected-maker history',async()=>{
 const m=await book('虚构其他制作商总表.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',5,'10月厂内']]),o=await book('虚构其他制作商订单.xlsx',[['DD号','物料','数量','喷粉'],['DD001','A',5,'10月厂内已对']]);const r=E.analyze(m,o,cfg);assert.equal(r.stats.newQuantity,'0');assert.equal(r.results[0].status,'unchanged');assert.equal(r.results[0].after,'10月厂内已对');assert.equal(r.changes[0].size+r.changes[1].size,0);
});
test('manual maker names with regexp characters or trailing digits round-trip without quantity-boundary ambiguity',async()=>{
 for(const name of ['新(甲)+商','制作商1','十月制作商','供商12月']){
  const m=await book('虚构新商总表.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',5,'']]),o=await book('虚构新商订单.xlsx',[['DD号','物料','数量','喷粉'],['DD001','A',5,'']]);const settings={...options,producer:name,suppliers:['制作商','制作商1']},r=E.analyze(m,o,settings);assert.equal(r.stats.newQuantity,'5');assert.equal(r.results[0].after,'10月'+name+'已对');await checkRoundtrip(r,settings);
 }
});
test('external maker scope includes declared and compound factory pages, but preserves other makers and unconfirmed hidden pages',async()=>{
 const m=await book('虚构范围总表.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',20,'']]);const head=['DD号','物料','数量','喷粉','客户'];const o=await multiBook('虚构制作商多页.xlsx',[{name:'达康',rows:[['供应商：达康'],head,['DD001','A',3,'','测试客户']]},{name:'三厂客户甲',rows:[head,['DD001','A',4,'','测试客户']]},{name:'Sheet1',rows:[head,['DD001','A',2,'','测试客户']]},{name:'天跃',state:'hidden',rows:[['供应商：天跃'],head,['DD001','A',99,'','测试客户']]},{name:'未声明页',state:'hidden',rows:[head,['DD001','A',99,'','测试客户']]}]);const settings={...cfg,targetKind:'producer',allOrderSheets:true,orderHeader:2,orderMap:{dd:'A',code:'B',quantity:'C',mark:'D',customer:'E'}};const r=E.analyze(m,o,settings);assert.equal(r.stats.newQuantity,'9');assert.deepEqual(r.diagnostics.orderSheets.map(s=>s.name),['达康','三厂客户甲','Sheet1']);const out=await checkRoundtrip(r,settings);for(const i of [3,4])assert.equal(out[1].sheets[i].xml,o.sheets[i].xml);const wrong=E.analyze(m,o,{...settings,producer:'新制作商'});assert.equal(wrong.stats.newQuantity,'0');assert.equal(wrong.changes[0].size+wrong.changes[1].size,0);assert(wrong.diagnostics.skippedOrderSheets.some(s=>s.name==='三厂客户甲'&&s.reasonCode==='producer-mismatch'));
});
test('business remarks may be retained but unclear reconciliation history is never treated as zero',async()=>{
 const m=await book('虚构备注历史总表.xlsx',[['专案名称','图号','数量','喷粉'],['DD001','A',10,'']]);for(const label of ['审批10月已对','9月对3','10月未知商3','1']){const o=await book('虚构未知历史订单.xlsx',[['DD号','物料','数量','备注'],['DD001','A',5,label]]),r=E.analyze(m,o,cfg);assert.equal(r.stats.newQuantity,'0');assert.equal(r.results[0].status,'review');assert.equal(r.results[0].after,label);}
});
test('maker names reject delimiters and factories while customer and supplier identities stay distinct',()=>{
 for(const name of ['一厂','汇总','错误，名称','错误;名称'])assert.throws(()=>C.producerName(name));assert.equal(C.producerName('厂内'),'厂内');assert.equal(C.producerName('达康'),'达康');assert.equal(E.fmt(E.parseOrderMark('10月厂内已对3件，10月达康补对2件（累计5件，尚余5件）',E.qty(10),10,'达康').current),'2');
});
test('supplier material annotations retain an explicitly confirmed quantity unit on partial use',async()=>{
 const m=await book('虚构单位总表.xlsx',[['专案名称','图号','数量','喷粉','单位'],['DD001','A',5,'','套']]),o=await book('虚构单位订单.xlsx',[['DD号','物料','数量','喷粉','单位'],['DD001','A',3,'','套']]);const settings={...cfg,materialMap:{dd:'A',code:'B',quantity:'C',mark:'D',unit:'E'},orderMap:{dd:'A',code:'B',quantity:'C',mark:'D',unit:'E'}};const r=E.analyze(m,o,settings);assert.equal(r.changes[0].get('D2').after,'10月达康对3套');await checkRoundtrip(r,settings);
});
