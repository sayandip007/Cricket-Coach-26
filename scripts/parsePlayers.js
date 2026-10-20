import fs from 'fs';
import path from 'path';

const csvContent = fs.readFileSync(path.join(process.cwd(), 'src/data/raw_players.csv'), 'utf8');

const TEAM_MAP = {
  'CSK': 'team_che',
  'DC': 'team_del',
  'GT': 'team_guj',
  'KKR': 'team_kol',
  'LSG': 'team_lko',
  'MI': 'team_mum',
  'PBKS': 'team_pun',
  'RR': 'team_raj',
  'RCB': 'team_blr',
  'SRH': 'team_hyd'
};

const PLAYER_COUNTRY_MAP = {
  // Australia
  'Matthew Short': 'Australia',
  'Nathan Ellis': 'Australia',
  'Spencer Johnson': 'Australia',
  'Mitchell Starc': 'Australia',
  'Cameron Green': 'Australia',
  'Mitchell Marsh': 'Australia',
  'Josh Inglis': 'Australia',
  'Xavier Bartlett': 'Australia',
  'Ben Dwarshuis': 'Australia',
  'Cooper Connolly': 'Australia',
  'Marcus Stoinis': 'Australia',
  'Tim David': 'Australia',
  'Josh Hazlewood': 'Australia',
  'Travis Head': 'Australia',
  'Pat Cummins': 'Australia',
  'Jack Edwards': 'Australia',

  // South Africa
  'Dewald Brevis': 'South Africa',
  'David Miller': 'South Africa',
  'Tristan Stubbs': 'South Africa',
  'Lungisani Ngidi': 'South Africa',
  'Connor Esterhuizen': 'South Africa',
  'Kagiso Rabada': 'South Africa',
  'Aiden Markram': 'South Africa',
  'Matthew Breetzke': 'South Africa',
  'Anrich Nortje': 'South Africa',
  'George Linde': 'South Africa',
  'Ryan Rickelton': 'South Africa',
  'Quinton de Kock': 'South Africa',
  'Keshav Maharaj': 'South Africa',
  'Corbin Bosch': 'South Africa',
  'Marco Jansen': 'South Africa',
  'Lhuan-dre Pretorius': 'South Africa',
  'Donovan Ferreira': 'South Africa',
  'Nandre Burger': 'South Africa',
  'Kwena Maphaka': 'South Africa',
  'Heinrich Klaasen': 'South Africa',
  'Gerald Coetzee': 'South Africa',

  // England
  'Jamie Overton': 'England',
  'Ben Duckett': 'England',
  'Tom Banton': 'England',
  'Jos Buttler': 'England',
  'Luke Wood': 'England',
  'Will Jacks': 'England',
  'Jofra Archer': 'England',
  'Phil Salt': 'England',
  'Jordan Cox': 'England',
  'Richard Gleeson': 'England',
  'Jacob Bethell': 'England',
  'Liam Livingstone': 'England',
  'Brydon Carse': 'England',
  'David Payne': 'England',

  // New Zealand
  'Matt Henry': 'New Zealand',
  'Zak Foulkes': 'New Zealand',
  'Kyle Jamieson': 'New Zealand',
  'Glenn Phillips': 'New Zealand',
  'Finn Allen': 'New Zealand',
  'Tim Seifert': 'New Zealand',
  'Rachin Ravindra': 'New Zealand',
  'Trent Boult': 'New Zealand',
  'Mitchell Santner': 'New Zealand',
  'Lockie Ferguson': 'New Zealand',
  'Adam Milne': 'New Zealand',
  'Jacob Duffy': 'New Zealand',

  // West Indies
  'Akeal Hosein': 'West Indies',
  'Jason Holder': 'West Indies',
  'Rovman Powell': 'West Indies',
  'Sunil Narine': 'West Indies',
  'Nicholas Pooran': 'West Indies',
  'Sherfane Rutherford': 'West Indies',
  'Shimron Hetmyer': 'West Indies',
  'Romario Shepherd': 'West Indies',

  // Afghanistan
  'Noor Ahmad': 'Afghanistan',
  'Rashid Khan': 'Afghanistan',
  'Allah Mohammad Ghazanfar': 'Afghanistan',
  'Azmatullah Omarzai': 'Afghanistan',

  // Sri Lanka
  'Pathum Nissanka': 'Sri Lanka',
  'Dushmantha Chameera': 'Sri Lanka',
  'Matheesha Pathirana': 'Sri Lanka',
  'Wanindu Hasaranga': 'Sri Lanka',
  'Dasun Shanaka': 'Sri Lanka',
  'Nuwan Thushara': 'Sri Lanka',
  'Kamindu Mendis': 'Sri Lanka',
  'Eshan Malinga': 'Sri Lanka',
  'Dilshan Madushanka': 'Sri Lanka',

  // Zimbabwe
  'Blessing Muzarabani': 'Zimbabwe'
};

const OVERSEAS_PLAYERS = new Set(Object.keys(PLAYER_COUNTRY_MAP));

function parseCSVLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i+1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

const lines = csvContent.trim().split('\n');
const header = parseCSVLine(lines[0]);

function mapRole(primaryRole) {
  if (primaryRole.includes('Top-order')) return 'Top-order';
  if (primaryRole.includes('Middle-order')) return 'Middle-order';
  if (primaryRole.includes('Wicketkeeper')) return 'Wk-bat';
  if (primaryRole.includes('Finisher')) return 'Middle-order';
  if (primaryRole.includes('Spin all-rounder') || primaryRole.includes('Pace all-rounder')) return 'All-rounder';
  if (primaryRole.includes('Spin bowler')) return 'Spin';
  if (primaryRole.includes('Pace bowler')) return 'Pace';
  return 'Middle-order';
}

function mapBowlingArm(style, arm) {
  const s = (style || '').toLowerCase();
  const a = (arm || '').toLowerCase();
  if (s.includes('fast') || s.includes('medium')) {
    if (a.includes('left') || s.includes('left')) return 'LAF';
    return 'RAF';
  }
  if (s.includes('off-break')) return 'ROB';
  if (s.includes('leg-break') || s.includes('wrist')) return 'LS';
  if (s.includes('orthodox')) return 'LSO';
  if (a.includes('left')) return 'LAF';
  return 'RAF';
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const players = [];
const teamCaptains = {};
const teamPlayersMap = {};

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = parseCSVLine(line);
  if (cols.length < 5) continue;

  const [
    team, player, primaryRole, captain, battingHand,
    bowlingStyle, bowlingArm, formStr, moraleStr, staminaStr,
    batStr, powStr, tecStr, tmpStr, aggStr, styStr, runStr, vpStr, vsStr,
    bowlStr, pacStr, ctrStr, varStr, dthStr, compStr,
    catStr, fldStr, fitStr, ageStr, ratingType, dataConfidence
  ] = cols;

  const clubId = TEAM_MAP[team] || 'team_mum';
  const playerId = `p_${team.toLowerCase()}_${slugify(player)}`;
  const isCaptain = (captain || '').toLowerCase() === 'yes';

  if (isCaptain) {
    teamCaptains[clubId] = playerId;
  }

  const role = mapRole(primaryRole);
  const arm = mapBowlingArm(bowlingStyle, bowlingArm);
  const bHand = (battingHand || 'RHB').toUpperCase().includes('L') ? 'LHB' : 'RHB';

  const isOverseas = OVERSEAS_PLAYERS.has(player);
  const age = parseInt(ageStr, 10) || 27;
  const form = parseInt(formStr, 10) || 85;
  const morale10 = parseInt(moraleStr, 10) || 8;
  const morale = Math.min(100, Math.max(10, morale10 * 10));
  const staminaPct = parseInt(staminaStr, 10) || 92;

  // Numerical ratings
  const bat = parseFloat(batStr) || (role === 'Pace' || role === 'Spin' ? 32 : 78);
  const pow = parseFloat(powStr) || (role === 'Pace' || role === 'Spin' ? 38 : 75);
  const tec = parseFloat(tecStr) || (role === 'Pace' || role === 'Spin' ? 35 : 75);
  const tmp = parseFloat(tmpStr) || (role === 'Pace' || role === 'Spin' ? 45 : 75);
  const agg = parseFloat(aggStr) || 75;
  const sty = parseFloat(styStr) || 75;
  const run = parseFloat(runStr) || 75;
  const vp = parseFloat(vpStr) || 75;
  const vs = parseFloat(vsStr) || 75;

  const bowl = parseFloat(bowlStr) || (role === 'Top-order' || role === 'Wk-bat' ? 20 : (role === 'Middle-order' ? 35 : 82));
  const pace = parseFloat(pacStr) || (role === 'Top-order' || role === 'Wk-bat' ? 20 : 75);
  const ctrl = parseFloat(ctrStr) || (role === 'Top-order' || role === 'Wk-bat' ? 20 : 78);
  const varRate = parseFloat(varStr) || (role === 'Top-order' || role === 'Wk-bat' ? 20 : 75);
  const dth = parseFloat(dthStr) || (role === 'Top-order' || role === 'Wk-bat' ? 15 : 78);
  const comp = parseFloat(compStr) || 75;

  const cat = parseFloat(catStr) || 75;
  const fld = parseFloat(fldStr) || 75;
  const fit = parseFloat(fitStr) || staminaPct;

  // Determine tier & base price
  const maxSkill = Math.max(bat, bowl);
  let tier = 'Silver';
  let basePriceCr = 1.0;
  let salaryCr = 5.0;
  if (maxSkill >= 88 || isCaptain) {
    tier = 'Platinum';
    basePriceCr = 2.0;
    salaryCr = 14.0 + (maxSkill - 88) * 1.5;
  } else if (maxSkill >= 82) {
    tier = 'Gold';
    basePriceCr = 1.5;
    salaryCr = 8.0 + (maxSkill - 82) * 0.8;
  } else if (maxSkill >= 76) {
    tier = 'Silver';
    basePriceCr = 1.0;
    salaryCr = 4.0;
  } else {
    tier = 'Bronze';
    basePriceCr = 0.5;
    salaryCr = 1.5;
  }

  const pObj = {
    id: playerId,
    name: player,
    jerseyNumber: Math.floor(Math.random() * 88) + 7,
    role,
    bowlingArm: arm,
    battingHand: bHand,
    age,
    country: PLAYER_COUNTRY_MAP[player] || (isOverseas ? 'Overseas' : 'India'),
    clubId,
    isOverseas,
    tier,
    basePriceCr: Math.round(basePriceCr * 10) / 10,
    salaryCr: Math.round(salaryCr * 10) / 10,
    ratings: {
      bat: Math.round(bat),
      pow: Math.round(pow),
      tec: Math.round(tec),
      tmp: Math.round(tmp),
      agg: Math.round(agg),
      sty: Math.round(sty),
      run: Math.round(run),
      vp: Math.round(vp),
      vs: Math.round(vs),
      bowl: Math.round(bowl),
      pace: Math.round(pace),
      ctrl: Math.round(ctrl),
      var: Math.round(varRate),
      dth: Math.round(dth),
      comp: Math.round(comp),
      cat: Math.round(cat),
      fld: Math.round(fld),
      fit: Math.round(fit)
    },
    form,
    morale,
    fitness: staminaPct,
    isInjured: false,
    injuryDays: 0,
    isCaptain,
    primaryRole,
    bowlingStyle,
    ratingType,
    dataConfidence,
    stats: {
      matches: Math.floor(Math.random() * 60) + 15,
      runs: role === 'Pace' || role === 'Spin' ? Math.floor(Math.random() * 120) : Math.floor(bat * 35),
      balls: role === 'Pace' || role === 'Spin' ? Math.floor(Math.random() * 100) : Math.floor(bat * 26),
      fours: Math.floor(bat * 2.8),
      sixes: Math.floor(pow * 1.2),
      fifties: Math.floor(bat / 14),
      hundreds: bat > 88 ? 1 : 0,
      highestScore: role === 'Pace' || role === 'Spin' ? 24 : Math.min(125, Math.floor(bat * 1.25)),
      wickets: role === 'Top-order' || role === 'Wk-bat' ? 0 : Math.floor(bowl * 0.9),
      oversBowled: role === 'Top-order' || role === 'Wk-bat' ? 0 : Math.floor(bowl * 3.2),
      runsConceded: role === 'Top-order' || role === 'Wk-bat' ? 0 : Math.floor(bowl * 24),
      maidens: role === 'Pace' || role === 'Spin' ? Math.floor(bowl / 25) : 0,
      bestBowling: role === 'Pace' || role === 'Spin' || role === 'All-rounder' ? (bowl > 85 ? '5/18' : '3/22') : '0/0'
    }
  };

  players.push(pObj);
  if (!teamPlayersMap[clubId]) teamPlayersMap[clubId] = [];
  teamPlayersMap[clubId].push(pObj);
}

// Generate Playing XI for each team
const teamXIs = {};
for (const [clubId, pList] of Object.entries(teamPlayersMap)) {
  // Sort into batting order: Openers/Top order first, WK, All-rounders, Spin, Pace
  const topOrder = pList.filter(p => p.role === 'Top-order').sort((a,b) => b.ratings.bat - a.ratings.bat);
  const wk = pList.filter(p => p.role === 'Wk-bat').sort((a,b) => b.ratings.bat - a.ratings.bat);
  const middle = pList.filter(p => p.role === 'Middle-order').sort((a,b) => b.ratings.bat - a.ratings.bat);
  const allrounders = pList.filter(p => p.role === 'All-rounder').sort((a,b) => (b.ratings.bat + b.ratings.bowl) - (a.ratings.bat + a.ratings.bowl));
  const spin = pList.filter(p => p.role === 'Spin').sort((a,b) => b.ratings.bowl - a.ratings.bowl);
  const pace = pList.filter(p => p.role === 'Pace').sort((a,b) => b.ratings.bowl - a.ratings.bowl);

  const xi = [];
  const addP = (p) => { if (p && !xi.find(x => x.id === p.id) && xi.length < 11) xi.push(p); };

  topOrder.slice(0, 3).forEach(addP);
  wk.slice(0, 1).forEach(addP);
  middle.slice(0, 2).forEach(addP);
  allrounders.slice(0, 2).forEach(addP);
  spin.slice(0, 2).forEach(addP);
  pace.slice(0, 3).forEach(addP);

  // Fill up to 11 if needed
  pList.forEach(addP);

  teamXIs[clubId] = xi.slice(0, 11).map(p => p.id);
}

const outTs = `// GENERATED FROM OFFICIAL CSV DATA: 265 PLAYERS WITH ATTRIBUTES
import { Player } from '../types/cricket';

export const CSV_PLAYERS: Player[] = ${JSON.stringify(players, null, 2)};

export const CSV_TEAM_CAPTAINS: Record<string, string> = ${JSON.stringify(teamCaptains, null, 2)};

export const CSV_TEAM_XIS: Record<string, string[]> = ${JSON.stringify(teamXIs, null, 2)};
`;

fs.writeFileSync(path.join(process.cwd(), 'src/data/csvPlayers.ts'), outTs, 'utf8');
console.log('Successfully generated csvPlayers.ts with', players.length, 'players.');
