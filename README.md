# 外协核销工作台

浏览器本地处理 XLSX，按 DD号＋图号匹配，扣除历史后逐笔和跨行分配余量。支持部分核销、无此订单、待核实和两表同步导出。

仅含网页程序及虚构演示数据，不含实际订单或物料表。JSZip 依赖随程序提供并保留原许可证。

## GitHub Pages 发布

免费账户从公开仓库发布；私有仓库需要支持 Pages 的套餐。确认代码可以公开后，在 Settings → General → Danger Zone → Change repository visibility 设置 Public。

然后 Settings → Pages → Deploy from a branch → main → / (root) → Save。以该页面返回的网址为准。国内访问需要实测。

## 验证

迁移前五厂738条订单结果与已交付工作簿逐项一致：720条全额、2条部分、10条无此订单、6条待核实，共4061件。分配、标注和导出工作簿部件一致，导出后再次核对新增量为零。
