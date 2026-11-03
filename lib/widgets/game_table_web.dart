import 'dart:convert';
import 'dart:js_interop';
import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

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
  web.HTMLIFrameElement? frame;
  JSFunction? listener;
  @override
  void initState() {
    super.initState();
    listener = ((web.MessageEvent event) {
      if (event.origin != web.window.location.origin ||
          event.source != frame?.contentWindow) {
        return;
      }
      try {
        final data = jsonDecode((event.data as JSString).toDart) as Map;
        if (data['type'] == 'ready') _send();
        if (data['type'] == 'clip') {
          widget.onEvent?.call(data['message'] as String);
        }
        if (data['type'] == 'action') {
          widget.onAction?.call(
            Map<String, dynamic>.from(data['action'] as Map),
          );
        }
      } catch (_) {
        /* ignore unrelated frame events */
      }
    }).toJS;
    web.window.addEventListener('message', listener);
  }

  void _send() {
    frame?.contentWindow?.postMessage(
      jsonEncode({
        'type': 'state',
        'dice': widget.dice,
        'round': widget.round,
        'art': widget.art,
        'muted': widget.muted,
        ...widget.state,
      }).toJS,
      web.window.location.origin.toJS,
    );
  }

  @override
  void didUpdateWidget(covariant GameTable oldWidget) {
    super.didUpdateWidget(oldWidget);
    _send();
    if (oldWidget.clip != widget.clip) {
      frame?.contentWindow?.postMessage(
        jsonEncode({'type': 'clip'}).toJS,
        web.window.location.origin.toJS,
      );
    }
  }

  @override
  Widget build(BuildContext context) => HtmlElementView.fromTagName(
    tagName: 'iframe',
    onElementCreated: (element) {
      frame = element as web.HTMLIFrameElement;
      frame!.src = Uri.base.resolve('table/index.html').toString();
      frame!.title = 'Portrait 3D dice table';
      frame!.style.cssText =
          'border:0;width:100%;height:100%;background:#171612';
      frame!.setAttribute('allow', 'web-share');
      frame!.addEventListener('load', ((web.Event _) => _send()).toJS);
    },
  );
  @override
  void dispose() {
    web.window.removeEventListener('message', listener);
    super.dispose();
  }
}
