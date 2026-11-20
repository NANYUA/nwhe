# xc · 星驰 API 自动签到

本目录只放 QX 脚本，不影响仓库里的书源文件。

## 文件

| 文件 | QX 类型 | 作用 |
|---|---|---|
| `xc-capture.js` | `[rewrite_local]` + `script-response-body` | 从登录/刷新响应中抓取 `refresh_token` |
| `xc-checkin.js` | `[task_local]` | 每天刷新令牌并签到 |

## 配置

把下面内容合并进 QX 配置文件；已有 `[rewrite_local]`、`[task_local]`、`[mitm]` 段落时只加行，不要重复段落。

```ini
[rewrite_local]
^https:\/\/xingchiapi\.com\/api\/v1\/auth\/ url script-response-body https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-capture.js

[task_local]
0 8 * * * https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-checkin.js, tag=星驰签到, enabled=true

[mitm]
hostname = %APPEND% xingchiapi.com
```

> `%APPEND%` 只适用于远程资源；如果你直接编辑本地主配置的 `hostname`，请把 `xingchiapi.com` 用逗号追加到原有列表末尾。

## 使用前提

1. QX 已开启 MitM，并安装、信任证书。
2. 在 Safari 中登录一次 `https://xingchiapi.com`，QX 日志出现 `xc: refresh token saved`。
3. 在 QX 任务里手动运行一次「星驰签到」确认结果。

## 说明

- 本站登录强制 Cloudflare Turnstile 人机验证，脚本无法代替账号密码登录，所以**不要**在脚本里填写账号密码。
- 登录状态保存在 QX 的 `$prefs`（键名 `xc_refresh_token`），脚本只访问 `https://xingchiapi.com`。
- refresh_token 等同于账户访问权限，请勿分享 QX 配置文件或截图。
- 每天只运行一次，避免触发风控；请先确认站点条款允许自动化签到。
