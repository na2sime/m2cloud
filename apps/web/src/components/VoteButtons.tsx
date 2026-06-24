// Up/down vote control. Calls the provided vote function and reflects the
// returned score. Optimistic-free: the displayed score comes from the server.

import { useState } from "react";
import type { VoteResponse, VoteValue } from "../types.js";

interface VoteButtonsProps {
  score: number;
  onVote(value: VoteValue): Promise<VoteResponse>;
}

export function VoteButtons({ score, onVote }: VoteButtonsProps) {
  const [current, setCurrent] = useState(score);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cast = async (value: VoteValue) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await onVote(value);
      setCurrent(res.score);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="votes">
      <button
        className="vote-btn"
        aria-label="Upvote"
        disabled={pending}
        onClick={() => void cast(1)}
      >
        ▲
      </button>
      <span className="vote-score">{current}</span>
      <button
        className="vote-btn"
        aria-label="Downvote"
        disabled={pending}
        onClick={() => void cast(-1)}
      >
        ▼
      </button>
      {error ? <span className="vote-error">{error}</span> : null}
    </div>
  );
}
