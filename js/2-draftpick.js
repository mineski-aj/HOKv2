// KEDUANYA SEKARANG IDENTIK (Dimulai dari Clash Lane di Kotak ke-0)
const HOME_ROLES = ["CLASH LANE", "JUNGLING", "MID LANE", "FARM LANE", "ROAMING"];
const AWAY_ROLES = ["CLASH LANE", "JUNGLING", "MID LANE", "FARM LANE", "ROAMING"];

const HOME_ROLE_ICONS = ["clash-lane", "jungler", "mid-lane", "farm-lane", "roamer"];
const AWAY_ROLE_ICONS = ["clash-lane", "jungler", "mid-lane", "farm-lane", "roamer"];

// 18 Step HOK Draft
const DRAFT_SEQUENCE = [
    { type: 'B', camp: 1 }, { type: 'B', camp: 2 }, { type: 'B', camp: 1 }, { type: 'B', camp: 2 }, 
    { type: 'P', camp: 1 }, { type: 'P', camp: 2 }, { type: 'P', camp: 2 }, { type: 'P', camp: 1 }, 
    { type: 'P', camp: 1 }, { type: 'P', camp: 2 }, 
    { type: 'B', camp: 2 }, { type: 'B', camp: 1 }, { type: 'B', camp: 2 }, { type: 'B', camp: 1 }, 
    { type: 'P', camp: 2 }, { type: 'P', camp: 1 }, { type: 'P', camp: 1 }, { type: 'P', camp: 2 }  
];

let currentStepCount = -1;

// Database CSV dan Tracker Animasi
let csvDatabase = {};
let revealedHeroes = {};
let playedHeroAudio = {}; // Menghalang audio daripada berulang kali dimainkan

// Fungsi Mengambil Data CSV dari API Server
async function loadCSVDatabase() {
    try {
        const res = await fetch('/api/database_csv');
        if (res.ok) {
            const text = await res.text();
            const lines = text.split(/\r?\n/);
            if(lines.length < 2) return;

            const header = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            // Pencarian Kolom Dinamis (Fallback jika header beda nama)
            let noIdx = header.indexOf('no'); if(noIdx === -1) noIdx = 9;  // Kolom J
            let heroIdx = header.indexOf('hero'); if(heroIdx === -1) heroIdx = 10; // Kolom K
            let banRIdx = header.indexOf('ban rate'); if(banRIdx === -1) banRIdx = 12; // Kolom M
            let pickRIdx = header.indexOf('pick rate'); if(pickRIdx === -1) pickRIdx = 13; // Kolom N
            let winRIdx = header.indexOf('win rate'); if(winRIdx === -1) winRIdx = 14; // Kolom O

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                if (cols.length > winRIdx) {
                    let id = parseInt(cols[noIdx]);
                    if (!isNaN(id)) {
                        csvDatabase[id] = {
                            name: cols[heroIdx] || "HERO",
                            banRate: cols[banRIdx] || "0%",
                            pickRate: cols[pickRIdx] || "0%",
                            winRate: cols[winRIdx] || "0%"
                        };
                    }
                }
            }
        }
    } catch (e) {}
}

function initUI() {
    loadCSVDatabase(); // Muat CSV di awal
    
    let homeBanHTML = '', awayBanHTML = '';
    for(let i=0; i<4; i++) {
        homeBanHTML += `<div class="ban-box"><img class="ban-hero" id="hb-${i}" src=""></div>`;
        awayBanHTML += `<div class="ban-box"><img class="ban-hero" id="ab-${i}" src=""></div>`;
    }
    document.getElementById('home-bans').innerHTML = homeBanHTML;
    document.getElementById('away-bans').innerHTML = awayBanHTML;

    let homePlayerHTML = '', awayPlayerHTML = '';
    for(let i=0; i<5; i++) {
        homePlayerHTML += createPlayerBox(i, 'home');
        awayPlayerHTML += createPlayerBox(i, 'away');
    }
    document.getElementById('home-players').innerHTML = homePlayerHTML;
    document.getElementById('away-players').innerHTML = awayPlayerHTML;

    for(let i=0; i<5; i++) {
        let hX = (i * 165) + 82.5; 
        let aX = 1920 - (i * 165) - 82.5; 
        
        let hRoleImg = document.createElement('img');
        hRoleImg.className = 'role-icon';
        hRoleImg.style.left = `${hX}px`;
        hRoleImg.id = `hr-icon-${i}`;
        document.getElementById('front-overlay').appendChild(hRoleImg);

        let aRoleImg = document.createElement('img');
        aRoleImg.className = 'role-icon';
        aRoleImg.style.left = `${aX}px`;
        aRoleImg.id = `ar-icon-${i}`;
        document.getElementById('front-overlay').appendChild(aRoleImg);
    }
    
    // PEMOTONGAN FRAME DAN FADE OUT VIDEO MENGHILANGKAN FRAME HITAM
    const stateVid = document.getElementById('state-vid');
    if(stateVid) {
        stateVid.style.transition = "opacity 0.5s ease-out"; 
        
        stateVid.ontimeupdate = function() {
            if (this.duration > 0 && this.currentTime >= (this.duration - 0.2)) {
                this.style.opacity = 0;
            }
        };

        stateVid.onended = function() {
            this.style.display = "none";
        };
    }
}

// Struktur kotak ditambahkan Stats Box
function createPlayerBox(index, side) {
    return `
        <div class="player-box" id="${side}-box-${index}">
            <img class="player-photo" id="${side}-photo-${index}" src="assets/images/photo/default.png" onerror="this.src='assets/images/photo/default.png'">
            <img class="hero-pick" id="${side}-hero-${index}" src="">
            
            <!-- ANIMASI STATS HERO -->
            <div class="stats-box" id="${side}-statsbox-${index}">
                <div class="stats-hero-name" id="${side}-sname-${index}">HERO</div>
                <div class="stats-rates-container">
                    <div class="stats-rate-value" id="${side}-sbr-${index}">0%</div>
                    <div class="stats-rate-value" id="${side}-spr-${index}">0%</div>
                    <div class="stats-rate-value" id="${side}-swr-${index}">0%</div>
                </div>
            </div>

            <img class="player-front" id="${side}-front-${index}" src="assets/images/0.draft-phase/standby-front.png">
            <div class="player-name" id="${side}-name-${index}">PLAYER</div>
        </div>
    `;
}

// FUNGSI TRIGGER ANIMASI STATS & AUDIO
function triggerStatsAnimation(side, index, heroId) {
    const statsBox = document.getElementById(`${side}-statsbox-${index}`);
    const nameEl = document.getElementById(`${side}-sname-${index}`);
    const brEl = document.getElementById(`${side}-sbr-${index}`);
    const prEl = document.getElementById(`${side}-spr-${index}`);
    const wrEl = document.getElementById(`${side}-swr-${index}`);
    
    // Ambil data dari CSV Cache
    const data = csvDatabase[heroId] || { name: "UNKNOWN", banRate: "-", pickRate: "-", winRate: "-" };
    
    nameEl.innerText = data.name;
    brEl.innerText = data.banRate;
    prEl.innerText = data.pickRate;
    wrEl.innerText = data.winRate;
    
    // Animasi IN setelah 1 detik
    setTimeout(() => {
        statsBox.classList.add('show-stats');
        
        // Animasi OUT setelah 4 detik (total durasi tampil 4 detik)
        setTimeout(() => {
            statsBox.classList.remove('show-stats');
        }, 4000);
    }, 1000);
}


async function fetchDraftData() {
    try {
        const [stateRes, draftRes] = await Promise.all([ fetch('/api/state'), fetch('/api/draft_phase') ]);
        const state = await stateRes.json();
        const draft = await draftRes.json();

        // Update Text & Logo
        document.getElementById('phase-text').innerText = state.draft_phase_text || "REGULAR SEASON";
        document.getElementById('match-text').innerText = state.draft_match_text || "MATCH 1 - BO 5";
        document.getElementById('home-score').innerText = state.team_1_score || 0;
        document.getElementById('away-score').innerText = state.team_2_score || 0;
        document.getElementById('home-abbr').innerText = state.team_1_abbr || "HOME";
        document.getElementById('away-abbr').innerText = state.team_2_abbr || "AWAY";

        if(state.team_1_abbr) document.getElementById('home-logo').src = `assets/images/logo/${state.team_1_abbr}.png`;
        if(state.team_2_abbr) document.getElementById('away-logo').src = `assets/images/logo/${state.team_2_abbr}.png`;

        const mode = state.draft_mode || 'API';
        const hSwap = state.home_role_swap || [];
        const aSwap = state.away_role_swap || [];
        
        for(let i=0; i<5; i++) {
            let hPlayerName = state.team_1_players ? (state.team_1_players[i] || `PLAYER ${i+1}`) : `PLAYER ${i+1}`;
            let aPlayerName = state.team_2_players ? (state.team_2_players[i] || `PLAYER ${i+1}`) : `PLAYER ${i+1}`;
            
            document.getElementById(`home-name-${i}`).innerText = hPlayerName;
            document.getElementById(`away-name-${i}`).innerText = aPlayerName;
            document.getElementById(`home-photo-${i}`).src = `assets/images/photo/${hPlayerName}.png`;
            document.getElementById(`away-photo-${i}`).src = `assets/images/photo/${aPlayerName}.png`;
            document.getElementById(`hr-icon-${i}`).src = `assets/images/role/${HOME_ROLE_ICONS[i]}.png`;
            document.getElementById(`ar-icon-${i}`).src = `assets/images/role/${AWAY_ROLE_ICONS[i]}.png`;
        }

        let bpList = [];
        let currentLength = 0;

        if (mode === 'API') {
            let apiList = (draft.response && draft.response.BanPickList) ? draft.response.BanPickList : [];
            currentLength = apiList.filter(x => x.HeroID > 0).length;
            for(let i=0; i<18; i++) {
                let heroId = (apiList[i] && apiList[i].HeroID > 0) ? apiList[i].HeroID : 0;
                bpList.push({ HeroID: heroId, IsBan: DRAFT_SEQUENCE[i].type === 'B', Camp: DRAFT_SEQUENCE[i].camp });
            }
        } else {
            let hBans = state.home_ban_override || [];
            let aBans = state.away_ban_override || [];
            const MAP = [
                { arr: 'hb', idx: 0 }, { arr: 'ab', idx: 0 }, { arr: 'hb', idx: 1 }, { arr: 'ab', idx: 1 }, 
                { arr: 'hp', idx: 0 }, { arr: 'ap', idx: 0 }, { arr: 'ap', idx: 1 }, { arr: 'hp', idx: 1 },
                { arr: 'hp', idx: 2 }, { arr: 'ap', idx: 2 }, 
                { arr: 'ab', idx: 2 }, { arr: 'hb', idx: 2 }, { arr: 'ab', idx: 3 }, { arr: 'hb', idx: 3 }, 
                { arr: 'ap', idx: 3 }, { arr: 'hp', idx: 3 }, { arr: 'hp', idx: 4 }, { arr: 'ap', idx: 4 }
            ];

            for(let i=0; i<18; i++) {
                let m = MAP[i];
                let heroId = 0;
                if (m.arr === 'hb') heroId = hBans[m.idx];
                if (m.arr === 'ab') heroId = aBans[m.idx];
                if (m.arr === 'hp') heroId = hSwap[m.idx];
                if (m.arr === 'ap') heroId = aSwap[m.idx];

                heroId = parseInt(heroId) || 0;
                bpList.push({ HeroID: heroId, IsBan: DRAFT_SEQUENCE[i].type === 'B', Camp: DRAFT_SEQUENCE[i].camp });

                if (heroId > 0 && currentLength === i) currentLength = i + 1;
            }
        }

        // ==============================================
        // RENDER GAMBAR & CEK HERO BARU REVEAL
        // ==============================================
        let hBanIdx = 0, aBanIdx = 0, hPickIdx = 0, aPickIdx = 0;
        
        for(let i=0; i<18; i++) {
            const act = DRAFT_SEQUENCE[i];
            const eventData = bpList[i];
            
            if (act.type === 'B') {
                let bIdx = act.camp === 1 ? hBanIdx++ : aBanIdx++;
                let side = act.camp === 1 ? 'hb' : 'ab';
                let imgEl = document.getElementById(`${side}-${bIdx}`);
                
                if (eventData && eventData.HeroID > 0) {
                    imgEl.src = `assets/images/hero-draftpick/${eventData.HeroID}_TINGGI.png`;
                    imgEl.classList.add('banned');
                    setTimeout(() => imgEl.classList.add('grayscale'), 2000); 
                } else {
                    imgEl.classList.remove('banned', 'grayscale');
                    imgEl.src = ""; 
                }
            } else {
                let pIdx = act.camp === 1 ? hPickIdx++ : aPickIdx++;
                let side = act.camp === 1 ? 'home' : 'away';
                let heroIdToDisplay = eventData ? eventData.HeroID : 0;
                
                if ((mode === 'API' && currentLength >= 18) || mode === 'MANUAL') { 
                    if (act.camp === 1 && hSwap[pIdx]) heroIdToDisplay = hSwap[pIdx];
                    if (act.camp === 2 && aSwap[pIdx]) heroIdToDisplay = aSwap[pIdx];
                }

                let imgEl = document.getElementById(`${side}-hero-${pIdx}`);
                let boxEl = document.getElementById(`${side}-box-${pIdx}`);
                let frontEl = document.getElementById(`${side}-front-${pIdx}`);

                const isDoublePickStart = (currentLength === 5 || currentLength === 7 || currentLength === 15);
                const isActivePick = (i === currentLength) || (isDoublePickStart && i === currentLength + 1);

                if (isActivePick) {
                    boxEl.classList.add('picking');
                    frontEl.src = "assets/images/0.draft-phase/pick-front.png";
                } else {
                    boxEl.classList.remove('picking');
                    frontEl.src = "assets/images/0.draft-phase/standby-front.png";
                }

                // EKSEKUSI ANIMASI STATS & AUDIO JIKA HERO TERISI (TER-REVEAL) PERTAMA KALI
                if (heroIdToDisplay > 0) {
                    let slotKey = `${side}-${pIdx}`;
                    if (revealedHeroes[slotKey] !== heroIdToDisplay) {
                        revealedHeroes[slotKey] = heroIdToDisplay; 
                        triggerStatsAnimation(side, pIdx, heroIdToDisplay); 
                    }

                    // --- LOGIKA PEMUTARAN AUDIO HERO (HANYA PICK) ---
                    if (playedHeroAudio[slotKey] !== heroIdToDisplay) {
                        playedHeroAudio[slotKey] = heroIdToDisplay;
                        
                        let heroVoice = new Audio(`assets/audio/heroes/${heroIdToDisplay}.mp3`);
                        heroVoice.volume = 0.8; // Volume bisa disesuaikan
                        heroVoice.play().catch(err => console.log("Audio hero belum tersedia di assets/audio/heroes/: " + err));
                    }

                    imgEl.src = `assets/images/hero-draftpick/${heroIdToDisplay}_TINGGI.png`;
                    imgEl.classList.add('picked');
                } else {
                    // Reset kunci jika hero kosong (misal tombol Clear ditekan)
                    revealedHeroes[`${side}-${pIdx}`] = 0;
                    playedHeroAudio[`${side}-${pIdx}`] = 0;
                    imgEl.classList.remove('picked');
                    imgEl.src = "";
                }
            }
        }

        // ==============================================
        // LOGIKA WEBM PENGGANTI TIMER
        // ==============================================
        const stateVid = document.getElementById('state-vid');

        if (currentLength !== currentStepCount) {
            currentStepCount = currentLength;

            if (currentLength < 18) {
                const isSecondOfDoublePick = (currentLength === 6 || currentLength === 8 || currentLength === 16);
                
                if (!isSecondOfDoublePick) {
                    const currentAct = DRAFT_SEQUENCE[currentLength];
                    const actType = currentAct.type === 'B' ? 'BANNING' : 'PICKING';
                    const campSide = currentAct.camp === 1 ? 'L' : 'R';
                    const vidName = `${actType}_${campSide}.webm`;
                    
                    stateVid.src = `assets/webm/draftpick/${vidName}`;
                    stateVid.style.opacity = 1;
                    stateVid.style.display = "block";
                    stateVid.play();
                }
            } else {
                stateVid.style.display = "none";
                stateVid.src = "";
            }
        }

    } catch (e) { }
}

initUI();
setInterval(fetchDraftData, 500);