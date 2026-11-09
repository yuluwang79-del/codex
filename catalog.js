(function(root){
 'use strict';
 const factories=Object.freeze(['一厂','二厂','三厂','五厂','六厂','总厂']);
 const defaultSuppliers=Object.freeze(['达康','天跃','祺隆','众创']);
 const norm=value=>String(value??'').replace(/\s+/g,'').toUpperCase();
 const unique=values=>[...new Map(values.filter(v=>typeof v==='string'&&v.trim()).map(v=>[norm(v),v.trim()])).values()];
 const isFactory=name=>factories.some(v=>norm(v)===norm(name));
 const isAuxiliary=name=>/汇总|统计|说明|封面|合计/.test(String(name));
 function cleanName(value){const name=String(value??'').trim();if(!name||name.length>80||/[\x00-\x1f]/.test(name))throw Error('请填写1至80字的有效名称。');return name;}
 function empty(){return {suppliers:[],customers:[],supplierSheets:{}};}
 function restore(text){try{const raw=JSON.parse(text),out=empty();out.suppliers=unique((raw.suppliers||[]).filter(v=>typeof v==='string'&&v.length<=80&&!isFactory(v)&&norm(v)!=='厂内'));out.customers=unique((raw.customers||[]).filter(v=>typeof v==='string'&&v.length<=80));if(raw.supplierSheets&&typeof raw.supplierSheets==='object')for(const [name,sheet] of Object.entries(raw.supplierSheets))if(typeof sheet==='string'&&sheet.length<=80)out.supplierSheets[name]=sheet;return out;}catch{return empty();}}
 function add(catalog,kind,value){const name=cleanName(value);if(!['suppliers','customers'].includes(kind))throw Error('选项类别无效。');if(kind==='suppliers'&&(isFactory(name)||norm(name)==='厂内'||isAuxiliary(name)))throw Error('厂区和“厂内”不是供应商，请填写供应商名称。');if(catalog[kind].some(v=>norm(v)===norm(name)))throw Error('该名称已经添加。');catalog[kind].push(name);return name;}
 const api={factories,defaultSuppliers,norm,unique,isFactory,isAuxiliary,empty,restore,add};root.WorkbenchCatalog=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:self);
