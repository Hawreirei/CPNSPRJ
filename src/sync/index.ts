import { getAccount, startAccount, subscribeAccount, type Account } from './auth';
import { attach, detach } from './runner';

/**
 * Sync follows the account: it starts when the learner is signed in and stops on sign-out (#101).
 * Wiring this up loads nothing and contacts nobody; only a signed-in account does.
 */
let wired = false;

function follow(a: Account) {
  if (a.status === 'signed-in') void attach(a.userId);
  else if (a.status === 'signed-out') detach();
}

export function startSync() {
  if (wired) return;
  wired = true;
  subscribeAccount(follow);
  follow(getAccount());
}

/** Start-up of a browser that was signed in: get the session back, then sync. */
export async function resumeSync() {
  startSync();
  await startAccount();
}
