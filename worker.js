importScripts('vendor/jszip.min.js', 'catalog.js?v=20261109.4', 'engine.js?v=20261109.4');
const books = new Map(); let result = null;
self.onmessage = async ({ data }) => {
  const { id, action } = data;
  const send = (type, payload) => self.postMessage({ id, type, ...payload });
  try {
    if (action === 'load') { result = null; const wb = await ReconcileEngine.readWorkbook(data.bytes, data.name); wb.meta = ReconcileEngine.metadata(wb, data.process || '喷粉'); books.set(data.slot, wb); send('loaded', { slot: data.slot, meta: wb.meta }); }
    if (action === 'metadata') send('metadata', { slot: data.slot, meta: ReconcileEngine.metadata(books.get(data.slot), data.process) });
    if (action === 'analyze') { result = null; const next = ReconcileEngine.analyze(books.get(data.materialSlot), books.get(data.orderSlot), data.options); result = next; send('result', { stats: next.stats, results: next.results, config: next.config, diagnostics: next.diagnostics, version: ReconcileEngine.version }); }
    if (action === 'export') { if (!result) throw Error('请先完成核对。'); const files = await ReconcileEngine.exportResult(result, text => send('progress', { text })); self.postMessage({ id, type: 'exported', files }, files.map(f => f.bytes.buffer)); }
    if (action === 'clear') { books.clear(); result = null; send('cleared', {}); }
  } catch (error) { send('error', { message: error.message || '处理失败，请检查文件。' }); }
};
