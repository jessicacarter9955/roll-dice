# Asset provenance

- `web/table/src/images/*` and `web/table/src/sfx/*` are copied from the supplied `C:/Users/jessi/Downloads/rolldice.zip`. Artwork and sound bytes are preserved.
- `web/table/script.js` adapts the archive’s renderer. The original board geometry, dice meshes, textures, physics and audio remain. Two malformed optional-chain expressions in the supplied JavaScript were repaired, plus explicit mute-button binding. Its old poker controls are redirected to the Liar’s Dice bridge; poker rules do not decide connected outcomes.
- `web/table/bridge.js` maps the original translucent dock/result UI to bid/catch/round commands. Flutter and the server own game state. The camera’s up vector turns the long table axis into the phone’s vertical axis.
- Three.js r159 and cannon-es 0.20.0 were vendored from the archive. Their upstream MIT notices are in `web/table/vendor/LICENSE.three` and `LICENSE.cannon`.
- No new stock photos, paid art, avatar images or AI-generated images were added. Avatars use initials. Default native launcher icons remain placeholders.
- The archive supplies no commercial license evidence for its fantasy artwork or sound. Reuse follows the user’s instruction; rights need establishing before commercial release.

The renderer is vendored directly; no extraction or transformation step is required for builds.
