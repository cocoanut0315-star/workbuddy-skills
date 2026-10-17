# 安装网点添加助手

本文件供 WorkBuddy 执行。用户提供本仓库并要求安装，即授权安装此技能；首次站点授权仍由用户在网页亲自确认。

1. 读取本仓库 README 和待安装版本的 SKILL.md。使用本仓库最新正式 Release 的 `branch-official-import.zip` 与 `SHA256SUMS`；从 GitHub 无法下载时说明具体问题，不改用不明镜像。不要使用 `curl | sh`。
2. 用当前系统已有的下载/解压能力取得 ZIP，核对 SHA-256。解压后只应有 `branch-official-import/SKILL.md`、`branch-official-import/references/tools.md`、`branch-official-import/scripts/workspace.mjs`；拒绝绝对路径、`..` 路径和意外文件。
3. 识别当前 WorkBuddy 客户端及其个人技能目录。WorkBuddy AI 通常为用户目录下 `.workbuddy-ai/skills`，WorkBuddy 通常为 `.workbuddy/skills`。用户目录通过系统能力查询，不写死他人用户名；Windows 使用本机路径分隔符。两款同时存在时以当前运行的客户端为准，不把技能装到另一款中。
4. 把整个 `branch-official-import` 目录放入正确的个人技能目录。安装/更新仅处理这个目录，保留其他技能和 MCP 配置。已有文件如果有本地改动，先备份到技能目录外；不要把备份作为另一份技能装入。技能包内不应出现凭据文件。
5. 按 SKILL.md 自动寻找 Node.js 20+，使用完整路径运行 `scripts/workspace.mjs status`。不要求用户调整 PATH；没有可用运行时时说明具体缺项，并引导使用 WorkBuddy 官方安装/升级方式。
6. 已连接时运行 `call list_official_banks` 验证。未连接时运行 `login`，打开返回的授权链接，让用户登录自己的平台账号并亲自允许；完成后再查询支持的银行列表。不要读取或输出个人凭据文件，不把密码索要到聊天中。
7. 返回安装版本、连接是否已验证及支持范围。安装和只读验证不授权添加生产测试网点。若客户端未识别新技能，先开启新对话重新识别；仍不识别再提示重新打开客户端，不中断用户正在执行的任务。

连接信息保存在脚本管理的个人目录，更新技能时保留。卸载技能不会自动撤销连接；用户要求退出时先执行 `logout`，或由本人在工作台撤销。
