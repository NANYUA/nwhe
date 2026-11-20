/**
 * 星驰 API · Quantumult X 登录状态抓取
 *
 * 用途：拦截星驰网站的登录/刷新响应，把 refresh_token 存进 QX 的持久化存储。
 * 配置（重写）：
 *   ^https:\/\/xingchiapi\.com\/api\/v1\/auth\/ url script-response-body xc-capture.js
 *
 * 放在「我的 iPhone → Quantumult X → Scripts」或「iCloud Drive → Quantumult X → Scripts」。
 * 本脚本只在命中星驰认证接口时运行，不改动响应内容。
 */

const PREFS_KEY = 'xc_refresh_token';

try {
    const json = JSON.parse($response.body);
    const data = json && json.data !== undefined ? json.data : json;
    if (data && typeof data.refresh_token === 'string' && data.refresh_token) {
        $prefs.setValueForKey(data.refresh_token, PREFS_KEY);
        // 只记录“已保存”，不要把令牌写进日志。
        console.log('xc: refresh token saved');
    }
} catch (e) {
    console.log('xc: capture skipped (' + e + ')');
}

// 不修改响应，原样放行。
$done({});
