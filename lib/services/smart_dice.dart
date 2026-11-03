import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:godice/godice.dart';
import 'package:godice_universal_ble/godice_universal_ble.dart';

/// Experimental, read-only physical dice adapter. Client-supplied BLE events
/// must never replace the authoritative server roll in a free-coin match.
class SmartDiceController extends ChangeNotifier {
  final GoDiceScanner _scanner = GoDiceScanner(manageScan: true);
  final Map<String, dynamic> found = {};
  final Map<String, GoDice> connected = {};
  final Map<String, int> values = {};
  final Map<String, int> batteries = {};
  final Map<String, StreamSubscription<GoDiceMessage>> _messages = {};
  final Map<String, StreamSubscription<bool>> _links = {};
  StreamSubscription<dynamic>? _scan;
  String? error;
  bool busy = false;
  bool _closed = false;

  @override
  void notifyListeners() {
    if (!_closed) super.notifyListeners();
  }

  bool get scanning => _scan != null;

  void startScan() {
    if (scanning) return;
    found.clear();
    error = null;
    try {
      _scan = _scanner.discover().listen(
        (dynamic device) {
          found[device.deviceId as String] = device;
          notifyListeners();
        },
        onError: (Object e) {
          error = e.toString();
          _scan = null;
          notifyListeners();
        },
        onDone: () {
          _scan = null;
          notifyListeners();
        },
      );
    } catch (e) {
      error = e.toString();
    }
    notifyListeners();
  }

  Future<void> stopScan() async {
    final scan = _scan;
    _scan = null;
    await scan?.cancel();
    notifyListeners();
  }

  Future<void> connect(String id) async {
    if (busy || connected.containsKey(id) || !found.containsKey(id)) return;
    if (connected.length >= 5) {
      error = 'A hand uses at most five physical dice.';
      notifyListeners();
      return;
    }
    await stopScan();
    busy = true;
    error = null;
    notifyListeners();
    final die = GoDiceUniversalBle.fromDevice(found[id], dieType: DieType.d6);
    try {
      _messages[id] = die.messages.listen((message) {
        if (message is PositionMessage &&
            message.kind == StabilityKind.stable &&
            message.value >= 1 && message.value <= 6) {
          values[id] = message.value;
          notifyListeners();
        }
        if (message is BatteryLevelMessage) {
          batteries[id] = message.level;
          notifyListeners();
        }
      });
      _links[id] = die.connectionState.listen((up) {
        if (!up && connected.containsKey(id)) unawaited(disconnect(id));
      });
      await die.connect();
      connected[id] = die;
      try {
        batteries[id] = await die.getBatteryLevel();
      } catch (_) {
        // Battery reporting is optional on older firmware.
      }
    } catch (e) {
      error = 'Unable to connect to the die: $e';
      await _messages.remove(id)?.cancel();
      await _links.remove(id)?.cancel();
      await die.dispose();
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> disconnect(String id) async {
    final die = connected.remove(id);
    await _messages.remove(id)?.cancel();
    await _links.remove(id)?.cancel();
    values.remove(id);
    batteries.remove(id);
    if (die != null) {
      try {
        await die.dispose();
      } catch (_) {
        // Bluetooth can drop before disconnect completes.
      }
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _closed = true;
    final scan = _scan;
    _scan = null;
    unawaited(scan?.cancel() ?? Future<void>.value());
    for (final sub in _messages.values) {
      unawaited(sub.cancel());
    }
    for (final sub in _links.values) {
      unawaited(sub.cancel());
    }
    for (final die in connected.values) {
      unawaited(die.dispose());
    }
    connected.clear();
    _messages.clear();
    _links.clear();
    super.dispose();
  }
}
