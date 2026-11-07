// Run with a locally installed Playwright and Chromium. All files are synthetic.
const {test}=require('node:test');const assert=require('node:assert/strict');
const http=require('node:http');const fs=require('node:fs/promises');const path=require('node:path');
const {chromium}=require('playwright');const {pair,book,multiBook}=require('./fixtures');
test('browser upload → allocation detail → two XLSX downloads → reupload; customer selection, numeric history safety and ambiguous header',async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({acceptDownloads:true});const errors=[];const network=[];page.on('request',r=>network.push(new URL(r.url()).hostname));page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#month').selectOption('10');
 const books=await pair([['DD001','001-A.V2',4,'','一厂'],['DD001','001-A.V2',6,'','一厂']],[['DD001','001-A.V2',5,'']]);
 async function upload(slot,wb,{fixedCustomer=true}={}){await page.locator(`[data-upload="${slot}"]`).setInputFiles({name:wb.name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(wb.bytes)});await page.waitForFunction(()=>!document.querySelector('#demo').disabled);const fixed=page.locator(`[data-customer="${slot}"]`);if(fixedCustomer&&await fixed.count()){await fixed.fill('测试客户');await fixed.dispatchEvent('change');}}
 await upload(0,books[0]);await upload(1,books[1]);await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);
 assert.match(await page.locator('#metrics').innerText(),/本次核完/);await page.locator('tr[data-row="2"]').click();
 const detail=await page.locator('#detail-content').innerText();assert.match(detail,/第 2 行 → 订单第 2 行.*4 件/);assert.match(detail,/第 3 行 → 订单第 2 行.*1 件/);assert.match(detail,/测试表!D3/);
 await page.locator('[data-close="detail"]').click();await page.locator('#export').click();await page.waitForFunction(()=>!document.querySelector('#download-box').hidden);
 const exported=[];
 for(const prefix of ['厂内物料总表','月度订单']){const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:prefix+' ↓',exact:true}).click();const download=await downloadPromise;exported.push({name:download.suggestedFilename(),bytes:new Uint8Array(await fs.readFile(await download.path()))});}
 await upload(0,exported[0]);await upload(1,exported[1]);await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);assert.match(await page.locator('#message').innerText(),/厂内 0 个标注格、订单 0 个标注格/);
 // Different manufacturing departments are all in-house; customer attribution is required.
 const alias=await pair([['DD001','001-A.V2',5,'','制造一部']],[['DD001','001-A.V2',5,'']]);
 await upload(0,alias[0]);await upload(1,alias[1]);await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);
 assert.equal(await page.locator('#export').isEnabled(),true);assert.match(await page.locator('#message').innerText(),/厂内 1 个标注格、订单 1 个标注格/);
 await page.locator('[data-customer="1"]').fill('其他客户');await page.locator('[data-customer="1"]').dispatchEvent('change');await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);
 await page.locator('tr[data-row="2"]').click();assert.match(await page.locator('#detail-content').innerText(),/其他客户|客户不|客户“测试客户”/);assert.match(await page.locator('#detail-content').innerText(),/本条无新增分配/);await page.locator('[data-close="detail"]').click();
 await page.locator('[data-customer="1"]').fill('测试客户');await page.locator('[data-customer="1"]').dispatchEvent('change');
 await page.locator('#customer-scope').fill('新增客户');await page.locator('#customer-scope').dispatchEvent('change');await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);await page.locator('tr[data-row="2"]').click();assert.match(await page.locator('#detail-content').innerText(),/不在本次选定客户“新增客户”范围/);await page.locator('[data-close="detail"]').click();
 await page.locator('#customer-scope').fill('');await page.locator('#customer-scope').dispatchEvent('change');
 const ambiguous=await book('候选订单.xlsx',[['DD号','物料','数量','喷粉核销','喷粉消单'],['DD001','001-A.V2',5,'','']]);await upload(1,ambiguous);assert.equal(await page.locator('[data-map="1:mark"]').inputValue(),'');assert.match(await page.locator('#uploads').innerText(),/D：喷粉核销；E：喷粉消单/);
 await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#demo').disabled);assert.match(await page.locator('#message').innerText(),/缺少字段.*核销标注列/);assert.equal(await page.locator('#results').isHidden(),true);
 const original=await book('虚构原始厂内表.xlsx',[['制造部门','专案名称','图号','物料名称','规格','所属客户名称','订单数量','日期','喷粉消单'],['一厂','DD001','A-01','侧板','X','甲',10,'2026-10-01','8月厂内1']]);
 const demand=await book('虚构需求表.xlsx',[['客户全称','DD号','物料号','数量','10月喷粉核销'],['甲','DD001','A-01',9,'']]);
 await upload(0,original);await upload(1,demand);assert.equal(await page.locator('[data-map="0:customer"]').inputValue(),'F');assert.equal(await page.locator('[data-map="0:mark"]').inputValue(),'I');assert.equal(await page.locator('[data-map="0:customer"] option[value="I"]').evaluate(el=>el.disabled),true);
 await page.locator('article.file-card').first().locator('summary').click();
 await page.locator('[data-map="0:customer"]').selectOption('');assert.equal(await page.locator('[data-customer="0"]').count(),1);await page.locator('[data-map="0:customer"]').selectOption('F');assert.equal(await page.locator('[data-customer="0"]').count(),0);
 await page.locator('article.file-card').first().locator('summary').click();await page.locator('[data-map="0:name"]').selectOption('');
 // Replacing the right file must not reset the left file's user-confirmed mapping.
 await upload(1,demand);assert.equal(await page.locator('[data-map="0:name"]').inputValue(),'');assert.equal(await page.locator('[data-map="0:mark"]').inputValue(),'I');assert.equal(await page.locator('[data-map="0:customer"]').inputValue(),'F');await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);assert.match(await page.locator('#message').innerText(),/厂内 1 个标注格、订单 1 个标注格/);
 // Confirmed layout: no material customer column; sheet name matches the order's 厂区 customer.
 const sheetCustomer=await book('虚构分客户厂内.xlsx',[['制造部门','专案名称','图号','物料名称','','','订单数量','','喷粉消单'],['一厂','DD001','A-01','侧板','','',10,'','8月厂内1']]);
 sheetCustomer.zip.file('xl/workbook.xml',(await sheetCustomer.zip.file('xl/workbook.xml').async('string')).replace('name="测试表"','name="虚构客户甲"'));sheetCustomer.zip.file('xl/workbook.xml',(await sheetCustomer.zip.file('xl/workbook.xml').async('string')).replace('</sheets>','<sheet name="虚构客户乙" sheetId="2" r:id="rId2"/></sheets>'));
 sheetCustomer.zip.file('xl/_rels/workbook.xml.rels',(await sheetCustomer.zip.file('xl/_rels/workbook.xml.rels').async('string')).replace('</Relationships>','<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'));sheetCustomer.zip.file('xl/worksheets/sheet2.xml',await sheetCustomer.zip.file('xl/worksheets/sheet1.xml').async('string'));sheetCustomer.bytes=await sheetCustomer.zip.generateAsync({type:'uint8array'});
 const factoryDemand=await book('虚构按客户月度订单.xlsx',[['序号','外发日期','厂区','DD号','物料','名称','颜色','数量','单价','总额','已对数量'],[1,'10月1日','虚构客户甲','DD001','A-01','侧板','白',9,10,90,'']]);
 await upload(0,sheetCustomer,{fixedCustomer:false});await upload(1,factoryDemand,{fixedCustomer:false});
 assert.equal(await page.locator('#customer-match').isHidden(),true);
 assert.equal(await page.locator('[data-customer="0"]').inputValue(),'虚构客户甲');assert.equal(await page.locator('[data-map="1:customer"]').inputValue(),'C');assert.equal(await page.locator('[data-map="1:mark"]').inputValue(),'K');assert.equal(await page.locator('#customer-scope').inputValue(),'虚构客户甲');
 await page.locator('[data-sheet="0"]').selectOption('xl/worksheets/sheet2.xml');assert.equal(await page.locator('[data-customer="0"]').inputValue(),'');await page.locator('[data-sheet="0"]').selectOption('xl/worksheets/sheet1.xml');assert.equal(await page.locator('[data-customer="0"]').inputValue(),'虚构客户甲');
 await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);assert.match(await page.locator('#message').innerText(),/厂内 1 个标注格、订单 1 个标注格/);await page.locator('#export').click();await page.waitForFunction(()=>!document.querySelector('#download-box').hidden);
 await page.locator('[data-customer="0"]').fill('');await page.locator('[data-customer="0"]').dispatchEvent('change');await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);assert.equal(await page.locator('[data-customer="0"]').inputValue(),'虚构客户甲');assert.match(await page.locator('#message').innerText(),/厂内 1 个标注格、订单 1 个标注格/);
 // All factory tabs participate; row 2 in each factory remains independently inspectable.
 const multiStock=await book('虚构各厂共用物料.xlsx',[['专案名称','图号','数量','喷粉','客户'],['DD001','A',4,'','虚构客户甲'],['DD001','A',6,'','虚构客户甲']]);
 const multiOrders=await multiBook('虚构多厂月度.xlsx',[{name:'一厂',rows:[['DD号','物料','数量','喷粉','客户'],['DD001','A',6,'','虚构客户甲']]},{name:'二厂',rows:[['DD号','物料','数量','喷粉','客户'],['DD001','A',6,'','虚构客户甲']]},{name:'三厂',rows:[['DD号','物料','数量','喷粉','客户'],['DD001','A',1,'','其他客户']]}]);
 await upload(0,multiStock);await upload(1,multiOrders);assert.equal(await page.locator('#all-order-sheets').isChecked(),true);await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);
 const sheetSummary=await page.locator('#sheet-summary').innerText();assert.match(sheetSummary,/3 个订单工作表/);assert.match(sheetSummary,/二厂：1 条订单，本次 4 件/);assert.match(sheetSummary,/三厂：1 条订单，本次 0 件/);
 await page.locator('tr[data-record="xl/worksheets/sheet2.xml!2"]').click();assert.match(await page.locator('#detail-content').innerText(),/二厂.*第 2 行/);assert.match(await page.locator('#detail-content').innerText(),/二厂!D2/);assert.match(await page.locator('#detail-content').innerText(),/4 件/);await page.locator('[data-close="detail"]').click();
 await page.locator('#export').click();await page.waitForFunction(()=>!document.querySelector('#download-box').hidden);const multiFiles=[];
 for(const prefix of ['厂内物料总表','月度订单']){const next=page.waitForEvent('download');await page.getByRole('link',{name:prefix+' ↓',exact:true}).click();const d=await next;multiFiles.push({name:d.suggestedFilename(),bytes:new Uint8Array(await fs.readFile(await d.path()))});}
 await upload(0,multiFiles[0]);await upload(1,multiFiles[1]);await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);assert.match(await page.locator('#message').innerText(),/厂内 0 个标注格、订单 0 个标注格/);assert.match(await page.locator('#sheet-summary').innerText(),/3 个订单工作表/);
 await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelector('#uploads').textContent.includes('示例_9月订单.xlsx')&&!document.querySelector('#demo').disabled);await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);assert.match(await page.locator('#scope-diagnostics').textContent(),/示例客户/);assert.match(await page.locator('#tbody').innerText(),/客户：示例客户/);assert.equal(await page.locator('#customers option[value="示例客户"]').count(),1);assert.equal(await page.locator('#export').isEnabled(),true);
 assert.deepEqual(errors,[]);assert(network.every(host=>host==='127.0.0.1'));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
