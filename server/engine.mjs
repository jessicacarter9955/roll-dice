// Pure state machine. Only the server supplies randomness in connected rooms.
export class GameError extends Error {}
const requireThat = (condition, message) => { if (!condition) throw new GameError(message); };
export function createGame(players, roll, now = Date.now()) {
  requireThat(players.length >= 2 && players.length <= 8, 'A table needs 2–8 players.');
  requireThat(new Set(players.map(p => p.id)).size === players.length, 'Duplicate player.');
  const game = {
    phase: 'bidding', round: 1, turn: 0, bid: null, revision: 0,
    players: players.map(p => ({ id: p.id, name: p.name, bot: !!p.bot, count: 5, dice: [] })),
    history: [], resolution: null, winner: null, deadline: now + 45000,
  };
  reroll(game, roll);
  return game;
}
function reroll(game, roll) {
  for (const p of game.players) p.dice = Array.from({ length: p.count }, () => roll());
}
function nextAlive(game, start) {
  for (let n = 1; n <= game.players.length; n++) {
    const i = (start + n) % game.players.length;
    if (game.players[i].count > 0) return i;
  }
  throw new GameError('No active players.');
}
export function totalDice(game) { return game.players.reduce((n, p) => n + p.count, 0); }
export function isHigherBid(bid, previous, total) {
  return Number.isInteger(bid.quantity) && bid.quantity > 0 && bid.quantity <= total &&
    Number.isInteger(bid.face) && bid.face >= 1 && bid.face <= 6 &&
    (!previous || bid.quantity > previous.quantity || (bid.quantity === previous.quantity && bid.face > previous.face));
}
export function command(game, playerId, action, roll, now = Date.now()) {
  requireThat(game.phase !== 'finished', 'This match has ended.');
  const current = game.players[game.turn];
  if (action.type === 'next') {
    requireThat(game.phase === 'reveal', 'Finish the current round first.');
    requireThat(game.players.some(p => p.id === playerId && p.count > 0), 'Only active players can continue.');
    game.round++; game.bid = null; game.resolution = null;
    game.phase = 'bidding'; reroll(game, roll);
  } else {
    requireThat(game.phase === 'bidding', 'The dice have been revealed. Continue to the next round.');
    requireThat(current.id === playerId, 'It is not your turn.');
    if (action.type === 'bid') {
      requireThat(isHigherBid(action, game.bid, totalDice(game)), 'Raise the quantity, or raise the face at the same quantity.');
      game.bid = { quantity: action.quantity, face: action.face, playerId };
      game.history.push({ type: 'bid', round: game.round, playerId, name: current.name, quantity: action.quantity, face: action.face, at: now });
      game.turn = nextAlive(game, game.turn);
    } else if (action.type === 'catch') {
      requireThat(game.bid, 'A bid must be made before calling catch.');
      const actual = game.players.reduce((sum, p) => sum + p.dice.filter(d => d === game.bid.face).length, 0);
      const truthful = actual >= game.bid.quantity;
      const loserId = truthful ? playerId : game.bid.playerId;
      const loser = game.players.find(p => p.id === loserId);
      game.resolution = {
        bid: { ...game.bid }, actual, truthful, callerId: playerId, loserId, loserName: loser.name,
        dice: game.players.map(p => ({ id: p.id, name: p.name, dice: [...p.dice] })),
      };
      loser.count--;
      game.history.push({ type: 'catch', round: game.round, name: current.name, ...game.resolution, at: now });
      if (game.players.filter(p => p.count > 0).length === 1) {
        game.phase = 'finished'; game.winner = game.players.find(p => p.count > 0).id;
      } else {
        game.phase = 'reveal';
        const index = game.players.indexOf(loser);
        game.turn = loser.count > 0 ? index : nextAlive(game, index);
      }
    } else throw new GameError('Unknown game action.');
  }
  game.revision++;
  game.deadline = now + (game.phase === 'reveal' ? 12000 : 45000);
  return game;
}
export function forfeit(game, playerId, now = Date.now()) {
  const p = game.players.find(p => p.id === playerId);
  if (!p || p.count === 0 || game.phase === 'finished') return;
  p.count = 0; p.dice = [];
  game.history.push({ type: 'forfeit', name: p.name, playerId, round: game.round, at: now });
  const alive = game.players.filter(p => p.count > 0);
  if (alive.length === 1) { game.phase = 'finished'; game.winner = alive[0].id; }
  else {
    // Forfeiture voids the outstanding bid; never evaluate a bid against fewer dice.
    game.bid = null; game.resolution = null; game.phase = 'reveal';
    if (game.players[game.turn].count === 0) game.turn = nextAlive(game, game.turn);
  }
  game.deadline = now + 12000;
  game.revision++;
}
export function viewGame(game, playerId) {
  if (!game) return null;
  return {
    ...game, history: game.history.slice(-100),
    // Reveals are frozen in resolution. Current opponent dice stay private even after elimination.
    players: game.players.map(p => ({ ...p, dice: p.id === playerId ? p.dice : [] })),
  };
}
export function botAction(game, roll) {
  if (game.phase === 'reveal') return { type: 'next' };
  const bid = game.bid;
  if (!bid) return { type: 'bid', quantity: 1, face: roll() };
  const own = game.players[game.turn];
  const matching = own.dice.filter(d => d === bid.face).length;
  const expected = matching + (totalDice(game) - own.count) / 6;
  if (bid.quantity > expected + 1 || (bid.quantity === totalDice(game) && bid.face === 6)) return { type: 'catch' };
  return bid.face < 6 ? { type: 'bid', quantity: bid.quantity, face: bid.face + 1 } : { type: 'bid', quantity: bid.quantity + 1, face: roll() };
}
