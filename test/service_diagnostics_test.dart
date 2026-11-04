import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:street_circle/services/app_model.dart';
import 'package:street_circle/widgets/forms.dart';

void main() {
  testWidgets('service diagnostics distinguish provider setup from real delivery', (tester) async {
    final app = AppModel(api: 'https://example.test');
    addTearDown(app.dispose);
    app.server = true;
    app.config = {'sms': false, 'video': true};
    app.token = 'not-for-diagnostics';

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: ServiceForm(app: app))),
    ));
    expect(find.textContaining('Game API: last check succeeded'), findsOneWidget);
    expect(find.textContaining('SMS: not configured'), findsOneWidget);
    expect(find.textContaining('Live video: configured, calls untested'), findsOneWidget);
    expect(find.textContaining('Realtime: sign in to test'), findsOneWidget);
    expect(find.textContaining('configuration alone does not confirm'), findsOneWidget);
    expect(find.text('Copy safe diagnostics'), findsOneWidget);
    expect(find.text('Recheck API and providers'), findsOneWidget);
  });
}
