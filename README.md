# 外协核销工作台

浏览器本地处理 XLSX，按客户＋DD号＋图号匹配，扣除历史后逐笔和跨行分配余量。支持部分核销、无此订单、待核实和两表同步导出。

仅含网页程序及虚构演示数据，不含实际订单或物料表。JSZip 依赖随程序提供并保留原许可证。

## GitHub Pages 发布

免费账户从公开仓库发布；私有仓库需要支持 Pages 的套餐。确认代码可以公开后，在 Settings → General → Danger Zone → Change repository visibility 设置 Public。

然后 Settings → Pages → Deploy from a branch → main → / (root) → Save。以该页面返回的网址为准。国内访问需要实测。

## 验证与本次修复

当前修复版本 `2026.11.07.3` 供用户试测，发布已获用户授权。合成数据回归及实际 Chromium 上传、核销、导出、重传流程通过；10月真实表未提供，尚未通过真实业务验收。

```sh
node --test tests/engine.test.js
# 本地安装 Playwright 和 Chromium 后可运行网页流程测试：
node --test tests/engine.test.js tests/browser.test.js
```

修复前后对比、逐笔坐标和剩余验收事项见 [审阅记录](REVIEW.md)。制造部门不限制厂内加工范围；客户必须一致，可选择或新增客户。纯数字错误历史按行保留跳过，不影响同键其他明确物料。测试目录仅使用虚构数据，真实文件不要提交到公开仓库。

客户列与喷粉消单列分开：客户列只读匹配，原喷粉消单列读取历史并追加本次实际核销。客户选择器禁用消单、数量等业务列；替换另一份文件不会重置已确认映射。原工作簿只改指定核销格，不新增客户列或重建原表。
