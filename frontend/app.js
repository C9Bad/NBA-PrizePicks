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
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");

const quarterButtons = document.querySelectorAll('.quarter-button');
const quarterContents = document.querySelectorAll('.quarter-content');

const teamLogoCache = new Map();
const playerImageCache = new Map();

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

async function getTeamLogo(abbreviation) {
    if (teamLogoCache.has(abbreviation)) {
        return teamLogoCache.get(abbreviation);
    }
    
    if (abbreviation == "UTA")
        abbreviation = "UTAH";

    const logoUrl = `https://a.espncdn.com/i/teamlogos/nba/500/${abbreviation}.png`;
    teamLogoCache.set(abbreviation, logoUrl);
    return logoUrl;
}

tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        // Remove 'active' from all buttons/contents
        tabButtons.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((tc) => tc.classList.remove("active"));

        // Add 'active' to the clicked button and associated content
        btn.classList.add("active");
        const targetTab = btn.getAttribute("data-tab");
        document.getElementById(targetTab).classList.add("active");

        // Fetch play-by-play data when the Play-by-Play tab is clicked
        if (targetTab === "playTab") {
            const gameId = gameSelect.value;
            if (gameId) {
                fetchPlayByPlay(gameId);
            }
        }
    });
});

quarterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        // Remove 'active' from all buttons/contents
        quarterButtons.forEach((b) => b.classList.remove("active"));
        quarterContents.forEach((qc) => qc.classList.remove("active"));

        // Add 'active' to the clicked button and associated content
        btn.classList.add("active");
        const quarter = btn.getAttribute("data-quarter");
        document.getElementById(`quarter${quarter.charAt(0).toUpperCase() + quarter.slice(1)}`).classList.add("active");
    });
});

// Add this function to fetch and display play-by-play data
async function fetchPlayByPlay(gameId) {
    try {
        const res = await fetch(`http://localhost:8000/games/${gameId}/playbyplay`);
        if (!res.ok) throw new Error("Failed to fetch play-by-play data");
        const playsByQuarter = await res.json();

        // Clear existing content
        ['1', '2', '3', '4'].forEach(quarter => {
            document.getElementById(`quarter${quarter}`).innerHTML = '';
        });

        // Process all quarters
        for (const quarter in playsByQuarter) {
            const container = document.getElementById(`quarter${quarter}`);
            
            for (const play of playsByQuarter[quarter]) {
                const logoUrl = await getTeamLogo(play.team);
                
                const playItem = document.createElement("div");
                playItem.className = "play-item";
                playItem.innerHTML = `
                    ${play.team && play.team !== "N/A" ? 
                        `<img class="team-logo-small" src="${logoUrl}" alt="${play.team} logo">` : 
                        `<div class="neutral-logo">🏀</div>`
                    }
                    <div class="play-details">
                        <div class="play-time">${play.time}</div>
                        <div class="play-description">${play.description}</div>
                        ${play.player !== "N/A" ? 
                            `<div class="play-player">${play.player}</div>` : 
                            `<div class="play-player">Game Event</div>`
                        }
                    </div>
                `;
                
                container.appendChild(playItem);
            }
        }
    } catch (err) {
        console.error("Error fetching play-by-play data:", err);
    }
}

async function updateGameData() {
    try {
        const res = await fetch("http://localhost:8000/games");
        const games = await res.json();
        const selectedGameId = gameSelect.value;
        const selectedGame = games.find(g => g.gameId === selectedGameId);
        if (selectedGame) {
            updateGameDisplay(selectedGame);
        }
    } catch (err) {
        console.error("Error updating game data:", err);
    }
}

async function updateGameDisplay(game) {
    // Update team names and scores
    awayTeamName.textContent = game.awayTeam;
    awayTeamScore.textContent = game.awayScore;
    homeTeamName.textContent = game.homeTeam;
    homeTeamScore.textContent = game.homeScore;

    // Update logos
    awayTeamLogo.src = await getTeamLogo(game.awayAbbreviation);
    homeTeamLogo.src = await getTeamLogo(game.homeAbbreviation);

    // Update game status and time
    gameStatus.textContent = {
        1: "Scheduled",
        2: "🟢 LIVE",
        3: "🏁 Final"
    }[game.status] || "Unknown";

    if (game.status === 1) { // Scheduled
        gameClock.textContent = game.statusText || game.gameTimeET;
    } else if (game.status === 3) { // Final
        gameClock.textContent = "Ended";
    } else { // Live game
        if (game.gameClock == "00:00")
            gameClock.textCotent = "Paused";
        else 
            gameClock.textContent = game.gameClock || 'Live';
    }

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
                1: `⏰ ${g.statusText}`,  // Scheduled with clock icon
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

                // Fetch play-by-play data if the Play-by-Play tab is active
                if (document.querySelector('[data-tab="playTab"]').classList.contains("active")) {
                    fetchPlayByPlay(selectedGame.gameId);
                }
            }
        });
        setInterval(updateGameData, 1000);
    } catch (err) {
        console.error("Error fetching games:", err);
    }
}

async function createTrackerElement(betData) {
    // Handle API errors first
    if (betData.error) {
        const errorCard = document.createElement("div");
        errorCard.className = "tracker-card error";
        errorCard.textContent = "Failed to track bet. Please try again.";
        return errorCard;
    }

    const card = document.createElement("div");
    card.className = "tracker-card";

    try {
        // Fetch player image
        let imageUrl;
        if (playerImageCache.has(betData.player)) {
            imageUrl = playerImageCache.get(betData.player);
        } else {
            const controller = new AbortController();
            card._imageRequestAbortController = controller;
            
            const playerImageRes = await fetch(
                `http://localhost:8000/player/${encodeURIComponent(betData.player)}/image`,
                { signal: controller.signal }
            );
            const playerImageData = await playerImageRes.json();
            imageUrl = playerImageData.imageUrl;
            
            // Cache even if no image found to prevent repeated requests
            playerImageCache.set(betData.player, imageUrl || null);
        }
        
        const betTypeDisplay = betData.bet_type.split('+')
        .map(stat => {
            // Map server response to proper display names
            const displayNames = {
                points: 'Pts',
                assists: 'Ast',
                rebounds: 'Reb'
            };
            return displayNames[stat] || stat.charAt(0).toUpperCase() + stat.slice(1);
        })
        .join('+');

            card.innerHTML = `
            <div class="tracker-card-container">
                <div class="player-image-container">
                    ${imageUrl ? 
                        `<img class="player-image" src="${imageUrl}" alt="${betData.player}">` : 
                        `<div class="player-image placeholder">?</div>`
                    }
                </div>
                
                <div class="player-info">
                    <div class="player-name">${betData.player}</div>
                    <div class="team-position">NBA ${betData.teamAbbreviation} - ${betData.position}</div>
                    <div class="game-info">${betData.gameDate} vs ${betData.opponent}</div>
                </div>
        
                <div class="progress-section">
                    <div class="progress-labels">
                        <span>${betData.current_total.toFixed(1)}</span>
                        <span>${betData.target}</span> <!-- Use display name -->
                    </div>
                    <div class="progress-bar ${betData.current_total >= betData.target ? 'exceeded' : 'below'}">
                        <div class="progress-fill" 
                            style="width: ${Math.min((betData.current_total / betData.target) * 100, 100)}%">
                        </div>
                    </div>
                </div>
        
                <div class="bet-status">
                    <div class="more-label">MORE</div>
                    <div class="target-line">${betData.target} ${betTypeDisplay.toUpperCase()}</div>
                </div>
            </div>
            <button class="remove-btn">×</button>
        `;
    } catch (err) {
        console.error("Error creating tracker card:", err);
        card.innerHTML = `
            <div class="error">
                Failed to load tracker data for ${betData.player}
            </div>
        `;
    }

    card.querySelector('.remove-btn').addEventListener('click', () => {
        // Clear from active trackers
        const intervalId = activeTrackers.get(card);
        if (intervalId) {
            clearInterval(intervalId);
            activeTrackers.delete(card);
        }
        
        // Clear cached image if this is the last instance
        setTimeout(() => { // Delay to ensure DOM update
            const hasOtherInstances = [...trackerQueue.children].some(child => 
                child.querySelector('h3')?.textContent === betData.player
            );
            if (!hasOtherInstances) {
                playerImageCache.delete(betData.player);
            }
        }, 0);
    
        // Remove from DOM
        card.remove();
    });

    return card;
}

async function addTracker(betData) {
    try {
        const initialData = await fetchBetStatus(betData);
        let card = await createTrackerElement(initialData);
        trackerQueue.appendChild(card);

        // Store the bet data with the card
        card.betData = betData;  // Add this line

        const intervalId = setInterval(async () => {
            try {
                const newData = await fetchBetStatus(betData);
                const newCard = await createTrackerElement(newData);
                
                // Update the DOM and references
                card.replaceWith(newCard);
                activeTrackers.delete(card);
                activeTrackers.set(newCard, intervalId);
                card = newCard; // Update the card reference
            } catch (err) {
                console.error("Update failed:", err);
            }
        }, 5000);

        activeTrackers.set(card, intervalId);
    } catch (err) {
        alert("Failed to start tracking. Check console for details.");
    }
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
betForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(betForm);

    // Validate target input
    const target = parseFloat(formData.get("target"));
    if (isNaN(target) || target <= 0) {
        alert("Please enter a valid target number greater than 0.");
        return;
    }

    // Prepare bet data
    const betData = {
        player: formData.get("player"),
        bet_type: formData.get("betType"),
        target: target,
        game_id: gameSelect.value
    };

    // Validate all fields
    if (!betData.player || !betData.bet_type || !betData.game_id) {
        alert("Please fill in all required fields.");
        return;
    }

    try {
        await addTracker(betData);
        betForm.reset();
        betForm.classList.remove('visible');
        overlay.classList.remove('visible');
    } catch (err) {
        alert("Failed to create tracker. Please try again.");
        console.error("Submission error:", err);
    }
});

// Initial load
loadGames();