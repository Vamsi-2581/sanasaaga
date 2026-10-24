import PocketBase from 'pocketbase';

export const pb = new PocketBase(window.location.origin);

export async function loginWithGoogle() {
  return await pb.collection('users').authWithOAuth2({ provider: 'google' });
}

export function logout() {
  pb.authStore.clear();
}

export function getCurrentUser() {
  return pb.authStore.record;
}

export async function updateUsername(newUsername) {
  if (!pb.authStore.record) return;
  return await pb.collection('users').update(pb.authStore.record.id, {
    username: newUsername
  });
}

export async function newGame({ length = 5, category = 'all', mode = 'random', date_str = null }) {
  const res = await fetch('/api/game/new', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {})
    },
    body: JSON.stringify({ length, category, mode, date_str })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Virhe uuden pelin aloittamisessa');
  }
  return await res.json();
}

export async function submitGuess({ sessionId, guess }) {
  const res = await fetch('/api/game/guess', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {})
    },
    body: JSON.stringify({ session_id: sessionId, guess })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Virhe arvauksen tarkistamisessa');
  }
  return await res.json();
}

export async function checkWord(word) {
  const res = await fetch(`/api/words/check?word=${encodeURIComponent(word)}`);
  return await res.json();
}

export async function getStats() {
  if (!pb.authStore.token) return null;
  const res = await fetch('/api/game/stats', {
    headers: {
      Authorization: `Bearer ${pb.authStore.token}`
    }
  });
  if (!res.ok) return null;
  return await res.json();
}
