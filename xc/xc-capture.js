/**
 * xc · 星驰 API · Quantumult X 登录状态抓取（多账号）
 *
 * 用途：拦截星驰网站的登录响应，把 refresh_token 按账号存进 QX 的持久化存储。
 * 引用方式（[rewrite_remote]）：
 *   https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-rewrite.snippet
 *
 * 账号标识优先取登录响应里的 user.email / user.username / user.name / user.id。
 * 抓不到的 refresh 响应会被跳过，避免把某个账号的令牌写到别的账号上。
 *
 * 通知策略：
 *   - 首次登录某账号：通知“已添加账号”；
 *   - 同一账号重新登录：通知“已更新账号”；
 *   - 登录/刷新接口没有返回 refresh_token：通知失败原因。
 * 通知里不会包含令牌本身。
 */

const LIST_KEY = 'xc_accounts';
const LEGACY_KEY = 'xc_refresh_token';

function notify(title, subtitle, message) {
    try { $notify(title, subtitle, message); } catch (e) {}
}

function readAccounts() {
    const raw = $prefs.valueForKey(LIST_KEY);
    if (raw) {
        try {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
                return list.filter(function (item) {
                    return item && typeof item.token === 'string' && item.token;
                });
            }
        } catch (e) {}
    }
    const legacy = $prefs.valueForKey(LEGACY_KEY);
    return legacy ? [{ name: '默认账号', token: legacy }] : [];
}

function saveAccounts(list) {
    $prefs.setValueForKey(JSON.stringify(list), LIST_KEY);
    if (list.length === 1) {
        $prefs.setValueForKey(list[0].token, LEGACY_KEY);
    }
}

function accountName(data) {
    const user = (data && data.user) || {};
    return user.email || user.username || user.name ||
        (user.id !== undefined && user.id !== null ? '账号' + user.id : '');
}

try {
    const json = JSON.parse($response.body);
    const data = json && json.data !== undefined ? json.data : json;
    const token = data && data.refresh_token;
    const url = ($request && $request.url) || '';
    const isLogin = /\/auth\/(login|login\/2fa|oauth\/callback)(\?|$)/.test(url);
    const isRefresh = /\/auth\/refresh(\?|$)/.test(url);
    const isAuthCall = /\/auth\/(login|refresh|login\/2fa)(\?|$)/.test(url);

    if (typeof token === 'string' && token) {
        const list = readAccounts();
        if (isLogin) {
            let name = accountName(data);
            if (!name) name = list.length ? '账号' + (list.length + 1) : '默认账号';
            let target = null;
            for (let i = 0; i < list.length; i++) {
                if (list[i].name === name) { target = list[i]; break; }
            }
            if (target) {
                target.token = token;
                saveAccounts(list);
                notify('xc 抓取', '已更新账号', name + '（共 ' + list.length + ' 个）');
            } else {
                list.push({ name: name, token: token });
                saveAccounts(list);
                notify('xc 抓取', '已添加账号', name + '（共 ' + list.length + ' 个）');
            }
        } else if (isRefresh) {
            // 刷新响应没有账号信息，只有单账号时才能安全归属。
            if (list.length === 1) {
                list[0].token = token;
                saveAccounts(list);
            }
        } else if (list.length === 1) {
            list[0].token = token;
            saveAccounts(list);
        }
        console.log('xc: refresh token saved (' + readAccounts().length + ' accounts)');
    } else {
        console.log('xc: no refresh token in response');
        if (isAuthCall) {
            const reason = json && json.message
                ? String(json.message).slice(0, 100)
                : 'HTTP ' + (($response && $response.statusCode) || '?');
            notify('xc 抓取', '未获取到登录状态', reason);
        }
    }
} catch (e) {
    console.log('xc: capture skipped (' + e + ')');
    if ($response && $response.statusCode >= 400) {
        notify('xc 抓取', '登录响应异常', 'HTTP ' + $response.statusCode);
    }
}

// 不修改响应，原样放行。
$done({});
