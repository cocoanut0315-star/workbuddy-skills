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
| locate_branches | `{"branchIds":["已有网点id"],"apply":false,"preferMapAddress":false}` | 预览补定位；明确授权后 apply=true，最多10家；用户选择地址按高德时 preferMapAddress=true |
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

`prepare_branch_import` 也支持可选 `preferMapAddress:true`。仅在用户明确选择地址冲突按高德时使用，官网原始地址始终保留。

`locate_branches` 的 `matched` 表示预览可定位，`located` 才表示已写入；`pending` 看 reason/message，`skipped` 看已有位置/网点变更等原因。该工具只补指定的未定位网点，不能覆盖已有坐标，不接受调用方自行提供坐标。保存后用 search_branches 回读确认，不将 list_imports 中历史导入快照当作当前坐标。
