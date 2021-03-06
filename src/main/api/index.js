import fs from 'fs';
import url from 'url';
import path from 'path';
import crypto from 'crypto';
import { Lrc } from 'lrc-kit';
import cp from 'child_process';
import { app } from 'electron';
import { http, https } from 'follow-redirects';

import Cache from './cache';
import Client from './httpClient';
import * as Settings from '../settings';
import MusicServer from './musicServer';

const BaseURL = 'http://music.163.com';

const client = new Client();

const appDataPath = path.join(app.getPath('appData'), Settings.appName);
const cachePathMap = {
    all: appDataPath,
    music: path.join(appDataPath, 'musicCache'),
    lyric: path.join(appDataPath, 'lyricCache')
};
const musicCache = new Cache(cachePathMap.music);
const lyricCache = new Cache(cachePathMap.lyric);

const musicServer = new MusicServer(musicCache);
const musicServerPort = process.env.NODE_ENV === 'development' ? 8210 : 8209;
musicServer.listen(musicServerPort);

export function updateCookie(cookie) {
    client.updateCookie(cookie);
    return client.getCookie('');
}

export function getCookie(key = '') {
    return client.getCookie(key);
}

export function login(acc, pwd) {
    const password = crypto.createHash('md5').update(pwd).digest('hex');
    const postBody = {
        password,
        rememberLogin: true,
        // FIXME: do not hardcode this......
        // clientToken: '1_skSxFOj/XAm7bjxjQW5FD4x73jFAbgiM_G37CFfnJVaG1oIU/7exF6ro65ioeuAbf_bRRvlPMnoredCK5p2Upo7Q=='
        clientToken: '1_sZ1r5MuQ4qBcb12MxZxFrJ3GgtyZGAYN_Rj3ssFDxxZ7+Lf9kZ+dLlZwS3mfbiE+n_ssnhg1ScZgvXau6VSb4JtQ=='
    };
    if (/^1\d{10}$/.test(acc)) {
        return client.post({
            url: `${BaseURL}/weapi/login/cellphone`,
            data: { phone: acc, ...postBody }
        });
    } else {
        return client.post({
            url: `${BaseURL}/weapi/login`,
            data: { username: acc, ...postBody }
        });
    }
}

export function refreshLogin() {
    return client.post({
        url: `${BaseURL}/weapi/login/token/refresh`,
        data: {}
    });
}

export async function logout() {
    const resp = await client.post({ url: `${BaseURL}/logout` });
    if (resp.code == 200) {
        client.setCookie({});
    }
    return resp.code;
}

export function getUserPlaylist(uid) {
    return client.post({
        url: `${BaseURL}/weapi/user/playlist`,
        data: {
            uid,
            offset: 0,
            limit: 1000,
        }
    });
}

export function getMusicRecord(uid) {
    return client.post({
        url: `${BaseURL}/weapi/v1/play/record`,
        data: {
            uid,
            type: 0,
        }
    });
}

export function getDailySuggestions() {
    return client.post({
        url: `${BaseURL}/weapi/v1/discovery/recommend/songs`,
        data: {
            offset: 0,
            total: true,
            limit: 20,
        }
    });
}

export function getListDetail(id) {
    return client.post({
        url: `${BaseURL}/weapi/v3/playlist/detail`,
        data: {
            id,
            offset: 0,
            total: true,
            limit: 1000,
            n: 1000,
        }
    });
}

const QualityMap = {
    h: 320000,
    m: 160000,
    l: 96000
};

export function getMusicUrl(idOrIds, quality = 'h') {
    if (!QualityMap[quality]) throw new Error(`Quality type '${quality}' is not in [h,m,l]`);
    let ids;
    if (Array.isArray(idOrIds)) ids = idOrIds;
    else ids = [idOrIds];
    return client.post({
        url: `${BaseURL}/weapi/song/enhance/player/url`,
        data: {
            ids,
            br: QualityMap[quality],
        }
    });
}

export function getMusicUrlCached(id, quality = 'l') {
    return { url: `http://127.0.0.1:${musicServerPort}/music?id=${id}&quality=${quality}` };
}

export function getMusicComments(rid, limit = 20, offset = 0) {
    return client.post({
        url: `${BaseURL}/weapi/v1/resource/comments/R_SO_4_${rid}`,
        data: {
            rid,
            offset,
            limit,
        }
    });
}

function byTimestamp(a, b) {
    return a.timestamp - b.timestamp;
}

export async function getMusicLyric(id) {
    const tmp = await client.post({
        url: `${BaseURL}/weapi/song/lyric`,
        data: {
            id,
            os: 'pc',
            lv: -1,
            kv: -1,
            tv: -1,
        }
    });
    let result = {};
    if (tmp.lrc && tmp.lrc.version) {
        result.lrc = Lrc.parse(tmp.lrc.lyric);
        result.lrc.lyrics.sort(byTimestamp);
        result.lyricUser = tmp.lyricUser;
    }
    if (tmp.tlyric && tmp.tlyric.version) {
        result.transUser = tmp.transUser;
        let tlrc = Lrc.parse(tmp.tlyric.lyric);
        tlrc.lyrics.sort(byTimestamp);
        let mlrc = {
            info: result.lrc.info,
            transInfo: tlrc.info,
            lyrics: result.lrc.lyrics.slice()
        };
        let i = 0;
        let j = 0;
        while (i < mlrc.lyrics.length && j < tlrc.lyrics.length) {
            if (mlrc.lyrics[i].timestamp === tlrc.lyrics[j].timestamp) {
                mlrc.lyrics[i].trans = tlrc.lyrics[j].content;
                i++; j++;
            } else if (mlrc.lyrics[i].timestamp < tlrc.lyrics[j].timestamp) {
                i++;
            } else {
                j++;
            }
        }
        result.mlrc = mlrc;
    }
    return result;
}

export async function getMusicLyricCached(id) {
    if (await lyricCache.has(id)) {
        return new Promise((resolve, reject) => {
            fs.readFile(lyricCache.fullPath(id), (err, data) => {
                if (!err) {
                    resolve(JSON.parse(data.toString()));
                } else {
                    reject(err);
                }
            });
        });
    } else {
        const lyric = await getMusicLyric(id);
        lyricCache.save(id, lyric);
        return lyric;
    }
}

export function submitWebLog(action, json) {
    return client.post({
        url: `${BaseURL}/weapi/log/web`,
        data: {
            action,
            json: JSON.stringify(json),
        }
    });
}

export function submitListened(id, time) {
    return submitWebLog('play', {
        id,
        type: 'song',
        wifi: 0,
        download: 0,
        time: Math.round(time),
        end: 'ui',
    });
}

export function checkUrlStatus(u = 'http://m10.music.126.net') {
    u = String(u);
    if (!~u.indexOf('http')) return new Promise(resolve => resolve(-1));
    const opt = url.parse(u);
    let request;
    switch (opt.protocol) {
        case 'https:':
            request = https;
            break;
        case 'http:':
            request = http;
            break;
        default:
            throw new Error(`Unsupported protocol ${opt.protocol}`);
    }
    return new Promise(resolve => {
        request.request(opt, resp => {
            resolve(resp.statusCode);
        }).end();
    });
}

export function getDirSize(dirPath) {
    let totalSize = 0;
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const stat = fs.statSync(path.join(dirPath, file));
        if (stat.isFile()) {
            totalSize += stat.size;
        } else if (stat.isDirectory) {
            totalSize += getDirSize(path.join(dirPath, file));
        }
    });
    return totalSize;
}

export function removeDir(dirPath) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
            fs.unlinkSync(fullPath);
        } else if (stat.isDirectory) {
            removeDir(fullPath);
        }
    });
}

export function getDataSize(type = 'all') {
    const cachePath = cachePathMap[type];
    let size;
    try {
        size = getDirSize(cachePath);
    } catch (err) {
        size = 0;
    }
    return size;
}

export function clearCache(type) {
    try {
        removeDir(cachePathMap[type]);
    } catch (err) {
        return {
            errno: -1,
            err
        };
    }
    return true;
}

export function getVersionName() {
    let version = Settings.appVer;
    if (process.env.NODE_ENV === 'development') {
        version += '-hot';
        let rev = '';
        try {
            rev = cp.execSync('git rev-parse --short HEAD').toString().trim();
            version += `.${rev}+`;
        } catch (err) { }
    } else {
        let hash;
        try {
            const hashFilePath = path.join(app.getPath('exe'), '../ncm_hash');
            hash = fs.readFileSync(hashFilePath).toString().trim();
            version += `-${hash}`;
        } catch (err) { }
    }
    return version;
}

export function getCurrentSettings() {
    return Settings.getCurrent();
}

export function writeSettings(target) {
    return Settings.set(target);
}

export function resetSettings() {
    return Settings.set(Settings.defaultSettings);
}

export function postDailyTask(type) {
    return client.post({
        url: `${BaseURL}/weapi/point/dailyTask`,
        data: {
            type,
        }
    });
}

export function manipulatePlaylistTracks(op, pid, tracks) {
    return client.post({
        url: `${BaseURL}/weapi/playlist/manipulate/tracks`,
        data: {
            op,
            pid,
            tracks,
            trackIds: JSON.stringify(tracks),
        }
    });
}

export function collectTrack(pid, ...tracks) {
    return manipulatePlaylistTracks('add', pid, tracks);
}

export function uncollectTrack(pid, ...tracks) {
    return manipulatePlaylistTracks('del', pid, tracks);
}

export function getSearchSuggest(s) {
    return client.post({
        url: `${BaseURL}/weapi/search/suggest/web`,
        data: {
            s,
        }
    });
}

const searchTypeMap = {
    song: '1',
    album: '10',
    artist: '100',
    playlist: '1000',
    user: '1002',
    mv: '1004',
    lyric: '1006',
    radio: '1009'
};

export function search(s, type, limit = 20, offset = 0) {
    return client.post({
        url: `${BaseURL}/weapi/cloudsearch/get/web`,
        data: {
            hlposttag: '</span>',
            hlpretag: '<span class="s-fc7">',
            limit,
            offset,
            s,
            total: true,
            type: searchTypeMap[type],
        }
    });
}
