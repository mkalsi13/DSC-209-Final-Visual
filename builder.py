import pandas as pd

bat = pd.read_csv("Batting.csv")
master = pd.read_csv("Master.csv")
teams = pd.read_csv("Teams.csv")

# Player age
master_sub = master[["playerID", "birthYear"]].dropna()
bat = bat.merge(master_sub, on="playerID", how="left")
bat["age"] = bat["yearID"] - bat["birthYear"]

# Plate appearances as weight
bat["PA"] = bat["AB"].fillna(0) + bat["BB"].fillna(0) + \
            bat["HBP"].fillna(0) + bat["SF"].fillna(0)

bat = bat[(bat["age"].notna()) & (bat["age"].between(18, 45))]

# Weighted average team age per season
def weighted_age(g):
    total_pa = g["PA"].sum()
    if total_pa == 0:
        return g["age"].mean()
    return (g["age"] * g["PA"]).sum() / total_pa

team_age = (
    bat.groupby(["yearID", "teamID"])
       .apply(weighted_age)
       .reset_index(name="avg_age")
)

teams_sub = teams[["yearID", "teamID", "lgID", "franchID", "G", "R", "W", "L"]].dropna()
teams_sub["runs_per_game"] = teams_sub["R"] / teams_sub["G"]
teams_sub["win_pct"] = teams_sub["W"] / (teams_sub["W"] + teams_sub["L"])

team_age_perf = team_age.merge(teams_sub, on=["yearID", "teamID"], how="inner")

# Optional: modern era only
team_age_perf = team_age_perf[team_age_perf["yearID"] >= 1970]

team_age_perf.to_csv("team_age_performance.csv", index=False)
