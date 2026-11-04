import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:street_circle/services/app_model.dart';

class _PendingTicketsModel extends AppModel {
  _PendingTicketsModel({required super.channelFactory})
    : super(api: 'https://example.test');

  final pendingTickets = <Completer<dynamic>>[];

  @override
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) {
    if (path != '/socket-ticket' || method != 'POST') {
      throw StateError('Unexpected request: $method $path');
    }
    final pending = Completer<dynamic>();
    pendingTickets.add(pending);
    return pending.future;
  }
}

void main() {
  test('a slow old ticket cannot replace a newer connection attempt', () async {
    var factoryCalls = 0;
    final app = _PendingTicketsModel(
      channelFactory: (Uri _) {
        factoryCalls++;
        // The socket itself is irrelevant: verify ticket ordering before it.
        throw StateError('Test socket is intentionally unavailable');
      },
    );
    addTearDown(app.dispose);
    app.token = 'a-test-session';

    final oldAttempt = app.connect();
    final newAttempt = app.connect();
    await Future<void>.delayed(Duration.zero);
    expect(app.pendingTickets, hasLength(2));

    app.pendingTickets[1].complete({'ticket': 'new'});
    await newAttempt;
    expect(factoryCalls, 1);

    app.pendingTickets[0].complete({'ticket': 'old'});
    await oldAttempt;
    expect(factoryCalls, 1, reason: 'The superseded ticket must be ignored');
  });

  test('disposing while a ticket is pending cannot open a socket', () async {
    var factoryCalls = 0;
    final app = _PendingTicketsModel(
      channelFactory: (Uri _) {
        factoryCalls++;
        throw StateError('Should not be called after disposal');
      },
    );
    app.token = 'a-test-session';

    final attempt = app.connect();
    await Future<void>.delayed(Duration.zero);
    expect(app.pendingTickets, hasLength(1));
    app.dispose();

    app.pendingTickets.single.complete({'ticket': 'too-late'});
    await attempt;
    expect(factoryCalls, 0);
  });
}
