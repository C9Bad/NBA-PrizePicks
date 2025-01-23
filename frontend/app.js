const gameSelect = document.getElementById("gameSelect");
const playerSelect = document.getElementById("playerSelect");
const betForm = document.getElementById("betForm");
const trackerQueue = document.getElementById("trackerQueue");
const teamDisplay = document.getElementById("teamDisplay");
const awayPlayers = document.getElementById("awayPlayers");
const homePlayers = document.getElementById("homePlayers");
const activeTrackers = new Map();
const fab = document.getElementById("fab");
const overlay = document.querySelector('.overlay');

async function loadPlayers(gameId) {
    try {
        const res = await fetch(`http://localhost:8000/games/${gameId}/players`);
        const players = await res.json();

        playerSelect.innerHTML = '<option value="">Select Player</option>' + 
            [...players.homeTeamPlayers, ...players.awayTeamPlayers]
            .map(player => `<option value="${player}">${player}</option>`)
            .join('');

        awayPlayers.innerHTML = `
            <h4>Away Team Players</h4>
            <ul>${players.awayTeamPlayers.map(p => `<li>${p}</li>`).join('')}</ul>
        `;
        homePlayers.innerHTML = `
            <h4>Home Team Players</h4>
            <ul>${players.homeTeamPlayers.map(p => `<li>${p}</li>`).join('')}</ul>
        `;
        teamDisplay.style.display = 'block';

    } catch (err) {
        console.error("Error loading players:", err);
    }
}

async function loadGames() {
    try {
        const res = await fetch("http://localhost:8000/games");
        const games = await res.json();

        gameSelect.innerHTML = games.length ? "" : 
            `<option value="">No games found for today</option>`;

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

        gameSelect.addEventListener('change', async (e) => {
            if (e.target.value) {
                await loadPlayers(e.target.value);
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

fab.addEventListener('click', () => {
    betForm.classList.toggle('visible');
    overlay.classList.toggle('visible');
    if (betForm.classList.contains('visible')) {
        betForm.reset();
    }
});

overlay.addEventListener('click', () => {
    betForm.classList.remove('visible');
    overlay.classList.remove('visible');
});

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

loadGames();