// Synthetic data only. Never place customer workbooks in this directory.
const JSZip = require('../vendor/jszip.min.js');
const E = require('../engine.js');
global.JSZip = JSZip;
const options = {materialCustomer:'测试客户',orderCustomer:'测试客户',month:10,process:'喷粉',factory:'一厂',materialSheet:'xl/worksheets/sheet1.xml',orderSheet:'xl/worksheets/sheet1.xml',materialHeader:1,orderHeader:1,materialMap:{dd:'A',code:'B',quantity:'C',mark:'D',factory:'E'},orderMap:{dd:'A',code:'B',quantity:'C',mark:'D'}};
const escape = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;');
async function book(name, rows, extra='') {
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
 zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="测试表" sheetId="1" r:id="rId1"/></sheets></workbook>');
 zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
 zip.file('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows.map((r,i)=>'<row r="'+(i+1)+'" hidden="'+(i===2?1:0)+'">'+r.map((v,j)=>`<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr"><is><t>${escape(v)}</t></is></c>`).join('')+'</row>').join('')+'</sheetData><autoFilter ref="A1:E20"/>'+extra+'</worksheet>');
 zip.file('customXml/item1.xml','<preserve>unchanged</preserve>');
 return E.readWorkbook(await zip.generateAsync({type:'uint8array'}),name);
}
async function pair(mats,orders) {return [await book('合成物料.xlsx',[['专案名称','图号','数量','喷粉','厂区'],...mats]), await book('合成订单.xlsx',[['DD号','物料','数量','喷粉'],...orders])];}
module.exports={E,JSZip,options,book,pair};

async function multiBook(name, sheets) {
 const wb=await book(name,sheets[0].rows),zip=wb.zip;
 const entries=[];const rels=[];let types=await zip.file('[Content_Types].xml').async('string');
 for(let i=0;i<sheets.length;i++) {
  const n=i+1,s=sheets[i],part='xl/worksheets/sheet'+n+'.xml';
  const source=i===0?wb:await book('part.xlsx',s.rows);
  zip.file(part,await source.zip.file('xl/worksheets/sheet1.xml').async('string'));
  entries.push('<sheet name="'+escape(s.name)+'" sheetId="'+n+'" r:id="rId'+n+'"'+(s.state?' state="'+s.state+'"':'')+'/>');
  rels.push('<Relationship Id="rId'+n+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+n+'.xml"/>');
  if(i)types=types.replace('</Types>','<Override PartName="/'+part+'" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
 }
 zip.file('[Content_Types].xml',types);
 zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+entries.join('')+'</sheets></workbook>');
 zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels.join('')+'</Relationships>');
 return E.readWorkbook(await zip.generateAsync({type:'uint8array'}),name);
}
module.exports.multiBook=multiBook;
