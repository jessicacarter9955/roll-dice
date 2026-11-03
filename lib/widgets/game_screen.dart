import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:livekit_client/livekit_client.dart';
import '../services/app_model.dart';
import '../services/video.dart';
import '../services/smart_dice.dart';
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
  final smartDice = SmartDiceController();

  @override
  void dispose() {
    smartDice.dispose();
    super.dispose();
  }
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
    // The original ZIP table owns the entire phone viewport. All social and
    // room controls are accessible as overlays, never as rows that shrink it.
    return Stack(
      fit: StackFit.expand,
      children: [
        GameTable(
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
        Positioned(
          left: 6,
          top: 4,
          child: _floatingControl(
            IconButton(
              tooltip: 'Leave ${room['name']}',
              onPressed: leave,
              icon: const Icon(Icons.arrow_back, size: 18),
            ),
          ),
        ),
        Positioned(
          right: 6,
          top: 4,
          child: _floatingControl(
            IconButton(
              tooltip: '${app.players.length} players · see seats',
              onPressed: () => modal(playersPanel()),
              icon: Badge.count(
                count: app.players.length,
                child: const Icon(Icons.groups_outlined, size: 19),
              ),
            ),
          ),
        ),
        if (phase == 'waiting')
          Positioned(
            left: 12,
            right: 12,
            bottom: 72,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 340),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xee101814),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: waiting(),
                ),
              ),
            ),
          ),
        Positioned(
          left: 6,
          bottom: 6,
          child: _floatingControl(
            PopupMenuButton<String>(
              tooltip: 'Room, chat and video controls',
              icon: const Icon(Icons.more_horiz, size: 22),
              onSelected: menu,
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'players', child: Text('Players / seats')),
                PopupMenuItem(value: 'chat', child: Text('Chat · ${(room['chat'] as List).length}')),
                const PopupMenuItem(value: 'history', child: Text('History')),
                const PopupMenuItem(value: 'react', child: Text('Reactions')),
                const PopupMenuItem(value: 'video', child: Text('Video / microphone')),
                const PopupMenuItem(value: 'rules', child: Text('Game rules')),
                const PopupMenuItem(value: 'clip', child: Text('Export 10s table clip')),
                if (app.practice == null)
                  const PopupMenuItem(value: 'invite', child: Text('Copy table invite')),
                const PopupMenuItem(value: 'dice', child: Text('Smart dice status')),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _floatingControl(Widget child) => Material(
    color: Colors.black.withValues(alpha: .47),
    borderRadius: BorderRadius.circular(30),
    child: SizedBox(width: 42, height: 42, child: child),
  );

  void menu(String value) {
    switch (value) {
      case 'players':
        modal(playersPanel());
        return;
      case 'chat':
        modal(ChatPanel(app: app));
        return;
      case 'history':
        history();
        return;
      case 'react':
        reactions();
        return;
      case 'video':
        video();
        return;
      case 'rules':
        showSheet(context, const RulesContent());
        return;
      case 'clip':
        setState(() => clip++);
        return;
      case 'invite':
        Clipboard.setData(ClipboardData(text: app.room!['inviteCode'] as String));
        message('Table invite code copied.');
        return;
      case 'dice':
        modal(smartDicePanel());
        return;
    }
  }

  Widget playersPanel() {
    final turn = game != null && game!['phase'] == 'bidding'
        ? game!['turn'] as int
        : null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(22, 20, 22, 24),
      children: [
        Text(app.room!['name'] as String,
            style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Text(app.practice != null ? 'PRACTICE · NO WALLET CHANGES'
            : '${app.watching ? 'WATCHING' : 'FREE COINS'} · ${app.socketReady ? 'CONNECTED' : 'RECONNECTING…'}',
            style: const TextStyle(color: muted, fontSize: 11)),
        const SizedBox(height: 18),
        for (var i = 0; i < app.players.length; i++)
          ListTile(
            onTap: video,
            leading: SizedBox(
              width: 42,
              height: 42,
              child: playerAvatar(i),
            ),
            title: Text(app.players[i]['name'] as String),
            subtitle: Text('${app.players[i]['count'] ?? 5} dice · ${app.players[i]['bot'] == true ? 'BOT' : 'PLAYER'}'),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              if (i == turn) const Icon(Icons.casino, color: gold),
              if (app.practice == null &&
                  app.players[i]['id'] != app.myId &&
                  app.players[i]['bot'] != true)
                IconButton(
                  tooltip: 'Report player',
                  onPressed: () => reportPlayer(app.players[i]),
                  icon: const Icon(Icons.flag_outlined, size: 19),
                ),
            ]),
          ),
      ],
    );
  }

  Future<void> reportPlayer(Map<String, dynamic> player) async {
    String reason = 'harassment';
    final details = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, update) => AlertDialog(
          title: Text('Report ${player['name']}'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButton<String>(
              isExpanded: true,
              value: reason,
              onChanged: (value) => update(() => reason = value!),
              items: const [
                DropdownMenuItem(value: 'harassment', child: Text('Harassment')),
                DropdownMenuItem(value: 'spam', child: Text('Spam')),
                DropdownMenuItem(value: 'inappropriate-video', child: Text('Inappropriate video')),
                DropdownMenuItem(value: 'cheating', child: Text('Cheating')),
                DropdownMenuItem(value: 'other', child: Text('Other')),
              ],
            ),
            TextField(
              controller: details,
              maxLines: 3,
              maxLength: 1000,
              decoration: const InputDecoration(labelText: 'Details (optional)'),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Send report')),
          ],
        ),
      ),
    );
    final message = details.text;
    details.dispose();
    if (accepted != true) return;
    await app.run(() async {
      await app.request('/reports', method: 'POST', body: {
        'userId': player['id'], 'roomId': app.room?['id'],
        'reason': reason, 'details': message,
      });
    });
    if (app.error == null) messageToast('Report received. Thank you.');
  }

  void messageToast(String value) => message(value);

  Widget smartDicePanel() => AnimatedBuilder(
    animation: smartDice,
    builder: (context, _) => ListView(
      padding: const EdgeInsets.all(22),
      children: [
        const Text('Physical GoDice · experimental',
            style: TextStyle(fontSize: 23, fontWeight: FontWeight.w600)),
        const SizedBox(height: 10),
        const Text(
          'Pair up to five GoDice over Bluetooth. Stable D6 rolls appear here. '
          'Online hands and free coins are still decided by the server; '
          'phone-supplied BLE values are not trusted as match results.',
          style: TextStyle(color: muted, fontSize: 12, height: 1.5),
        ),
        const SizedBox(height: 16),
        if (smartDice.error != null)
          Text(smartDice.error!,
              style: const TextStyle(color: Color(0xfff0aaa3))),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: smartDice.busy
              ? null
              : smartDice.scanning
                  ? smartDice.stopScan
                  : smartDice.startScan,
          icon: Icon(smartDice.scanning ? Icons.stop : Icons.bluetooth_searching),
          label: Text(smartDice.scanning ? 'Stop scan' : 'Find GoDice'),
        ),
        if (smartDice.scanning) const LinearProgressIndicator(),
        const SizedBox(height: 12),
        Text('Connected · ${smartDice.connected.length}/5',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        for (final entry in smartDice.connected.entries)
          ListTile(
            leading: const Icon(Icons.casino, color: gold),
            title: Text(entry.value.name ?? 'GoDice'),
            subtitle: Text('Battery: ${smartDice.batteries[entry.key]?.toString() ?? '?'}%'),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              Text('${smartDice.values[entry.key] ?? '–'}',
                  style: const TextStyle(fontSize: 24)),
              IconButton(
                tooltip: 'Disconnect die',
                onPressed: () => smartDice.disconnect(entry.key),
                icon: const Icon(Icons.link_off),
              ),
            ]),
          ),
        if (app.practice != null &&
            app.game?['phase'] == 'bidding' &&
            app.game?['bid'] == null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: FilledButton(
              onPressed: smartDice.connected.length == app.myDice.length &&
                      smartDice.connected.keys.every(smartDice.values.containsKey)
                  ? () {
                      try {
                        app.usePhysicalPracticeDice([
                          for (final id in smartDice.connected.keys)
                            smartDice.values[id]!,
                        ]);
                        message('Physical D6 hand applied to local practice.');
                      } catch (e) {
                        message(e.toString());
                      }
                    }
                  : null,
              child: const Text('Use these rolls in offline practice'),
            ),
          ),
        if (smartDice.found.isEmpty && smartDice.connected.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('Wake a GoDice by shaking it, then scan.',
                style: TextStyle(color: muted)),
          ),
        for (final entry in smartDice.found.entries)
          if (!smartDice.connected.containsKey(entry.key))
            ListTile(
              leading: const Icon(Icons.bluetooth),
              title: Text(entry.value.name as String? ?? 'GoDice'),
              subtitle: Text(entry.key),
              trailing: OutlinedButton(
                onPressed: smartDice.busy || smartDice.connected.length >= 5
                    ? null
                    : () => smartDice.connect(entry.key),
                child: const Text('Pair'),
              ),
            ),
        const SizedBox(height: 16),
        const Text(
          'Commercial hardware/protocol authorization and real-device '
          'verification are still required before release.',
          style: TextStyle(fontSize: 11, color: muted),
        ),
      ],
    ),
  );

  Widget playerAvatar(int i) {
    final player = app.players[i];
    final track = widget.video.trackFor(player['id'] as String);
    return track != null
        ? VideoTrackRenderer(track)
        : Avatar(
            name: player['name'] as String,
            size: 36,
            color: (player['count'] as int? ?? 5) == 0
                ? muted
                : playerColors[i % 6],
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
