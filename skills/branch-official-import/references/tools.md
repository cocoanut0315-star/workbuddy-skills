# 工具参数

所有调用由 `scripts/workspace.mjs call <name> --input <file>` 自动携带本人授权。没有参数时可省略文件。

| 工具 | JSON 参数 | 作用 |
|---|---|---|
| list_official_banks | `{}` | 官网入口与当前支持范围 |
| search_branches | `{"query":"石家庄","offset":0}` | 共用网点搜索，按 nextOffset 翻页 |
| read_official_page | `{"bankId":"boc","url":"官网HTTPS地址"}` | 官网表格与下一页线索 |
| prepare_branch_import | 见下 | 核实与生成 30 分钟有效预览，不立即入库 |
| commit_branch_import | `{"batchId":"预览返回的id"}` | 提交本人预览，可安全重试 |
| list_imports | `{"batchId":"id"}` 或 `{"mine":true,"offset":0}` | 批次详情或历史，mine=false 看团队 |
| undo_branch_import | `{"batchId":"id"}` | 撤销本人批次未被后续修改的新增项 |

预览输入：
```json
{
  "requestId":"此次任务稳定唯一编号，8至80字符",
  "bankId":"boc",
  "branches":[{
    "name":"官网完整营业网点名称",
    "address":"官网完整地址",
    "province":"河北省",
    "city":"石家庄",
    "district":"长安区",
    "sourceUrl":"https://www.bankofchina.com/官网具体列表页"
  }]
}
```
bankId 当前为 boc 或 spdb；每批 1–10 家，最多 3 个官网页面。示例不是真实网点，不得直接提交。
