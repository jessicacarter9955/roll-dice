import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:livekit_client/livekit_client.dart';
import '../services/app_model.dart';
import '../services/video.dart';
import 'game_table.dart';
import 'ui.dart';
import 'forms.dart';

class GameScreen extends StatefulWidget {
  const GameScreen({super.key, required this.app, required this.video});
  final AppModel app;
  final VideoSession video;
  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  int clip = 0;
  AppModel get app => widget.app;
  Map<String, dynamic>? get game => app.game;
  void message(String s) {
    if (mounted) toast(context, s);
  }

  @override
  Widget build(BuildContext context) {
    final room = app.room!;
    final phase = game?['phase'] as String? ?? 'waiting';
    final active = game != null && phase == 'bidding'
        ? app.players[game!['turn'] as int]
        : null;
    final alive = app.players.any(
      (p) => p['id'] == app.myId && (p['count'] as int? ?? 5) > 0,
    );
    final winner = app.players
        .where((p) => p['id'] == game?['winner'])
        .firstOrNull;
    final bid = game?['bid'] as Map<String, dynamic>?;
    final status = phase == 'waiting'
        ? 'Invite your friends to start.'
        : phase == 'finished'
        ? '${winner?['name'] ?? 'The circle'} wins the match.'
        : phase == 'reveal'
        ? 'Catch resolved · view the revealed dice.'
        : app.myTurn
        ? bid == null
              ? 'Your turn · make the first bid.'
              : 'Your turn · raise the bid or call Catch!'
        : '${active?['name'] ?? 'Player'} is making a call…';
    return Column(
      children: [
        SizedBox(
          height: 44,
          child: Row(
            children: [
              IconButton(
                tooltip: 'Leave table',
                onPressed: leave,
                icon: const Icon(Icons.arrow_back, size: 18),
              ),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      room['name'] as String,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      app.practice != null
                          ? 'PRACTICE · NO WALLET CHANGES'
                          : '${app.watching ? 'WATCHING' : 'FREE COINS'} · ${app.socketReady ? 'CONNECTED' : 'RECONNECTING…'}',
                      style: const TextStyle(
                        color: muted,
                        fontSize: 7,
                        letterSpacing: .8,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Game rules',
                onPressed: () => showSheet(context, const RulesContent()),
                icon: const Icon(Icons.info_outline, size: 17, color: muted),
              ),
              PopupMenuButton<String>(
                iconSize: 18,
                onSelected: (v) {
                  if (v == 'clip') {
                    if (kIsWeb) {
                      setState(() => clip++);
                    } else {
                      message(
                        'Table clip export is currently available in the web build.',
                      );
                    }
                  }
                  if (v == 'invite') {
                    Clipboard.setData(
                      ClipboardData(text: room['inviteCode'] as String),
                    );
                    message('Table invite code copied.');
                  }
                  if (v == 'dice') {
                    message(
                      'This build uses server-generated dice. GoDice hardware integration and device verification are pending.',
                    );
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'clip',
                    child: Text('Export 10s table clip'),
                  ),
                  if (app.practice == null)
                    const PopupMenuItem(
                      value: 'invite',
                      child: Text('Copy table invite'),
                    ),
                  const PopupMenuItem(
                    value: 'dice',
                    child: Text('Smart dice status'),
                  ),
                ],
              ),
            ],
          ),
        ),
        SizedBox(
          height: 46,
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(8, 2, 8, 4),
            scrollDirection: Axis.horizontal,
            itemCount: app.players.length,
            separatorBuilder: (_, _) => const SizedBox(width: 5),
            itemBuilder: (_, i) {
              final p = app.players[i];
              final turn = active?['id'] == p['id'];
              final count = p['count'] as int? ?? 5;
              final track = widget.video.trackFor(p['id'] as String);
              return InkWell(
                onTap: video,
                child: Container(
                  width: 88,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  decoration: BoxDecoration(
                    color: panel,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: turn ? gold : Colors.white.withValues(alpha: .07),
                    ),
                  ),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 25,
                        height: 30,
                        child: track != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: VideoTrackRenderer(track),
                              )
                            : Avatar(
                                name: p['name'] as String,
                                size: 24,
                                color: count == 0 ? muted : playerColors[i % 6],
                              ),
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              p['name'] as String,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 8),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '${p['bot'] == true
                                  ? 'BOT'
                                  : p['id'] == app.myId
                                  ? 'YOU'
                                  : 'PLAYER'} · $count dice',
                              style: const TextStyle(color: muted, fontSize: 6),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        Expanded(
          child: GameTable(
            key: const Key('portrait-table'),
            dice: app.myDice,
            round: game?['round'] as int? ?? 0,
            clip: clip,
            onEvent: message,
            onAction: (action) {
              if (action['type'] == 'rematch') {
                rematch();
              } else {
                app.run(() => app.action(action));
              }
            },
            state: {
              'phase': phase,
              'bid': bid,
              'status': status,
              'myTurn': app.myTurn,
              'busy': app.busy,
              'totalDice': app.totalDice,
              'canContinue': alive || app.practice != null,
              'canRematch': !app.watching,
              'balance': app.user?['coins'] ?? 1000,
              'pot': room['pot'],
              'resolution': game?['resolution'],
              'winnerName': winner?['name'],
              'practice': app.practice != null,
              'deadline': game?['deadline'],
            },
          ),
        ),
        if (phase == 'waiting')
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: waiting(),
          ),
        SizedBox(
          height: 40,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              tool(
                Icons.chat_bubble_outline,
                'Chat ${(room['chat'] as List).length}',
                () => modal(ChatPanel(app: app)),
              ),
              tool(Icons.history, 'History', history),
              tool(Icons.sentiment_satisfied_alt, 'React', reactions),
              tool(
                widget.video.room == null
                    ? Icons.videocam_off_outlined
                    : Icons.videocam_outlined,
                'Video',
                video,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget waiting() => Column(
    children: [
      Text(
        '${app.players.length}/8 seats · ${app.room!['ante']} free coins per player',
        style: const TextStyle(color: muted, fontSize: 11),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: () {
          Clipboard.setData(
            ClipboardData(text: app.room!['inviteCode'] as String),
          );
          message('Invite code copied.');
        },
        icon: const Icon(Icons.copy, size: 14),
        label: Text('Invite · ${app.room!['inviteCode']}'),
      ),
      if (app.room!['hostId'] == app.myId) ...[
        const SizedBox(height: 8),
        Row(
          children: [
            if (app.config['allowGuests'] == true) ...[
              Expanded(
                child: OutlinedButton(
                  onPressed: app.busy
                      ? null
                      : () => app.run(() => app.roomCall('bot')),
                  child: const Text(
                    'Add practice bot',
                    style: TextStyle(fontSize: 11),
                  ),
                ),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: FilledButton(
                onPressed: app.busy || app.players.length < 2
                    ? null
                    : () => app.run(() => app.roomCall('start')),
                child: const Text('Start match'),
              ),
            ),
          ],
        ),
      ],
    ],
  );
  Widget tool(IconData icon, String label, VoidCallback action) => InkWell(
    onTap: action,
    borderRadius: BorderRadius.circular(10),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: muted),
          const SizedBox(width: 5),
          Text(label, style: const TextStyle(color: muted, fontSize: 9)),
        ],
      ),
    ),
  );
  Future<void> leave() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave this circle?'),
        content: Text(
          app.practice != null
              ? 'You can start a new practice match any time.'
              : game != null && game!['phase'] != 'finished'
              ? 'Leaving forfeits this match and your entry coins.'
              : 'You can rejoin with the table invite.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Stay'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    if (yes == true) {
      await app.run(() async {
        await widget.video.disconnect();
        await app.leave();
      });
    }
  }

  void rematch() {
    if (app.practice != null) {
      app.startPractice(opponents: app.players.length - 1);
      return;
    }
    app.run(() async {
      await app.roomCall('rematch');
      if (app.room!['hostId'] == app.myId &&
          (app.room!['rematch'] as List).length ==
              (app.room!['players'] as List)
                  .where((p) => p['bot'] != true)
                  .length) {
        await app.roomCall('start');
      }
    });
  }

  void modal(Widget content) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    constraints: const BoxConstraints(maxWidth: 450),
    builder: (ctx) =>
        SizedBox(height: MediaQuery.sizeOf(ctx).height * .66, child: content),
  );
  void history() => modal(
    ListView(
      padding: const EdgeInsets.fromLTRB(22, 0, 22, 24),
      children: [
        const Text(
          'The story so far.',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        const Text(
          'Every call. Every catch. Every revealed die.',
          style: TextStyle(color: muted, fontSize: 12),
        ),
        const SizedBox(height: 20),
        if ((game?['history'] as List? ?? []).isEmpty)
          const Text(
            'The first call is still to come.',
            style: TextStyle(color: muted),
          ),
        for (final h in (game?['history'] as List? ?? []).reversed)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Tile(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Eyebrow('ROUND ${h['round']}'),
                  const SizedBox(height: 8),
                  Text(
                    h['type'] == 'bid'
                        ? '${h['name']} bid ${h['quantity']} × ${h['face']}'
                        : h['type'] == 'forfeit'
                        ? '${h['name']} forfeited.'
                        : '${h['name']} called catch. ${h['loserName']} lost a die.',
                    style: const TextStyle(fontSize: 12, height: 1.5),
                  ),
                  if (h['type'] == 'catch') ...[
                    const SizedBox(height: 12),
                    for (final p in h['dice'] as List)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 7),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 70,
                              child: Text(
                                p['name'] as String,
                                style: const TextStyle(
                                  color: muted,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                            for (final d in p['dice'] as List)
                              Padding(
                                padding: const EdgeInsets.only(right: 4),
                                child: Dice(
                                  value: d as int,
                                  size: 22,
                                  goldFace: d == h['bid']['face'],
                                ),
                              ),
                          ],
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
      ],
    ),
  );
  void reactions() => showModalBottomSheet<void>(
    context: context,
    constraints: const BoxConstraints(maxWidth: 450),
    builder: (ctx) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 30),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          for (final reaction in ['🔥', '👏', '😂', '🎲', '👀'])
            IconButton(
              onPressed: () {
                Navigator.pop(ctx);
                app.run(() => app.chat(reaction, reaction: true));
              },
              icon: Text(reaction, style: const TextStyle(fontSize: 28)),
            ),
        ],
      ),
    ),
  );
  void video() => modal(
    AnimatedBuilder(
      animation: widget.video,
      builder: (_, _) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'See your circle.',
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            Text(
              app.practice != null
                  ? 'Practice players are bots. Live cameras are available at connected tables when the video service is configured.'
                  : app.watching
                  ? 'Watch the table with your camera and microphone off.'
                  : 'Join video first, then enable your camera or microphone when you’re ready.',
              style: const TextStyle(color: muted, height: 1.6, fontSize: 13),
            ),
            const SizedBox(height: 22),
            if (widget.video.error != null)
              Text(
                widget.video.error!,
                style: const TextStyle(color: Color(0xfff0aaa3), fontSize: 12),
              ),
            const SizedBox(height: 12),
            if (widget.video.room == null)
              FilledButton.icon(
                onPressed: widget.video.connecting
                    ? null
                    : () => widget.video.connect(app),
                icon: const Icon(Icons.videocam_outlined),
                label: Text(
                  widget.video.connecting ? 'Connecting…' : 'Join video',
                ),
              )
            else ...[
              if (!app.watching)
                Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: widget.video.toggleCamera,
                      icon: Icon(
                        widget.video.camera
                            ? Icons.videocam
                            : Icons.videocam_off,
                      ),
                      label: Text(
                        widget.video.camera ? 'Camera on' : 'Camera off',
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: widget.video.toggleMicrophone,
                      icon: Icon(
                        widget.video.microphone ? Icons.mic : Icons.mic_off,
                      ),
                      label: Text(
                        widget.video.microphone ? 'Mic on' : 'Mic off',
                      ),
                    ),
                  ],
                ),
              TextButton(
                onPressed: widget.video.disconnect,
                child: const Text('Disconnect video'),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}
