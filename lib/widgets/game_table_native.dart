import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class GameTable extends StatefulWidget {
  const GameTable({
    super.key,
    required this.dice,
    required this.round,
    this.art = 0,
    this.muted = true,
    this.clip = 0,
    this.onEvent,
    this.state = const {},
    this.onAction,
  });
  final List<int> dice;
  final int round, art, clip;
  final bool muted;
  final void Function(String)? onEvent;
  final Map<String, dynamic> state;
  final void Function(Map<String, dynamic>)? onAction;
  @override
  State<GameTable> createState() => _GameTableState();
}

class _GameTableState extends State<GameTable> {
  WebViewController? controller;
  @override
  void initState() {
    super.initState();
    // GitHub Pages serves the exact ZIP-derived table until the native asset
    // bundle has been verified on both WebView engines. Can be overridden for
    // staging/private hosting with --dart-define=TABLE_URL=... .
    const url = String.fromEnvironment('TABLE_URL',
        defaultValue: 'https://jessicacarter9955.github.io/roll-dice/table/index.html');
    if (url.isNotEmpty) {
      controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..addJavaScriptChannel(
          'StreetCircleBridge',
          onMessageReceived: (message) {
            final data = jsonDecode(message.message) as Map;
            if (data['type'] == 'ready') _send();
            if (data['type'] == 'action') {
              widget.onAction?.call(
                Map<String, dynamic>.from(data['action'] as Map),
              );
            }
            if (data['type'] == 'clip') {
              widget.onEvent?.call(data['message'] as String);
            }
          },
        )
        ..setNavigationDelegate(
          NavigationDelegate(onPageFinished: (_) => _send()),
        )
        ..loadRequest(Uri.parse(url));
    }
  }

  // Real postMessage sets event.source to window. A synthetic MessageEvent
  // leaves source null, and the ZIP bridge correctly rejects that message.
  void _post(Map<String, dynamic> data) => controller?.runJavaScript(
    'window.postMessage(${jsonEncode(jsonEncode(data))}, location.origin);',
  );

  void _send() => _post({
    'type': 'state',
    'dice': widget.dice,
    'round': widget.round,
    'art': widget.art,
    'muted': widget.muted,
    ...widget.state,
  });
  @override
  void didUpdateWidget(covariant GameTable oldWidget) {
    super.didUpdateWidget(oldWidget);
    _send();
    if (oldWidget.clip != widget.clip) _post({'type': 'clip'});
  }

  @override
  Widget build(BuildContext context) => controller != null
      ? WebViewWidget(controller: controller!)
      : Container(
          decoration: BoxDecoration(
            color: const Color(0xff25251e),
            border: Border.all(color: const Color(0xffc7a45b), width: 2),
            borderRadius: BorderRadius.circular(120),
          ),
          child: const Center(
            child: Icon(
              Icons.casino_outlined,
              color: Color(0xffc7a45b),
              size: 64,
            ),
          ),
        );
}
