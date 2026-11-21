/**
 * xc · 星驰 API · Quantumult X 每日自动签到（多账号）
 *
 * 配置（定时任务）：
 *   0 8 * * * https://raw.githubusercontent.com/NANYUA/nwhe/main/xc/xc-checkin.js, tag=星驰签到, enabled=true
 *
 * 前置条件：
 *   1. 已引用 xc-rewrite.snippet，并在 Safari 里逐个登录过要签到的账号；
 *   2. QX 已开启 MitM 并安装、信任证书。
 *
 * 多账号：在 Safari 里退出当前账号、登录下一个账号，抓取脚本会自动按邮箱/ID 添加。
 * 本脚本会逐个账号刷新令牌、查询、签到，并在一条通知里汇总。
 */

const SITE = 'https://xingchiapi.com';
const LIST_KEY = 'xc_accounts';
const LEGACY_KEY = 'xc_refresh_token';
const MAX_LINES = 6;

// 可选：手动填账号时用，格式 [{ name: 'a@example.com', token: '...' }]。
// 留空则使用抓取脚本自动保存的账号列表。
const MANUAL_ACCOUNTS = [];

let finished = false;
function finish(title, subtitle, message) {
    if (finished) return;
    finished = true;
    $notify(title, subtitle, message);
    console.log('xc checkin: ' + title + ' | ' + subtitle + ' | ' + message.replace(/\n/g, ' / '));
    $done();
}

// 整体超时保护，避免任务卡住。
setTimeout(function () {
    finish('xc 签到', '超时', '请求超时，请稍后在 QX 里手动运行一次。');
}, 55000);

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

function readAccounts() {
    if (MANUAL_ACCOUNTS.length) {
        return MANUAL_ACCOUNTS.map(function (item) {
            return { name: item.name || '账号', token: item.token };
        });
    }
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
        parts.push(key === 'message' ? String(value).slice(0, 60) : key + ' ' + value);
        if (parts.length >= 2) break;
    }
    return parts.length ? '：' + parts.join(' · ') : '';
}

function refresh(account) {
    return request({
        url: SITE + '/api/v1/auth/refresh',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ refresh_token: account.token })
    }).then(function (response) {
        const json = parse(response);
        if (response.status === 401 || (json && json.code === 401)) throw new Error('REFRESH_INVALID');
        const data = payloadOf(json);
        if (!data || typeof data.access_token !== 'string' || !data.access_token) {
            throw new Error('刷新失败：' + (json && json.message ? json.message : 'HTTP ' + response.status));
        }
        if (typeof data.refresh_token === 'string' && data.refresh_token) {
            account.token = data.refresh_token;
        }
        return data.access_token;
    });
}

function checkin(accessToken) {
    return request({
        url: SITE + '/api/v1/user/checkin?timezone=Asia%2FShanghai',
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' }
    }).then(function (response) {
        if (response.status === 401) throw new Error('REFRESH_INVALID');
        const json = parse(response);
        if (detectCheckedIn(payloadOf(json)) === true) return '今天已签到';
        return request({
            url: SITE + '/api/v1/user/checkin',
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' }
        }).then(function (result) {
            if (result.status === 401) throw new Error('REFRESH_INVALID');
            const body = parse(result);
            if (body && body.code !== undefined && body.code !== 0 && body.code !== 200) {
                const message = body.message || '签到失败';
                if (/already|already done|已签到|已经签到|签到过|重复|已领取/i.test(message)) return '今天已签到';
                throw new Error(message);
            }
            return '签到成功' + summarize(payloadOf(body));
        });
    });
}

const accounts = readAccounts();
if (!accounts.length) {
    finish('xc 签到', '未登录', '请先在 Safari 登录星驰网站，QX 会自动抓取登录状态。');
} else {
    const removed = [];
    const results = [];
    let chain = Promise.resolve();

    accounts.forEach(function (account) {
        chain = chain.then(function () {
            return refresh(account).then(function (accessToken) {
                // 先保存轮换后的令牌，再做签到，避免签到失败丢掉新令牌。
                saveAccounts(accounts.filter(function (item) { return removed.indexOf(item.name) < 0; }));
                return checkin(accessToken);
            }).then(function (message) {
                results.push({ name: account.name, ok: true, message: message });
            }).catch(function (err) {
                const message = err && err.message ? err.message : '失败';
                if (message === 'REFRESH_INVALID') {
                    removed.push(account.name);
                    results.push({ name: account.name, ok: false, message: '登录过期' });
                } else {
                    results.push({ name: account.name, ok: false, message: message });
                }
            }).then(function () {
                saveAccounts(accounts.filter(function (item) { return removed.indexOf(item.name) < 0; }));
            });
        });
    });

    chain.then(function () {
        let okCount = 0;
        for (let i = 0; i < results.length; i++) if (results[i].ok) okCount++;
        const lines = [];
        for (let i = 0; i < results.length && i < MAX_LINES; i++) {
            lines.push((results[i].ok ? '✓ ' : '✗ ') + results[i].name + '：' + results[i].message);
        }
        if (results.length > MAX_LINES) lines.push('…共 ' + results.length + ' 个账号');
        finish('xc 签到', okCount + '/' + results.length + ' 成功', lines.join('\n'));
    }).catch(function (err) {
        finish('xc 签到', '失败', err && err.message ? err.message : '未知错误');
    });
}
