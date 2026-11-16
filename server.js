require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 7788;
const DATA_DIR = path.join(__dirname, process.env.DATA_DIR || 'data');
const STATE_FILE = path.join(__dirname, 'server_state.json');

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// APP ROUTES (WEB PAGES)
// ============================================================================
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/overlay', (req, res) => res.sendFile(path.join(__dirname, 'overlay.html')));
app.get('/draftpick', (req, res) => res.sendFile(path.join(__dirname, 'draftpick.html')));
app.get('/draft-led', (req, res) => res.sendFile(path.join(__dirname, 'draft-led.html')));

// ============================================================================
// STATE MANAGER (Saves Dashboard Configuration)
// ============================================================================
function getState() {
    if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
    return { 
        app_id: "hok_met_ph_tournament", 
        app_secret: "mdaRyVtFemRYafsyUMmqcPQsPvhZkLgH", 
        base_url: "https://hok-sg-match.playerinfinite.com", 
        dc_app_id: "", 
        dc_app_secret: "",
        datacenter_url: "https://hok-esports.playerinfinite.com",
        battle_id: "", 
        ob_open_id: "14721625020824982866", 
        csv_url: "", 
        season_ids: "",
        team_1_abbr: "", team_1_score: 0, team_1_players: [],
        team_2_abbr: "", team_2_score: 0, team_2_players: [],
        last_updated: 0
    };
}

function updateState(newState) {
    const currentState = getState();
    const mergedState = { ...currentState, ...newState };
    fs.writeFileSync(STATE_FILE, JSON.stringify(mergedState, null, 4));
}

// ============================================================================
// OVERLAY CONTROLLER STATE (Show/Hide Controls)
// ============================================================================
let overlayState = { 
    top_bar_visible: false, 
    bg_visible: false,
    kp_visible: true,
    obj_visible: true
};

app.get('/api/overlay_state', (req, res) => {
    res.json(overlayState);
});

app.post('/api/overlay_state', (req, res) => {
    if (req.body.visible !== undefined) overlayState.top_bar_visible = req.body.visible;
    if (req.body.bg_visible !== undefined) overlayState.bg_visible = req.body.bg_visible;
    if (req.body.kp_visible !== undefined) overlayState.kp_visible = req.body.kp_visible;
    if (req.body.obj_visible !== undefined) overlayState.obj_visible = req.body.obj_visible;
    res.json({ success: true, state: overlayState });
});

// BITFOCUS COMPANION ROUTE
app.get('/api/companion', (req, res) => {
    const target = req.query.target;
    const action = req.query.action; // 'show' or 'hide'

    if (target === 'topbar') overlayState.top_bar_visible = (action === 'show');
    if (target === 'kp') overlayState.kp_visible = (action === 'show');
    if (target === 'obj') overlayState.obj_visible = (action === 'show');

    res.json({ success: true, message: `Successfully executed ${action} on ${target}`, state: overlayState });
});

// ============================================================================
// BATTLE & CSV MANAGER 
// ============================================================================
app.post('/api/clear_battle', (req, res) => {
    try {
        const state = getState();
        state.battle_id = ""; updateState(state);
        const filesToDelete = ['battle_detail.json', 'team_list.json', 'player_list.json', 'event_list.json', 'ban_pick_list.json'];
        filesToDelete.forEach(file => { const filePath = path.join(DATA_DIR, file); if (fs.existsSync(filePath)) fs.unlinkSync(filePath); });
        const statFile = path.join(__dirname, 'status.json'); if (fs.existsSync(statFile)) fs.unlinkSync(statFile);
        isSleeping = false;
        res.json({ success: true, message: "Battle ID and previous match memory cleared successfully!" });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/update_csv', async (req, res) => {
    try {
        const csvUrl = req.body.url;
        if (!csvUrl) return res.status(400).json({ error: "CSV URL not found" });
        const response = await axios.get(csvUrl);
        const dbPath = path.join(DATA_DIR, 'database.csv');
        fs.writeFileSync(dbPath, response.data, 'utf8');
        res.json({ success: true, message: "CSV Database downloaded successfully." });
    } catch (error) { res.status(500).json({ error: error.message, success: false }); }
});

app.get('/api/database_csv', (req, res) => {
    const dbPath = path.join(DATA_DIR, 'database.csv');
    if (fs.existsSync(dbPath)) res.send(fs.readFileSync(dbPath, 'utf8'));
    else res.status(404).send("");
});

// ============================================================================
// RAW DATA ENDPOINTS (SEPARATED)
// ============================================================================

app.get('/api/raw/battle_detail', (req, res) => {
    res.json(readJSON('battle_detail.json'));
});

app.get('/api/raw/team_list', (req, res) => {
    res.json(readJSON('team_list.json'));
});

app.get('/api/raw/player_list', (req, res) => {
    res.json(readJSON('player_list.json'));
});

app.get('/api/raw/event_list', (req, res) => {
    res.json(readJSON('event_list.json'));
});

app.get('/api/raw/ban_pick_list', (req, res) => {
    res.json(readJSON('ban_pick_list.json'));
});

// ============================================================================
// HOK AUTHENTICATION & FETCHER
// ============================================================================

// 1. Store Timestamp and Nonce PAIR in memory
let cachedTimestamp = Math.floor(Date.now() / 1000).toString();
let cachedNonce = Date.now().toString() + Math.floor(Math.random() * 1000).toString();

// 2. Renew this Signature Set every 30 minutes (per HOK guidelines)
setInterval(() => {
    cachedTimestamp = Math.floor(Date.now() / 1000).toString();
    cachedNonce = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    console.log(`[${new Date().toLocaleTimeString()}] 🔑 Refreshing HOK API Signature (Valid for 30 Mins)`);
}, 30 * 60 * 1000); // 30 Minutes

function getAuthHeaders(uri, state) {
    if (!state.app_id || !state.app_secret) return null;
    
    const timestamp = cachedTimestamp;
    const nonce = cachedNonce;
    
    const signStr = `${uri}\n${state.app_id}\n${timestamp}\n${nonce}`;
    const signature = crypto.createHmac('sha256', state.app_secret).update(signStr).digest('hex');
    
    return { 
        'Content-type': 'application/json', 
        'X-AUTH-Appkey': state.app_id, 
        'X-AUTH-Sign': signature, 
        'X-AUTH-Timestamp': timestamp, 
        'X-AUTH-Nonce': nonce 
    };
}

async function fetchFromHOK(uri, payload, state) {
    if (!state.base_url || !state.app_id) return { error: "Credentials missing" };
    const url = `${state.base_url}${uri}`;
    const headers = getAuthHeaders(uri, state);
    if (!headers) return { error: "APP_ID/APP_SECRET is empty" };
    
    try { 
        const response = await axios.post(url, payload, { headers, timeout: 5000 }); 
        return response.data; 
    } 
    catch (error) { 
        return { error: error.message }; 
    }
}

function saveData(filename, data) {
    if(data && !data.error && data.ret === 0) {
        const output = { fetched_at: new Date().toISOString(), timestamp: Math.floor(Date.now() / 1000), data: data };
        fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(output, null, 2));
    }
}

// ============================================================================
// HOK DATA CENTER (THIRD-PARTY API) FETCHER
// ============================================================================

function getDataCenterAuthHeaders(uri, state) {
    // Ubah variabel yang dicek menjadi dc_app_id dan dc_app_secret
    if (!state.dc_app_id || !state.dc_app_secret) return null;
    
    const timestamp = (Math.floor(Date.now() / 1000) - 1).toString();
    const nonce = crypto.randomBytes(4).toString('hex');
    
    // Gunakan dc_app_id untuk payload string
    const signStr = `${uri}\n${state.dc_app_id}\n${timestamp}\n${nonce}`;
    
    // Gunakan dc_app_secret untuk mengenkripsi signature
    const signature = crypto.createHmac('sha256', state.dc_app_secret).update(signStr).digest('hex');
    
    return { 
        'Content-type': 'application/json', 
        'X-AUTH-Appkey': state.dc_app_id, // Gunakan dc_app_id untuk header
        'X-AUTH-Sign': signature, 
        'X-AUTH-Timestamp': timestamp, 
        'X-AUTH-Nonce': nonce 
    };
}

async function fetchFromDataCenter(methodName, payload) {
    const state = getState();
    const dcBaseUrl = state.datacenter_url || "https://hok-esports.playerinfinite.com";
    const uri = `/datacenter/admin/api/${methodName}`;
    const url = `${dcBaseUrl}${uri}`;
    const headers = getDataCenterAuthHeaders(uri, state);
    
    if (!headers) return { ret: -1, error: "APP_ID/APP_SECRET empty" };
    
    try { 
        const response = await axios.post(url, payload, { headers, timeout: 5000 }); 
        return response.data; 
    } 
    catch (error) { 
        console.error(`[DataCenter Error] ${methodName}:`, error.response ? error.response.data : error.message);
        return { ret: -1, error: error.message, details: error.response ? error.response.data : null }; 
    }
}

// 1. Endpoint: GetHeroWinRate (Menggunakan GET agar bisa diakses di Browser)
app.get('/api/datacenter/hero_win_rate', async (req, res) => {
    const { hero_id, season_ids } = req.query;
    if (!hero_id || !season_ids) {
        return res.status(400).json({ ret: 30055, error: "Parameter hero_id dan season_ids wajib diisi pada URL." });
    }
    // Ubah string season_ids menjadi array
    const sIds = season_ids.split(',').map(s => s.trim());
    const data = await fetchFromDataCenter('GetHeroWinRate', { hero_id: parseInt(hero_id), season_ids: sIds });
    res.json(data);
});

// 2. Endpoint: GetPlayerHeroWinRate (Menggunakan GET)
app.get('/api/datacenter/player_hero_win_rate', async (req, res) => {
    const { openid, hero_id, season_ids } = req.query;
    if (!openid || !hero_id || !season_ids) {
        return res.status(400).json({ ret: 30055, error: "Parameter openid, hero_id, dan season_ids wajib diisi pada URL." });
    }
    const sIds = season_ids.split(',').map(s => s.trim());
    const data = await fetchFromDataCenter('GetPlayerHeroWinRate', { openid, hero_id: parseInt(hero_id), season_ids: sIds });
    res.json(data);
});

// 3. Endpoint: GetTeamVsTeam (Menggunakan GET)
app.get('/api/datacenter/team_vs_team', async (req, res) => {
    const { team_a, team_b, season_ids } = req.query;
    if (!team_a || !team_b || !season_ids) {
        return res.status(400).json({ ret: 30055, error: "Parameter team_a, team_b, dan season_ids wajib diisi pada URL." });
    }
    const sIds = season_ids.split(',').map(s => s.trim());
    const data = await fetchFromDataCenter('GetTeamVsTeam', { team_a, team_b, season_ids: sIds });
    res.json(data);
});


// ============================================================================
// WORKER (AUTO DATA PULLER) WITH CONSOLE LOGGING
// ============================================================================
let workerInterval = null;
let isSleeping = false;
let lastConsoleStatus = "INITIALIZING";

function startWorker() {
    if (workerInterval) clearInterval(workerInterval);
    const interval = parseInt(process.env.FETCH_INTERVAL_MS) || 1000;
    
    workerInterval = setInterval(async () => {
        const state = getState();
        if (!state.app_id) return; 
        
        let battleId = state.battle_id;
        const obOpenId = state.ob_open_id || battleId;

        if (obOpenId) {
            const banPick = await fetchFromHOK('/match_data/api/HOKBanPickList', { ObOpenId: obOpenId }, state);
            if (banPick && !banPick.error && banPick.ret === 0) {
                saveData('ban_pick_list.json', banPick);
            }
        }

        if ((!battleId || isSleeping) && obOpenId) {
            const bList = await fetchFromHOK('/match_data/api/HOKBattleList', { ObOpenId: obOpenId, page_offset: 0, page_size: 1 }, state);
            if (bList && bList.BattleList && bList.BattleList.length > 0) {
                const newBattleId = bList.BattleList[0].BattleID;
                if (newBattleId !== battleId) {
                    battleId = newBattleId;
                    state.battle_id = battleId;
                    updateState(state);
                    isSleeping = false;
                    console.log(`[${new Date().toLocaleTimeString()}] 🚀 NEW MATCH DETECTED: [${battleId}]`);
                }
            }
        }

        if (!battleId) {
            if (lastConsoleStatus !== "WAITING") {
                console.log(`[${new Date().toLocaleTimeString()}] ⏳ WAITING: Searching for new match via OB_OPEN_ID...`);
                lastConsoleStatus = "WAITING";
            }
            return;
        }

        if (isSleeping) {
            return; 
        }

        const [detail, teams, players, events] = await Promise.all([
            fetchFromHOK('/match_data/api/HOKBattleDetail', { BattleID: battleId }, state),
            fetchFromHOK('/match_data/api/HOKTeamList', { BattleID: battleId }, state),
            fetchFromHOK('/match_data/api/HOKPlayerList', { BattleID: battleId }, state),
            fetchFromHOK('/match_data/api/HOKEventList', { BattleID: battleId }, state)
        ]);

        let currentStatus = "DISCONNECTED";
        let errMsg = "";

        if (detail && !detail.error && detail.ret === 0) {
            currentStatus = "CONNECTED";
        } else {
            errMsg = detail ? (detail.error || detail.msg || "API Connection Failed") : "No Response";
        }

        if (currentStatus !== lastConsoleStatus && currentStatus !== "SLEEP") {
            const time = new Date().toLocaleTimeString();
            if (currentStatus === "CONNECTED") {
                console.log(`[${time}] ✅ CONNECTED: Receiving In-Game data from Battle ID [${battleId}]`);
            } else if (currentStatus === "DISCONNECTED" && lastConsoleStatus === "CONNECTED") {
                console.log(`[${time}] ❌ DISCONNECTED: HOK API connection lost. (${errMsg})`);
            }
            lastConsoleStatus = currentStatus;
        }

        if (currentStatus === "CONNECTED") {
            saveData('battle_detail.json', detail);
            saveData('team_list.json', teams);
            saveData('player_list.json', players);
            saveData('event_list.json', events);

            let matchEnded = false;

            if (detail && detail.BattleDetail) {
                const gs = detail.BattleDetail.GameStatus;
                const st = detail.BattleDetail.Status;
                if (gs === 3 || st === 4) {
                    matchEnded = true;
                }
            }

            if (teams && teams.HOKTeamList) {
                const t1 = teams.HOKTeamList.find(t => t.Camp === 1);
                const t2 = teams.HOKTeamList.find(t => t.Camp === 2);
                if ((t1 && t1.IsWin > 0) || (t2 && t2.IsWin > 0)) {
                    matchEnded = true;
                }
            }

            if (matchEnded) {
                isSleeping = true;
                console.log(`[${new Date().toLocaleTimeString()}] 💤 GAME ENDED: Standby mode active. (Draft Pick still running)`);
                lastConsoleStatus = "SLEEP";
                fs.writeFileSync(path.join(__dirname, 'status.json'), JSON.stringify({ status: "SLEEP", battleId: battleId }));
            } else {
                isSleeping = false;
                fs.writeFileSync(path.join(__dirname, 'status.json'), JSON.stringify({ status: "RUNNING", battleId: battleId }));
            }
        }
        
    }, interval);
}

// ============================================================================
// DATA ENDPOINTS (Local JSON Sources)
// ============================================================================
function readJSON(filename) {
    const file = path.join(DATA_DIR, filename);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).data : {};
}

app.get('/api/server_status', (req, res) => {
    const statFile = path.join(__dirname, 'status.json');
    const state = getState();
    const statusData = fs.existsSync(statFile) ? JSON.parse(fs.readFileSync(statFile, 'utf8')) : { status: "IDLE" };
    statusData.last_updated = state.last_updated || 0;
    res.json(statusData);
});

app.get('/api/state', (req, res) => res.json(getState()));

app.post('/api/state', (req, res) => {
    const newState = req.body;
    newState.last_updated = Date.now(); // Record save time
    updateState(newState);
    isSleeping = false;
    res.json({ success: true, message: 'Data saved successfully!', last_updated: newState.last_updated });
});

// Smart Logic for Penalty Ban & Draft End
app.get('/api/draft_phase', (req, res) => {
    const bpData = readJSON('ban_pick_list.json');
    let banPicks = bpData.BanPickList || [];

    if (banPicks.length === 0) {
        const detailData = readJSON('battle_detail.json');
        banPicks = (detailData.BattleDetail ? detailData.BattleDetail.BanPickList : detailData.BanPickList) || [];
    }

    res.json({
        status_code: 200,
        response: {
            ret: 0, msg: "", picking_index: null,
            BanPickList: banPicks.map((bp) => {
                const heroId = parseInt(bp.HeroID || 0);
                const dte = bp.Dteventtime || "";
                const isPicking = (heroId === 0) && (dte === "");

                return { 
                    Camp: parseInt(bp.Camp || 0), 
                    Dteventtime: dte, 
                    HeroID: heroId, 
                    IsBan: bp.IsBan || false, 
                    picking: isPicking 
                };
            })
        }
    });
});

app.get('/api/hokteamlist', (req, res) => {
    const teams = readJSON('team_list.json').HOKTeamList || [];
    let transformed = [{}, {}];
    teams.forEach(t => { 
        const sortedTeam = {};
        Object.keys(t).sort().forEach(key => { sortedTeam[key] = t[key]; });
        transformed[(t.Camp || 1) - 1] = sortedTeam; 
    });
    res.json({ status_code: 200, response: { HOKTeamList: transformed } });
});

app.get('/api/ingame_data', (req, res) => {
    const state = getState();
    const teams = readJSON('team_list.json').HOKTeamList || [];
    const players = readJSON('player_list.json').HOKPlayerList || [];
    res.json({ status: "success", battle_id: state.battle_id, team_stats: teams, players: players });
});

// ============================================================================
// ENDPOINT UNTUK MELIHAT RIWAYAT BATTLE ID DARI OB OPEN ID
// ============================================================================
app.get('/api/battle_history', async (req, res) => {
    const state = getState();
    // Ambil OB Open ID dari parameter URL, jika kosong gunakan dari Dashboard
    const obOpenId = req.query.ob_openid || state.ob_open_id;
    // Tentukan jumlah riwayat yang ingin ditarik (default: 10 match terakhir)
    const limit = parseInt(req.query.limit) || 10; 

    if (!obOpenId) {
        return res.status(400).json({ error: "OB_OPEN_ID tidak ditemukan" });
    }

    // Tarik list battle dari server Tencent In-Game
    const bList = await fetchFromHOK('/match_data/api/HOKBattleList', { 
        ObOpenId: obOpenId, 
        page_offset: 0, 
        page_size: limit 
    }, state);

    res.json({
        status_code: 200,
        ob_openid_used: obOpenId,
        history: bList
    });
});

app.get('/api/player_list', (req, res) => {
    const players = readJSON('player_list.json').HOKPlayerList || [];
    res.json({ response: players.map(p => parseInt(p.PlayerUID || p.openid)) });
});

app.get('/api/event_list', (req, res) => {
    const events = readJSON('event_list.json').HOKEventList || [];
    res.json({ status_code: 200, response: events });
});

// ============================================================================
// ENDPOINT RAW PLAYER PANEL (HEXAGON / POSTGAME)
// ============================================================================
app.get('/api/player_panel', async (req, res) => {
    const state = getState();
    // Gunakan ob_open_id dari Dashboard
    const obOpenId = state.ob_open_id; 

    if (!obOpenId) {
        return res.status(400).json({ error: "OB_OPEN_ID kosong di Dashboard." });
    }

    // Perhatikan: Key parameter di body API ini HARUS huruf kecil (ob_openid)
    const payload = {
        ob_openid: obOpenId
    };

    // Tembak ke server HOK
    const data = await fetchFromHOK('/match_data/api/HOKPlayerPanelProxy', payload, state);
    
    // Kembalikan data raw apa adanya
    res.json(data);
});

// ============================================================================
// DEDICATED VMIX ENDPOINT (Auto Calculated, Alphabetical, & Role-Ordered)
// ============================================================================
app.get('/api/vmix-output', (req, res) => {
    const state = getState();
    const playersData = readJSON('player_list.json').HOKPlayerList || [];

    if (playersData.length === 0) {
        return res.json({ BattleID: state.battle_id, players: [] });
    }

    const teamTotals = {
        1: { damage: 0, damageTaken: 0, gold: 0, kills: 0 },
        2: { damage: 0, damageTaken: 0, gold: 0, kills: 0 }
    };

    playersData.forEach(p => {
        const camp = p.Camp || 1;
        if (teamTotals[camp]) {
            teamTotals[camp].damage += (p.TotalHurtToHero || 0);
            teamTotals[camp].damageTaken += (p.TotalBeHurtByHero || 0);
            teamTotals[camp].gold += (p.Gold || 0);
            teamTotals[camp].kills += (p.K || 0);
        }
    });

    const vmixPlayers = playersData.map(p => {
        const camp = p.Camp || 1;
        const totals = teamTotals[camp];
        
        const gameTimeSeconds = p.CurrentGameTime || 1; 
        const gameTimeMinutes = gameTimeSeconds / 60;

        const damage_percent = totals.damage > 0 ? Math.round((p.TotalHurtToHero || 0) / totals.damage * 100) : 0;
        const damage_taken_percent = totals.damageTaken > 0 ? Math.round((p.TotalBeHurtByHero || 0) / totals.damageTaken * 100) : 0;
        const gold_percentage = totals.gold > 0 ? Math.round((p.Gold || 0) / totals.gold * 100) : 0;
        const gpm = Math.round((p.Gold || 0) / gameTimeMinutes);
        
        const kp = totals.kills > 0 ? (((p.K || 0) + (p.A || 0)) / totals.kills * 100).toFixed(1) : "0.0";

        let rawEquips = p.Equips || [];
        let safeEquips = [];
        for (let i = 0; i < 6; i++) {
            if (rawEquips[i] && rawEquips[i] !== "" && rawEquips[i] !== "0") {
                safeEquips.push(rawEquips[i]);
            } else {
                safeEquips.push(0);
            }
        }

        const rawPlayerObj = {
            ...p,
            Equips: safeEquips,
            camp: `camp_${camp}`,
            damage_percent: damage_percent,
            damage_taken_percent: damage_taken_percent,
            gold_percentage: gold_percentage,
            gpm: gpm,
            hero_name: p.HeroName || "",
            "k/d/a": `${p.K || 0}/${p.D || 0}/${p.A || 0}`,
            kda: `${p.K || 0}/${p.D || 0}/${p.A || 0}`,
            kill_participation: parseFloat(kp)
        };

        const sortedPlayerObj = {};
        Object.keys(rawPlayerObj).sort().forEach(key => {
            sortedPlayerObj[key] = rawPlayerObj[key];
        });

        return sortedPlayerObj;
    });

    const orderedUIDs = [
        ...(state.team_1_uids || []),
        ...(state.team_2_uids || [])
    ];

    vmixPlayers.sort((a, b) => {
        const uidA = a.openid || a.PlayerUID;
        const uidB = b.openid || b.PlayerUID;

        const indexA = orderedUIDs.indexOf(uidA);
        const indexB = orderedUIDs.indexOf(uidB);

        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        
        return (a.Camp || 1) - (b.Camp || 1);
    });

    res.json({
        BattleID: state.battle_id || playersData[0].BattleID,
        players: vmixPlayers
    });
});

startWorker();
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`HOK Node.js API Provider Running on Port ${PORT}`);
    console.log(`Open Dashboard  : http://localhost:${PORT}/dashboard`);
    console.log(`Open Overlay    : http://localhost:${PORT}/overlay`);
    console.log(`Open Draft Pick : http://localhost:${PORT}/draftpick`);
    console.log(`Open vMix Data  : http://localhost:${PORT}/api/vmix-output`);
    console.log(`=========================================`);
});