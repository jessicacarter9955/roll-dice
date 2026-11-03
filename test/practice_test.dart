import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:street_circle/domain/practice.dart';

void main() {
  test('bids rise by quantity or by face at the same quantity', () {
    const bid = {'quantity': 3, 'face': 4};
    expect(PracticeMatch.higher(3, 5, bid, 10), isTrue);
    expect(PracticeMatch.higher(4, 1, bid, 10), isTrue);
    expect(PracticeMatch.higher(3, 4, bid, 10), isFalse);
    expect(PracticeMatch.higher(2, 6, bid, 10), isFalse);
    expect(PracticeMatch.higher(11, 1, bid, 10), isFalse);
  });
  test('opponent dice are hidden until an explicit catch reveal', () {
    final match = PracticeMatch(random: Random(5));
    final view = match.view();
    expect((view['players'] as List).first['dice'], hasLength(5));
    expect((view['players'] as List)[1]['dice'], isEmpty);
    match.act('local', {'type': 'bid', 'quantity': 20, 'face': 6});
    match.act('bot-0', {'type': 'catch'});
    expect(match.game['phase'], 'reveal');
    expect(match.game['resolution']['loserId'], 'local');
    expect(match.game['resolution']['dice'][0]['dice'], hasLength(5));
    expect(match.players.first['count'], 4);
  });
  test('physical GoDice rolls can replace only an unopened local practice hand', () {
    final match = PracticeMatch(opponents: 1, random: Random(4));
    expect(() => match.setPhysicalDice([1, 2]), throwsStateError);
    expect(() => match.setPhysicalDice([1, 2, 3, 4, 7]), throwsStateError);
    match.setPhysicalDice([1, 2, 3, 4, 5]);
    expect(match.players.first['dice'], [1, 2, 3, 4, 5]);
    match.act('local', {'type': 'bid', 'quantity': 1, 'face': 1});
    expect(() => match.setPhysicalDice([6, 6, 6, 6, 6]), throwsStateError);
  });
  test('no wild ones: a truthful bid makes the catcher lose a die', () {
    final match = PracticeMatch(opponents: 1, random: Random(1));
    match.players[0]['dice'] = [1, 1, 1, 1, 1];
    match.players[1]['dice'] = [2, 2, 2, 2, 2];
    match.act('local', {'type': 'bid', 'quantity': 5, 'face': 2});
    match.act('bot-0', {'type': 'catch'});
    expect(match.game['resolution']['actual'], 5);
    expect(match.players[1]['count'], 4);
    expect(match.game['turn'], 1);
  });
  test('a full eight-player match terminates without invalid turns', () {
    for (var seed = 0; seed < 30; seed++) {
      final match = PracticeMatch(opponents: 7, random: Random(seed));
      var steps = 0;
      while (match.game['phase'] != 'finished' && steps++ < 4000) {
        match.act(match.current['id'] as String, match.botAction());
        expect(match.players.every((p) => (p['count'] as int) >= 0), isTrue);
      }
      expect(match.game['phase'], 'finished');
      expect(match.players.where((p) => (p['count'] as int) > 0), hasLength(1));
    }
  });
}
