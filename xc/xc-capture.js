/**
 * xc · 星驰 API · Quantumult X 登录状态抓取
 *
 * 用途：拦截星驰网站的登录/刷新响应，把 refresh_token 存进 QX 的持久化存储。
 * 引用方式（[rewrite_remote]）：
 *   https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-rewrite.snippet
 *
 * 通知策略：
 *   - 首次获取到登录状态：通知一次，确认抓取成功；
 *   - 之后令牌自动轮换：静默更新，避免每次刷新都弹通知；
 *   - 登录/刷新接口没有返回 refresh_token：通知失败原因。
 * 通知里不会包含令牌本身。
 */

const PREFS_KEY = 'xc_refresh_token';

function notify(title, subtitle, message) {
    try { $notify(title, subtitle, message); } catch (e) {}
}

try {
    const json = JSON.parse($response.body);
    const data = json && json.data !== undefined ? json.data : json;
    const token = data && data.refresh_token;
    const url = ($request && $request.url) || '';
    const isAuthCall = /\/auth\/(login|refresh|login\/2fa)(\?|$)/.test(url);

    if (typeof token === 'string' && token) {
        const previous = $prefs.valueForKey(PREFS_KEY);
        $prefs.setValueForKey(token, PREFS_KEY);
        console.log('xc: refresh token saved');
        if (!previous) {
            notify('xc 抓取', '登录状态已保存', '之后可自动签到，建议先手动运行一次「星驰签到」验证。');
        }
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
