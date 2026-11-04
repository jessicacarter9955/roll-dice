import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:street_circle/widgets/ui.dart';

void main() {
  testWidgets('rules open in Italian and explain Bid is a dice claim', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: RulesContent()),
      ),
    ));

    expect(find.text('Come si gioca'), findsOneWidget);
    expect(find.text('Bid NON è una puntata di denaro'), findsOneWidget);
    expect(find.textContaining('lanciati automaticamente'), findsOneWidget);
    expect(find.textContaining('Catch è disabilitato'), findsOneWidget);

    await tester.tap(find.byKey(const Key('rules-en')));
    await tester.pump();

    expect(find.text('How to play'), findsOneWidget);
    expect(find.text('Bid is NOT a money bet'), findsOneWidget);
    expect(find.textContaining('not your latest Bid'), findsOneWidget);

    await tester.tap(find.byKey(const Key('rules-it')));
    await tester.pump();
    expect(find.text('Come si gioca'), findsOneWidget);
  });

  testWidgets('dice ownership strip labels my dice and keeps other faces private', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: DiceOwnershipLegend(
        players: [
          {'id': 'local', 'name': 'You', 'count': 5},
          {'id': 'bot-0', 'name': 'Maya', 'count': 4},
          {'id': 'bot-1', 'name': 'Rio', 'count': 3},
        ],
        myId: 'local',
        watching: false,
        phase: 'bidding',
        turnIndex: 1,
      )),
    ));

    expect(find.textContaining('Dadi visibili: TUOI'), findsOneWidget);
    expect(find.text('TU · 5'), findsOneWidget);
    expect(find.text('Maya · 4'), findsOneWidget);
    expect(find.text('Rio · 3'), findsOneWidget);
    expect(find.byIcon(Icons.lock_outline), findsNWidgets(2));
    expect(find.byIcon(Icons.arrow_forward_ios), findsOneWidget);
  });

  testWidgets('after Catch the other rack is labelled with the bidder', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: DiceOwnershipLegend(
        players: [
          {'id': 'local', 'name': 'You', 'count': 4},
          {'id': 'bot-0', 'name': 'Maya', 'count': 5},
        ],
        myId: 'local',
        watching: false,
        phase: 'reveal',
        revealOwner: 'Maya',
      )),
    ));
    expect(find.text('Dadi: TU + Maya'), findsOneWidget);
    expect(find.text('Maya · 5'), findsOneWidget);
    expect(find.byIcon(Icons.arrow_forward_ios), findsNothing);
  });
}
