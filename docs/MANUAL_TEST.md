# Manual acceptance checks

These are test suggestions, not a claim that every scenario has been manually passed. Include commit, browser/device, expected and actual behavior in a bug report.

## Browser practice

1. Open the preview. On desktop choose compact/standard/large phone widths. On a narrow actual phone, the app should fill the viewport.
2. Select **Play a practice round**. Three opponents are explicitly labelled BOT. The original ZIP’s wood, black/gold board, artwork and 3D dice should appear in portrait, with no Flutter card covering the board.
3. Use the original top controls: cycle volume, artwork and shake. Use the bottom dock to choose quantity/face and press the dice icon to bid. The mode automatically rolls at each round start; the dice button places a bid.
4. Wait for bots. On your turn raise face at the same quantity, then raise quantity with a lower face. Equal/lower bids must disable Bid. Catch must be disabled before the first bid.
5. Catch a bid. In the result window, count matching faces across all revealed hands. Ones must be literal. The correct player loses a die. **View table** dismisses the result window; **View results** reopens it.
6. Press **Next round**, verify reroll and losing-player start. Play through elimination to a winner, then **Play again**.
7. Send chat and reactions; practice chat stays local. Open History to inspect bids/catches. Bots do not pretend to chat or have cameras.
8. Export a 10-second table clip from the menu. Expect a browser video download, not automatic social publishing. MediaRecorder support varies.
9. Leave; practice must not change the wallet.

## Connected rooms

Run the Node service and use separate browser profiles A/B/C. A and B are players, C watches. Local review accounts require unique names; production requires actual SMS verification.

1. A creates an invite-only table, entry 50. B cannot find it in the public lobby. B joins by code; C chooses **Watch instead**.
2. Start. A/B each pay 50 once; pot is 100. Repeat Start must not deduct again. Each player sees only their own current dice. C sees none.
3. Bid/catch across clients. Changes arrive without refresh; C cannot act. Refresh within reconnect grace should restore the seat/hand.
4. Disconnect for under 60 seconds, then longer than 60. The former reconnects; the latter forfeits. Explicit leave forfeits immediately. The remaining player receives the pot once.
5. Let 45 seconds expire. Server catches the previous bid or makes an opening bid. Check history.
6. Finish and request rematch from all humans. Host starts only after consent; new entries are deducted once.
7. Fill eight seats; reject a ninth. Check watcher-disabled tables and host departure.
8. Create/join a crew, copy its code, refresh membership. Test duplicate usernames and invalid codes.
9. Make B private, then block B from A. Check search/entry restrictions and Unblock in You. Existing-call video revocation remains unfinished.
10. Set a 5-minute daily cap, play to it and refresh/restart. Usage must persist; a new match must be denied. Server day resets at midnight UTC.

## Outstanding provider and device checks

- Twilio: actual delivery, consent, valid/invalid/expired codes, resend throttles and provider failures. No default OTP exists.
- LiveKit: 8 publishers plus watchers, permissions, mute/unmute, packet loss, handoff/reconnect, expiry, leave/block revocation and no watcher publication.
- GoDice: not implemented. Do not mark BLE tests passed.
- Native: physical iPhone/Android builds, permissions/lifecycle, secure storage, hosted WebView and sharing are not yet verified.
