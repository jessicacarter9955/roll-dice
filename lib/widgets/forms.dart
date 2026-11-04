import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/app_model.dart';
import 'ui.dart';

class EntryForm extends StatefulWidget {
  const EntryForm({
    super.key,
    required this.app,
    required this.title,
    required this.label,
    required this.button,
    required this.submit,
    this.alternate,
  });
  final AppModel app;
  final String title, label, button;
  final String? alternate;
  final Future<void> Function(String, bool) submit;
  @override
  State<EntryForm> createState() => _EntryFormState();
}

class _EntryFormState extends State<EntryForm> {
  final text = TextEditingController();
  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Future<void> submit(bool alt) async {
    await widget.app.run(() => widget.submit(text.text.trim(), alt));
    if (widget.app.error == null && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.app,
    builder: (_, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.title,
          style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 22),
        TextField(
          controller: text,
          decoration: InputDecoration(labelText: widget.label),
          maxLength: 40,
          onSubmitted: (_) => widget.app.busy ? null : submit(false),
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: widget.app.busy ? null : () => submit(false),
            child: Text(widget.button),
          ),
        ),
        if (widget.alternate != null)
          Center(
            child: TextButton(
              onPressed: widget.app.busy ? null : () => submit(true),
              child: Text(widget.alternate!),
            ),
          ),
        if (widget.app.error != null)
          Text(
            widget.app.error!,
            style: const TextStyle(color: Color(0xfff0aaa3), fontSize: 12),
          ),
      ],
    ),
  );
}

class SignInForm extends StatefulWidget {
  const SignInForm({super.key, required this.app});
  final AppModel app;
  @override
  State<SignInForm> createState() => _SignInFormState();
}

class _SignInFormState extends State<SignInForm> {
  final name = TextEditingController(),
      phone = TextEditingController(),
      pin = TextEditingController();
  bool sent = false, consent = false, busy = false;
  String? error;
  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    pin.dispose();
    super.dispose();
  }

  Future<void> act(Future<void> Function() action) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
      if (mounted && widget.app.user != null) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Eyebrow('WELCOME TO THE CIRCLE'),
      const SizedBox(height: 12),
      const Text(
        'Let’s make it yours.',
        style: TextStyle(fontSize: 28, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 12),
      const Text(
        'Choose a username your people will recognize.',
        style: TextStyle(color: muted, fontSize: 12, height: 1.5),
      ),
      const SizedBox(height: 22),
      TextField(
        controller: name,
        maxLength: 20,
        decoration: const InputDecoration(
          labelText: 'Username',
          prefixText: '@',
          helperText: '3–20 letters, numbers or underscores',
        ),
      ),
      const SizedBox(height: 12),
      if (!widget.app.server) ...[
        const Text(
          'No game service is connected. Practice is available from the lobby.',
          style: TextStyle(color: muted, fontSize: 12, height: 1.6),
        ),
        TextButton(
          onPressed: () {
            Navigator.pop(context);
            showSheet(context, ServiceForm(app: widget.app));
          },
          child: const Text('Connect game service'),
        ),
      ] else ...[
        if (widget.app.config['sms'] == true) ...[
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone number',
              hintText: '+1 555 123 4567',
            ),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: consent,
            onChanged: (v) => setState(() => consent = v!),
            title: const Text(
              'I agree to receive a verification SMS. Carrier rates may apply.',
              style: TextStyle(color: muted, fontSize: 11),
            ),
          ),
          if (sent)
            TextField(
              controller: pin,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'SMS verification code',
              ),
            ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: busy || !consent
                  ? null
                  : () => act(() async {
                      final p = phone.text.replaceAll(RegExp(r'[\s()-]'), '');
                      if (sent) {
                        await widget.app.verifySms(
                          p,
                          pin.text.trim(),
                          name.text.trim(),
                        );
                      } else {
                        await widget.app.sendSms(p);
                        setState(() => sent = true);
                      }
                    }),
              child: Text(sent ? 'Verify & sign in' : 'Send verification code'),
            ),
          ),
          if (sent)
            TextButton(
              onPressed: busy ? null : () => setState(() => sent = false),
              child: const Text('Change number or resend code'),
            ),
        ] else
          const Text(
            'Phone sign-in is not configured on this review server.',
            style: TextStyle(color: muted, fontSize: 12, height: 1.6),
          ),
        if (widget.app.config['allowGuests'] == true) ...[
          const SizedBox(height: 20),
          const Divider(),
          const SizedBox(height: 10),
          const Eyebrow('LOCAL REVIEW ACCOUNT'),
          const SizedBox(height: 8),
          const Text(
            'For testing connected rooms. This does not verify a phone number.',
            style: TextStyle(color: muted, fontSize: 11, height: 1.5),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: busy
                  ? null
                  : () => act(() => widget.app.login(name.text.trim())),
              child: const Text('Create review account'),
            ),
          ),
        ],
      ],
      if (error != null)
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Text(
            error!,
            style: const TextStyle(color: Color(0xfff0aaa3), fontSize: 12),
          ),
        ),
      const SizedBox(height: 20),
      const Text(
        'Free coins have no cash value. No real-money modes are enabled.',
        style: TextStyle(color: muted, fontSize: 10, height: 1.5),
      ),
    ],
  );
}

class ServiceForm extends StatefulWidget {
  const ServiceForm({super.key, required this.app});
  final AppModel app;
  @override
  State<ServiceForm> createState() => _ServiceFormState();
}

class _ServiceFormState extends State<ServiceForm> {
  late final text = TextEditingController(text: widget.app.api);
  String? error;
  bool busy = false;

  Future<void> recheck() async {
    setState(() { busy = true; error = null; });
    try {
      await widget.app.recheckServer();
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget statusLine(String label, String status, bool? ready) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(children: [
      Icon(ready == null ? Icons.help_outline : ready ? Icons.check_circle_outline : Icons.error_outline,
        size: 17, color: ready == null ? muted : ready ? green : const Color(0xfff0aaa3)),
      const SizedBox(width: 9),
      Expanded(child: Text('$label: $status', style: const TextStyle(fontSize: 12))),
    ]),
  );

  String get safeDiagnostics => [
    'Street Circle connection diagnostics',
    'Game API: ${widget.app.server ? 'reachable on last check' : 'not connected'}',
    'SMS provider configured: ${widget.app.server && widget.app.config['sms'] == true}',
    'Live video provider configured: ${widget.app.server && widget.app.config['video'] == true}',
    'Realtime socket: ${widget.app.user == null ? 'not tested (sign in first)' : widget.app.socketReady ? 'connected' : 'disconnected'}',
    'Note: configured providers have not necessarily passed real SMS/video delivery tests.',
  ].join('\n');

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Connect your game.', style: TextStyle(fontSize: 26)),
      const SizedBox(height: 14),
      const Text(
        'Use the Street Circle service URL supplied by your host. Changing service signs you out.',
        style: TextStyle(color: muted, fontSize: 12, height: 1.6),
      ),
      const SizedBox(height: 18),
      TextField(
        controller: text,
        decoration: const InputDecoration(labelText: 'Game service URL'),
        keyboardType: TextInputType.url,
      ),
      const SizedBox(height: 18),
      FilledButton(
        onPressed: busy
            ? null
            : () async {
                setState(() {
                  busy = true;
                  error = null;
                });
                try {
                  await widget.app.configureApi(text.text);
                  if (context.mounted) Navigator.pop(context);
                } catch (e) {
                  if (mounted) {
                    setState(
                      () =>
                          error = e.toString().replaceFirst('Exception: ', ''),
                    );
                  }
                } finally {
                  if (mounted) setState(() => busy = false);
                }
              },
        child: Text(busy ? 'Connecting…' : 'Connect service'),
      ),
      const SizedBox(height: 24),
      const Eyebrow('SERVICE DIAGNOSTICS'),
      const SizedBox(height: 8),
      statusLine('Game API', widget.app.server ? 'last check succeeded' : 'not connected', widget.app.server),
      statusLine('SMS', widget.app.server && widget.app.config['sms'] == true ? 'configured, delivery untested' : 'not configured', widget.app.server && widget.app.config['sms'] == true),
      statusLine('Live video', widget.app.server && widget.app.config['video'] == true ? 'configured, calls untested' : 'not configured', widget.app.server && widget.app.config['video'] == true),
      statusLine('Realtime', widget.app.user == null ? 'sign in to test' : widget.app.socketReady ? 'connected' : 'not connected', widget.app.user == null ? null : widget.app.socketReady),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        onPressed: busy ? null : recheck,
        icon: const Icon(Icons.refresh, size: 17),
        label: const Text('Recheck API and providers'),
      ),
      TextButton.icon(
        onPressed: () => Clipboard.setData(ClipboardData(text: safeDiagnostics)),
        icon: const Icon(Icons.copy_all_outlined, size: 16),
        label: const Text('Copy safe diagnostics'),
      ),
      const Text('Provider configuration alone does not confirm real SMS delivery or a working video call.',
        style: TextStyle(color: muted, fontSize: 11, height: 1.5)),
      if (error != null)
        Text(
          error!,
          style: const TextStyle(color: Color(0xfff0aaa3), fontSize: 12),
        ),
    ],
  );
}

class CreateTableForm extends StatefulWidget {
  const CreateTableForm({super.key, required this.app});
  final AppModel app;
  @override
  State<CreateTableForm> createState() => _CreateTableFormState();
}

class _CreateTableFormState extends State<CreateTableForm> {
  late final name = TextEditingController(text: '${widget.app.name}’s circle');
  int ante = 50;
  bool private = false, watchers = true;
  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.app,
    builder: (_, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Set your table.',
          style: TextStyle(fontSize: 28, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 22),
        TextField(
          controller: name,
          maxLength: 40,
          decoration: const InputDecoration(labelText: 'Table name'),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<int>(
          initialValue: ante,
          decoration: const InputDecoration(
            labelText: 'Entry per match · free coins',
          ),
          items: [
            for (final n in [0, 10, 25, 50, 100])
              DropdownMenuItem(value: n, child: Text('$n coins')),
          ],
          onChanged: (v) => setState(() => ante = v!),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Invite only', style: TextStyle(fontSize: 14)),
          value: private,
          onChanged: (v) => setState(() => private = v),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Allow watchers', style: TextStyle(fontSize: 14)),
          subtitle: const Text(
            'Watchers can’t see private dice.',
            style: TextStyle(fontSize: 11, color: muted),
          ),
          value: watchers,
          onChanged: (v) => setState(() => watchers = v),
        ),
        const SizedBox(height: 12),
        const Text(
          'The entry is deducted when the match starts. The last player standing wins the pot.',
          style: TextStyle(color: muted, fontSize: 11, height: 1.6),
        ),
        const SizedBox(height: 18),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: widget.app.busy
                ? null
                : () async {
                    await widget.app.run(
                      () => widget.app.createRoom(
                        name.text.trim(),
                        ante,
                        private,
                        watchers,
                      ),
                    );
                    if (widget.app.error == null && context.mounted) {
                      Navigator.pop(context);
                    }
                  },
            child: const Text('Create circle'),
          ),
        ),
        if (widget.app.error != null)
          Text(
            widget.app.error!,
            style: const TextStyle(color: Color(0xfff0aaa3), fontSize: 12),
          ),
      ],
    ),
  );
}

class RemoteList extends StatefulWidget {
  const RemoteList({
    super.key,
    required this.app,
    required this.path,
    required this.title,
    required this.empty,
    required this.item,
    this.header,
  });
  final AppModel app;
  final String path, title, empty;
  final Widget Function(Map<String, dynamic>) item;
  final Widget? header;
  @override
  State<RemoteList> createState() => _RemoteListState();
}

class _RemoteListState extends State<RemoteList> {
  late Future<dynamic> future = widget.app.request(widget.path);
  @override
  void didUpdateWidget(covariant RemoteList oldWidget) {
    super.didUpdateWidget(oldWidget);
    future = widget.app.request(widget.path);
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () async {
      setState(() => future = widget.app.request(widget.path));
      await future;
    },
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        Text(
          widget.title,
          style: const TextStyle(
            fontSize: 29,
            fontWeight: FontWeight.w600,
            letterSpacing: -.8,
          ),
        ),
        const SizedBox(height: 18),
        if (widget.header != null) widget.header!,
        const SizedBox(height: 18),
        FutureBuilder<dynamic>(
          future: future,
          builder: (_, snapshot) {
            if (snapshot.hasError) {
              return Text(
                '${snapshot.error}',
                style: const TextStyle(color: muted, fontSize: 12),
              );
            }
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final data = snapshot.data as List;
            if (data.isEmpty) {
              return Tile(
                child: Text(
                  widget.empty,
                  style: const TextStyle(color: muted, fontSize: 12),
                ),
              );
            }
            return Column(
              children: [
                for (final item in data)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: widget.item(Map<String, dynamic>.from(item as Map)),
                  ),
              ],
            );
          },
        ),
      ],
    ),
  );
}

class AccountPrompt extends StatelessWidget {
  const AccountPrompt({super.key, required this.app, required this.title});
  final AppModel app;
  final String title;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      const SizedBox(height: 40),
      const Icon(Icons.groups_2_outlined, color: gold, size: 44),
      const SizedBox(height: 24),
      Text(
        title,
        style: const TextStyle(fontSize: 30, height: 1.1, letterSpacing: -1),
      ),
      const SizedBox(height: 14),
      const Text(
        'Sign in to connect with friends and keep your circle together.',
        style: TextStyle(color: muted, height: 1.6, fontSize: 13),
      ),
      const SizedBox(height: 28),
      FilledButton(
        onPressed: () => showSheet(context, SignInForm(app: app)),
        child: const Text('Sign in'),
      ),
    ],
  );
}

class CrewsPage extends StatefulWidget {
  const CrewsPage({super.key, required this.app});
  final AppModel app;
  @override
  State<CrewsPage> createState() => _CrewsPageState();
}

class _CrewsPageState extends State<CrewsPage> {
  Future<void> _crewAction(
    Map<String, dynamic> crew,
    String action,
    String prompt, {
    String? memberId,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirm crew change'),
        content: Text(prompt),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Confirm')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await widget.app.run(() async {
      await widget.app.request(
        '/crews/${crew['id']}${action == 'delete' ? '' : '/$action'}',
        method: action == 'delete' ? 'DELETE' : 'POST',
        body: memberId == null ? null : {'userId': memberId},
      );
      if (mounted) setState(() {});
    });
  }

  Future<void> _chooseMember(Map<String, dynamic> crew, String action) async {
    final members = (crew['members'] as List)
        .cast<Map<String, dynamic>>()
        .where((m) => m['id'] != widget.app.myId)
        .toList();
    if (members.isEmpty) return;
    final picked = await showDialog<String>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: Text(action == 'transfer' ? 'Transfer ownership to' : 'Remove member'),
        children: [
          for (final member in members)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(dialogContext, member['id'] as String),
              child: Text(member['name'] as String),
            ),
        ],
      ),
    );
    if (picked == null || !mounted) return;
    final name = members.firstWhere((m) => m['id'] == picked)['name'];
    await _crewAction(
      crew,
      action == 'transfer' ? 'transfer' : 'remove-member',
      action == 'transfer' ? 'Give ownership of ${crew['name']} to $name?' : 'Remove $name from ${crew['name']}?',
      memberId: picked,
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = widget.app;
    if (app.user == null) {
      return AccountPrompt(app: app, title: 'Keep your people close.');
    }
    return RemoteList(
      app: app,
      path: '/crews',
      title: 'Your crews',
      empty: 'Your first crew starts here.',
      header: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => showSheet(
                context,
                EntryForm(
                  app: app,
                  title: 'Name your crew.',
                  label: 'Crew name',
                  button: 'Create crew',
                  submit: (s, _) async {
                    await app.request(
                      '/crews',
                      method: 'POST',
                      body: {'name': s},
                    );
                    if (mounted) setState(() {});
                  },
                ),
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Create'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => showSheet(
                context,
                EntryForm(
                  app: app,
                  title: 'Join your people.',
                  label: 'Crew invite code',
                  button: 'Join crew',
                  submit: (s, _) async {
                    await app.request(
                      '/crews/join',
                      method: 'POST',
                      body: {'code': s},
                    );
                    if (mounted) setState(() {});
                  },
                ),
              ),
              icon: const Icon(Icons.key, size: 16),
              label: const Text('Join'),
            ),
          ),
        ],
      ),
      item: (c) => Tile(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(c['name'] as String, style: const TextStyle(fontSize: 17))),
                if (c['ownerId'] == app.myId)
                  const Text('OWNER', style: TextStyle(fontSize: 10, color: gold)),
                PopupMenuButton<String>(
                  tooltip: 'Manage crew',
                  onSelected: (action) async {
                    switch (action) {
                      case 'leave':
                        await _crewAction(c, 'leave', 'Leave ${c['name']}? If you are the owner, ownership passes to another member.');
                      case 'rotate-code':
                        await _crewAction(c, 'rotate-code', 'Replace the invite code? Existing invitations will stop working.');
                      case 'transfer':
                      case 'remove-member':
                        await _chooseMember(c, action);
                      case 'delete':
                        await _crewAction(c, 'delete', 'Delete ${c['name']} for every member? This cannot be undone.');
                    }
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'leave', child: Text('Leave crew')),
                    if (c['ownerId'] == app.myId) ...[
                      const PopupMenuItem(value: 'rotate-code', child: Text('Replace invite code')),
                      if ((c['members'] as List).length > 1) ...[
                        const PopupMenuItem(value: 'transfer', child: Text('Transfer ownership')),
                        const PopupMenuItem(value: 'remove-member', child: Text('Remove member')),
                      ],
                      const PopupMenuItem(value: 'delete', child: Text('Delete crew')),
                    ],
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${(c['members'] as List).length} members',
              style: const TextStyle(color: muted, fontSize: 12),
            ),
            const SizedBox(height: 10),
            Text(
              (c['members'] as List).map((m) => m['name']).join(' · '),
              style: const TextStyle(color: muted, fontSize: 11),
            ),
            TextButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: c['code'] as String));
                toast(context, 'Crew invite code copied.');
              },
              icon: const Icon(Icons.copy, size: 14),
              label: Text('Invite · ${c['code']}'),
            ),
          ],
        ),
      ),
    );
  }
}

class PeoplePage extends StatefulWidget {
  const PeoplePage({super.key, required this.app});
  final AppModel app;
  @override
  State<PeoplePage> createState() => _PeoplePageState();
}

class _PeoplePageState extends State<PeoplePage> {
  final search = TextEditingController();
  String query = '';
  Timer? debounce;
  @override
  void dispose() {
    search.dispose();
    debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = widget.app;
    if (app.user == null) {
      return AccountPrompt(app: app, title: 'Find your next circle.');
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 18, 22, 0),
          child: TextField(
            controller: search,
            decoration: const InputDecoration(
              hintText: 'Find a username',
              prefixIcon: Icon(Icons.search, size: 20),
            ),
            onChanged: (s) {
              debounce?.cancel();
              debounce = Timer(
                const Duration(milliseconds: 400),
                () => setState(() => query = s),
              );
            },
          ),
        ),
        Expanded(
          child: RemoteList(
            app: app,
            path: '/players?q=${Uri.encodeQueryComponent(query)}',
            title: 'Find your people.',
            empty: 'No players found. Invite a friend to join Street Circle.',
            item: (p) => Tile(
              child: Row(
                children: [
                  Avatar(
                    name: p['name'] as String,
                    color: playerColors[(p['color'] as int? ?? 0) % 6],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '@${p['name']}',
                          style: const TextStyle(fontSize: 13),
                        ),
                        if ((p['bio'] as String? ?? '').isNotEmpty)
                          Text(
                            p['bio'] as String,
                            style: const TextStyle(color: muted, fontSize: 11),
                          ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () => app.run(() async {
                      app.user = Map<String, dynamic>.from(
                        await app.request(
                              '/blocks/${p['id']}',
                              method: 'POST',
                              body: {'blocked': true},
                            )
                            as Map,
                      );
                      if (mounted) setState(() {});
                    }),
                    child: const Text('Block', style: TextStyle(fontSize: 10)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, required this.app});
  final AppModel app;
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final name = TextEditingController(text: widget.app.name),
      bio = TextEditingController(
        text: widget.app.user?['bio'] as String? ?? '',
      );
  late bool private = widget.app.user?['private'] == true;
  late double daily = (widget.app.user?['dailyMinutes'] as int? ?? 120)
          .toDouble(),
      reminder = (widget.app.user?['reminderMinutes'] as int? ?? 30).toDouble();
  @override
  void dispose() {
    name.dispose();
    bio.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = widget.app;
    return ListView(
      padding: const EdgeInsets.all(22),
      children: [
        Row(
          children: [
            Avatar(name: app.name, size: 58),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                app.user == null ? 'Your circle starts here.' : '@${app.name}',
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        if (app.user == null) ...[
          FilledButton(
            onPressed: () => showSheet(context, SignInForm(app: app)),
            child: const Text('Sign in to Street Circle'),
          ),
          const SizedBox(height: 24),
          const Tile(
            child: Text(
              'Practice has a 2-hour session cap and a reminder every 30 minutes. Sign in to set your limits.',
              style: TextStyle(color: muted, fontSize: 12, height: 1.6),
            ),
          ),
        ] else ...[
          const Eyebrow('YOUR WALLET'),
          const SizedBox(height: 10),
          Tile(
            child: Row(
              children: [
                const Icon(Icons.toll, color: gold),
                const SizedBox(width: 12),
                Text(
                  '${app.user!['coins']} free coins',
                  style: const TextStyle(fontSize: 20),
                ),
                const Spacer(),
                const Tag('NO CASH'),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const Eyebrow('YOUR PROFILE'),
          const SizedBox(height: 12),
          TextField(
            controller: name,
            decoration: const InputDecoration(labelText: 'Username'),
            maxLength: 20,
          ),
          const SizedBox(height: 10),
          TextField(
            controller: bio,
            decoration: const InputDecoration(labelText: 'A little about you'),
            maxLength: 160,
            maxLines: 2,
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Private profile',
              style: TextStyle(fontSize: 13),
            ),
            subtitle: const Text(
              'Hide your profile from player search.',
              style: TextStyle(color: muted, fontSize: 10),
            ),
            value: private,
            onChanged: (v) => setState(() => private = v),
          ),
          OutlinedButton(
            onPressed: app.busy
                ? null
                : () => app.run(
                    () => app.profile({
                      'name': name.text.trim(),
                      'bio': bio.text.trim(),
                      'private': private,
                    }),
                  ),
            child: const Text('Save profile'),
          ),
          const SizedBox(height: 24),
          const Eyebrow('PLAY AT YOUR PACE'),
          const SizedBox(height: 12),
          Tile(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Daily cap · ${daily.round()} minutes',
                  style: const TextStyle(fontSize: 13),
                ),
                Slider(
                  value: daily,
                  min: 5,
                  max: 240,
                  divisions: 47,
                  label: '${daily.round()} min',
                  onChanged: (v) => setState(() => daily = v),
                ),
                Text(
                  'Break reminder · every ${reminder.round()} minutes',
                  style: const TextStyle(fontSize: 13),
                ),
                Slider(
                  value: reminder,
                  min: 5,
                  max: 60,
                  divisions: 11,
                  label: '${reminder.round()} min',
                  onChanged: (v) => setState(() => reminder = v),
                ),
                Text(
                  '${(app.user?['seconds'] as int? ?? 0) ~/ 60} minutes played today · resets at 00:00 UTC',
                  style: const TextStyle(color: muted, fontSize: 10),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: app.busy
                      ? null
                      : () => app.run(
                          () => app.profile({
                            'dailyMinutes': daily.round(),
                            'reminderMinutes': reminder.round(),
                          }),
                        ),
                  child: const Text('Save play limits'),
                ),
              ],
            ),
          ),
          if ((app.user!['blocked'] as List).isNotEmpty) ...[
            const SizedBox(height: 24),
            const Eyebrow('BLOCKED PLAYERS'),
            for (final id in app.user!['blocked'] as List)
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Blocked player',
                      style: TextStyle(color: muted, fontSize: 11),
                    ),
                  ),
                  TextButton(
                    onPressed: () => app.run(() async {
                      app.user = Map<String, dynamic>.from(
                        await app.request(
                              '/blocks/$id',
                              method: 'POST',
                              body: {'blocked': false},
                            )
                            as Map,
                      );
                    }),
                    child: const Text(
                      'Unblock',
                      style: TextStyle(fontSize: 11),
                    ),
                  ),
                ],
              ),
          ],
        ],
        const SizedBox(height: 22),
        TextButton.icon(
          onPressed: () => showSheet(context, ServiceForm(app: app)),
          icon: const Icon(Icons.link, size: 18),
          label: const Text('Game service connection'),
        ),
        TextButton.icon(
          onPressed: () => showSheet(context, const RulesContent()),
          icon: const Icon(Icons.menu_book_outlined, size: 18),
          label: const Text('Rules & fair play'),
        ),
        if (app.user != null)
          TextButton.icon(
            onPressed: app.busy ? null : () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Export your data'),
                  content: const Text('Your profile, phone number, crew memberships and own activity will be copied as JSON. The clipboard may be visible to other apps until you replace it.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
                    FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Copy export')),
                  ],
                ),
              );
              if (confirmed != true || !mounted) return;
              await app.run(() async {
                final data = await app.request('/me/export');
                await Clipboard.setData(ClipboardData(text: const JsonEncoder.withIndent('  ').convert(data)));
                if (mounted) toast(this.context, 'Account data copied. Paste it into a private file.');
              });
            },
            icon: const Icon(Icons.file_download_outlined, size: 16),
            label: const Text('Export my account data (JSON)'),
          ),
        if (app.user != null)
          TextButton(
            onPressed: () => app.run(app.logout),
            child: const Text('Sign out'),
          ),
        if (app.user != null)
          TextButton.icon(
            onPressed: app.busy ? null : () async {
              String confirmation = '';
              final approved = await showDialog<bool>(
                context: context,
                builder: (dialogContext) => StatefulBuilder(
                  builder: (dialogContext, setDialogState) => AlertDialog(
                    title: const Text('Permanently delete account?'),
                    content: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('This removes your account, sessions, crew memberships and messages. Shared game history will be anonymized. Export your data first if needed. Copies in backups may remain until their retention period expires.'),
                        const SizedBox(height: 16),
                        TextField(
                          autocorrect: false,
                          enableSuggestions: false,
                          decoration: const InputDecoration(labelText: 'Type DELETE to confirm'),
                          onChanged: (value) => setDialogState(() => confirmation = value),
                        ),
                      ],
                    ),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
                      FilledButton(
                        onPressed: confirmation == 'DELETE' ? () => Navigator.pop(dialogContext, true) : null,
                        child: const Text('Delete permanently'),
                      ),
                    ],
                  ),
                ),
              );
              if (approved == true && mounted) await app.run(app.deleteAccount);
            },
            icon: const Icon(Icons.delete_forever_outlined, size: 16),
            label: const Text('Delete my account'),
          ),
        const SizedBox(height: 12),
        const Center(
          child: Text(
            'STREET CIRCLE  /  FREE-COIN PLAY',
            style: TextStyle(color: muted, fontSize: 9, letterSpacing: 1.4),
          ),
        ),
      ],
    );
  }
}

class ChatPanel extends StatefulWidget {
  const ChatPanel({super.key, required this.app});
  final AppModel app;
  @override
  State<ChatPanel> createState() => _ChatPanelState();
}

class _ChatPanelState extends State<ChatPanel> {
  final text = TextEditingController();
  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  void send() {
    final value = text.text.trim();
    if (value.isNotEmpty) {
      widget.app.run(() async {
        await widget.app.chat(value);
        text.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.app,
    builder: (ctx, _) => Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        0,
        22,
        MediaQuery.viewInsetsOf(ctx).bottom + 16,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Around the table.',
            style: TextStyle(fontSize: 25, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          if (widget.app.practice != null)
            const Text(
              'Practice chat stays on this device. Bots don’t send messages.',
              style: TextStyle(color: muted, fontSize: 11),
            ),
          const SizedBox(height: 14),
          Expanded(
            child: ListView(
              reverse: true,
              children: [
                if ((widget.app.room?['chat'] as List? ?? []).isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Text(
                      'Say hello to your circle.',
                      style: TextStyle(color: muted),
                    ),
                  ),
                for (final m
                    in (widget.app.room?['chat'] as List? ?? []).reversed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          m['name'] as String,
                          style: const TextStyle(color: gold, fontSize: 10),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          m['text'] as String,
                          style: TextStyle(
                            fontSize: m['reaction'] == true ? 25 : 13,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: text,
                  maxLength: 300,
                  decoration: const InputDecoration(
                    hintText: 'Send a message…',
                    counterText: '',
                  ),
                  onSubmitted: (_) => send(),
                ),
              ),
              const SizedBox(width: 6),
              IconButton(
                onPressed: widget.app.busy ? null : send,
                icon: const Icon(Icons.arrow_upward, color: gold),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
