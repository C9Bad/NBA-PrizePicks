from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from nba_api.live.nba.endpoints import scoreboard, boxscore, playbyplay
from nba_api.stats.static import players
from typing import List
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import pytz
import math

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# ---------------------------
# 1) Data Model for your bet
# ---------------------------
class Bet(BaseModel):
    player: str
    bet_type: str
    target: float
    game_id: str

# ---------------------------
# 2) GET endpoint: Return today's ongoing games
# ---------------------------
@app.get("/games")
async def get_ongoing_games():
    sb = scoreboard.ScoreBoard()
    data = sb.get_dict()
    games_data = data["scoreboard"]["games"]
    
    # Use the scoreboard's gameDate instead of current date
    scoreboard_date = data["scoreboard"]["gameDate"]
    eastern = pytz.timezone("US/Eastern")

    games_list = []
    for g in games_data:
        # if g["gameStatus"] != 2:
        #     return

        # Parse gameEt to check if it matches scoreboard date
        try:
            game_time_et = datetime.fromisoformat(g["gameEt"].replace("Z", "")).astimezone(eastern)
            if game_time_et.date().isoformat() != scoreboard_date:
                continue
        except:
            continue

        games_list.append({
            "gameId": g["gameId"],
            "homeTeam": g["homeTeam"]["teamName"],
            "awayTeam": g["awayTeam"]["teamName"],
            "statusText": g["gameStatusText"],
            "homeAbbreviation": g["homeTeam"]["teamTricode"],  # e.g. "BOS"
            "awayAbbreviation": g["awayTeam"]["teamTricode"],  # e.g. "LAL"
            "status": g["gameStatus"],
            "gameTimeET": game_time_et.strftime("%I:%M %p"),
            "homeScore": g["homeTeam"]["score"],
            "awayScore": g["awayTeam"]["score"],
            "period": g["period"],
            "gameClock": g["gameClock"]
        })

    status_priority = {2: 0, 3: 1, 1: 2}
    games_list.sort(key=lambda x: status_priority.get(x["status"], 3))
    
    return JSONResponse(content=games_list)

# ---------------------------
# 3) Helper: Fetch Player Stats
# ---------------------------
# In main.py, update this section:
def get_player_stats(player_name: str, game_id: str):
    try:
        box = boxscore.BoxScore(game_id=game_id)
        data = box.get_dict()
    except:
        return None

    home_players = data["game"]["homeTeam"]["players"]
    away_players = data["game"]["awayTeam"]["players"]
    all_players = home_players + away_players

    for p in all_players:
        if player_name.lower() in p["name"].lower():
            # Fix: Use .get() with default value
            return {
                "name": p["name"],
                "active": not p.get("notPlaying", False),
                "points": p["statistics"].get("points", 0),
                "assists": p["statistics"].get("assists", 0),
                "rebounds": p["statistics"].get("rebounds", 0)
            }
    return None

# Get Images!
@app.get("/player/{player_name}/image")
async def get_player_image(player_name: str):
    # Find player ID
    nba_players = players.find_players_by_full_name(player_name)
    if not nba_players:
        return {"imageUrl": None}
    
    # Get first matching player
    player_id = nba_players[0]['id']
    
    # ESPN image URL pattern (works for most active players)
    image_url = f"https://cdn.nba.com/headshots/nba/latest/1040x760/{player_id}.png"
    
    # Alternative if ESPN doesn't work:
    # image_url = f"https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/{player_id}.png"
    
    return {"imageUrl": image_url}

# Add these new endpoints
# ---------------------------
# 2a) GET detailed game info
# ---------------------------
@app.get("/games/{game_id}")
async def get_game_details(game_id: str):
    sb = scoreboard.ScoreBoard()
    data = sb.get_dict()
    
    for g in data["scoreboard"]["games"]:
        if g["gameId"] == game_id:
            return {
                "gameId": game_id,
                "statusText": g["gameStatusText"],
                "homeScore": g["homeTeam"]["score"],
                "awayScore": g["awayTeam"]["score"],
                "period": g["period"],
                "gameClock": g["gameClock"],
                "homeLeaders": g["gameLeaders"]["homeLeaders"],
                "awayLeaders": g["gameLeaders"]["awayLeaders"]
            }
    return {"error": "Game not found"}

# play by play
@app.get("/games/{game_id}/playbyplay")
async def get_play_by_play(game_id: str):
    try:
        # Fetch play-by-play data
        pbp = playbyplay.PlayByPlay(game_id)
        data = pbp.get_dict()

        # Extract the play-by-play actions
        plays = data.get("game", {}).get("actions", [])

        # Initialize a dictionary to group plays by quarter
        plays_by_quarter = {1: [], 2: [], 3: [], 4: []}

        for play in plays:
            # Extract the period (quarter) from the play
            period = play.get("period", 1)  # Default to 1 if period is missing
            if period not in plays_by_quarter:
                continue  # Skip if the period is not 1, 2, 3, or 4

            # Format the play data
            minutes, seconds = play.get("clock", "N/A")[2:-1].split("M")
            formatted_time = f"{int(minutes)}:{float(seconds):02.0f}"  # Combine into "MM:SS"

            formatted_play = {
                "time": formatted_time,  # Game clock time
                "description": play.get("description", "N/A"),  # Play description
                "player": play.get("playerName", "N/A"),  # Player involved
                "team": play.get("teamTricode", "N/A"),  # Team abbreviation
                "action_type": play.get("actionType", "N/A"),  # Type of action (e.g., shot, turnover)
                "score": play.get("score", "N/A")  # Current score after the play
            }

            # Add the play to the corresponding quarter
            plays_by_quarter[period].append(formatted_play)

        # Reverse the plays within each quarter (newest first)
        for quarter in plays_by_quarter:
            plays_by_quarter[quarter].reverse()

        # Return the plays grouped by quarter
        return JSONResponse(content=plays_by_quarter)

    except Exception as e:
        return {"error": str(e)}

# ---------------------------
# 2b) GET players in a game
# ---------------------------
@app.get("/games/{game_id}/players")
async def get_game_players(game_id: str):
    try:
        box = boxscore.BoxScore(game_id=game_id)
        data = box.get_dict()
        home_players = [p["name"] for p in data["game"]["homeTeam"]["players"]]
        away_players = [p["name"] for p in data["game"]["awayTeam"]["players"]]
        return {
            "homeTeamPlayers": home_players,
            "awayTeamPlayers": away_players
        }
    except Exception as e:
        return {"error": str(e)}

# ---------------------------
# 4) Main logic to compare stats with bet
# ---------------------------
def check_bet(player_name: str, bet_type: str, target_value: float, game_id: str):
    stats = get_player_stats(player_name, game_id)
    if not stats:
        return {
            "player": player_name,
            "game_id": game_id,
            "message": "No data found (invalid game ID, or player not in game)."
        }

    total = 0
    if "pts" in bet_type:
        total += stats["points"]
    if "assists" in bet_type:
        total += stats["assists"]
    if "rebounds" in bet_type:
        total += stats["rebounds"]

    remaining = target_value - total
    on_track = total >= target_value

    return {
        "player": stats["name"],
        "game_id": game_id,
        "status": "Active" if stats["active"] else "Benched",
        "bet_type": bet_type,
        "current_total": total,
        "target": target_value,
        "progress": "On Track ✅" if on_track else f"Needs {math.ceil(remaining)} more"
    }

# ---------------------------
# 5) POST endpoint to track bet
# ---------------------------
@app.post("/track")
async def track_bet(bet: Bet):
    """
    Expects JSON:
      {
        "player": "...",
        "bet_type": "...",
        "target": ...,
        "game_id": "..."
      }
    Returns JSON with bet status.
    """
    
    result = check_bet(bet.player, bet.bet_type, bet.target, bet.game_id)
    return JSONResponse(content=result)

# ---------------------------
# 6) Basic homepage route (optional)
# ---------------------------
@app.get("/")
async def root():
    return {"message": "NBA PrizePicks Watcher - FastAPI"}

@app.get("/debug/raw_games")
async def debug_raw_games():
    sb = scoreboard.ScoreBoard()
    return sb.get_dict()

# ---------------------------
# 7) Run locally
# ---------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
