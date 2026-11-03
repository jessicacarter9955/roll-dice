import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, command, viewGame, isHigherBid, forfeit, botAction, totalDice } from '../engine.mjs';
const players = [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bo' }];
test('bid boundaries and monotonic ordering', () => {
  const previous = { quantity: 3, face: 4 };
  assert.equal(isHigherBid({quantity: 3, face: 5}, previous, 10), true);
  assert.equal(isHigherBid({quantity: 4, face: 1}, previous, 10), true);
  for (const bid of [{quantity: 3, face: 4}, {quantity: 2, face: 6}, {quantity: 11, face: 2}, {quantity: 1.5, face: 3}, {quantity: 4, face: 7}]) assert.equal(isHigherBid(bid, previous, 10), false);
});
test('turn enforcement, dice privacy and no pre-bid catches', () => {
  const game = createGame(players, () => 4, 0);
  assert.throws(() => command(game, 'b', {type: 'bid', quantity: 1, face: 2}, () => 1));
  assert.throws(() => command(game, 'a', {type: 'catch'}, () => 1));
  assert.deepEqual(viewGame(game, 'watcher').players.map(p => p.dice), [[], []]);
  assert.equal(viewGame(game, 'a').players[0].dice.length, 5);
  assert.equal(viewGame(game, 'a').players[1].dice.length, 0);
});
test('truthful catch, loser starts and revealed dice are frozen', () => {
  const game = createGame(players, () => 4, 0);
  command(game, 'a', {type: 'bid', quantity: 10, face: 4}, () => 1, 1);
  command(game, 'b', {type: 'catch'}, () => 1, 2);
  assert.equal(game.resolution.actual, 10);
  assert.equal(game.resolution.loserId, 'b');
  assert.equal(game.turn, 1);
  assert.equal(game.players[1].count, 4);
  const reveal = game.history[1].dice;
  command(game, 'b', {type: 'next'}, () => 6, 3);
  assert.deepEqual(reveal[1].dice, [4,4,4,4,4]);
  assert.deepEqual(game.players[1].dice, [6,6,6,6]);
});
test('ones are literal, bluff loser is bidder, zero-dice player is eliminated', () => {
  const game = createGame(players, () => 1);
  game.players[0].count = 1; game.players[0].dice = [1];
  command(game, 'a', {type: 'bid', quantity: 1, face: 2}, () => 1);
  command(game, 'b', {type: 'catch'}, () => 1);
  assert.equal(game.resolution.actual, 0);
  assert.equal(game.winner, 'b'); assert.equal(game.phase, 'finished');
  assert.throws(() => command(game, 'b', {type: 'next'}, () => 1));
});
test('forfeiture voids bid instead of evaluating against changed dice', () => {
  const game = createGame([...players, { id: 'c', name: 'Cy' }], () => 2);
  command(game, 'a', {type: 'bid', quantity: 15, face: 2}, () => 1);
  forfeit(game, 'a'); assert.equal(game.bid, null); assert.equal(game.phase, 'reveal');
  command(game, 'b', {type: 'next'}, () => 1);
  assert.equal(totalDice(game), 10);
});
test('100 complete matches from 2–8 players preserve game invariants', () => {
  let seed = 123456;
  const roll = () => { seed = (1664525 * seed + 1013904223) >>> 0; return 1 + seed % 6; };
  for (let n = 0; n < 100; n++) {
    const game = createGame(Array.from({length: 2 + n % 7}, (_, i) => ({ id: String(i), name: String(i) })), roll);
    let steps = 0;
    while (game.phase !== 'finished' && steps++ < 4000) {
      const current = game.players[game.turn];
      assert.ok(current.count > 0);
      command(game, current.id, botAction(game, roll), roll);
      assert.ok(game.players.every(p => p.count >= 0));
    }
    assert.equal(game.phase, 'finished');
    assert.equal(game.players.filter(p => p.count > 0).length, 1);
  }
});
