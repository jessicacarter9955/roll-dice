(() => {
  let token = '';
  const $ = id => document.getElementById(id);
  const notice = message => { $('notice').textContent = message; };
  async function api(path, options = {}) {
    const response = await fetch('/admin/api' + path, {
      ...options,
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  function field(card, label, value) {
    const line = document.createElement('p');
    const strong = document.createElement('strong'); strong.textContent = label + ': ';
    line.append(strong, document.createTextNode(String(value ?? '—'))); card.append(line);
  }
  async function load() {
    const status = $('status').value;
    const qs = status === 'all' ? '' : '?status=' + encodeURIComponent(status);
    try {
      const data = await api('/reports' + qs);
      $('dashboard').hidden = false;
      $('reports').replaceChildren();
      $('count').textContent = `${data.reports.length} shown / ${data.count} matching`;
      for (const item of data.reports) {
        const card = document.createElement('article'); card.className = 'report';
        field(card, 'Reason', item.reason); field(card, 'Reporter', item.reporterId);
        field(card, 'Target', item.targetId); field(card, 'Room', item.roomId);
        field(card, 'Details', item.details); field(card, 'Status', item.status);
        field(card, 'Created', new Date(item.createdAt).toLocaleString());
        const button = document.createElement('button');
        button.textContent = item.status === 'open' ? 'Mark reviewed' : 'Reopen';
        button.addEventListener('click', async () => {
          try {
            await api('/reports/' + encodeURIComponent(item.id), {method: 'PATCH', body: JSON.stringify({status: item.status === 'open' ? 'reviewed' : 'open'})});
            notice('Review status saved.'); await load();
          } catch (error) { notice(error.message); }
        });
        const suspension = document.createElement('button');
        const currentlySuspended = Boolean(item.targetSuspended);
        suspension.textContent = currentlySuspended ? 'Restore account' : 'Suspend account';
        suspension.addEventListener('click', async () => {
          const reason = window.prompt('Document the moderation reason (8–300 characters):');
          if (reason === null) return;
          if (reason.trim().length < 8 || reason.length > 300) return notice('Give a reason of 8–300 characters.');
          if (!window.confirm(`${currentlySuspended ? 'Restore' : 'Suspend'} this account? Existing sessions are revoked, and suspension removes the player from active rooms.`)) return;
          try {
            await api('/users/' + encodeURIComponent(item.targetId) + '/status', {
              method: 'PATCH', body: JSON.stringify({suspended: !currentlySuspended, reason}),
            });
            notice(currentlySuspended ? 'Account restored.' : 'Account suspended; sessions revoked.');
            await load();
          } catch (error) { notice(error.message); }
        });
        const history = document.createElement('button');
        history.textContent = 'Moderation history';
        history.addEventListener('click', async () => {
          try {
            const result = await api('/users/' + encodeURIComponent(item.targetId));
            const panel = document.createElement('div'); panel.className = 'history';
            if (!result.actions.length) field(panel, 'History', 'No previous moderation decisions.');
            for (const action of result.actions) {
              field(panel, action.action + ' · ' + new Date(action.createdAt).toLocaleString(), action.reason);
            }
            history.replaceWith(panel);
          } catch (error) { notice(error.message); }
        });
        card.append(button, suspension, history); $('reports').append(card);
      }
      notice(data.count ? '' : 'No reports match this filter.');
    } catch (error) { notice(error.message); }
  }
  $('access').addEventListener('submit', event => {
    event.preventDefault(); token = $('key').value; $('key').value = '';
    load();
  });
  $('refresh').addEventListener('click', load);
  $('status').addEventListener('change', load);
  $('lock').addEventListener('click', () => {
    token = ''; $('dashboard').hidden = true; $('reports').replaceChildren(); notice('Locked.');
  });
})();
