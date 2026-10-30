# Checkin

GitHub Actions 实现 [GLaDOS][glados] 自动签到

([GLaDOS][glados] 可用邀请码: `MW4DK-O0RSF-C7AOU-EN1MP`, 双方都有奖励天数)

## 使用说明

1. Fork 这个仓库

1. 登录 [GLaDOS][glados] 获取 Cookie

1. 添加 Cookie 到 Secret `GLADOS`

1. 启用 Actions, 每天北京时间 08:00 自动签到（GitHub 调度可能延迟）

1. 如需推送通知, 可用 [PushPlus][pushplus], 添加 Token 到 Secret `NOTIFY`

## 查看签到结果

在 Actions 中打开运行记录，查看 Summary 或 `npm run main` 步骤的日志。即使未配置 `NOTIFY`，也会显示签到结果和剩余天数。接口拒绝签到、Cookie 缺失或失效、网络异常都会使运行失败。

如果日志提示需要登录，请重新登录 GLaDOS，将浏览器请求头中的完整 Cookie 更新到仓库 Settings → Secrets and variables → Actions → `GLADOS`，然后手动运行。不要把 Cookie 写入代码或运行日志。

[glados]: https://github.com/glados-network/GLaDOS
[pushplus]: https://www.pushplus.plus/
