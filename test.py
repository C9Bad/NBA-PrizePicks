from nba_api.live.nba.endpoints import scoreboard

sb = scoreboard.ScoreBoard()
data = sb.get_dict()
print(data)
