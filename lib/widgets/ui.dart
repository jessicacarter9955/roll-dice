import 'package:flutter/material.dart';

const ink = Color(0xff101b18),
    panel = Color(0xff192620),
    gold = Color(0xffe6c582),
    muted = Color(0xff9caea3),
    green = Color(0xffb5d5a6);
const playerColors = [
  gold,
  Color(0xffa6c5a1),
  Color(0xffb1a3c7),
  Color(0xff9dbcc7),
  Color(0xffca9e91),
  Color(0xffc4bd8d),
];

class Brand extends StatelessWidget {
  const Brand({super.key});
  @override
  Widget build(BuildContext context) => const Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(Icons.blur_circular, size: 28, color: gold),
      SizedBox(width: 8),
      Text(
        'street circle',
        style: TextStyle(
          fontSize: 17,
          letterSpacing: -.6,
          fontWeight: FontWeight.w700,
        ),
      ),
    ],
  );
}

class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      color: gold,
      fontSize: 8,
      letterSpacing: 1.5,
      fontWeight: FontWeight.w700,
    ),
  );
}

class Tag extends StatelessWidget {
  const Tag(this.text, {super.key, this.color = gold});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .08),
      borderRadius: BorderRadius.circular(5),
    ),
    child: Text(
      text,
      style: TextStyle(color: color, fontSize: 8, letterSpacing: .3),
    ),
  );
}

class Tile extends StatelessWidget {
  const Tile({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: panel,
      borderRadius: BorderRadius.circular(15),
      border: Border.all(color: Colors.white.withValues(alpha: .055)),
    ),
    child: child,
  );
}

class Avatar extends StatelessWidget {
  const Avatar({
    super.key,
    required this.name,
    this.size = 40,
    this.color = gold,
  });
  final String name;
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: color.withValues(alpha: .17),
    ),
    child: Text(
      name.isEmpty ? '?' : name[0].toUpperCase(),
      style: TextStyle(
        color: color,
        fontSize: size * .4,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
}

class Dice extends StatelessWidget {
  const Dice({
    super.key,
    required this.value,
    this.size = 30,
    this.goldFace = false,
  });
  final int value;
  final double size;
  final bool goldFace;
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Die $value',
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: goldFace ? gold : const Color(0xffeee9dd),
        borderRadius: BorderRadius.circular(size * .19),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: .25),
            offset: Offset(0, size * .06),
            blurRadius: 2,
          ),
        ],
      ),
      child: CustomPaint(painter: _Pips(value)),
    ),
  );
}

class _Pips extends CustomPainter {
  _Pips(this.value);
  final int value;
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = ink;
    const patterns = [
      <int>[],
      [4],
      [0, 8],
      [0, 4, 8],
      [0, 2, 6, 8],
      [0, 2, 4, 6, 8],
      [0, 2, 3, 5, 6, 8],
    ];
    for (final i in patterns[value.clamp(0, 6)]) {
      canvas.drawCircle(
        Offset(
          size.width * (.25 + (i % 3) * .25),
          size.height * (.25 + (i ~/ 3) * .25),
        ),
        size.width * .075,
        p,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _Pips oldDelegate) => oldDelegate.value != value;
}

Future<void> showSheet(BuildContext context, Widget child) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      constraints: const BoxConstraints(maxWidth: 450),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          0,
          24,
          MediaQuery.viewInsetsOf(ctx).bottom + 24,
        ),
        child: SingleChildScrollView(child: child),
      ),
    );
void toast(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), duration: const Duration(seconds: 5)),
    );

class RulesContent extends StatelessWidget {
  const RulesContent({super.key});
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Eyebrow('LIAR’S DICE · STREET CIRCLE RULES V1'),
      const SizedBox(height: 14),
      const Text(
        'A good bluff goes\na long way.',
        style: TextStyle(
          fontSize: 30,
          height: 1.1,
          fontWeight: FontWeight.w600,
        ),
      ),
      const SizedBox(height: 22),
      for (final (title, body) in [
        (
          'Five dice. Just for you.',
          '2–8 players start with five hidden dice. Every face counts as itself. Ones are not wild.',
        ),
        (
          'Make a call. Raise a call.',
          'Bid how many dice of a face exist across the whole table. Example: “three fours”. The next bid must raise the quantity, or the face at the same quantity.',
        ),
        (
          'Don’t believe it? Catch.',
          'On your turn, challenge the previous bid. Everyone’s dice are revealed. If the count meets or exceeds the bid, the catcher loses one die. Otherwise the bidder loses one.',
        ),
        (
          'Stay in the circle.',
          'The loser starts the next round with fresh dice. At zero dice you watch. The last player with dice wins the match and the free-coin pot.',
        ),
        (
          'Keep it friendly.',
          'Each player pays the same entry once per match. No raising coin stakes during a hand. No purchases, withdrawals or cash value. Practice never changes your wallet.',
        ),
        (
          'A connection can drop.',
          'Connected tables give you 45 seconds per call. A timed-out turn catches the last bid, or makes an opening bid. A disconnect has 60 seconds to reconnect before forfeiture. Leaving forfeits immediately.',
        ),
      ])
        Padding(
          padding: const EdgeInsets.only(bottom: 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                body,
                style: const TextStyle(
                  color: muted,
                  fontSize: 12,
                  height: 1.65,
                ),
              ),
            ],
          ),
        ),
      const Text(
        'These are selected house rules. Liar’s Dice has other variants.',
        style: TextStyle(color: muted, fontSize: 10),
      ),
    ],
  );
}
