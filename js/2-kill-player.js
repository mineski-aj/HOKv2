window.hokEventQueue = window.hokEventQueue || [];
window.hokIsPlaying = window.hokIsPlaying || false;

let currentBattleIdKp = ""; // <-- TRACKER MATCH BARU
let kpPrevData = {}; 
let isKpFirstFetch = true; 
let csvTeamMap = {}; 

async function loadCsvTeamMap() {
    try {
        const res = await fetch('/api/database_csv');
        if (res.ok) {
            const text = await res.text();
            const lines = text.split(/\r?\n/);
            let tempMap = {};
            for(let i=1; i<lines.length; i++) {
                const cols = lines[i].split(',');
                if (cols.length >= 2) {
                    let tName = cols[0].trim(); 
                    let tAbbr = cols[1].trim(); 
                    if (tAbbr && tName) tempMap[tAbbr] = tName;
                }
            }
            csvTeamMap = tempMap;
        }
    } catch(e){}
}

loadCsvTeamMap();
setInterval(loadCsvTeamMap, 10000);

function squeezeText(elId, maxWidth) {
    const el = document.getElementById(elId);
    el.style.transform = elId.includes('ace') ? 'translateX(-50%) scaleX(1)' : 'scaleX(1)';
    if (el.scrollWidth > maxWidth) {
        const scale = maxWidth / el.scrollWidth;
        el.style.transform = elId.includes('ace') ? `translateX(-50%) scaleX(${scale})` : `scaleX(${scale})`;
    }
}

async function fetchKillPlayer() {
    try {
        const [ingameRes, stateRes, overlayRes, teamRes] = await Promise.all([
            fetch('/api/ingame_data'), fetch('/api/state'), fetch('/api/overlay_state'), fetch('/api/hokteamlist')
        ]);
        const ingame = await ingameRes.json();
        const state = await stateRes.json();
        const overlay = await overlayRes.json();
        const teamData = await teamRes.json();
        
        // RESET TRACKER JIKA MATCH GANTI (Game Baru)
        if (state.battle_id !== currentBattleIdKp) {
            currentBattleIdKp = state.battle_id;
            kpPrevData = {};
            isKpFirstFetch = true;
        }

        const getTeamAbbr = (camp) => camp === 1 ? state.team_1_abbr : state.team_2_abbr;
        
        const getFullTeamName = (camp) => {
            const abbr = getTeamAbbr(camp);
            if (csvTeamMap[abbr]) return csvTeamMap[abbr];
            if (teamData.response && teamData.response.HOKTeamList) {
                const teamObj = teamData.response.HOKTeamList.find(t => t.Camp === camp);
                if (teamObj && teamObj.TeamName) return teamObj.TeamName;
            }
            return abbr; 
        };

        const isEnabled = overlay.kp_visible;

        if (ingame.players && ingame.players.length > 0) {
            ingame.players.forEach(p => {
                const uid = p.PlayerUID || p.openid;
                if (!kpPrevData[uid]) kpPrevData[uid] = { fb: 0, d: 0, t: 0, q: 0, p: 0, ace: 0 };
                const prev = kpPrevData[uid];

                if (isKpFirstFetch || !isEnabled) {
                    prev.d = p.VTDoubleKill || 0; 
                    prev.t = p.VTTripleKill || 0; 
                    prev.q = p.VTQuataryKill || 0; 
                    prev.p = p.VTPentaKill || 0;
                    prev.fb = p.FirstBloodTime > 0 ? 1 : 0; 
                    prev.ace = p.VSTAllDeadCnt || 0;
                } else {
                    let pD = p.VTDoubleKill || 0;
                    let pT = p.VTTripleKill || 0;
                    let pQ = p.VTQuataryKill || 0;
                    let pP = p.VTPentaKill || 0;
                    let pFb = p.FirstBloodTime > 0 ? 1 : 0;
                    let pAce = p.VSTAllDeadCnt || 0;

                    if (pD > prev.d) { window.hokEventQueue.push({ category: 'kp', type: 'DOUBLE KILL', name: p.NickName, logo: getTeamAbbr(p.Camp) }); prev.d = pD; }
                    if (pT > prev.t) { window.hokEventQueue.push({ category: 'kp', type: 'TRIPLE KILL', name: p.NickName, logo: getTeamAbbr(p.Camp) }); prev.t = pT; }
                    if (pQ > prev.q) { window.hokEventQueue.push({ category: 'kp', type: 'QUADRA KILL', name: p.NickName, logo: getTeamAbbr(p.Camp) }); prev.q = pQ; }
                    if (pP > prev.p) { window.hokEventQueue.push({ category: 'kp', type: 'PENTA KILL', name: p.NickName, logo: getTeamAbbr(p.Camp) }); prev.p = pP; }
                    
                    if (pFb > 0 && prev.fb === 0) { window.hokEventQueue.push({ category: 'kp', type: 'FIRST BLOOD', name: p.NickName, logo: getTeamAbbr(p.Camp) }); prev.fb = 1; }
                    if (pAce > prev.ace) { window.hokEventQueue.push({ category: 'kp', type: 'ACE', name: getFullTeamName(p.Camp), logo: getTeamAbbr(p.Camp) }); prev.ace = pAce; }
                }
            });
        }

        if (isKpFirstFetch) isKpFirstFetch = false;
        else if (isEnabled) window.processHokQueue();
    } catch (e) {}
}

window.processHokQueue = function() {
    if (window.hokIsPlaying || window.hokEventQueue.length === 0) return;
    window.hokIsPlaying = true;
    
    const event = window.hokEventQueue.shift();
    
    if (event.category === 'kp') playKpEvent(event);
    else if (event.category === 'obj') {
        if (typeof window.playObjEvent === 'function') window.playObjEvent(event);
        else { window.hokIsPlaying = false; window.processHokQueue(); }
    }
};

function playKpEvent(event) {
    const container = document.getElementById('kp-container');
    const vid = document.getElementById('kp-vid');
    const multiBox = document.getElementById('kp-multi-box');
    const aceBox = document.getElementById('kp-ace-box');

    multiBox.classList.remove('active', 'show-content'); 
    aceBox.classList.remove('active', 'show-content');
    
    vid.src = `assets/webm/${event.type}.webm`;
    
    let activeBox = event.type === 'ACE' ? aceBox : multiBox;

    if (event.type === 'ACE') {
        document.getElementById('kp-ace-logo').src = `assets/images/logo/${event.logo}.png`;
        document.getElementById('kp-ace-name').innerText = event.name;
        squeezeText('kp-ace-name', 245);
    } else {
        document.getElementById('kp-multi-logo').src = `assets/images/logo/${event.logo}.png`;
        let photoName = event.photo ? event.photo : event.name;
        let photoEl = document.getElementById('kp-multi-photo');
        photoEl.src = `assets/images/photo/${photoName}.png`;
        photoEl.onerror = function() { this.src = 'assets/images/photo/default.png'; };
        document.getElementById('kp-multi-name').innerText = event.name;
        squeezeText('kp-multi-name', 205);
    }

    activeBox.classList.add('active'); 
    container.classList.add('show'); 
    vid.play();

    setTimeout(() => { activeBox.classList.add('show-content'); }, 1000);
    setTimeout(() => { activeBox.classList.remove('show-content'); }, 3300);
    
    setTimeout(() => { 
        container.classList.remove('show'); 
        activeBox.classList.remove('active');
        window.hokIsPlaying = false; 
        window.processHokQueue(); 
    }, 4000);
}

const bcKp = new BroadcastChannel('hok_events');
bcKp.onmessage = (e) => {
    if (e.data.action === 'debug_kp') { 
        const payload = e.data.payload;
        payload.category = 'kp';
        window.hokEventQueue.push(payload); 
        window.processHokQueue(); 
    }
};

setInterval(fetchKillPlayer, 500);