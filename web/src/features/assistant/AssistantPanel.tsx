import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { isApiErrorWithCode } from '../../shared/api/api-error';
import type { AuctionSummaryView } from '../../shared/api/api-types';
import { formatCents } from '../../shared/format/money';
import { CloseIcon, SparkleIcon } from '../../shared/ui/icons';
import { Countdown } from '../auctions/Countdown';
import { useDemoUserId } from '../demo-user/use-demo-user-id';
import {
  type AssistantEntry,
  deleteAssistantSession,
  getAssistantSession,
  getAssistantStatus,
  sendAssistantMessage,
} from './assistant-api';
import { assistantContextFromPath, assistantSessionKey, bidPrefillHref, starterPrompts } from './assistant-context';
import { RichText } from './RichText';

function readStoredSessionId(demoUserId: string): string | null {
  try {
    return sessionStorage.getItem(assistantSessionKey(demoUserId));
  } catch {
    return null;
  }
}

function storeSessionId(demoUserId: string, sessionId: string | null): void {
  try {
    if (sessionId) sessionStorage.setItem(assistantSessionKey(demoUserId), sessionId);
    else sessionStorage.removeItem(assistantSessionKey(demoUserId));
  } catch {
    // The conversation still works; it just won't survive a reload.
  }
}

function RecommendationCard({ auction }: { auction: AuctionSummaryView }) {
  return (
    <Link className="concierge-card" to={`/auctions/${auction.slug}`}>
      <span className="concierge-card__artist">{auction.artwork.artist.name}</span>
      <span className="concierge-card__title">{auction.artwork.title}</span>
      <span className="concierge-card__figures">
        <span>{formatCents(auction.priceCents)}</span>
        <span>{auction.status === 'ended' ? 'Ended' : <Countdown endsAt={auction.endsAt} />}</span>
      </span>
    </Link>
  );
}

function ConciergeMessage({ entry, onFollowUp }: { entry: AssistantEntry; onFollowUp?: (text: string) => void }) {
  if (entry.role === 'user') {
    return (
      <div className="concierge-message concierge-message--user">
        <p>{entry.text}</p>
      </div>
    );
  }
  return (
    <div className="concierge-message concierge-message--assistant">
      <div className="concierge-message__text">
        <RichText text={entry.text} />
      </div>
      {entry.cards.length > 0 && (
        <div className="concierge-cards">
          {entry.cards.map((auction) => (
            <RecommendationCard key={auction.slug} auction={auction} />
          ))}
        </div>
      )}
      {entry.bidSuggestion && (
        <div className="concierge-bid">
          <p className="mono-label mono-label--gold">Suggested maximum · {entry.bidSuggestion.artworkTitle}</p>
          <p className="concierge-bid__amount">{formatCents(entry.bidSuggestion.amountCents)}</p>
          <p className="concierge-bid__note">
            Minimum right now {formatCents(entry.bidSuggestion.minimumNextBidCents)}. This only fills in the form: you review
            it and place the bid yourself.
          </p>
          <Link className="button button--gold" to={bidPrefillHref(entry.bidSuggestion)}>
            Review this bid
          </Link>
        </div>
      )}
      {onFollowUp && entry.followUpSuggestions.length > 0 && (
        <div className="concierge-prompts">
          {entry.followUpSuggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="chip" onClick={() => onFollowUp(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The Concierge on every page. It finds and explains work and suggests maximums; it never bids or pays. */
export function AssistantPanel() {
  const { pathname } = useLocation();
  const context = assistantContextFromPath(pathname);
  const demoUserId = useDemoUserId();
  const [isOpen, setIsOpen] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<AssistantEntry[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen || isAvailable !== null) return;
    getAssistantStatus().then(
      (status) => setIsAvailable(status.available),
      () => setIsAvailable(false),
    );
  }, [isOpen, isAvailable]);

  // Each demo user has their own conversation; restore it when the user changes.
  useEffect(() => {
    setEntries([]);
    setError('');
    setSessionId(null);
    if (!demoUserId) return undefined;
    const storedId = readStoredSessionId(demoUserId);
    if (!storedId) return undefined;
    let isCurrent = true;
    getAssistantSession(storedId).then(
      (restored) => {
        if (!isCurrent) return;
        if (restored) {
          setSessionId(storedId);
          setEntries([...restored]);
        } else {
          storeSessionId(demoUserId, null);
        }
      },
      () => undefined,
    );
    return () => {
      isCurrent = false;
    };
  }, [demoUserId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries.length, isPending]);

  // Focus moves into the panel when it opens and back to the launcher when it closes.
  const hasOpened = useRef(false);
  useEffect(() => {
    if (isOpen) {
      hasOpened.current = true;
      inputRef.current?.focus();
    } else if (hasOpened.current) {
      launcherRef.current?.focus();
    }
  }, [isOpen]);

  function close() {
    setIsOpen(false);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || !demoUserId || isPending) return;
    setDraft('');
    setError('');
    setIsPending(true);
    const now = new Date().toISOString();
    setEntries((current) => [...current, { role: 'user', text: message, cards: [], bidSuggestion: null, followUpSuggestions: [], createdAt: now }]);
    try {
      const reply = await sendAssistantMessage({ sessionId: sessionId ?? undefined, message, context });
      setSessionId(reply.sessionId);
      storeSessionId(demoUserId, reply.sessionId);
      setEntries((current) => [
        ...current,
        {
          role: 'assistant',
          text: reply.message,
          cards: reply.cards,
          bidSuggestion: reply.bidSuggestion,
          followUpSuggestions: reply.followUpSuggestions,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (failure) {
      if (isApiErrorWithCode(failure, 'ASSISTANT_UNAVAILABLE')) setIsAvailable(false);
      setError(failure instanceof Error ? failure.message : 'The Concierge could not answer right now.');
      setEntries((current) => current.slice(0, -1));
      setDraft(message);
    } finally {
      setIsPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  async function startOver() {
    if (demoUserId && sessionId) {
      storeSessionId(demoUserId, null);
      await deleteAssistantSession(sessionId).catch(() => undefined);
    }
    setSessionId(null);
    setEntries([]);
    setError('');
  }

  const lastEntry = entries.at(-1);
  const canSend = Boolean(demoUserId) && isAvailable !== false;

  if (!isOpen) {
    return (
      <button ref={launcherRef} type="button" className="concierge-launcher" onClick={() => setIsOpen(true)}>
        <SparkleIcon />
        {context?.type === 'auction' ? 'Ask about this auction' : context?.type === 'artwork' ? 'Ask about this work' : 'Ask the Concierge'}
      </button>
    );
  }

  return (
    <aside
      className="concierge-panel"
      role="dialog"
      aria-labelledby="concierge-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
    >
      <header className="concierge-panel__header">
        <div>
          <p className="mono-label mono-label--gold">AI advisor</p>
          <h2 id="concierge-title" className="concierge-panel__title">
            Concierge
          </h2>
          <p className="concierge-panel__subtitle">Finds and explains work. It can’t bid or pay for you.</p>
        </div>
        <div className="concierge-panel__actions">
          {entries.length > 0 && (
            <button type="button" className="concierge-panel__text-button" onClick={() => void startOver()}>
              New chat
            </button>
          )}
          <button type="button" className="concierge-panel__close" aria-label="Close the Concierge" onClick={close}>
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="concierge-log" ref={logRef} aria-live="polite">
        {isAvailable === false && (
          <div className="concierge-notice" role="status">
            <strong>The Concierge is offline</strong>
            <span>
              Set <code>OPENAI_API_KEY</code> in <code>.env</code> and restart the API to enable it. Search still works by keywords.
            </span>
          </div>
        )}
        {isAvailable !== false && entries.length === 0 && (
          <div className="concierge-welcome">
            <strong>{demoUserId ? 'What are you looking for?' : 'Choose a demo user under “Viewing as” to chat.'}</strong>
            <span>Describe a work you’d love, a budget, or ask how proxy bidding works.</span>
            <div className="concierge-prompts">
              {starterPrompts(context).map((prompt) => (
                <button key={prompt} type="button" className="chip" disabled={!demoUserId} onClick={() => void send(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {entries.map((entry, index) => (
          <ConciergeMessage
            key={`${entry.createdAt}-${index}`}
            entry={entry}
            onFollowUp={!isPending && entry === lastEntry ? (text) => void send(text) : undefined}
          />
        ))}
        {isPending && (
          <div className="concierge-message concierge-message--assistant concierge-typing" role="status" aria-label="The Concierge is thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && (
          <p className="concierge-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <form className="concierge-input" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="concierge-message">
          Message the Concierge
        </label>
        <input
          ref={inputRef}
          id="concierge-message"
          className="text-input"
          value={draft}
          maxLength={1_000}
          autoComplete="off"
          placeholder={context ? 'Ask about this…' : 'What are you looking for?'}
          disabled={!canSend}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="button button--primary" type="submit" disabled={!draft.trim() || isPending || !canSend}>
          Send
        </button>
      </form>
    </aside>
  );
}
