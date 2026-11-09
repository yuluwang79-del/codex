(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const C=root.WorkbenchCatalog,key='outsourced-workbench-parties-v1';let entries=C.empty();
 try{entries=C.restore(localStorage.getItem(key)||'{}');}catch{}
 function suppliers(){const o=state[1];return C.unique([...C.defaultSuppliers,...entries.suppliers,...(o?o.meta.sheets.filter(s=>!C.isFactory(s.name)&&!C.isAuxiliary(s.name)).map(s=>s.name):[])]);}
 function customers(){const m=state[0];return C.unique([...entries.customers,...state.filter(Boolean).flatMap(s=>[s.customer,...s.meta.sheets.flatMap(sh=>sh.customers||[])]),...(m?m.meta.sheets.filter(sh=>['dd','code','quantity'].every(k=>sh.material.map[k])&&!sh.material.map.customer).map(sh=>m.sheetConfigs?.[sh.path]?.customer||(sh.path===m.sheet&&m.customer)||sh.name):[])]);}
 function persist(){try{localStorage.setItem(key,JSON.stringify(entries));return true;}catch{return false;}}
 function render(){
  const options=state[1]?.meta.sheets.filter(s=>!C.isFactory(s.name)&&!C.isAuxiliary(s.name))||[];
  $('supplier-sheet').innerHTML='<option value="">上传后绑定工作表（可稍后选择）</option>'+options.map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
  $('supplier-catalog').innerHTML='<table><thead><tr><th>供应商名称</th><th>对应订单工作表</th><th></th></tr></thead><tbody>'+suppliers().map(name=>{const match=entries.supplierSheets[name]||options.find(s=>C.norm(s.name)===C.norm(name))?.name||'';return `<tr><td>${esc(name)}</td><td><select data-supplier-binding="${esc(name)}"><option value="">未绑定</option>${options.map(s=>`<option value="${esc(s.name)}" ${s.name===match?'selected':''}>${esc(s.name)}</option>`).join('')}</select></td><td>${entries.suppliers.includes(name)?`<button class="button secondary small" data-remove-supplier="${esc(name)}">移除选项</button>`:'已从工作表或历史名单识别'}</td></tr>`}).join('')+'</tbody></table>';
  $('customer-catalog').innerHTML=customers().map(name=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:5px"><span>${esc(name)}</span><button class="button secondary small" data-use-customer="${esc(name)}">只选此项目</button></div>`).join('')||'<p>上传厂内表后列出项目候选，也可在上方新增项目。</p>';
  const names=C.unique([...customers(),...selectedProjects]);
  $('project-picker').innerHTML='<p>已勾选 '+selectedProjects.length+' 个项目；勾选后一起核对。未勾选时按当前表内资料识别。</p>'+names.map(name=>`<label class="check project-option"><input type="checkbox" data-project-name="${esc(name)}" ${selectedProjects.some(n=>C.norm(n)===C.norm(name))?'checked':''} ${busy?'disabled':''}><span>${esc(name)}</span></label>`).join('');
  $('customers').innerHTML=customers().map(name=>`<option value="${esc(name)}"></option>`).join('');
 }
 $('project-picker').addEventListener('change',e=>{const name=e.target.dataset.projectName;if(!name||busy)return;const next=selectedProjects.filter(n=>C.norm(n)!==C.norm(name));if(e.target.checked)next.push(name);selectProjects(next);});
 $('clear-projects').addEventListener('click',()=>{if(!busy)selectProjects([])});
 $('save-projects').addEventListener('click',()=>{if(busy)return;try{if(!selectedProjects.length)throw Error('请先勾选要保存的项目。');let added=0;for(const name of selectedProjects)if(!entries.customers.some(n=>C.norm(n)===C.norm(name))){C.add(entries,'customers',name);added++;}const saved=persist();renderFiles();notify('已将 '+added+' 个项目添加到常用名单。'+(saved?'名单保存在当前浏览器。':'名单本次会话有效。'));}catch(error){notify(error.message,true);}});
 $('supplier-form').addEventListener('submit',e=>{e.preventDefault();if(busy)return;try{const name=C.add(entries,'suppliers',$('supplier-name').value);if($('supplier-sheet').value)entries.supplierSheets[name]=$('supplier-sheet').value;const saved=persist();$('supplier-name').value='';invalidate();renderFiles();notify('已添加供应商“'+name+'”。'+(saved?'新增选项保存在当前浏览器，原Excel不变。':'浏览器无法保存，选项暂用于本次会话。'));}catch(error){notify(error.message,true);}});
 $('customer-form').addEventListener('submit',e=>{e.preventDefault();if(busy)return;try{const name=C.add(entries,'customers',$('customer-name').value);const saved=persist();$('customer-name').value='';$('customer-add').open=false;invalidate();renderFiles();notify('已添加项目“'+name+'”。'+(saved?'新增选项保存在当前浏览器，原Excel不变。':'浏览器无法保存，选项暂用于本次会话。'));}catch(error){notify(error.message,true);}});
 $('party-settings').addEventListener('click',e=>{if(busy)return;const use=e.target.closest('[data-use-customer]');if(use){selectCustomer(use.dataset.useCustomer);return;}const remove=e.target.closest('[data-remove-supplier]');if(remove){entries.suppliers=entries.suppliers.filter(n=>n!==remove.dataset.removeSupplier);delete entries.supplierSheets[remove.dataset.removeSupplier];persist();invalidate();renderFiles();}});
 $('party-settings').addEventListener('change',e=>{const name=e.target.dataset.supplierBinding;if(!name||busy)return;entries.supplierSheets[name]=e.target.value;persist();invalidate();});
 root.Parties={render,suppliers,customers};
})(window);
