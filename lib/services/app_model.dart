import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../domain/practice.dart';

class AppModel extends ChangeNotifier {
  AppModel({String? api})
    : api = api ?? const String.fromEnvironment('API_URL') {
    if (this.api.isEmpty) {
      final base = Uri.base;
      this.api = base.host.isEmpty
          ? 'http://localhost:8787'
          : '${base.scheme}://${base.authority}';
    }
  }
  late String api;
  String? token;
  Map<String, dynamic>? user;
  Map<String, dynamic> config = {};
  Map<String, dynamic>? room;
  List<dynamic> rooms = [];
  bool server = false, busy = false, initialized = false, socketReady = false;
  String? error, notice;
  PracticeMatch? practice;
  Timer? _bots, _poll, _reconnect, _practiceClock;
  WebSocketChannel? _socket;
  int practiceSeconds = 0, _failures = 0;
  bool _disposed = false;
  final _client = http.Client();
  final _secure = const FlutterSecureStorage();

  Future<String?> _readSession(SharedPreferences prefs) async {
    if (kIsWeb) return prefs.getString('session');
    final secured = await _secure.read(key: 'session');
    if (secured != null) return secured;
    // One-time migration from the original plaintext native preference.
    final legacy = prefs.getString('session');
    if (legacy != null) {
      await _secure.write(key: 'session', value: legacy);
      await prefs.remove('session');
    }
    return legacy;
  }

  Future<void> _saveSession(String value) async {
    if (kIsWeb) {
      await (await SharedPreferences.getInstance()).setString('session', value);
    } else {
      await _secure.write(key: 'session', value: value);
    }
  }

  Future<void> _deleteSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('session');
    if (!kIsWeb) await _secure.delete(key: 'session');
  }
  String get myId => practice != null ? 'local' : user?['id'] as String? ?? '';
  String get name => user?['name'] as String? ?? 'You';
  Map<String, dynamic>? get game => room?['game'] as Map<String, dynamic>?;
  List<Map<String, dynamic>> get players =>
      (game?['players'] as List? ?? room?['players'] as List? ?? [])
          .cast<Map<String, dynamic>>();
  bool get watching =>
      room != null && !(room!['players'] as List).any((p) => p['id'] == myId);
  bool get myTurn =>
      game?['phase'] == 'bidding' &&
      players[game!['turn'] as int]['id'] == myId;
  int get totalDice =>
      players.fold(0, (sum, p) => sum + ((p['count'] ?? 5) as int));
  List<int> get myDice => List<int>.from(
    players.where((p) => p['id'] == myId).firstOrNull?['dice'] as List? ?? [],
  );
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$api/api$path');
    final headers = {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
    final req = http.Request(method, uri)..headers.addAll(headers);
    if (body != null) req.body = jsonEncode(body);
    final streamed = await _client
        .send(req)
        .timeout(const Duration(seconds: 18));
    final response = await http.Response.fromStream(streamed);
    dynamic result;
    try {
      result = jsonDecode(response.body);
    } catch (_) {
      throw Exception('The game service is unavailable at $api.');
    }
    if (response.statusCode >= 400) {
      throw Exception(
        result is Map
            ? result['error'] ?? 'Request failed.'
            : 'Request failed.',
      );
    }
    return result;
  }

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    token = await _readSession(prefs);
    api = prefs.getString('api') ?? api;
    try {
      config = Map<String, dynamic>.from(await request('/config') as Map);
      server = true;
      if (token != null) {
        try {
          user = Map<String, dynamic>.from(await request('/me') as Map);
        } catch (_) {
          token = null;
          await _deleteSession();
        }
      }
      if (user != null) {
        await refreshRooms();
        connect();
      }
    } catch (_) {
      server = false;
    }
    initialized = true;
    notifyListeners();
    _poll = Timer.periodic(const Duration(seconds: 8), (_) async {
      if (_disposed || user == null || !server || busy) return;
      try {
        if (room != null && practice == null && !socketReady) {
          room = Map<String, dynamic>.from(
            await request('/rooms/${room!['id']}') as Map,
          );
        } else if (room == null) {
          await refreshRooms();
        }
        if (practice == null) {
          user = Map<String, dynamic>.from(await request('/me') as Map);
        }
        if (!_disposed) notifyListeners();
      } catch (_) {
        /* reconnect loop and explicit actions report connection errors */
      }
    });
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    busy = true;
    error = null;
    notifyListeners();
    try {
      await action();
    } catch (e) {
      error = e
          .toString()
          .replaceFirst('Exception: ', '')
          .replaceFirst('Bad state: ', '');
    } finally {
      busy = false;
      if (!_disposed) notifyListeners();
    }
  }

  void clearError() {
    error = null;
    notice = null;
    notifyListeners();
  }

  Future<void> configureApi(String value) async {
    final uri = Uri.tryParse(value.trim());
    if (uri == null ||
        !['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty) {
      throw Exception('Enter an http or https service URL.');
    }
    if (uri.scheme == 'http' &&
        !['localhost', '127.0.0.1', '10.0.2.2'].contains(uri.host)) {
      throw Exception('Remote services require HTTPS.');
    }
    final changed = api != value.trim().replaceAll(RegExp(r'/$'), '');
    api = value.trim().replaceAll(RegExp(r'/$'), '');
    if (changed) {
      token = null;
      user = null;
      _socket?.sink.close();
    }
    config = Map<String, dynamic>.from(await request('/config') as Map);
    server = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('api', api);
    if (changed) await _deleteSession();
    notifyListeners();
  }

  Future<void> login(String name) async {
    await _signedIn(
      Map<String, dynamic>.from(
        await request('/auth/guest', method: 'POST', body: {'name': name})
            as Map,
      ),
    );
  }

  Future<void> sendSms(String phone) async {
    await request(
      '/auth/sms',
      method: 'POST',
      body: {'phone': phone, 'consent': true},
    );
  }

  Future<void> verifySms(String phone, String pin, String name) async {
    await _signedIn(
      Map<String, dynamic>.from(
        await request(
              '/auth/verify',
              method: 'POST',
              body: {'phone': phone, 'code': pin, 'name': name},
            )
            as Map,
      ),
    );
  }

  Future<void> _signedIn(Map<String, dynamic> result) async {
    token = result['token'] as String;
    user = Map<String, dynamic>.from(result['user'] as Map);
    await _saveSession(token!);
    await refreshRooms();
    connect();
    notifyListeners();
  }

  Future<void> logout() async {
    if (room != null) await leave();
    if (token != null && server) await request('/auth/logout', method: 'POST');
    _reconnect?.cancel();
    await _socket?.sink.close();
    token = null;
    user = null;
    await _deleteSession();
    notifyListeners();
  }

  Future<void> deleteAccount() async {
    await request(
      '/me/delete',
      method: 'POST',
      body: {'confirmation': 'DELETE MY ACCOUNT'},
    );
    token = null; // Clear auth before closing the socket to suppress reconnect.
    _reconnect?.cancel();
    await _socket?.sink.close();
    _socket = null;
    socketReady = false;
    user = null;
    room = null;
    rooms = [];
    practice = null;
    _bots?.cancel();
    _practiceClock?.cancel();
    await _deleteSession();
    notifyListeners();
  }

  Future<void> refreshRooms() async {
    rooms = await request('/rooms') as List;
  }

  Future<void> connect() async {
    if (token == null || _disposed) return;
    _reconnect?.cancel();
    try {
      final ticket = await request('/socket-ticket', method: 'POST');
      await _socket?.sink.close();
      final uri = Uri.parse(
        api,
      ).replace(scheme: api.startsWith('https') ? 'wss' : 'ws', path: '/ws');
      final channel = WebSocketChannel.connect(uri);
      _socket = channel;
      await channel.ready;
      channel.sink.add(jsonEncode(ticket));
      channel.stream.listen(
        (raw) {
          final data = jsonDecode(raw as String) as Map<String, dynamic>;
          if (data['type'] == 'ready') {
            socketReady = true;
            _failures = 0;
          }
          if (data['type'] == 'room' &&
              practice == null &&
              room?['id'] == data['room']['id']) {
            room = Map<String, dynamic>.from(data['room'] as Map);
          }
          if (data['type'] == 'me') {
            user = Map<String, dynamic>.from(data['user'] as Map);
          }
          if (!_disposed) notifyListeners();
        },
        onDone: () => _lostConnection(channel),
        onError: (_) => _lostConnection(channel),
      );
    } catch (_) {
      _lostConnection(_socket);
    }
  }

  void _lostConnection(WebSocketChannel? channel) {
    if (channel != _socket || _disposed) return;
    socketReady = false;
    _reconnect?.cancel();
    if (token != null) {
      _reconnect = Timer(
        Duration(seconds: min(20, 1 << min(_failures++, 4))),
        connect,
      );
    }
    notifyListeners();
  }

  void startPractice({int opponents = 3}) {
    practice = PracticeMatch(name: name, opponents: opponents);
    practiceSeconds = 0;
    room = {
      'id': 'practice',
      'name': 'The practice circle',
      'hostId': 'local',
      'inviteCode': null,
      'pot': 0,
      'ante': 0,
      'players': practice!.players,
      'watchers': 0,
      'chat': <dynamic>[],
      'rematch': [],
      'game': practice!.view(),
    };
    notice = null;
    _practiceClock?.cancel();
    _practiceClock = Timer.periodic(const Duration(seconds: 1), (_) {
      practiceSeconds++;
      final cap = (user?['dailyMinutes'] as int? ?? 120) * 60;
      if (practiceSeconds >= cap) {
        _bots?.cancel();
        _practiceClock?.cancel();
        error = 'Daily practice limit reached. Take a break.';
      }
      if (practiceSeconds % ((user?['reminderMinutes'] as int? ?? 30) * 60) ==
          0) {
        notice =
            'You have played for ${practiceSeconds ~/ 60} minutes. Take a moment to stretch.';
      }
      if (!_disposed) notifyListeners();
    });
    _syncPractice();
  }

  void _syncPractice() {
    if (practice == null || room == null) return;
    room!['game'] = practice!.view();
    room!['players'] = practice!.players;
    _bots?.cancel();
    if (practice!.game['phase'] == 'bidding' &&
        practice!.current['bot'] == true) {
      _bots = Timer(const Duration(milliseconds: 1800), () {
        if (practice == null) return;
        practice!.act(practice!.current['id'] as String, practice!.botAction());
        _syncPractice();
      });
    }
    notifyListeners();
  }

  void usePhysicalPracticeDice(List<int> values) {
    if (practice == null) throw StateError('Open a practice match first.');
    practice!.setPhysicalDice(values);
    _syncPractice();
  }

  Future<void> action(Map<String, dynamic> action) async {
    if (practice != null) {
      if (practiceSeconds >= (user?['dailyMinutes'] as int? ?? 120) * 60) {
        throw Exception('Daily practice limit reached.');
      }
      // Eliminated players can observe; practice rounds still continue under bot control.
      final actor =
          action['type'] == 'next' && practice!.players.first['count'] == 0
          ? practice!.current['id'] as String
          : 'local';
      practice!.act(actor, action);
      _syncPractice();
    } else {
      room = Map<String, dynamic>.from(
        await request(
              '/rooms/${room!['id']}/action',
              method: 'POST',
              body: {
                'requestId':
                    '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}',
                'revision': game!['revision'],
                'action': action,
              },
            )
            as Map,
      );
    }
  }

  Future<void> createRoom(
    String name,
    int ante,
    bool isPrivate,
    bool watchers,
  ) async {
    room = Map<String, dynamic>.from(
      await request(
            '/rooms',
            method: 'POST',
            body: {
              'name': name,
              'ante': ante,
              'private': isPrivate,
              'allowWatchers': watchers,
            },
          )
          as Map,
    );
  }

  Future<void> join({String? id, String? code, bool watch = false}) async {
    room = Map<String, dynamic>.from(
      await request(
            '/rooms/join',
            method: 'POST',
            body: {'id': id, 'code': code, 'watch': watch},
          )
          as Map,
    );
  }

  Future<void> roomCall(String path) async {
    room = Map<String, dynamic>.from(
      await request('/rooms/${room!['id']}/$path', method: 'POST') as Map,
    );
  }

  Future<void> leave() async {
    _bots?.cancel();
    _practiceClock?.cancel();
    if (practice == null && room != null) {
      await request('/rooms/${room!['id']}/leave', method: 'POST');
    }
    practice = null;
    room = null;
    notice = null;
    if (server && user != null) {
      user = Map<String, dynamic>.from(await request('/me') as Map);
      await refreshRooms();
    }
  }

  Future<void> chat(String text, {bool reaction = false}) async {
    if (practice != null) {
      (room!['chat'] as List).add({
        'name': name,
        'userId': 'local',
        'text': text,
        'reaction': reaction,
      });
      notifyListeners();
    } else {
      await request(
        '/rooms/${room!['id']}/chat',
        method: 'POST',
        body: {'text': text, 'reaction': reaction},
      );
    }
  }

  Future<void> profile(Map<String, dynamic> values) async {
    user = Map<String, dynamic>.from(
      await request('/me', method: 'PATCH', body: values) as Map,
    );
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _bots?.cancel();
    _poll?.cancel();
    _reconnect?.cancel();
    _practiceClock?.cancel();
    _socket?.sink.close();
    _client.close();
    super.dispose();
  }
}
