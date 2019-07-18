javascript:(async function() {
  const LOCAL_STORAGE_KEY = 'slack-banlist';
  const PAGE_SIZE = 1000;

  function apiUserToLocalUser(user, now) {
    return {
      username: user.name,
      recorded: now,
    };
  }

  /*
   * Expected local storage data format:
   *
   * type User = {
   *   username: string,
   *   recorded: number,
   * };
   *
   * type Data = {
   *   active: User[],
   *   banned: User[],
   * };
   */
  let activeUsers = new Map();
  let bannedUsers = new Map();
  let lastBanTime = 0;
  let firstScan = true;
  const storedStateJson = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (storedStateJson) {
    try {
      const storedState = JSON.parse(storedStateJson);
      if (
        Array.isArray(storedState.active) &&
        Array.isArray(storedState.banned)
      ) {
        firstScan = false;
        activeUsers = new Map(storedState.active.map(u => [u.username, u]));
        bannedUsers = new Map(storedState.banned.map(u => [u.username, u]));
        lastBanTime = storedState.banned.reduce(
          (max, u) => Math.max(max, u.recorded),
          0
        );
      }
    } catch (e) {
      console.error('bad stored state json:', storedStateJson);
    }
  }

  let cursor;
  const members = [];
  const apiToken = window.slackDebug[
    window.slackDebug.activeTeamId
  ].redux.getState().bootData.api_token;
  do {
    const cursorParam = cursor
      ? `&cursor=${window.encodeURIComponent(cursor)}`
      : '';
    const url = `/api/users.list?token=${apiToken}` +
      `&limit=${PAGE_SIZE}${cursorParam}`;
    const resp = await window.fetch(url);
    if (resp.status !== 200) {
      throw new Error(`Bad API response: ${resp.status}`);
    }

    const data = await resp.json();
    if (!data.ok) {
      throw new Error(`Error calling users.list: ${data.error}`);
    }

    if (Array.isArray(data.members)) {
      members.push(...data.members);
    }
    cursor = data.response_metadata && data.response_metadata.next_cursor;
  } while (cursor);

  const newBannedUsernames = [];
  const newActiveUsernames = [];
  const now = Date.now();
  for (const user of members) {
    if (user.deleted && !bannedUsers.has(user.name)) {
      newBannedUsernames.push(user.name);
      bannedUsers.set(user.name, apiUserToLocalUser(user, now));
      activeUsers.delete(user.name);
    } else if (!user.deleted && !activeUsers.has(user.name)) {
      newActiveUsernames.push(user.name);
      activeUsers.set(user.name, apiUserToLocalUser(user, now));
      bannedUsers.delete(user.name);
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
    active: [...activeUsers.values()],
    banned: [...bannedUsers.values()],
  }));

  const messages = [];
  if (firstScan) {
    messages.push(
      'First scan!',
      `Found ${newBannedUsernames.length} banned users`,
      `Found ${newActiveUsernames.length} active users`
    );
  } else {
    if (newBannedUsernames.length) {
      const names = newBannedUsernames.join(', ');
      messages.push(`\ud83d\udeab Goodbye: ${names}`);
    } else {
      const dateString = new Date(lastBanTime).toLocaleDateString();
      messages.push(`No new bans since last scan (${dateString})`);
    }
    if (newActiveUsernames.length) {
      const names = newActiveUsernames.join(', ');
      messages.push(`\ud83d\udc4b Welcome: ${names}`);
    } else {
      messages.push('No new active users since last scan');
    }
  }

  for (const message of messages) {
    console.log(message);
  }

  const containerElem = document.createElement('div');
  containerElem.id = `slack-banlist-container-${now}`;
  containerElem.style.position = 'fixed';
  containerElem.style.right = '32px';
  containerElem.style.bottom = '16px';
  containerElem.style.left = '32px';
  containerElem.style.maxHeight = '80%';
  containerElem.style.overflow = 'auto';
  containerElem.style.padding = '16px';
  containerElem.style.background = '#eee';
  containerElem.style.border = '2px solid #222';
  containerElem.style.borderRadius = '8px';
  containerElem.style.boxShadow = '0 0 2px #222';
  containerElem.style.zIndex = '99999';
  containerElem.style.zIndex = '99999';

  const closeElem = document.createElement('div');
  closeElem.textContent = '\u274c';
  closeElem.style.position = 'absolute';
  closeElem.style.top = '8px';
  closeElem.style.right = '8px';
  closeElem.style.fontSize = '12px';
  closeElem.style.cursor = 'pointer';
  closeElem.addEventListener(
    'click',
    () => document.body.removeChild(containerElem)
  );
  containerElem.appendChild(closeElem);

  for (const message of messages) {
    const textElem = document.createElement('p');
    textElem.style.color = '#222';
    textElem.style.fontSize = '24px';
    textElem.style.lineHeight = '32px';
    textElem.style.margin = '4px 0';
    textElem.style.userSelect = 'text';
    textElem.textContent = message;
    containerElem.appendChild(textElem);
  }

  document.body.appendChild(containerElem);
})();
