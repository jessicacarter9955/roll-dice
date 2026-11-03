import 'dart:math';

/// Offline practice only. Connected matches are always decided by server/engine.mjs.
class PracticeMatch {
  PracticeMatch({this.name = 'You', int opponents = 3, Random? random})
    : random = random ?? Random.secure() {
    game = {
      'phase': 'bidding',
      'round': 1,
      'turn': 0,
      'bid': null,
      'revision': 0,
      'history': <Map<String, dynamic>>[],
      'resolution': null,
      'winner': null,
      'players': [
        {
          'id': 'local',
          'name': name,
          'count': 5,
          'dice': <int>[],
          'bot': false,
        },
        for (var i = 0; i < opponents; i++)
          {
            'id': 'bot-$i',
            'name': ['Maya', 'Rio', 'Jules', 'Noah', 'Ash', 'Sam', 'Kai'][i],
            'count': 5,
            'dice': <int>[],
            'bot': true,
          },
      ],
    };
    _reroll();
  }
  final String name;
  final Random random;
  late Map<String, dynamic> game;
  List<Map<String, dynamic>> get players =>
      (game['players'] as List).cast<Map<String, dynamic>>();
  Map<String, dynamic> get current => players[game['turn'] as int];
  int get total => players.fold(0, (sum, p) => sum + (p['count'] as int));
  int roll() => random.nextInt(6) + 1;
  void _reroll() {
    for (final p in players) {
      p['dice'] = List<int>.generate(p['count'] as int, (_) => roll());
    }
  }

  /// Locally observed physical GoDice hand. Practice is not a wagered or
  /// authoritative match; reject replacement after bidding begins.
  void setPhysicalDice(List<int> values) {
    final hand = players.first;
    if (game['phase'] != 'bidding' || game['bid'] != null) {
      throw StateError('Physical dice can only be used before the first bid.');
    }
    if (values.length != hand['count'] ||
        values.any((value) => value < 1 || value > 6)) {
      throw StateError('Roll one D6 per remaining die (1–6).');
    }
    hand['dice'] = List<int>.from(values);
    game['revision'] = (game['revision'] as int) + 1;
  }

  int _next(int from) {
    for (var n = 1; n <= players.length; n++) {
      final i = (from + n) % players.length;
      if ((players[i]['count'] as int) > 0) return i;
    }
    throw StateError('No players remain.');
  }

  static bool higher(
    int quantity,
    int face,
    Map<String, dynamic>? bid,
    int total,
  ) =>
      quantity >= 1 &&
      quantity <= total &&
      face >= 1 &&
      face <= 6 &&
      (bid == null ||
          quantity > (bid['quantity'] as int) ||
          (quantity == bid['quantity'] && face > (bid['face'] as int)));
  void act(String id, Map<String, dynamic> action) {
    final phase = game['phase'];
    if (phase == 'finished') throw StateError('This match has ended.');
    final type = action['type'];
    if (type == 'next') {
      if (phase != 'reveal' ||
          !players.any((p) => p['id'] == id && (p['count'] as int) > 0)) {
        throw StateError('An active player must continue.');
      }
      game['round'] = (game['round'] as int) + 1;
      game['bid'] = null;
      game['resolution'] = null;
      game['phase'] = 'bidding';
      _reroll();
    } else {
      if (phase != 'bidding' || current['id'] != id) {
        throw StateError('It is not your turn.');
      }
      final bid = game['bid'] as Map<String, dynamic>?;
      final history = game['history'] as List;
      if (type == 'bid') {
        final quantity = action['quantity'] as int;
        final face = action['face'] as int;
        if (!higher(quantity, face, bid, total)) {
          throw StateError(
            'Raise the quantity, or the face at the same quantity.',
          );
        }
        game['bid'] = {'quantity': quantity, 'face': face, 'playerId': id};
        history.add({
          'type': 'bid',
          'name': current['name'],
          'quantity': quantity,
          'face': face,
          'round': game['round'],
        });
        game['turn'] = _next(game['turn'] as int);
      } else if (type == 'catch') {
        if (bid == null) throw StateError('Wait for the first bid.');
        final actual = players.fold<int>(
          0,
          (sum, p) =>
              sum + (p['dice'] as List).where((d) => d == bid['face']).length,
        );
        final truthful = actual >= (bid['quantity'] as int);
        final loserId = truthful ? id : bid['playerId'];
        final loser = players.firstWhere((p) => p['id'] == loserId);
        final resolution = {
          'bid': Map<String, dynamic>.from(bid),
          'actual': actual,
          'truthful': truthful,
          'callerId': id,
          'loserId': loserId,
          'loserName': loser['name'],
          'dice': [
            for (final p in players)
              {
                'id': p['id'],
                'name': p['name'],
                'dice': List<int>.from(p['dice'] as List),
              },
          ],
        };
        game['resolution'] = resolution;
        history.add({
          'type': 'catch',
          'name': current['name'],
          'round': game['round'],
          ...resolution,
        });
        loser['count'] = (loser['count'] as int) - 1;
        final alive = players.where((p) => (p['count'] as int) > 0).toList();
        if (alive.length == 1) {
          game['phase'] = 'finished';
          game['winner'] = alive.first['id'];
        } else {
          game['phase'] = 'reveal';
          final i = players.indexOf(loser);
          game['turn'] = (loser['count'] as int) > 0 ? i : _next(i);
        }
      } else {
        throw StateError('Unknown action.');
      }
    }
    game['revision'] = (game['revision'] as int) + 1;
  }

  Map<String, dynamic> botAction() {
    if (game['phase'] == 'reveal') return {'type': 'next'};
    final bid = game['bid'] as Map<String, dynamic>?;
    if (bid == null) return {'type': 'bid', 'quantity': 1, 'face': roll()};
    final own = (current['dice'] as List).where((d) => d == bid['face']).length;
    final expected = own + (total - (current['count'] as int)) / 6;
    if ((bid['quantity'] as int) > expected + 1 ||
        (bid['quantity'] == total && bid['face'] == 6)) {
      return {'type': 'catch'};
    }
    return (bid['face'] as int) < 6
        ? {
            'type': 'bid',
            'quantity': bid['quantity'],
            'face': (bid['face'] as int) + 1,
          }
        : {
            'type': 'bid',
            'quantity': (bid['quantity'] as int) + 1,
            'face': roll(),
          };
  }

  Map<String, dynamic> view() => {
    ...game,
    'players': [
      for (final p in players)
        {...p, 'dice': p['id'] == 'local' ? p['dice'] : <int>[]},
    ],
  };
}
