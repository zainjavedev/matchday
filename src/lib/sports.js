export const SPORTS = {
  f1: { label: 'Formula 1', emoji: '🏎️', color: '#ff4d4d', duration: 120 },
  nba: { label: 'NBA', emoji: '🏀', color: '#f5822a', duration: 150 },
  nfl: { label: 'NFL', emoji: '🏈', color: '#4d8dff', duration: 200 },
  soccer: { label: 'Football', emoji: '⚽', color: '#2fd07a', duration: 120 },
  cricket: { label: 'Cricket', emoji: '🏏', color: '#ffc933', duration: 480 },
  mlb: { label: 'MLB', emoji: '⚾', color: '#e8505b', duration: 180 },
  nhl: { label: 'NHL', emoji: '🏒', color: '#5ec2ff', duration: 150 },
};

export const SPORT_ORDER = ['soccer', 'nba', 'f1', 'cricket', 'nfl', 'nhl', 'mlb'];

// US leagues list the away side first ("GS @ LAL").
export const AWAY_FIRST = new Set(['nba', 'nfl', 'mlb', 'nhl']);

export const F1_TEAM = {
  id: 'f1:f1',
  sport: 'f1',
  league: 'Formula 1',
  espnId: 'f1',
  name: 'Formula 1',
  short: 'F1',
  abbr: 'F1',
  logo: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/f1.png',
  color: '#ff1801',
};
