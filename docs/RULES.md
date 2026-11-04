# Liar’s Dice · Street Circle v1

The brief calls for 2–8 players, private dice, turns, free coins and a “catch” dispute. Liar’s Dice is the selected mode. The ZIP’s two-player poker renderer is reused; poker scoring is not part of this mode. These are explicit house rules, not a claim of a single universal ruleset or a verified popularity ranking.

1. Each seated player starts with five standard D6 dice. Ones are literal, **not wild**.
2. Each player contributes the fixed table entry once per match: 0, 10, 25, 50 or 100 free coins. There are no purchases, cash values or withdrawals. Local practice does not touch the wallet.
3. All active dice reroll at the start of each round. A player sees only their own results. Watchers see no private results.
4. The first seat opens the first round. A bid claims at least Q dice showing face F exist across the whole table: e.g. three fours.
5. Turns follow seat order, skipping eliminated players. Raise the quantity with any face, or keep quantity and raise face. Never bid more dice than exist. From 3×4, 3×5 and 4×1 are legal; 3×4 and 2×6 are not.
6. The next player may instead call **Catch!** on the previous bid. Catch is unavailable before the first bid. Everyone’s dice are revealed and recorded.
7. Actual count at least the bid: catcher loses a die. Actual count below the bid: bidder loses a die. No separate “exact” action exists.
8. At zero dice, a player is out and may watch. The loser starts the next round if still active, otherwise the next active seat starts. Any active player may continue the reveal; online servers also continue after 12 seconds.
9. The last player with dice wins the free-coin pot. Settlement happens once. All remaining human seats must opt into a rematch, then the host starts it. A rematch takes a new entry.
10. Online turns have 45 seconds. Timeout catches an existing bid or creates an opening bid of one random face. A disconnected seat has 60 seconds to reconnect before forfeiture. Explicit leave forfeits immediately. Forfeiture voids the bid and starts a fresh round; bids are never judged against a changed set of dice.
11. Server daily active-play caps reset at midnight UTC. Reaching the cap forfeits the active match and prevents a new match. Watchers and eliminated players do not use active play time. The player can change their chosen cap. Offline practice currently uses a session cap.

The Node engine is authoritative online; the Dart engine is only for offline practice. Rule changes must update both and their tests.

## In-app guidance / Guida in italiano

The lobby has a visible **Regole / How to play** button; during a match the **Regole** help button stays visible beside the table. The help sheet defaults to Italian and supports **IT / EN** without leaving the match. It explains the dice, bids, challenges, round results and every visible table control.

**Attenzione:** nel gioco *Bid* significa **dichiarare** una quantità e una faccia di dado, non scommettere monete. I dadi sono rilanciati automaticamente a ogni round; *Catch!* significa sfidare la dichiarazione precedente. *Balance* è il saldo di monete gratuite e *In Play* è il montepremi fisso della partita. Una partita pratica non modifica il saldo.

The original table has two five-slot racks, **not** one rack per player. During bidding only the local player's numbered dice are rendered; the opposite rack is empty. After Catch the second rack shows the last bidder's hand, while the result sheet lists everyone's revealed dice. The compact top strip explicitly marks **TU** (your dice), shows each seated player's remaining public dice count, and highlights the current turn. Other players' face values stay hidden until Catch.

General bluff/challenge reference: [Stanford’s Liar’s Dice assignment](https://web.stanford.edu/class/cs109l/unrestricted/assignments/assn1a/liarsdice.pdf). The exact timeout, no-wild and free-coin rules above are implementation choices.
