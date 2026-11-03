import 'dart:math';
import 'package:flutter/material.dart';
import 'services/app_model.dart';
import 'services/video.dart';
import 'widgets/ui.dart';
import 'widgets/forms.dart';
import 'widgets/game_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const StreetCircleApp());
}

class StreetCircleApp extends StatefulWidget {
  const StreetCircleApp({super.key});
  @override
  State<StreetCircleApp> createState() => _StreetCircleAppState();
}

class _StreetCircleAppState extends State<StreetCircleApp> {
  final app = AppModel();
  final video = VideoSession();
  int tab = 0;
  double phoneWidth = 393;
  @override
  void initState() {
    super.initState();
    app.init();
  }

  @override
  void dispose() {
    app.dispose();
    video.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Street Circle · Roll Dice',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: ink,
      fontFamily: 'Arial',
      colorScheme: const ColorScheme.dark(
        primary: gold,
        secondary: green,
        surface: panel,
        error: Color(0xfff0aaa3),
      ),
      dividerColor: Colors.white.withValues(alpha: .08),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xff223029),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: gold,
          foregroundColor: ink,
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: gold,
          minimumSize: const Size(0, 44),
          side: BorderSide(color: gold.withValues(alpha: .3)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 66,
        backgroundColor: ink,
        indicatorColor: gold.withValues(alpha: .13),
        labelTextStyle: const WidgetStatePropertyAll(
          TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: ink,
        showDragHandle: true,
      ),
    ),
    home: AnimatedBuilder(
      animation: Listenable.merge([app, video]),
      builder: (context, _) => LayoutBuilder(
        builder: (context, c) {
          final phone = _phone(context);
          if (c.maxWidth < 480) return phone;
          final scale = min(1.0, max(400.0, c.maxHeight - 48) / 872);
          return Scaffold(
            backgroundColor: const Color(0xff0a100e),
            body: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (c.maxWidth > 1050)
                  SizedBox(
                    width: 250,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 40),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Brand(),
                          const SizedBox(height: 42),
                          const Text(
                            'Your circle.\nYour call.',
                            style: TextStyle(
                              fontSize: 36,
                              fontWeight: FontWeight.w600,
                              height: 1.1,
                              letterSpacing: -1.4,
                            ),
                          ),
                          const SizedBox(height: 18),
                          const Text(
                            'A little luck. A good bluff.\nOne more round with your people.',
                            style: TextStyle(
                              color: muted,
                              height: 1.7,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 42),
                          const Eyebrow('ON THE TABLE'),
                          const SizedBox(height: 12),
                          const Text(
                            'Liar’s Dice',
                            style: TextStyle(fontSize: 18),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            '2–8 players · Free coins only',
                            style: TextStyle(color: muted, fontSize: 12),
                          ),
                          const SizedBox(height: 28),
                          Text(
                            app.socketReady
                                ? '●  Connected to your circle'
                                : '●  Practice is ready to play',
                            style: const TextStyle(color: muted, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ),
                SizedBox(
                  width: (phoneWidth + 20) * scale,
                  height: 872 * scale,
                  child: FittedBox(
                    child: Container(
                      width: phoneWidth + 20,
                      height: 872,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xff252b27),
                        borderRadius: BorderRadius.circular(48),
                        border: Border.all(color: const Color(0xff424b44)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: .5),
                            blurRadius: 70,
                            offset: const Offset(0, 24),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(39),
                        child: Column(
                          children: [
                            Container(
                              height: 31,
                              color: ink,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 26,
                              ),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text(
                                    '9:41',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Container(
                                    width: 83,
                                    height: 20,
                                    decoration: BoxDecoration(
                                      color: const Color(0xff080d0b),
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                  ),
                                  const Row(
                                    children: [
                                      Icon(Icons.signal_cellular_alt, size: 13),
                                      SizedBox(width: 4),
                                      Icon(Icons.wifi, size: 13),
                                      SizedBox(width: 4),
                                      Icon(Icons.battery_full, size: 16),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            Expanded(
                              child: SizedBox(width: phoneWidth, child: phone),
                            ),
                            Container(
                              height: 16,
                              color: ink,
                              alignment: Alignment.center,
                              child: Container(
                                width: 110,
                                height: 4,
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: .5),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                if (c.maxWidth > 1200)
                  SizedBox(
                    width: 228,
                    child: Padding(
                      padding: const EdgeInsets.only(left: 42),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Eyebrow('PHONE PREVIEW'),
                          const SizedBox(height: 14),
                          DropdownButton<double>(
                            value: phoneWidth,
                            isExpanded: true,
                            items: const [
                              DropdownMenuItem(
                                value: 360,
                                child: Text('Compact · 360'),
                              ),
                              DropdownMenuItem(
                                value: 393,
                                child: Text('Standard · 393'),
                              ),
                              DropdownMenuItem(
                                value: 430,
                                child: Text('Large · 430'),
                              ),
                            ],
                            onChanged: (v) => setState(() => phoneWidth = v!),
                          ),
                          const SizedBox(height: 26),
                          const Text(
                            'Make your first call.',
                            style: TextStyle(fontSize: 20),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'Start a practice circle to learn the flow. Your opponents are labelled, and no coins leave your wallet.',
                            style: TextStyle(
                              color: muted,
                              height: 1.7,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 24),
                          TextButton.icon(
                            onPressed: () =>
                                showSheet(context, const RulesContent()),
                            icon: const Icon(
                              Icons.menu_book_outlined,
                              size: 16,
                            ),
                            label: const Text(
                              'Read the rules',
                              style: TextStyle(fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    ),
  );
  Widget _phone(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Column(
        children: [
          if (app.busy)
            const LinearProgressIndicator(minHeight: 2, color: gold),
          if (app.error != null)
            Container(
              color: const Color(0xff4b2e2a),
              padding: const EdgeInsets.only(left: 14),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      app.error!,
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                  IconButton(
                    onPressed: app.clearError,
                    icon: const Icon(Icons.close, size: 16),
                  ),
                ],
              ),
            ),
          Expanded(
            child: app.room != null
                ? GameScreen(app: app, video: video)
                : Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
                        child: Row(
                          children: [
                            const Expanded(child: Brand()),
                            InkWell(
                              onTap: () => setState(() => tab = 3),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: gold.withValues(alpha: .08),
                                  borderRadius: BorderRadius.circular(24),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.toll,
                                      size: 16,
                                      color: gold,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      '${app.user?['coins'] ?? 1000}',
                                      style: const TextStyle(
                                        color: gold,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: switch (tab) {
                          1 => CrewsPage(app: app),
                          2 => PeoplePage(app: app),
                          3 => ProfilePage(app: app),
                          _ => _lobby(context),
                        },
                      ),
                    ],
                  ),
          ),
        ],
      ),
    ),
    bottomNavigationBar: app.room != null
        ? null
        : NavigationBar(
            selectedIndex: tab,
            onDestinationSelected: (i) => setState(() => tab = i),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.grid_view_rounded, size: 21),
                label: 'Lobby',
              ),
              NavigationDestination(
                icon: Icon(Icons.groups_outlined, size: 23),
                label: 'Crews',
              ),
              NavigationDestination(
                icon: Icon(Icons.people_outline, size: 22),
                label: 'People',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline, size: 22),
                label: 'You',
              ),
            ],
          ),
  );
  void account(BuildContext context, VoidCallback action) {
    if (app.user == null) {
      showSheet(context, SignInForm(app: app));
    } else {
      action();
    }
  }

  Widget _lobby(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
    children: [
      const Eyebrow('GOOD COMPANY. GOOD GAME.'),
      const SizedBox(height: 16),
      Text(
        app.user == null ? 'Pull up a seat.' : 'Welcome back,\n${app.name}.',
        style: const TextStyle(
          fontSize: 34,
          height: 1.08,
          letterSpacing: -1.1,
          fontWeight: FontWeight.w600,
        ),
      ),
      const SizedBox(height: 12),
      const Text(
        'Read the room. Raise the stakes.\nKnow when to call their bluff.',
        style: TextStyle(color: muted, height: 1.6, fontSize: 13),
      ),
      const SizedBox(height: 24),
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xff2d3d2b), Color(0xff1c2b23)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: gold.withValues(alpha: .18)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Eyebrow('LEARN THE TABLE'),
                      SizedBox(height: 12),
                      Text(
                        'Liar’s Dice',
                        style: TextStyle(
                          fontSize: 26,
                          letterSpacing: -.7,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      SizedBox(height: 7),
                      Text(
                        'A game of nerve & numbers.',
                        style: TextStyle(color: muted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                Transform.rotate(
                  angle: .18,
                  child: const Dice(value: 5, size: 50, goldFace: true),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Row(
              children: [
                Tag('2–8 players'),
                SizedBox(width: 6),
                Tag('5 dice each'),
                Spacer(),
                Icon(Icons.arrow_outward, size: 18, color: gold),
              ],
            ),
            const SizedBox(height: 22),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const Key('practice'),
                onPressed: app.initialized ? () => app.startPractice() : null,
                icon: const Icon(Icons.casino_outlined, size: 19),
                label: const Text('Play a practice round'),
              ),
            ),
            const SizedBox(height: 10),
            const Center(
              child: Text(
                'Practice opponents · No wallet changes',
                style: TextStyle(color: muted, fontSize: 10),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => account(
                context,
                () => showSheet(context, CreateTableForm(app: app)),
              ),
              icon: const Icon(Icons.add, size: 17),
              label: const Text('Create table', style: TextStyle(fontSize: 12)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => account(
                context,
                () => showSheet(
                  context,
                  EntryForm(
                    app: app,
                    title: 'Your seat is waiting.',
                    label: 'Table invite code',
                    button: 'Join circle',
                    alternate: 'Watch instead',
                    submit: (s, watch) => app.join(code: s, watch: watch),
                  ),
                ),
              ),
              icon: const Icon(Icons.key_outlined, size: 17),
              label: const Text('Join by code', style: TextStyle(fontSize: 12)),
            ),
          ),
        ],
      ),
      const SizedBox(height: 28),
      const Row(
        children: [
          Expanded(
            child: Text(
              'Open circles',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
            ),
          ),
          Tag('FREE COINS', color: green),
        ],
      ),
      const SizedBox(height: 14),
      if (app.rooms.isEmpty)
        Tile(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.chair_alt_outlined, size: 26, color: muted),
              const SizedBox(height: 10),
              const Text(
                'The next circle starts with you.',
                style: TextStyle(fontSize: 13),
              ),
              const SizedBox(height: 6),
              Text(
                app.user == null
                    ? 'Sign in to create a table or join your friends.'
                    : 'Create a table and share your invite code.',
                style: const TextStyle(color: muted, height: 1.5, fontSize: 11),
              ),
              TextButton(
                onPressed: () => account(
                  context,
                  () => showSheet(context, CreateTableForm(app: app)),
                ),
                child: Text(
                  app.user == null
                      ? 'Sign in to play together →'
                      : 'Start your circle →',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      for (final r in app.rooms)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Tile(
            child: Row(
              children: [
                const Icon(Icons.casino_outlined, color: gold),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        r['name'] as String,
                        style: const TextStyle(fontSize: 13),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${r['players']}/8 players · ${r['ante']} coins',
                        style: const TextStyle(color: muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () => account(
                    context,
                    () => app.run(
                      () => app.join(
                        id: r['id'] as String,
                        watch: !['waiting', 'finished'].contains(r['phase']),
                      ),
                    ),
                  ),
                  child: Text(
                    ['waiting', 'finished'].contains(r['phase'])
                        ? 'Join'
                        : 'Watch',
                  ),
                ),
              ],
            ),
          ),
        ),
      const SizedBox(height: 24),
      InkWell(
        onTap: () => showSheet(context, const RulesContent()),
        child: const Row(
          children: [
            Icon(Icons.menu_book_outlined, color: muted, size: 19),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'New to bluffing? Learn in a minute.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ),
            Icon(Icons.chevron_right, size: 16, color: muted),
          ],
        ),
      ),
    ],
  );
}
