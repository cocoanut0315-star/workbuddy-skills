# WorkBuddy 技能库

[![脚本兼容性测试](https://github.com/cocoanut0315-star/workbuddy-skills/actions/workflows/test.yml/badge.svg)](https://github.com/cocoanut0315-star/workbuddy-skills/actions/workflows/test.yml)

给 WorkBuddy 安装后使用的小工具。目前包含 **网点添加助手**：从银行官网查找营业网点、检查重复，并添加到团队共用的网点工作台，也能补齐已有网点的位置。

## 让 WorkBuddy 安装

把下面整段发给 WorkBuddy：

> 请从 https://github.com/cocoanut0315-star/workbuddy-skills 安装 branch-official-import（网点添加助手）。先读仓库 INSTALL.md，下载正式版本，检查文件并安装到当前 WorkBuddy 的个人技能目录，保留其他技能。安装后检查连接状态；如果尚未连接，打开网点工作台登录授权页，由我登录并点击“允许连接”。完成后读取支持的银行列表验证连接，不要添加测试网点。

首次使用需要先成为网点工作台成员。没有账号时，请管理员发送邀请，激活后用自己的账号登录。开源代码可供任何人查看，使用团队站点仍需本人账号授权。

安装一次后，直接说：

> 从中国银行官网查找石家庄市长安区的营业网点，添加到我们的网点工作台。已有的跳过，保留官网来源，最后告诉我新增和待核实的数量。

助手会核实官网资料、检查重复、给出清单，再按你的授权添加。它会保留来源和维护者；可以撤销本人尚未被后续修改的导入。你不用填写服务器地址、密钥或 MCP 配置。

也可以说：

> 把保定还没定位的网点补上。同一家网点的地址有冲突时按高德的来，保留官网原始资料，最后告诉我还有哪些没匹配上。

助手会先预览匹配结果，再按你的授权分批保存，并回读位置确认结果。

## 下载与更新

- [最新正式版及校验和](https://github.com/cocoanut0315-star/workbuddy-skills/releases/latest)
- [网点工作台](https://weizuo-poker-d7ghungs1b578ef96-1425410890.ap-shanghai.app.tcloudbase.com/map/)
- [安装步骤（供助手执行）](INSTALL.md)
- [技能说明](skills/branch-official-import/SKILL.md)

更新时让 WorkBuddy 重新从 Releases 安装。只替换该技能的文件；个人登录信息由脚本保存在用户目录，不随技能包分发，更新不需要复制或读取这些信息。

## 支持范围

| 项目 | 当前范围 |
| --- | --- |
| 银行 | 中国银行公开网点表格；浦发公开静态网点资料 |
| 尚不能自动核实 | 动态查询、验证码、PDF、缺少清楚名称和地址的资料 |
| 已有网点 | 导入时重复跳过；可按要求批量补齐待定位网点，保留已有坐标 |
| 地址冲突 | 同名同地区唯一网点，经用户选择后采用高德地址与坐标，保留官网原始资料 |
| 授权 | 本人登录后允许；90天有效，可在工作台撤销 |
| 可操作数据 | 公司共用网点和导入批次 |
| 私人数据 | 不读取个人拜访、行程、跟进或成员管理信息 |
| 客户端 | WorkBuddy AI 的 Mac 实际对话已验证；Windows 客户端尚未实机验证 |
| 脚本运行时 | Node.js 20及以上，优先复用 WorkBuddy 自带版本 |

当前脚本连接上方网点工作台。它不是任意站点的通用连接器；如需接入自建站点，需自行实现对应授权和网点接口。

## 开发验证

不安装额外依赖，运行：

```sh
node --test tests/cli.test.mjs
```

测试只启动本机模拟服务，使用临时账号和临时目录，不连接生产站点。[v1.0.0 的六组检查已全部通过](https://github.com/cocoanut0315-star/workbuddy-skills/actions/runs/39046637594)：Windows、macOS、Linux × Node 20/22，覆盖脚本测试与发布打包。通过仅代表脚本验证，不等同于各系统 WorkBuddy 客户端实测。

发布打包：

```sh
python3 scripts/package.py --output dist
```

只打包技能目录中的白名单文件，同时生成 SHA256SUMS。运行时不用 Python。

MIT 开源协议。Skill 文件结构参考 [WorkBuddy 官方文档](https://open.workbuddy.cn/docs/skill)。
