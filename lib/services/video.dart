import 'package:flutter/foundation.dart';
import 'package:livekit_client/livekit_client.dart';
import 'app_model.dart';

class VideoSession extends ChangeNotifier {
  Room? room;
  bool connecting = false, camera = false, microphone = false;
  String? error;
  Future<void> connect(AppModel app) async {
    connecting = true;
    error = null;
    notifyListeners();
    try {
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
      room!.addListener(notifyListeners);
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
      await room?.localParticipant?.setCameraEnabled(!camera);
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
      await room?.localParticipant?.setMicrophoneEnabled(!microphone);
      microphone = !microphone;
      error = null;
    } catch (_) {
      error = 'Microphone access was not available. Check your permissions.';
    }
    notifyListeners();
  }

  VideoTrack? trackFor(String id) {
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
    previous?.removeListener(notifyListeners);
    await previous?.disconnect();
    await previous?.dispose();
    notifyListeners();
  }

  @override
  void dispose() {
    room?.removeListener(notifyListeners);
    room?.dispose();
    super.dispose();
  }
}
