import { useEffect } from 'react';
import { apiClient } from '../../shared/api/api-client';
import type { ListView, UserView } from '../../shared/api/api-types';
import { useApiQuery } from '../../shared/api/use-api-query';
import { demoUserStore } from '../../shared/session/demo-user-store';
import { useDemoUserId } from './use-demo-user-id';

const ANONYMOUS = '';

/**
 * There is no login (a documented scope decision): this picks which demo user the app acts as.
 * The choice goes in sessionStorage and on every API call as X-Demo-User-Id.
 */
export function DemoUserSwitcher() {
  const demoUserId = useDemoUserId();
  const users = useApiQuery('demo-users', (signal) => apiClient.get<ListView<UserView>>('/users', { signal }));

  // A remembered ID that no longer exists (the database was reset) would make every request
  // fail with 401, so fall back to anonymous.
  useEffect(() => {
    if (users.status === 'success' && demoUserId && !users.data.items.some((user) => user.id === demoUserId)) {
      demoUserStore.set(null);
    }
  }, [users, demoUserId]);

  return (
    <label className="user-switcher">
      <span className="user-switcher__label">Viewing as</span>
      <select
        className="user-switcher__select"
        value={demoUserId ?? ANONYMOUS}
        disabled={users.status !== 'success'}
        onChange={(event) => demoUserStore.set(event.target.value || null)}
      >
        <option value={ANONYMOUS}>Guest</option>
        {users.status === 'success' &&
          users.data.items.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
            </option>
          ))}
      </select>
    </label>
  );
}
