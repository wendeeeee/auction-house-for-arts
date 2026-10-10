import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { BellIcon } from '../../shared/ui/icons';
import { describeNotification } from './notification-message';
import { useNotifications } from './NotificationsProvider';

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const MAXIMUM_SHOWN_COUNT = 9;

export function NotificationBell() {
  const { hasInbox, notifications, unreadCount, markRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const location = useLocation();

  useEffect(() => setIsOpen(false), [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (!hasInbox) return null;

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button notification-bell__button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        onClick={() => setIsOpen((open) => !open)}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notification-bell__count" aria-hidden="true">
            {unreadCount > MAXIMUM_SHOWN_COUNT ? `${MAXIMUM_SHOWN_COUNT}+` : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div id={panelId} className="notification-panel card card--raised">
          <p className="mono-label notification-panel__heading">Notifications</p>
          {notifications.length === 0 ? (
            <p className="notification-panel__empty">Nothing yet. Results of auctions you sell or bid on appear here.</p>
          ) : (
            <ul className="notification-panel__list">
              {notifications.map((notification) => {
                const message = describeNotification(notification);
                const isUnread = notification.readAt === null;
                return (
                  <li key={notification.id}>
                    <Link
                      className={`notification-item${isUnread ? ' notification-item--unread' : ''}`}
                      to={`/auctions/${notification.auctionSlug}`}
                      onClick={() => {
                        if (isUnread) markRead(notification.id);
                        setIsOpen(false);
                      }}
                    >
                      <span className={`mono-label${message.isPositive ? ' mono-label--gold' : ''}`}>
                        {message.label}
                        {isUnread && <span className="visually-hidden"> (unread)</span>}
                      </span>
                      <span className="notification-item__headline">{message.headline}</span>
                      <span className="notification-item__time">{timeFormat.format(new Date(notification.createdAt))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
