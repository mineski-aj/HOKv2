const ROLE_ICONS = ["clash-lane", "jungler", "mid-lane", "farm-lane", "roamer"];

// Urutan Base HOK (Selalu Camp 1 vs Camp 2)
const DRAFT_SEQUENCE_BASE = [
    { type: 'B', c: 1 }, { type: 'B', c: 2 }, { type: 'B', c: 1 }, { type: 'B', c: 2 }, 
    { type: 'P', c: 1 }, { type: 'P', c: 2 }, { type: 'P', c: 2 }, { type: 'P', c: 1 }, 
    { type: 'P', c: 1 }, { type: 'P', c: 2 }, 
    { type: 'B', c: 2 }, { type: 'B', c: 1 }, { type: 'B', c: 2 }, { type: 'B', c: 1 }, 
    { type: 'P', c: 2 }, { type: 'P', c: 1 }, { type: 'P', c: 1 }, { type: 'P', c: 2 }  
];

let revealedHeroes = {};

function initUI() {
    let hbHtml = '', abHtml = '';
    for(let i=0; i<4; i++) {
        hbHtml += `<div class="ban-box" id="hb-box-${i}"><img class="ban-hero" id="hb-${i}" src=""><div class="ban-fg"></div></div>`;
        abHtml += `<div class="ban-box" id="ab-box-${i}"><img class="ban-hero" id="ab-${i}" src=""><div class="ban-fg"></div></div>`;
    }
    document.getElementById('home-bans').innerHTML = hbHtml;
    document.getElementById('away-bans').innerHTML = abHtml;

    let hpHtml = '', apHtml = '';
    for(let i=0; i<5; i++) {
        const box = (side, role) => `
            <div class="pick-box" id="${side}-box-${i}">
                <div class="pick-bg-mask">
                    <img class="pick-photo" id="${side}-photo-${i}" src="assets/images/photo/default.png" onerror="this.src='assets/images/photo/default.png'">
                </div>
                <img class="pick-hero" id="${side}-hero-${i}" src="">
                <div class="pick-fg"></div>
                <img class="role-icon" src="assets/images/role/${role}.png">
                <div class="player-name" id="${side}-name-${i}">PLAYER</div>
            </div>`;
        hpHtml += box('home', ROLE_ICONS[i]);
        apHtml += box('away', ROLE_ICONS[i]);
    }
    document.getElementById('home-picks').innerHTML = hpHtml;
    document.getElementById('away-picks').innerHTML = apHtml;
}

async function fetchDraftLED() {
    try {
        const [stateRes, draftRes] = await Promise.all([fetch('/api/state'), fetch('/api/draft_phase')]);
        const state = await stateRes.json();
        const draft = await draftRes.json();

        // 1. Tentukan Siapa First Pick (Diambil dari Dashboard)
        const firstPick = state.draft_first_pick || 'HOME';
        
        // 2. PEMBALIKAN HANYA PADA TARGET RENDER VISUAL KE LED (KIRI/KANAN)
        let draftSeq = [];
        if (firstPick === 'HOME') {
            // Normal: Camp 1 (First Pick) dirender di Home (Kiri)
            draftSeq = DRAFT_SEQUENCE_BASE.map(d => ({ type: d.type, targetSide: d.c === 1 ? 'home' : 'away' }));
        } else {
            // Flip Visual: Camp 1 (First Pick) dirender di Away (Kanan)
            draftSeq = DRAFT_SEQUENCE_BASE.map(d => ({ type: d.type, targetSide: d.c === 1 ? 'away' : 'home' }));
        }

        // Hide Photo & Pick Box Background (Untuk POV Cam Mode)
        const hidePick = state.draft_hide_pick || false;
        const canvasEl = document.getElementById('canvas');
        if (hidePick) {
            canvasEl.classList.add('hide-pov-bg');
        } else {
            canvasEl.classList.remove('hide-pov-bg');
        }

        // Load Nama & Foto Independen Khusus LED
        for(let i=0; i<5; i++) {
            let hPlayer = state.led_home_players ? state.led_home_players[i] : "";
            let aPlayer = state.led_away_players ? state.led_away_players[i] : "";
            
            if (!hPlayer) hPlayer = `PLAYER ${i+1}`;
            if (!aPlayer) aPlayer = `PLAYER ${i+1}`;

            document.getElementById(`home-name-${i}`).innerText = hPlayer;
            document.getElementById(`away-name-${i}`).innerText = aPlayer;
            document.getElementById(`home-photo-${i}`).src = `assets/images/photo/${hPlayer}.png`;
            document.getElementById(`away-photo-${i}`).src = `assets/images/photo/${aPlayer}.png`;
        }

        const mode = state.draft_mode || 'API';
        let bpList = [];
        let currentLength = 0;

        if (mode === 'API') {
            let apiList = (draft.response && draft.response.BanPickList) ? draft.response.BanPickList : [];
            currentLength = apiList.filter(x => x.HeroID > 0).length;
            for(let i=0; i<18; i++) {
                let heroId = (apiList[i] && apiList[i].HeroID > 0) ? apiList[i].HeroID : 0;
                bpList.push(heroId);
            }
        } else {
            let hBans = state.home_ban_override || [];
            let aBans = state.away_ban_override || [];
            let hSwap = state.home_role_swap || [];
            let aSwap = state.away_role_swap || [];
            
            // 3. MAPPING INPUT DASHBOARD MUTLAK (Tidak boleh dibalik!)
            // Kotak 'HOME' di Dashboard selalu mewakili First Pick (Camp 1) 
            // Kotak 'AWAY' di Dashboard selalu mewakili Second Pick (Camp 2)
            const MAP = [
                {arr:hBans,i:0}, {arr:aBans,i:0}, {arr:hBans,i:1}, {arr:aBans,i:1}, 
                {arr:hSwap,i:0}, {arr:aSwap,i:0}, {arr:aSwap,i:1}, {arr:hSwap,i:1}, {arr:hSwap,i:2}, {arr:aSwap,i:2}, 
                {arr:aBans,i:2}, {arr:hBans,i:2}, {arr:aBans,i:3}, {arr:hBans,i:3}, 
                {arr:aSwap,i:3}, {arr:hSwap,i:3}, {arr:hSwap,i:4}, {arr:aSwap,i:4}
            ];

            for(let i=0; i<18; i++) {
                let val = parseInt(MAP[i].arr[MAP[i].i]) || 0;
                bpList.push(val);
                if (val > 0 && currentLength === i) currentLength = i + 1;
            }
        }

        // 4. Render ke Layar
        let hbIdx = 0, abIdx = 0, hpIdx = 0, apIdx = 0;
        
        for(let i=0; i<18; i++) {
            const act = draftSeq[i];
            const heroId = bpList[i];
            const isActive = (i === currentLength) || ((currentLength===5||currentLength===7||currentLength===15) && i === currentLength+1);
            
            if (act.type === 'B') {
                let bIdx = act.targetSide === 'home' ? hbIdx++ : abIdx++;
                let side = act.targetSide === 'home' ? 'hb' : 'ab';
                let imgEl = document.getElementById(`${side}-${bIdx}`);
                
                if (imgEl) {
                    if (heroId > 0) {
                        imgEl.src = `assets/images/hero_realteamfight/${heroId}_KOTAK.png`;
                        if (revealedHeroes[`${side}-${bIdx}`] !== heroId) {
                            revealedHeroes[`${side}-${bIdx}`] = heroId;
                            
                            imgEl.classList.remove('banned', 'grayscale'); 
                            setTimeout(() => imgEl.classList.add('banned'), 50);
                            setTimeout(() => imgEl.classList.add('grayscale'), 2000); 
                        }
                    } else {
                        revealedHeroes[`${side}-${bIdx}`] = 0;
                        imgEl.classList.remove('banned', 'grayscale');
                        imgEl.src = ""; 
                    }
                }
            } else {
                let pIdx = act.targetSide === 'home' ? hpIdx++ : apIdx++;
                let side = act.targetSide;
                
                let imgEl = document.getElementById(`${side}-hero-${pIdx}`);
                let boxEl = document.getElementById(`${side}-box-${pIdx}`);

                if (imgEl && boxEl) {
                    if (isActive) boxEl.classList.add('picking');
                    else boxEl.classList.remove('picking');

                    if (heroId > 0) {
                        imgEl.src = `assets/images/hero-draftpick/${heroId}_TINGGI.png`;
                        imgEl.classList.add('picked');
                    } else {
                        imgEl.classList.remove('picked');
                        imgEl.src = "";
                    }
                }
            }
        }
    } catch(e) {}
}

initUI();
setInterval(fetchDraftLED, 500);