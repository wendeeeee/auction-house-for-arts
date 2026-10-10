import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { OutbidToasts } from '../features/auctions/OutbidToasts';
import { DemoUserSwitcher } from '../features/demo-user/DemoUserSwitcher';
import { useDemoUserId } from '../features/demo-user/use-demo-user-id';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { NotificationsProvider } from '../features/notifications/NotificationsProvider';
import { OutcomeDialog } from '../features/notifications/OutcomeDialog';
import { CloseIcon, MenuIcon } from '../shared/ui/icons';

/** Section links point at anchors on the landing page; plain <a> so the browser scrolls to them. */
const NAVIGATION = [
  { label: 'Auctions', to: '/auctions', isRoute: true },
  { label: 'Catalog', to: '/artworks', isRoute: true },
  { label: 'How bidding works', to: '/#how-to-bid', isRoute: false },
  { label: 'Artists', to: '/#artists', isRoute: false },
  { label: 'For sellers', to: '/#sellers', isRoute: false },
] as const;

function Wordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link to="/" className={`wordmark${inverted ? ' wordmark--inverted' : ''}`}>
      <span className="wordmark__mark" aria-hidden="true">
        A
      </span>
      <span>
        <span className="wordmark__name">Atelier &amp; Auction</span>
        <span className="wordmark__tagline">Original art · live auctions</span>
      </span>
    </Link>
  );
}

function NavigationLinks({ className }: { className: string }) {
  const demoUserId = useDemoUserId();
  return (
    <>
      {NAVIGATION.map((item) =>
        item.isRoute ? (
          <NavLink key={item.to} to={item.to} className={className}>
            {item.label}
          </NavLink>
        ) : (
          <a key={item.to} href={item.to} className={className}>
            {item.label}
          </a>
        ),
      )}
      {demoUserId !== null && (
        <NavLink to="/earnings" className={className}>
          Earnings
        </NavLink>
      )}
    </>
  );
}

export function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu after any navigation.
  useEffect(() => setIsMenuOpen(false), [location.pathname, location.hash]);

  return (
    <NotificationsProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>

        <header className="site-header">
          <div className="site-header__bar container">
            <Wordmark />
            <nav className="site-nav" aria-label="Main">
              <NavigationLinks className="site-nav__link" />
            </nav>
            <div className="site-header__actions">
              <DemoUserSwitcher />
            </div>
            <NotificationBell />
            <button
              type="button"
              className="icon-button site-header__menu-button"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
          {isMenuOpen && (
            <div id="mobile-menu" className="mobile-menu container">
              <NavigationLinks className="mobile-menu__link" />
              <div className="mobile-menu__switcher">
                <DemoUserSwitcher />
              </div>
            </div>
          )}
        </header>

        <main id="main-content" className="site-main">
          <Outlet />
        </main>

        <OutbidToasts />
        <OutcomeDialog />

        <footer className="site-footer">
          <div className="container">
            <div className="site-footer__grid">
              <div>
                <Wordmark inverted />
                <p className="site-footer__about">
                  Paintings, prints, photography, sculpture, drawing, and digital work, sold at auction with proxy bidding,
                  a soft close, and a royalty to the artist on every resale.
                </p>
                <div className="badge-row">
                  <span className="badge badge--dark">Proxy bidding</span>
                  <span className="badge badge--dark">Soft close</span>
                  <span className="badge badge--dark">Artist royalties</span>
                </div>
              </div>
              <div>
                <h2 className="site-footer__heading">Catalog</h2>
                <ul className="site-footer__links">
                  <li><Link to="/artworks">All works</Link></li>
                  <li><Link to="/artworks?medium=Painting">Paintings</Link></li>
                  <li><Link to="/artworks?medium=Photography">Photography</Link></li>
                  <li><Link to="/artworks?medium=Sculpture">Sculpture</Link></li>
                </ul>
              </div>
              <div>
                <h2 className="site-footer__heading">Bidding</h2>
                <ul className="site-footer__links">
                  <li><a href="/#how-to-bid">How bidding works</a></li>
                  <li><a href="/#trust">Public bid record</a></li>
                  <li><a href="/#sellers">For sellers</a></li>
                </ul>
              </div>
              <div>
                <h2 className="site-footer__heading">Project</h2>
                <ul className="site-footer__links">
                  <li><a href="/api/docs">API documentation</a></li>
                  <li><a href="/#artists">Artists</a></li>
                </ul>
              </div>
            </div>
            <div className="site-footer__bottom">
              <span>© {new Date().getFullYear()} Atelier &amp; Auction · A portfolio project. All artists and works are fictional.</span>
              <span className="badge-row">
                <span className="site-footer__muted">Payments</span>
                <span className="badge badge--dark">Stripe (test mode)</span>
              </span>
            </div>
          </div>
        </footer>
      </div>
    </NotificationsProvider>
  );
}
