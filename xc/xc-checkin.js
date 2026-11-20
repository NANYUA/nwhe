/**
 * 星驰 API · Quantumult X 每日自动签到
 *
 * 配置（定时任务）：
 *   0 8 * * * xc-checkin.js, tag=星驰签到, enabled=true
 *
 * 前置条件：
 *   1. 已添加 xc-capture.js 的重写规则，并在 Safari 登录过一次网站；
 *   2. QX 已开启 MitM 并安装、信任证书；
 *   3. 本文件放在 QX 的 Scripts 目录。
 *
 * 说明：本站登录必须通过 Cloudflare Turnstile 人机验证，
 * 所以脚本不能代替账号密码登录；这里用的是登录后保存的 refresh_token。
 * 请勿把账号密码写进脚本，也不需要。
 */

const SITE = 'https://xingchiapi.com';
const PREFS_KEY = 'xingchi_refresh_token';
// 可选：如果抓取失败，可手动把浏览器的 refresh_token 粘到这里（不建议分享此文件）。
const MANUAL_TOKEN = '';

let finished = false;
function finish(title, subtitle, message) {
    if (finished) return;
    finished = true;
    $notify(title, subtitle, message);
    console.log('xingchi checkin: ' + title + ' | ' + subtitle + ' | ' + message);
    $done();
}

// 整体超时保护，避免任务卡住。
setTimeout(function () {
    finish('星驰签到', '超时', '请求超时，请稍后在 QX 中手动运行一次。');
}, 30000);

function request(options) {
    return $task.fetch(options).then(function (response) {
        return { status: response.statusCode, text: response.body || '' };
    }, function (reason) {
        throw new Error('网络错误：' + (reason && reason.error ? reason.error : '请求失败'));
    });
}

function parse(response) {
    try { return JSON.parse(response.text); } catch (e) { return null; }
}

function payloadOf(json) {
    return json && json.data !== undefined ? json.data : json;
}

function detectCheckedIn(data) {
    if (!data || typeof data !== 'object') return null;
    const names = ['checked_in', 'checked_in_today', 'is_checked_in', 'today_checked_in',
        'has_checked_in', 'signed_in', 'signed_in_today', 'already_checked_in'];
    for (const key in data) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
        const name = key.toLowerCase();
        const value = data[key];
        if (names.indexOf(name) >= 0 &&
            (typeof value === 'boolean' || value === 1 || value === 0 || value === 'true' || value === 'false')) {
            return value === true || value === 1 || value === 'true';
        }
    }
    return null;
}

function summarize(data) {
    if (!data || typeof data !== 'object') return '';
    const keys = ['message', 'reward', 'award', 'quota', 'amount', 'credits', 'points', 'streak', 'consecutive_days', 'days'];
    const parts = [];
    for (const key of keys) {
        const value = data[key];
        if (value === null || value === undefined || value === '' || typeof value === 'object') continue;
        parts.push(key === 'message' ? String(value).slice(0, 80) : key + ' ' + value);
        if (parts.length >= 3) break;
    }
    if (!parts.length) {
        const brief = JSON.stringify(data);
        if (brief && brief !== '{}') parts.push(brief.slice(0, 140));
    }
    return parts.length ? '：' + parts.join(' · ') : '';
}

function notifyError(err) {
    const message = err && err.message ? err.message : '未知错误';
    if (message === 'REFRESH_INVALID') {
        $prefs.removeValueForKey(PREFS_KEY);
        finish('星驰签到', '登录已过期', '请重新登录星驰网站一次，QX 会自动抓取新的登录状态。');
        return;
    }
    finish('星驰签到', '失败', message);
}

const refreshToken = MANUAL_TOKEN || $prefs.valueForKey(PREFS_KEY);
if (!refreshToken) {
    finish('星驰签到', '未登录', '请先在 Safari 中登录一次星驰网站，并确认已启用抓取脚本。');
} else {
    request({
        url: SITE + '/api/v1/auth/refresh',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
    }).then(function (response) {
        const json = parse(response);
        if (response.status === 401 || (json && json.code === 401)) throw new Error('REFRESH_INVALID');
        const data = payloadOf(json);
        if (!data || typeof data.access_token !== 'string' || !data.access_token) {
            throw new Error('刷新登录状态失败：' + (json && json.message ? json.message : 'HTTP ' + response.status));
        }
        if (typeof data.refresh_token === 'string' && data.refresh_token) {
            $prefs.setValueForKey(data.refresh_token, PREFS_KEY);
        }
        return data.access_token;
    }).then(function (accessToken) {
        return request({
            url: SITE + '/api/v1/user/checkin?timezone=Asia%2FShanghai',
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' }
        }).then(function (response) {
            if (response.status === 401) throw new Error('REFRESH_INVALID');
            const json = parse(response);
            if (detectCheckedIn(payloadOf(json)) === true) {
                return { message: '今天已经签过到了，无需重复操作。' };
            }
            return request({
                url: SITE + '/api/v1/user/checkin',
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' }
            }).then(function (result) {
                if (result.status === 401) throw new Error('REFRESH_INVALID');
                const body = parse(result);
                if (body && body.code !== undefined && body.code !== 0 && body.code !== 200) {
                    const message = body.message || '签到失败';
                    if (/already|already done|已签到|已经签到|签到过|重复|已领取/i.test(message)) {
                        return { message: '今天已经签过到了，无需重复操作。' };
                    }
                    throw new Error(message);
                }
                return { message: '签到成功' + summarize(payloadOf(body)) };
            });
        });
    }).then(function (result) {
        finish('星驰签到', '', result.message);
    }).catch(notifyError);
}
