const currentVals = {};
const animFrames = {}; 

// ====================================================================
// 1. FUNGSI ANIMASI COUNTER (Khusus untuk Gold Selisih / Diff)
// ====================================================================
function animateValue(id, endVal, isGold, isDiff) {
    const el = document.getElementById(id);
    if (!el) return;
    
    let startVal = currentVals[id] !== undefined ? currentVals[id] : 0;
    
    if (startVal === endVal) {
        el.innerText = formatAnim(endVal, isGold, isDiff);
        return;
    }

    if (animFrames[id]) cancelAnimationFrame(animFrames[id]);

    const duration = 500; 
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = startVal + (endVal - startVal) * progress;
        currentVals[id] = current; 
        
        el.innerText = formatAnim(current, isGold, isDiff);
        
        if (progress < 1) {
            animFrames[id] = requestAnimationFrame(update);
        } else {
            currentVals[id] = endVal;
            el.innerText = formatAnim(endVal, isGold, isDiff);
        }
    }
    animFrames[id] = requestAnimationFrame(update);
}

// ====================================================================
// LOGIKA FORMAT ANGKA
// ====================================================================
function formatAnim(val, isGold, isDiff) {
    if (isGold || isDiff) {
        let s = "";
        if (val < 1000) {
            s = Math.floor(val).toString();
        } else {
            s = (val / 1000).toFixed(1) + "K";
        }
        
        if (isDiff) s = "+ " + s;
        return s;
    }
    return Math.floor(val);
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// ====================================================================
// VARIABEL LOKAL TIMER PINTAR V2 (Sistem Jangkar Presisi Tinggi)
// ====================================================================
let anchorApiTime = 0;       
let anchorLocalTime = 0;     
let lastApiTime = -1;        
let stuckCount = 0;          
let isPaused = true;         
let currentDisplayedTime = -1; 

// Detak Render UI (Mengecek setiap 100ms)
setInterval(() => {
    if (!isPaused && anchorLocalTime > 0) {
        const elapsedSeconds = Math.floor((performance.now() - anchorLocalTime) / 1000);
        const calculatedTime = anchorApiTime + elapsedSeconds;
        
        if (calculatedTime !== currentDisplayedTime && calculatedTime >= 0) {
            currentDisplayedTime = calculatedTime;
            document.getElementById('timer').innerText = formatTime(calculatedTime);
        }
    }
}, 100);

async function fetchOverlayData() {
    try {
        const [teamRes, stateRes, overlayRes, ingameRes] = await Promise.all([
            fetch('/api/hokteamlist'),
            fetch('/api/state'),
            fetch('/api/overlay_state'),
            fetch('/api/ingame_data') 
        ]);

        const teamData = await teamRes.json();
        const state = await stateRes.json();
        const overlay = await overlayRes.json();
        const ingameData = await ingameRes.json();

        // 1. Visibilitas Overlay
        const topBar = document.getElementById('top-bar');
        if (overlay.top_bar_visible) {
            topBar.classList.add('show');
        } else {
            topBar.classList.remove('show');
        }

        if (overlay.bg_visible) {
            document.body.style.backgroundImage = "url('assets/images/BG-test.png')";
            document.body.style.backgroundSize = "1920px 1080px";
            document.body.style.backgroundRepeat = "no-repeat";
        } else {
            document.body.style.backgroundImage = "";
            document.body.style.backgroundColor = "transparent";
        }

        // ====================================================================
        // 2. KOREKSI POSISI TIM OTOMATIS (SMART OVERLAY)
        // ====================================================================
        let leftAbbr = state.team_1_abbr;
        let rightAbbr = state.team_2_abbr;
        let leftScore = state.team_1_score || 0;
        let rightScore = state.team_2_score || 0;

        if (ingameData.players && ingameData.players.length > 0) {
            const camp1Players = ingameData.players.filter(p => p.Camp === 1);
            const camp2Players = ingameData.players.filter(p => p.Camp === 2);

            const findMajorityTeam = (playerList) => {
                const counts = {};
                playerList.forEach(p => {
                    const nick = p.NickName || "";
                    if(nick.includes('.')) {
                        const abbr = nick.split('.')[0].toUpperCase();
                        counts[abbr] = (counts[abbr] || 0) + 1;
                    }
                });
                let maxCount = 0;
                let majorTeam = "";
                for (const team in counts) {
                    if (counts[team] > maxCount) {
                        maxCount = counts[team];
                        majorTeam = team;
                    }
                }
                return majorTeam;
            };

            const apiCamp1Abbr = findMajorityTeam(camp1Players);
            const apiCamp2Abbr = findMajorityTeam(camp2Players);

            if (apiCamp1Abbr || apiCamp2Abbr) {
                leftAbbr = apiCamp1Abbr || leftAbbr;
                rightAbbr = apiCamp2Abbr || rightAbbr;

                if (apiCamp1Abbr === state.team_2_abbr && apiCamp2Abbr === state.team_1_abbr) {
                    leftScore = state.team_2_score || 0;
                    rightScore = state.team_1_score || 0;
                } else {
                    if (apiCamp1Abbr === state.team_1_abbr) leftScore = state.team_1_score || 0;
                    else if (apiCamp1Abbr === state.team_2_abbr) leftScore = state.team_2_score || 0;
                    
                    if (apiCamp2Abbr === state.team_2_abbr) rightScore = state.team_2_score || 0;
                    else if (apiCamp2Abbr === state.team_1_abbr) rightScore = state.team_1_score || 0;
                }
            }
        }

        if(leftAbbr) {
            const hLogo = document.getElementById('home-logo');
            const newSrc = `assets/images/logo/${leftAbbr}.png`;
            if (hLogo.getAttribute('src') !== newSrc) hLogo.src = newSrc;
        }
        if(rightAbbr) {
            const aLogo = document.getElementById('away-logo');
            const newSrc = `assets/images/logo/${rightAbbr}.png`;
            if (aLogo.getAttribute('src') !== newSrc) aLogo.src = newSrc;
        }

        document.getElementById('home-score').innerText = leftScore;
        document.getElementById('away-score').innerText = rightScore;
        document.getElementById('home-abbr-ingame').innerText = leftAbbr || "";
        document.getElementById('away-abbr-ingame').innerText = rightAbbr || "";

        // 3. API Data
        if (!teamData.response || !teamData.response.HOKTeamList) return;
        
        const blue = teamData.response.HOKTeamList[0] || {};
        const red = teamData.response.HOKTeamList[1] || {};

        document.getElementById('home-kill').innerText = blue.K || 0;
        document.getElementById('away-kill').innerText = red.K || 0;

        document.getElementById('home-dragon').innerText = blue.KillDragonNumber || 0;
        document.getElementById('away-dragon').innerText = red.KillDragonNumber || 0;

        document.getElementById('home-tower').innerText = blue.KillTowerNumber || 0;
        document.getElementById('away-tower').innerText = red.KillTowerNumber || 0;

        // ====================================================================
        // 4. LOGIKA TIMER SISTEM JANGKAR
        // ====================================================================
        const apiTime = blue.CurrentGameTime || 0;

        if (apiTime > 0) {
            if (apiTime === lastApiTime) {
                stuckCount++;
                if (stuckCount >= 5) {
                    isPaused = true;
                }
            } else {
                stuckCount = 0;
                
                if (isPaused) {
                    isPaused = false;
                    anchorApiTime = apiTime;
                    anchorLocalTime = performance.now();
                } else {
                    const elapsedSeconds = Math.floor((performance.now() - anchorLocalTime) / 1000);
                    const calculatedTime = anchorApiTime + elapsedSeconds;
                    
                    if (anchorLocalTime === 0 || Math.abs(calculatedTime - apiTime) > 3) {
                        anchorApiTime = apiTime;
                        anchorLocalTime = performance.now();
                    }
                }
            }
        } else {
            isPaused = true;
            anchorApiTime = 0;
            anchorLocalTime = 0;
            currentDisplayedTime = -1;
            document.getElementById('timer').innerText = "00:00";
        }
        
        lastApiTime = apiTime;

        // ====================================================================
        // 5. Animasi Gold & Diff (Total = Cut/Langsung, Diff = Counter)
        // ====================================================================
        const homeGold = blue.Gold || 0;
        const awayGold = red.Gold || 0;

        // Terapkan efek CUT (Langsung ganti) untuk Total Gold
        document.getElementById('home-gold').innerText = formatAnim(homeGold, true, false);
        document.getElementById('away-gold').innerText = formatAnim(awayGold, true, false);

        const diff = homeGold - awayGold;
        const homeDiffEl = document.getElementById('home-diff');
        const awayDiffEl = document.getElementById('away-diff');

        if (diff > 0) {
            homeDiffEl.style.opacity = 1;
            awayDiffEl.style.opacity = 0;
            // Terapkan efek counter untuk Gold Diff (Selisih)
            animateValue('home-diff', diff, false, true);
        } else if (diff < 0) {
            homeDiffEl.style.opacity = 0;
            awayDiffEl.style.opacity = 1;
            // Terapkan efek counter untuk Gold Diff (Selisih)
            animateValue('away-diff', Math.abs(diff), false, true);
        } else {
            homeDiffEl.style.opacity = 0;
            awayDiffEl.style.opacity = 0;
        }

    } catch (e) {}
}

// Loop Data API setiap 500ms
setInterval(fetchOverlayData, 500);