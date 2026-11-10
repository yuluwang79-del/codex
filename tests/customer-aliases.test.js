// All DD numbers, quantities and workbooks in this file are synthetic.
const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../catalog');const {E,options,multiBook}=require('./fixtures');
const head=['专案名称','图号','数量','喷粉','客户','名称'];
const orderHead=['DD号','物料','数量','喷粉','客户','名称'];
const map={dd:'A',code:'B',quantity:'C',mark:'D',customer:'E',name:'F'};
const settings={...options,materialMap:map,orderMap:map,materialCustomer:'',orderCustomer:'',allOrderSheets:true,targetKind:'factories'};
async function roundtrip(m,o,cfg){const r=E.analyze(m,o,cfg),files=await E.exportResult(r),out=await Promise.all(files.map(f=>E.readWorkbook(f.bytes,f.name)));const again=E.analyze(...out,cfg);assert.equal(again.stats.newQuantity,'0');assert.equal(again.changes[0].size+again.changes[1].size,0);return {r,out};}

test('customer names use the agreed shortlist and only the two confirmed final suffixes are canonicalized',()=>{
 assert.deepEqual([...C.defaultCustomers],['海天精工','海天塑机','赛尔富','公牛','乐仑','兴泰','埃利','荣特','君灵','东英吉利','蓓灵']);
 for(const name of ['海天精工','海外-海天精工','春晓装配-海天精工','五分厂- 海天 精工 '])assert.equal(C.customerName(name),'海天精工');
 for(const name of ['海天塑机','海外-海天塑机','五分厂-海天塑机'])assert.equal(C.customerName(name),'海天塑机');
 for(const name of ['海天精工-售后','海天塑机配件','海天金属','装配-公牛',''])assert.equal(C.customerName(name),name);
 assert.notEqual(C.customerKey('海外-海天精工'),C.customerKey('海外-海天塑机'));
 assert.equal(C.norm('001-海天精工.V2'),'001-海天精工.V2');
 const saved=C.restore(JSON.stringify({customers:['海天精工','海外-海天精工','五分厂-海天塑机','海天塑机','自增客户']}));assert.deepEqual(saved.customers,['海天精工','海天塑机','自增客户']);assert.throws(()=>C.add(saved,'customers','新项目-海天精工'),/已经添加/);
 const vendors=C.empty();C.add(vendors,'suppliers','海外-海天精工');assert.deepEqual(vendors.suppliers,['海外-海天精工']);
});

test('different prefixes of the same customer share one ledger and preserve all raw customer cells on export',async()=>{
 const m=await multiBook('虚构后缀物料.xlsx',[{name:'混合客户',rows:[head,['DD001','001-A.V2',10,'8月厂内1','春晓装配-海天精工','侧板'],['DD001','001-A.V2',4,'','海外-海天塑机','侧板']]}]);
 const o=await multiBook('虚构后缀订单.xlsx',[{name:'一厂',rows:[orderHead,['DD001','001-A.V2',9,'','海外-海天精工','侧板'],['DD001','001-A.V2',5,'','五分厂-海天塑机','侧板'],['DD001','001-A.V2',8,'','海天精工-售后','侧板']]}]);
 const {r,out}=await roundtrip(m,o,settings);assert.equal(r.stats.newQuantity,'13');assert.deepEqual(r.results.map(x=>x.added),['9','4','0']);assert.deepEqual(r.results.map(x=>x.canonicalCustomer),['海天精工','海天塑机','海天精工-售后']);assert.equal(r.flows[0].materialCustomer,'春晓装配-海天精工');assert.equal(r.flows[0].customer,'海外-海天精工');assert.equal(r.flows[0].canonicalCustomer,'海天精工');assert(r.results[0].scopeEvidence.some(x=>x.customer==='春晓装配-海天精工'&&x.inScope));
 assert.equal(out[0].sheets[0].byRow.get(2).values.D,'8月厂内1，10月厂内9');
 for(const i of [0,1])for(const row of [m,o][i].sheets[0].rows)for(const col of ['A','B','C','E','F'])assert.equal(out[i].sheets[0].byRow.get(row.row).values[col],row.values[col]);
 assert.equal(out[1].sheets[0].byRow.get(4).values.D,undefined);
});

test('alias grouping keeps name and quantity priority while customers and drawing versions remain separate',async()=>{
 const m=await multiBook('虚构优先物料.xlsx',[{name:'同客户多项目',rows:[head,['DD001','A.V1',5,'','装配-海天精工','甲'],['DD001','A.V1',5,'','海外-海天精工','乙'],['DD001','A.V2',7,'','海天精工','甲'],['DD001','A.V1',20,'','海天塑机','甲']]}]);
 const o=await multiBook('虚构优先订单.xlsx',[{name:'一厂',rows:[orderHead,['DD001','A.V1',5,'','其他前缀-海天精工','乙'],['DD001','A.V1',5,'','海天精工','甲']]}]);
 const {r}=await roundtrip(m,o,settings);assert.deepEqual(r.flows.map(f=>[f.orderRow,f.materialRow,f.quantity]),[[2,3,'5'],[3,2,'5']]);assert(r.flows.every(f=>f.rule==='DD号图号名称余量一致优先'));assert.equal(r.stats.newQuantity,'10');
});

test('a selected canonical customer includes prefixed source sheets even when the root-name sheet also exists',async()=>{
 const mh=['专案名称','图号','数量','喷粉','名称'],mm={dd:'A',code:'B',quantity:'C',mark:'D',name:'E'};
 const m=await multiBook('虚构分项目物料.xlsx',[{name:'海天精工',rows:[mh,['DD001','A',2,'','侧板']]},{name:'装配-海天精工',rows:[mh,['DD001','A',3,'','侧板']]},{name:'海外-海天精工',rows:[mh,['DD001','A',4,'','侧板']]},{name:'海外-海天塑机',rows:[mh,['DD001','A',99,'','侧板']]}]);
 const o=await multiBook('虚构单客户订单.xlsx',[{name:'一厂',rows:[orderHead,['DD001','A',10,'','售后-海天精工','侧板'],['DD001','A',10,'','海天塑机','侧板']]}]);
 const cfg={...settings,materialMap:mm,materialCustomer:'海天精工',selectedProjects:['海天精工'],customerSelection:true,materialSheetPaths:m.sheets.map(sh=>sh.path)};
 const {r,out}=await roundtrip(m,o,cfg);assert.equal(r.stats.newQuantity,'9');assert.equal(r.results[0].remaining,'1');assert.equal(r.results[1].deferred,true);assert.deepEqual(r.flows.map(f=>f.materialSheet),['海天精工','装配-海天精工','海外-海天精工']);assert.equal(out[0].sheets[3].xml,m.sheets[3].xml);
});

test('a customer column takes precedence over a prefixed sheet title and incomplete customer headers can infer confirmed aliases',async()=>{
 const m=await multiBook('虚构标题不替代客户.xlsx',[{name:'装配-海天精工',rows:[head,['DD001','A',3,'','海外-海天精工','侧板'],['DD001','A',99,'','公牛','侧板']]}]);
 const o=await multiBook('虚构别名空表头.xlsx',[{name:'一厂',rows:[['DD号','物料','数量','喷粉','','名称'],['DD001','A',4,'','春晓-海天精工','侧板'],['DD001','A',4,'原文保留','公牛','侧板']]}]);
 const cfg={...settings,orderMap:{...map,customer:''},customers:['海天精工'],selectedProjects:['海天精工'],customerSelection:true,materialSheetPaths:[m.sheets[0].path]};
 const {r,out}=await roundtrip(m,o,cfg);assert.equal(r.stats.newQuantity,'3');assert.equal(r.diagnostics.orderSheets[0].customerSource,'customer-values');assert.equal(r.results[1].deferred,true);assert.equal(out[0].sheets[0].byRow.get(3).values.D,undefined);assert.equal(out[1].sheets[0].byRow.get(3).values.D,'原文保留');
});

test('a stale manual selection cannot relabel another confirmed customer worksheet or consume its stock',async()=>{
 const m=await multiBook('虚构仅塑机物料.xlsx',[{name:'五分厂-海天塑机',rows:[['专案名称','图号','数量','喷粉'],['DD001','A',5,'']]}]);
 const o=await multiBook('虚构两客户订单.xlsx',[{name:'一厂',rows:[orderHead,['DD001','A',5,'','海天精工','侧板'],['DD001','A',5,'','海天塑机','侧板']]}]);
 const cfg={...settings,materialMap:{dd:'A',code:'B',quantity:'C',mark:'D'},materialCustomer:'海天精工',customerSelection:true,selectedProjects:['海天精工'],materialSheetPaths:[m.sheets[0].path]};
 const {r,out}=await roundtrip(m,o,cfg);assert.equal(r.stats.newQuantity,'0');assert(r.results.every(x=>x.deferred));assert.equal(out[0].sheets[0].xml,m.sheets[0].xml);assert.equal(out[1].sheets[0].xml,o.sheets[0].xml);
 const right=E.analyze(m,o,{...cfg,selectedProjects:['海天塑机']});assert.equal(right.stats.newQuantity,'5');assert.equal(right.results[0].added,'0');assert.equal(right.results[1].added,'5');
});
