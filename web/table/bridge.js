// Adapts the original table's controls; Flutter/server retain ownership of gameplay.
export function attachBridge({ canvas, ui, hint, setDice, roll }) {
  let ready = false, state = null, renderedRound = null, animating = false, shownReveal = null, recording = false;
  let highlight = null;
  const shareHighlight = document.getElementById('shareHighlight');
  const face = document.getElementById('bidFace');
  const catchButton = document.getElementById('catchBtn');
  const modal = document.getElementById('modal');
  modal.inert = true;
  const total = document.getElementById('totalDice');
  const bidLabel = document.getElementById('currentBid');
  const roundLabel = document.getElementById('roundLabel');
  const rollLabel = document.getElementById('rollLabel');
  function send(data) {
    const json = JSON.stringify(data);
    if (window.StreetCircleBridge) window.StreetCircleBridge.postMessage(json);
    else parent.postMessage(json, location.origin);
  }
  function action(data) { send({ type: 'action', action: data }); }
  const diceText = values => values.map(v => String.fromCodePoint(0x267f + v)).join(' ');
  function validBid() {
    const q = Number(ui.betInput.value), f = Number(face.value), b = state?.bid;
    return Number.isInteger(q) && q >= 1 && q <= (state?.totalDice || 0) &&
      (!b || q > b.quantity || (q === b.quantity && f > b.face));
  }
  function updateButtons() {
    ui.rollBtn.disabled = !state?.myTurn || state?.busy || !validBid();
    catchButton.disabled = !state?.myTurn || state?.busy || !state?.bid;
    ui.betInput.disabled = face.disabled = !state?.myTurn || state?.busy;
    ui.newGameBtn.disabled = state?.busy || (state?.phase === 'finished' ? !state?.canRematch : !state?.canContinue);
    rollLabel.textContent = 'Bid';
  }
  ui.betInput.addEventListener('input', updateButtons);
  face.addEventListener('change', updateButtons);
  ui.rollBtn.onclick = () => { if (!ui.rollBtn.disabled) action({type:'bid', quantity:Number(ui.betInput.value), face:Number(face.value)}); };
  catchButton.onclick = () => { if (!catchButton.disabled) action({type:'catch'}); };
  ui.newGameBtn.onclick = () => action({type: state?.phase === 'finished' ? 'rematch' : 'next'});
  function closeResult() { modal.classList.remove('show'); modal.inert = true; }
  function openResult() { modal.inert = false; modal.classList.add('show'); }
  document.getElementById('dismissResult').onclick = closeResult;
  hint.onclick = () => { if (state?.resolution || state?.phase === 'finished') openResult(); };
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeResult(); });
  function showResult(data) {
    const r = data.resolution;
    document.getElementById('resultTitle').textContent = data.phase === 'finished' ? 'Match Results' : 'Catch Results';
    ui.pHand.textContent = data.phase === 'finished' ? data.winnerName === 'You' ? 'You win' : `${data.winnerName || 'The circle'} wins` : r ? r.loserName === 'You' ? 'You lose a die' : `${r.loserName} loses a die` : 'Player forfeited';
    ui.aHand.textContent = r ? `${r.actual} actual ${diceText([r.bid.face])} · bid ${r.bid.quantity}` : 'The current bid is void.';
    ui.winlose.textContent = r ? r.truthful ? 'The bid was true' : 'Bluff caught!' : 'Round complete';
    ui.sumEl.textContent = String(data.phase === 'finished' ? data.pot || 0 : r?.actual || 0);
    ui.newGameBtn.textContent = data.phase === 'finished' ? data.practice ? 'Play again' : 'Request / start rematch' : 'Next round';
    const hands = document.getElementById('revealHands'); hands.replaceChildren();
    for (const p of r?.dice || []) {
      const row = document.createElement('div'); row.className = 'revealed-hand';
      const name = document.createElement('span'); name.textContent = p.name;
      const dice = document.createElement('b'); dice.textContent = diceText(p.dice); dice.setAttribute('aria-label', p.dice.join(', '));
      row.append(name, dice); hands.append(row);
    }
    ui.pIcons.textContent = ui.aIcons.textContent = '';
    openResult();
  }
  async function apply(data) {
    const old = state; state = data;
    if (!ready) return;
    const newBid = !old || data.round !== old.round || data.bid?.quantity !== old.bid?.quantity || data.bid?.face !== old.bid?.face;
    if (newBid) {
      let q = data.bid?.quantity || 1, f = (data.bid?.face || 0) + 1;
      if (f > 6) { q++; f = 1; }
      ui.betInput.value = String(q); face.value = String(f);
    }
    ui.betInput.max = String(data.totalDice || 40);
    ui.balanceEl.textContent = String(data.balance ?? 1000);
    ui.inPlayEl.textContent = String(data.pot || 0);
    total.textContent = String(data.totalDice || 0);
    roundLabel.textContent = data.round ? `ROUND ${data.round}` : 'WAITING';
    bidLabel.textContent = data.bid ? `${data.bid.quantity} × ${diceText([data.bid.face])}` : '—';
    const seconds = data.deadline ? Math.max(0, Math.ceil((data.deadline-Date.now())/1000)) : null;
    hint.textContent = `${data.status || 'Your private dice'}${seconds !== null && data.phase === 'bidding' ? ` · ${seconds}s` : ''}`;
    const ended = data.phase === 'reveal' || data.phase === 'finished';
    document.querySelector('.bid-controls').hidden = ended || data.phase === 'waiting';
    document.getElementById('reopenResult').hidden = !ended;
    document.getElementById('reopenResult').onclick = openResult;
    if (ended && shownReveal !== `${data.round}:${data.phase}`) { shownReveal = `${data.round}:${data.phase}`; showResult(data); }
    if (!ended) closeResult();
    updateButtons();
    const other = ended ? data.resolution?.dice?.find(p => p.id === data.resolution.bid.playerId)?.dice || [] : [];
    if (renderedRound !== data.round && data.dice?.length && !animating) {
      renderedRound = data.round; animating = true; setDice([], []);
      try { await roll(Math.min(5, data.dice.length)); }
      finally { animating = false; setDice(state.dice || [], ['reveal','finished'].includes(state.phase) ? state.resolution?.dice?.find(p => p.id === state.resolution.bid.playerId)?.dice || [] : []); }
    } else if (!animating) setDice(data.dice || [], other);
  }
  async function capture() {
    if (recording) return;
    if (!canvas.captureStream || !window.MediaRecorder) { send({type:'clip',message:'This browser cannot record the table. Try desktop Chrome.'}); return; }
    recording = true;
    shareHighlight.hidden = true;
    highlight = null;
    send({type:'clip',message:'Recording 10 seconds of the table. Cameras and chat are excluded.'});
    const stream = canvas.captureStream(30), chunks = [];
    // Some Chromium builds claim `video/mp4` support but encode VP9 inside an
    // MP4 container, which many social apps reject. Only choose MP4 with an
    // explicit H.264 codec; otherwise provide a truthful WebM download.
    const mimeType = [
      'video/mp4;codecs=avc1.42E01E',
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
    ].find(t => MediaRecorder.isTypeSupported(t));
    try {
      const recorder = new MediaRecorder(stream, mimeType ? {mimeType} : {});
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); recording = false;
        const filename = 'street-circle-table-' + Date.now() + (recorder.mimeType.includes('mp4') ? '.mp4' : '.webm');
        highlight = new File(chunks, filename, {type: recorder.mimeType});
        const url = URL.createObjectURL(highlight), a = document.createElement('a');
        a.href = url; a.download = filename;
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
        shareHighlight.hidden = false;
        send({type:'clip',message:'10-second clip downloaded. Tap Share highlight to choose an installed social app where supported.'});
      };
      recorder.onerror = () => { recording = false; stream.getTracks().forEach(t => t.stop()); send({type:'clip',message:'Recording failed in this browser.'}); };
      recorder.start(); setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 10000);
    } catch { recording = false; stream.getTracks().forEach(t => t.stop()); send({type:'clip',message:'Recording is not supported in this browser.'}); }
  }
  shareHighlight.addEventListener('click', async () => {
    if (!highlight) return;
    if (!navigator.canShare?.({files: [highlight]})) {
      send({type:'clip',message:'This browser cannot share the recorded video directly. Use the downloaded clip in your social app.'});
      return;
    }
    try {
      await navigator.share({files: [highlight],title:'Street Circle highlight'});
    } catch (e) {
      if (e.name !== 'AbortError') send({type:'clip',message:'Sharing failed. Your downloaded video is still available.'});
    }
  });
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || (e.source !== parent && e.source !== window)) return;
    try {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (data?.type === 'state') apply(data);
      // Status notifications also have type "clip". On a standalone table,
      // parent === window, so never treat those replies as fresh commands.
      if (data?.type === 'clip' && !Object.hasOwn(data, 'message')) capture();
    } catch { send({type:'clip',message:'Table command failed.'}); }
  });
  return { ready() {
    ready = true; send({type:'ready'});
    if (state) { const pending = state; state = null; apply(pending); }
    else if (parent === window) { setDice([6,6,1,1,5], [5,3,2,1,2]); hint.textContent = 'Table preview · open Street Circle to play'; updateButtons(); }
  } };
}
