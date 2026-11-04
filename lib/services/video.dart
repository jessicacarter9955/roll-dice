import 'package:flutter/foundation.dart';
import 'package:livekit_client/livekit_client.dart';
import 'app_model.dart';

class VideoSession extends ChangeNotifier {
  Room? room;
  bool connecting = false, camera = false, microphone = false;
  String? error;
  bool get connected => room?.connectionState == ConnectionState.connected;
  bool get reconnecting => room?.connectionState == ConnectionState.reconnecting;

  void _onRoomChanged() {
    // A closed transport is not a successful camera/microphone session.
    // During a temporary reconnect, LiveKit may restore published tracks, so
    // retain the user's choices until the connection is definitively closed.
    if (room?.connectionState == ConnectionState.disconnected) {
      camera = false;
      microphone = false;
    }
    notifyListeners();
  }

  Future<void> connect(AppModel app) async {
    if (connecting) return;
    connecting = true;
    error = null;
    notifyListeners();
    try {
      // A previously disconnected room can still own event listeners and
      // tracks. Dispose it before opening a new connection on rejoin.
      if (room != null) await disconnect();
      if (app.practice != null) {
        throw Exception(
          'Practice opponents have no live camera. Join a connected table to use video.',
        );
      }
      final details =
          await app.request(
                '/rooms/${app.room!['id']}/video-token',
                method: 'POST',
              )
              as Map;
      final next = Room(
        roomOptions: const RoomOptions(adaptiveStream: true, dynacast: true),
      );
      room = next;
      next.addListener(_onRoomChanged);
      await next.connect(details['url'] as String, details['token'] as String);
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
      await disconnect();
    } finally {
      connecting = false;
      notifyListeners();
    }
  }

  Future<void> toggleCamera() async {
    try {
      final participant = room?.localParticipant;
      if (!connected || participant == null) {
        throw StateError('Not connected to a video room.');
      }
      await participant.setCameraEnabled(!camera);
      camera = !camera;
      error = null;
    } catch (_) {
      error =
          'Camera access was not available. Check your browser or device permissions.';
    }
    notifyListeners();
  }

  Future<void> toggleMicrophone() async {
    try {
      final participant = room?.localParticipant;
      if (!connected || participant == null) {
        throw StateError('Not connected to a video room.');
      }
      await participant.setMicrophoneEnabled(!microphone);
      microphone = !microphone;
      error = null;
    } catch (_) {
      error = 'Microphone access was not available. Check your permissions.';
    }
    notifyListeners();
  }

  VideoTrack? trackFor(String id) {
    if (!connected) return null;
    final Participant? participant = room?.localParticipant?.identity == id
        ? room?.localParticipant
        : room?.remoteParticipants.values
              .where((p) => p.identity == id)
              .firstOrNull;
    for (final pub
        in participant?.videoTrackPublications ?? <TrackPublication>[]) {
      if (!pub.muted && pub.track is VideoTrack) return pub.track as VideoTrack;
    }
    return null;
  }

  Future<void> disconnect() async {
    final previous = room;
    room = null;
    camera = false;
    microphone = false;
    previous?.removeListener(_onRoomChanged);
    await previous?.disconnect();
    await previous?.dispose();
    notifyListeners();
  }

  @override
  void dispose() {
    room?.removeListener(_onRoomChanged);
    room?.dispose();
    super.dispose();
  }
}
