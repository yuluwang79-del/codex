(function(root){
 'use strict';
 const factories=Object.freeze(['一厂','二厂','三厂','五厂','六厂','总厂']);
 const defaultSuppliers=Object.freeze(['达康','天跃','祺隆','众创']);
 const defaultCustomers=Object.freeze(['海天精工','海天塑机','赛尔富','公牛','乐仝','兴泰','埃利','荣特','君灵','东英吉利','蓓灵']);
 const norm=value=>String(value??'').replace(/\s+/g,'').toUpperCase();
 const unique=values=>[...new Map(values.filter(v=>typeof v==='string'&&v.trim()).map(v=>[norm(v),v.trim()])).values()];
 const customerName=value=>{const raw=String(value??'').trim(),key=norm(raw);return ['海天精工','海天塑机'].find(name=>key.endsWith(name))||raw;};
 const customerKey=value=>norm(customerName(value));
 const customerUnique=values=>unique(values.filter(v=>typeof v==='string').map(customerName));
 const customerForSheet=(name,fallback='')=>{const raw=String(name??'').trim();return defaultCustomers.some(n=>customerKey(n)===customerKey(raw))?raw:String(fallback||'').trim();};
 const isFactory=name=>factories.some(v=>norm(v)===norm(name));
 const isAuxiliary=name=>/汇总|统计|说明|封面|合计/.test(String(name));
 const sheetProducer=sheet=>{if(typeof sheet.producer==='string')return sheet.producer;return (sheet.rows||[]).slice(0,4).flatMap(row=>Object.values(row.values)).map(value=>String(value).trim().match(/^(?:供应商|供應商)[：:]\s*(.+)$/)?.[1]?.trim()).find(Boolean)||'';};
 const fileProducer=sheets=>{const names=unique(sheets.filter(s=>s.state!=='hidden'&&s.state!=='veryHidden').map(sheetProducer).filter(Boolean));return names.length===1?names[0]:names.length?null:'';};
 function producerName(value){const name=cleanName(value);if(isFactory(name)||isAuxiliary(name)||/[,，;；]/.test(name))throw Error('制作商名称不能是厂区、汇总页或含分隔符。');return name;}
 function orderSheetAllowed(sheet,producer,suppliers=[],fileOwner=''){if(isAuxiliary(sheet.name))return false;const own=sheetProducer(sheet),known=unique([...defaultSuppliers,...suppliers]),named=known.find(n=>norm(n)===norm(sheet.name)),declared=own||named||fileOwner;if(norm(producer)==='厂内')return isFactory(sheet.name)&&(!declared||norm(declared)==='厂内'||!known.some(n=>norm(n)===norm(declared)));if(own||named)return norm(own||named)===norm(producer);if(sheet.state==='hidden'||sheet.state==='veryHidden'||fileOwner===null)return false;return declared?norm(declared)===norm(producer):true;}
 function cleanName(value){const name=String(value??'').trim();if(!name||name.length>80||/[\x00-\x1f]/.test(name))throw Error('请填写1至80字的有效名称。');return name;}
 function empty(){return {suppliers:[],customers:[],supplierSheets:{}};}
 function restore(text){try{const raw=JSON.parse(text),out=empty();out.suppliers=unique((raw.suppliers||[]).filter(v=>typeof v==='string'&&v.length<=80&&!isFactory(v)&&norm(v)!=='厂内'));out.customers=customerUnique((raw.customers||[]).filter(v=>typeof v==='string'&&v.length<=80));if(raw.supplierSheets&&typeof raw.supplierSheets==='object')for(const [name,sheet] of Object.entries(raw.supplierSheets))if(typeof sheet==='string'&&sheet.length<=80)out.supplierSheets[name]=sheet;return out;}catch{return empty();}}
 function add(catalog,kind,value){const raw=cleanName(value),name=kind==='customers'?customerName(raw):raw;if(!['suppliers','customers'].includes(kind))throw Error('选项类别无效。');if(kind==='suppliers'&&(isFactory(name)||norm(name)==='厂内'||isAuxiliary(name)))throw Error('厂区和“厂内”不是供应商，请填写供应商名称。');if(kind==='suppliers')producerName(name);const key=kind==='customers'?customerKey:norm;if(catalog[kind].some(v=>key(v)===key(name)))throw Error('该名称已经添加。');catalog[kind].push(name);return name;}
 const api={factories,defaultSuppliers,defaultCustomers,norm,unique,customerName,customerKey,customerUnique,customerForSheet,isFactory,isAuxiliary,sheetProducer,fileProducer,producerName,orderSheetAllowed,empty,restore,add};root.WorkbenchCatalog=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:self);
