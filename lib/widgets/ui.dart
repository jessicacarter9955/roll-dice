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

class RulesContent extends StatefulWidget {
  const RulesContent({super.key});

  @override
  State<RulesContent> createState() => _RulesContentState();
}

class _RulesContentState extends State<RulesContent> {
  bool italian = true;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          const Expanded(child: Eyebrow('STREET CIRCLE · LIAR’S DICE')),
          TextButton(
            key: const Key('rules-it'),
            onPressed: () => setState(() => italian = true),
            style: TextButton.styleFrom(
              foregroundColor: italian ? gold : muted,
              backgroundColor: italian ? gold.withValues(alpha: .15) : null,
            ),
            child: const Text('IT'),
          ),
          TextButton(
            key: const Key('rules-en'),
            onPressed: () => setState(() => italian = false),
            style: TextButton.styleFrom(
              foregroundColor: italian ? muted : gold,
              backgroundColor: italian ? null : gold.withValues(alpha: .15),
            ),
            child: const Text('EN'),
          ),
        ],
      ),
      const SizedBox(height: 14),
      Text(
        italian ? 'Come si gioca' : 'How to play',
        style: const TextStyle(
          fontSize: 30,
          height: 1.1,
          fontWeight: FontWeight.w600,
        ),
      ),
      const SizedBox(height: 16),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: gold.withValues(alpha: .10),
          border: Border.all(color: gold.withValues(alpha: .35)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              italian ? 'Bid NON è una puntata di denaro' : 'Bid is NOT a money bet',
              style: const TextStyle(color: gold, fontSize: 15, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 7),
            Text(
              italian
                  ? 'Con Bid dichiari quanti dadi di un certo valore pensi ci siano fra TUTTI i giocatori. Non spendi monete a ogni Bid. La quota del tavolo, se prevista, si paga una sola volta all’inizio; in pratica è gratis.'
                  : 'Bid means claiming how many dice of a certain face you think ALL players have combined. It does not spend coins each time. The table entry, if any, is paid once at match start; practice is free.',
              style: const TextStyle(color: Colors.white, fontSize: 12, height: 1.6),
            ),
          ],
        ),
      ),
      const SizedBox(height: 20),
      for (final (title, body) in (italian ? [
        (
          '1. Perché i dadi appaiono subito?',
          'All’inizio di ogni round i tuoi dadi vengono lanciati automaticamente: non devi premere Roll. I dadi bianchi con i numeri visibili sono i TUOI (anche quelli che vedi volare durante il lancio). Le due file di supporti sono l’aspetto del vecchio tavolo a due mani: i cerchi vuoti non sono i dadi di Maya o degli altri. I loro valori restano segreti fino a Catch. La striscia sopra il tavolo mostra nomi e quantità rimaste; il bordo oro indica chi ha il turno.',
        ),
        (
          '2. Scegli quantità e faccia, poi Bid',
          'Nel campo numerico scegli QUANTI dadi e nel selettore scegli il VALORE (da 1 a 6). Esempio: quantità 3, faccia 4, premi il dado/Bid = “Secondo me sul tavolo ci sono almeno tre 4”. Puoi anche bluffare.',
        ),
        (
          '3. Il giocatore successivo alza o sfida',
          'Deve dichiarare più dadi (per esempio da 3×4 a 4×1) oppure lo stesso numero con faccia maggiore (3×4 → 3×5). In alternativa preme Catch! per dire “Non ci credo!”. Catch è disabilitato finché nessuno ha fatto un Bid.',
        ),
        (
          '4. Cosa succede dopo Catch?',
          'Si scoprono tutti i dadi nel riquadro del risultato; la seconda fila mostra allora la mano dell’ultimo dichiarante. Se la dichiarazione era vera (o sottostimata), chi ha premuto Catch perde 1 dado. Se era falsa, perde 1 dado chi ha fatto Bid. Esempio: Bid “tre 4”, ma sul tavolo ci sono solo due 4 → perde chi ha dichiarato.',
        ),
        (
          '5. Next round, Balance e In Play',
          'Dopo il risultato premi Next round: si rilanciano automaticamente i dadi rimasti. A zero dadi sei eliminato; vince l’ultimo rimasto. Balance è il saldo di monete gratuite. In Play è il montepremi della partita, NON il valore dell’ultimo Bid.',
        ),
        (
          '6. Altri pulsanti e tempi',
          'In alto: altoparlante = suono, tavolozza = immagine del tavolo, dado = effetto shake. Bid e Catch sono attivi solo nel tuo turno. Online hai 45 secondi per decidere e 60 secondi per riconnetterti; in pratica non perdi monete.',
        ),
      ] : [
        (
          '1. Why do dice appear immediately?',
          'Your dice roll automatically at the start of each round. The numbered dice you see (including those rolling in the middle) are YOUR hand. The two rows of holders come from the original two-hand table: empty cups do not represent Maya or any other player. Their values remain secret until Catch. The player strip above the board shows everyone’s name and remaining dice count; the gold outline marks whose turn it is.',
        ),
        (
          '2. Quantity + face + Bid',
          'Choose a quantity and a face (1–6). For example, 3 and 4 means “I think there are at least three fours across everyone’s dice.” Press the dice/Bid button to make that claim; bluffing is allowed.',
        ),
        (
          '3. Raise the claim or Catch!',
          'The next player must raise the quantity (3×4 → 4×1) or keep the quantity and raise the face (3×4 → 3×5). Alternatively, Catch! challenges the previous claim. Catch is disabled until someone has bid.',
        ),
        (
          '4. Resolving Catch',
          'Catch reveals every hand in the result sheet; the second rack then shows the last bidder’s hand. If the claim is true, the challenger loses one die; if false, the bidder loses one. Example: someone claimed three fours but only two exist; the bidder loses.',
        ),
        (
          '5. Next round, Balance and In Play',
          'Next round rolls the remaining dice automatically. A player with zero dice is out; the last player wins. Balance shows free coins. In Play is the whole match pot, not your latest Bid.',
        ),
        (
          '6. Other controls and timing',
          'Top controls change sound, table art and shaking. Bid/Catch only work on your turn. Online you have 45 seconds to act and 60 seconds to reconnect; practice never changes your wallet.',
        ),
      ]))
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
      Text(
        italian
            ? 'Queste sono le regole adottate da Street Circle: esistono altre varianti di Liar’s Dice. I dadi con valore 1 non sono jolly.'
            : 'These are Street Circle house rules; other Liar’s Dice variants exist. Ones are not wild.',
        style: const TextStyle(color: muted, fontSize: 10),
      ),
    ],
  );
}

/// A compact guide to public dice ownership. Opponents' actual faces remain
/// hidden until a Catch, even though the original ZIP table has two racks.
class DiceOwnershipLegend extends StatelessWidget {
  const DiceOwnershipLegend({
    super.key,
    required this.players,
    required this.myId,
    required this.watching,
    required this.phase,
    this.turnIndex,
    this.revealOwner,
  });

  final List<Map<String, dynamic>> players;
  final String myId;
  final bool watching;
  final String phase;
  final int? turnIndex;
  final String? revealOwner;

  String get ownershipText {
    final revealed = phase == 'reveal' || phase == 'finished';
    if (watching) {
      return revealed ? 'Spettatore · risultato visibile' : 'Spettatore · dadi segreti';
    }
    if (phase == 'waiting') {
      return 'In attesa · dadi non ancora lanciati';
    }
    if (revealed) {
      return 'Dadi: TU + ${revealOwner ?? 'ultimo dichiarante'}';
    }
    return '🎲 Dadi visibili: TUOI · altri segreti';
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        key: const Key('dice-ownership-label'),
        margin: const EdgeInsets.only(right: 108),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: const Color(0xe6101814),
          borderRadius: BorderRadius.circular(15),
        ),
        child: Text(
          ownershipText,
          maxLines: 2,
          style: const TextStyle(fontSize: 10, color: Colors.white, height: 1.2),
        ),
      ),
      const SizedBox(height: 5),
      SingleChildScrollView(
        key: const Key('player-dice-strip'),
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (var i = 0; i < players.length; i++)
              Padding(
                padding: const EdgeInsets.only(right: 5),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
                  decoration: BoxDecoration(
                    color: players[i]['id'] == myId
                        ? const Color(0xee294030)
                        : const Color(0xe0101814),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: turnIndex == i ? gold : Colors.white24,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        players[i]['id'] == myId
                            ? Icons.casino_outlined
                            : Icons.lock_outline,
                        size: 12,
                        color: players[i]['id'] == myId ? gold : muted,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${players[i]['id'] == myId ? 'TU' : players[i]['name']} · ${players[i]['count'] ?? 5}',
                        style: const TextStyle(fontSize: 10, color: Colors.white),
                      ),
                      if (turnIndex == i) ...[
                        const SizedBox(width: 5),
                        const Icon(Icons.arrow_forward_ios, color: gold, size: 10),
                      ],
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    ],
  );
}
