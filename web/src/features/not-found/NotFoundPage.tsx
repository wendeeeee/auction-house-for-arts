import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="page page--narrow">
      <p className="eyebrow">404</p>
      <h1 className="page-title">This room is empty.</h1>
      <p>The page you’re looking for isn’t here.</p>
      <p>
        <Link className="text-link" to="/">
          Return to the entrance
        </Link>
      </p>
    </section>
  );
}
