# xc · 星驰 API 自动签到

本目录只放 QX 脚本，不影响仓库里的书源文件。

## 文件

| 文件 | 类型 | 作用 |
|---|---|---|
| `xc-capture.js` | JS | 从登录/刷新响应中抓取 `refresh_token` |
| `xc-checkin.js` | JS | 每天刷新令牌并签到 |
| `xc-rewrite.snippet` | QX 重写规则资源 | 包含 MITM 主机名和抓取规则 |

## 方式 A：`[rewrite_remote]`（推荐，本地不写重写规则）

```ini
[rewrite_remote]
https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-rewrite.snippet, tag=星驰抓取, enabled=true

[task_local]
0 8 * * * https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-checkin.js, tag=星驰签到, enabled=true
```

`xc-rewrite.snippet` 的内容是：

```ini
hostname = xingchiapi.com
^https:\/\/xingchiapi\.com\/api\/v1\/auth\/ url script-response-body https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-capture.js
```

QX 拉取该资源后会合并 hostname 和重写规则，本地配置里不需要再写 `[rewrite_local]` 或改 `[mitm]`。

> 注意：`[rewrite_remote]` 只接受**规则资源**，不能直接填 `.js` 文件；JS 是在片段里用 URL 引用的。

## 方式 B：本地 `[rewrite_local]`

```ini
[rewrite_local]
^https:\/\/xingchiapi\.com\/api\/v1\/auth\/ url script-response-body https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-capture.js

[task_local]
0 8 * * * https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-checkin.js, tag=星驰签到, enabled=true
```

并在原有 `hostname` 末尾用逗号追加 `xingchiapi.com`。

## 使用前提

1. QX 已开启 MitM，并安装、信任证书（`[rewrite_remote]` 里的 hostname 只负责匹配，证书仍要信任）。
2. 在 Safari 中登录一次 `https://xingchiapi.com`，QX 日志出现 `xc: refresh token saved`。
3. 在 QX 任务里手动运行一次「星驰签到」确认结果。

## 说明

- 本站登录强制 Cloudflare Turnstile 人机验证，脚本无法代替账号密码登录，所以**不要**在脚本里填写账号密码。
- 登录状态保存在 QX 的 `$prefs`（键名 `xc_refresh_token`），脚本只访问 `https://xingchiapi.com`。
- refresh_token 等同于账户访问权限，请勿分享 QX 配置文件或截图。
- 每天只运行一次，避免触发风控；请先确认站点条款允许自动化签到。
