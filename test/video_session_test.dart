import 'package:flutter_test/flutter_test.dart';
import 'package:street_circle/services/video.dart';

void main() {
  test('camera and microphone never claim success without a LiveKit room', () async {
    final session = VideoSession();
    addTearDown(session.dispose);

    await session.toggleCamera();
    expect(session.camera, isFalse);
    expect(session.error, contains('Camera access was not available'));

    await session.toggleMicrophone();
    expect(session.microphone, isFalse);
    expect(session.error, contains('Microphone access was not available'));
  });
}
