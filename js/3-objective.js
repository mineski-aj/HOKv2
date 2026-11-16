window.hokEventQueue = window.hokEventQueue || [];
window.hokIsPlaying = window.hokIsPlaying || false;

let currentBattleIdObj = ""; // <-- TRACKER MATCH BARU
let objPrevData = {};
let firstTyrantTaken = false;
let firstOverlordTaken = false;
let isObjFirstFetch = true; 

function squeezeObjText(elId, maxWidth) {
    const el = document.getElementById(elId);
    el.style.transform = 'scaleX(1)';
    if (el.scrollWidth > maxWidth) {
        el.style.transform = `scaleX(${maxWidth / el.scrollWidth})`;
    }
}

async function fetchObjective() {
    try {
        const [ingameRes, stateRes, overlayRes] = await Promise.all([fetch('/api/ingame_data'), fetch('/api/state'), fetch('/api/overlay_state')]);
        const ingame = await ingameRes.json();
        const state = await stateRes.json();
        const overlay = await overlayRes.json();
        
        // RESET TRACKER JIKA MATCH GANTI (Game Baru)
        if (state.battle_id !== currentBattleIdObj) {
            currentBattleIdObj = state.battle_id;
            objPrevData = {};
            firstTyrantTaken = false;
            firstOverlordTaken = false;
            isObjFirstFetch = true;
        }

        const getTeamAbbr = (camp) => camp === 1 ? state.team_1_abbr : state.team_2_abbr;
        const isEnabled = overlay.obj_visible;

        if (ingame.players && ingame.players.length > 0) {
            ingame.players.forEach(p => {
                const uid = p.PlayerUID || p.openid;
                if (!objPrevData[uid]) objPrevData[uid] = { tyr: 0, ov: 0, shTyr: 0, shOv: 0, temp: 0 };
                const prev = objPrevData[uid];

                if (isObjFirstFetch || !isEnabled) {
                    prev.tyr = p.KillBigDragonCnt || 0; 
                    prev.ov = p.KillXiaoZhuzaiCnt || 0; 
                    prev.shTyr = p.KillDarkBigDragonCnt || 0; 
                    prev.shOv = p.KillBaronCnt || 0; 
                    prev.temp = p.KillYuanGuBaoJunCnt || 0;

                    if (prev.tyr > 0) firstTyrantTaken = true;
                    if (prev.ov > 0) firstOverlordTaken = true;
                } else {
                    let pTyr = p.KillBigDragonCnt || 0;
                    let pOv = p.KillXiaoZhuzaiCnt || 0;
                    let pShTyr = p.KillDarkBigDragonCnt || 0;
                    let pShOv = p.KillBaronCnt || 0;
                    let pTemp = p.KillYuanGuBaoJunCnt || 0;

                    if (pTyr > prev.tyr) {
                        let type = firstTyrantTaken ? 'TYRANT' : 'FIRST TYRANT'; 
                        firstTyrantTaken = true;
                        window.hokEventQueue.push({ category: 'obj', type: type, name: p.NickName, logo: getTeamAbbr(p.Camp) }); 
                        prev.tyr = pTyr;
                    }
                    if (pOv > prev.ov) {
                        let type = firstOverlordTaken ? 'OVERLORD' : 'FIRST OVERLORD'; 
                        firstOverlordTaken = true;
                        window.hokEventQueue.push({ category: 'obj', type: type, name: p.NickName, logo: getTeamAbbr(p.Camp) }); 
                        prev.ov = pOv;
                    }
                    if (pShTyr > prev.shTyr) { window.hokEventQueue.push({ category: 'obj', type: 'SHADOW TYRANT', name: p.NickName, logo: getTeamAbbr(p.Camp) }); prev.shTyr = pShTyr; }
                    if (pShOv > prev.shOv) { window.hokEventQueue.push({ category: 'obj', type: 'SHADOW OVERLORD', name: p.NickName, logo: getTeamAbbr(p.Camp) }); prev.shOv = pShOv; }
                    if (pTemp > prev.temp) { window.hokEventQueue.push({ category: 'obj', type: 'TEMPEST DRAGON', name: p.NickName, logo: getTeamAbbr(p.Camp) }); prev.temp = pTemp; }
                }
            });
        }

        if (isObjFirstFetch) isObjFirstFetch = false;
        else if (isEnabled && typeof window.processHokQueue === 'function') window.processHokQueue();
    } catch (e) {}
}

window.playObjEvent = function(event) {
    const container = document.getElementById('obj-container');
    const vid = document.getElementById('obj-vid');
    const epicBox = document.getElementById('obj-epic-box');
    const regBox = document.getElementById('obj-reg-box');

    epicBox.classList.remove('active', 'show-content'); 
    regBox.classList.remove('active', 'show-content');
    
    vid.src = `assets/webm/${event.type}.webm`;
    
    let photoName = event.photo ? event.photo : event.name;
    let activeBox = ['TYRANT', 'OVERLORD'].includes(event.type) ? regBox : epicBox;

    if (activeBox === regBox) {
        document.getElementById('obj-reg-logo').src = `assets/images/logo/${event.logo}.png`;
        let regPhotoEl = document.getElementById('obj-reg-photo');
        regPhotoEl.src = `assets/images/photo/${photoName}.png`;
        regPhotoEl.onerror = function() { this.src = 'assets/images/photo/default.png'; };
        document.getElementById('obj-reg-name').innerText = event.name;
        squeezeObjText('obj-reg-name', 179);
    } else {
        document.getElementById('obj-epic-logo').src = `assets/images/logo/${event.logo}.png`;
        let epicPhotoEl = document.getElementById('obj-epic-photo');
        epicPhotoEl.src = `assets/images/photo/${photoName}.png`;
        epicPhotoEl.onerror = function() { this.src = 'assets/images/photo/default.png'; };
        document.getElementById('obj-epic-name').innerText = event.name;
        squeezeObjText('obj-epic-name', 179);
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
        if (typeof window.processHokQueue === 'function') window.processHokQueue(); 
    }, 4000);
};

const bcObj = new BroadcastChannel('hok_events');
bcObj.onmessage = (e) => {
    if (e.data.action === 'debug_obj') { 
        const payload = e.data.payload;
        payload.category = 'obj';
        window.hokEventQueue.push(payload); 
        if (typeof window.processHokQueue === 'function') window.processHokQueue(); 
    }
};

setInterval(fetchObjective, 500);