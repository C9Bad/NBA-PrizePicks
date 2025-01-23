const gameSelect = document.getElementById("gameSelect");
const playerSelect = document.getElementById("playerSelect");
const betForm = document.getElementById("betForm");
const trackerQueue = document.getElementById("trackerQueue");
const activeTrackers = new Map();
const fab = document.getElementById("fab");
const overlay = document.querySelector('.overlay');
const awayTeamName = document.getElementById("awayTeamName");
const awayTeamScore = document.getElementById("awayTeamScore");
const homeTeamName = document.getElementById("homeTeamName");
const homeTeamScore = document.getElementById("homeTeamScore");
const gameStatus = document.getElementById("gameStatus");
const gameClock = document.getElementById("gameClock");
const gamePeriod = document.getElementById("gamePeriod");
const awayTeamLogo = document.getElementById("awayTeamLogo");
const homeTeamLogo = document.getElementById("homeTeamLogo");

async function loadPlayers(gameId) {
    try {
        const res = await fetch(`http://localhost:8000/games/${gameId}/players`);
        const players = await res.json();

        playerSelect.innerHTML = '<option value="">Select Player</option>' + 
            [...players.homeTeamPlayers, ...players.awayTeamPlayers]
            .map(player => `<option value="${player}">${player}</option>`)
            .join('');
    } catch (err) {
        console.error("Error loading players:", err);
    }
}

function getTeamLogoUrl(abbreviation) {
    return `https://a.espncdn.com/i/teamlogos/nba/500/${abbreviation}.png`;
}

function updateGameDisplay(game) {
    // Update team names and scores
    awayTeamName.textContent = game.awayTeam;
    awayTeamScore.textContent = game.awayScore;
    homeTeamName.textContent = game.homeTeam;
    homeTeamScore.textContent = game.homeScore;

    // Update logos
    awayTeamLogo.src = getTeamLogoUrl(game.awayAbbreviation);
    homeTeamLogo.src = getTeamLogoUrl(game.homeAbbreviation);

    // Update game status and time
    gameStatus.textContent = {
        1: "Scheduled",
        2: "🟢 LIVE",
        3: "🏁 Final"
    }[game.status] || "Unknown";
    gameClock.textContent = game.gameClock || '-';
    gamePeriod.textContent = `${game.period}Q` || '-';
}

async function loadGames() {
    try {
        const res = await fetch("http://localhost:8000/games");
        const games = await res.json();
        window.games = games;

        gameSelect.innerHTML = games.length ? "" : 
            `<option value="">No games found for today</option>`;

        // Populate game select dropdown
        games.forEach(g => {
            const option = document.createElement("option");
            option.value = g.gameId;
            const statusText = {
                1: "Scheduled",
                2: "🟢 LIVE",
                3: "🏁 Final"
            }[g.status] || "Unknown";

            option.textContent = `${statusText} | ${g.awayTeam} vs ${g.homeTeam}`;
            gameSelect.appendChild(option);
        });

        // Show first game by default
        if (games.length > 0) {
            updateGameDisplay(games[0]);
            await loadPlayers(games[0].gameId);
        }

        // Handle game selection changes
        gameSelect.addEventListener('change', async (e) => {
            const selectedGame = window.games.find(g => g.gameId === e.target.value);
            if (selectedGame) {
                updateGameDisplay(selectedGame);
                await loadPlayers(selectedGame.gameId);
            }
        });

    } catch (err) {
        console.error("Error fetching games:", err);
    }
}

function createTrackerElement(betData) {
    const card = document.createElement("div");
    card.className = "tracker-card";
    const betTypeDisplay = betData.bet_type.split('+')
        .map(stat => stat.charAt(0).toUpperCase() + stat.slice(1))
        .join(' + ');

    card.innerHTML = `
        <div>
            <h3>${betData.player}</h3>
            <div class="status-indicator ${betData.status === 'Active' ? 'live' : 'benched'}">
                ${betData.status}
            </div>
            <div>${betTypeDisplay} | Target: ${betData.target}</div>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min((betData.current_total / betData.target) * 100, 100)}%"></div>
        </div>
        <div>
            <div>${betData.current_total.toFixed(1)}/${betData.target}</div>
            <div>${betData.progress}</div>
        </div>
        <button class="remove-btn">×</button>
    `;

    card.querySelector('.remove-btn').addEventListener('click', () => {
        card.remove();
        const intervalId = activeTrackers.get(card);
        if (intervalId) clearInterval(intervalId);
        activeTrackers.delete(card);
    });

    return card;
}

async function addTracker(betData) {
    const card = createTrackerElement(await fetchBetStatus(betData));
    trackerQueue.appendChild(card);

    const intervalId = setInterval(async () => {
        const newData = await fetchBetStatus(betData);
        card.replaceWith(createTrackerElement(newData));
    }, 5000);

    activeTrackers.set(card, intervalId);
}

async function fetchBetStatus(betData) {
    try {
        const res = await fetch("http://localhost:8000/track", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(betData)
        });
        return await res.json();
    } catch (err) {
        console.error("Error fetching bet status:", err);
        return { error: "Failed to fetch updates" };
    }
}

// Floating action button handlers
fab.addEventListener('click', () => {
    betForm.classList.toggle('visible');
    overlay.classList.toggle('visible');
    betForm.classList.contains('visible') && betForm.reset();
});

overlay.addEventListener('click', () => {
    betForm.classList.remove('visible');
    overlay.classList.remove('visible');
});

// Form submission handler
betForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(betForm);

    const betData = {
        player: formData.get("player"),
        bet_type: document.getElementById("betType").value,
        target: parseFloat(formData.get("target")),
        game_id: gameSelect.value
    };

    if (!betData.game_id) {
        alert("Please select a valid game.");
        return;
    }

    addTracker(betData);
    betForm.reset();
    betForm.classList.remove('visible');
    overlay.classList.remove('visible');
});

// Initial load
loadGames();