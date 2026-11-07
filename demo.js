window.makeExample = async function () {
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  async function book(name, rows) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="核销示例" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    const content=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>typeof v==='number'?'<c r="'+String.fromCharCode(65+j)+(i+1)+'"><v>'+v+'</v></c>':'<c r="'+String.fromCharCode(65+j)+(i+1)+'" t="inlineStr"><is><t>'+esc(v)+'</t></is></c>').join('')+'</row>').join('');
    zip.file('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+content+'</sheetData></worksheet>');
    return new File([await zip.generateAsync({type:'uint8array'})],name);
  }
  return [await book('示例_厂内物料.xlsx',[
    ['专案名称','图号','名称','订单数量','喷粉','客户'],
    ['DD26001','A-101','侧板',4,'','示例客户'],['DD26001','A-101','侧板',6,'','示例客户'],
    ['DD26002','B-201','门板',10,'8月厂内1','示例客户'],['DD26002','B-201','门板',6,'','示例客户'],
    ['DD26003','C-301','支架',1,'','示例客户'],['DD26004','D-401','底板',50,'8月厂内48','示例客户'],
    ['DD26005','E-501','面板',10,'待确认','示例客户']]),
    await book('示例_9月订单.xlsx',[
    ['DD号','物料','名称','数量','喷粉','客户'],
    ['DD26001','A-101','侧板组件',5,'','示例客户'],['DD26002','B-201','门板',16,'','示例客户'],
    ['DD26003','C-301','支架',1,'','示例客户'],['DD26003','C-301','支架',1,'','示例客户'],
    ['DD26004','D-401','底板',4,'','示例客户'],['DD26005','E-501','面板',5,'','示例客户'],
    ['DD26006','F-601','新零件',2,'','示例客户']])];
};
