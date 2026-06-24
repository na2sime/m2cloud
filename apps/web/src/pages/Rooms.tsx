// Rooms list + create-room form.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api.js";
import type { Room } from "../types.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function Rooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRooms(await api.listRooms());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const room = await api.createRoom({
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim() || undefined,
      });
      setRooms((prev) => [room, ...prev]);
      setName("");
      setSlug("");
      setSlugTouched(false);
      setDescription("");
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to create room",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Rooms</h1>
      </div>

      <section className="card">
        <h2 className="card-title">Create a room</h2>
        <form className="form form-inline" onSubmit={onCreate}>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Slug</span>
            <input
              type="text"
              required
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
            />
          </label>
          <label className="field field-grow">
            <span>Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
        {createError ? <p className="error">{createError}</p> : null}
      </section>

      <section>
        {loading ? (
          <p className="muted">Loading rooms…</p>
        ) : loadError ? (
          <p className="error">{loadError}</p>
        ) : rooms.length === 0 ? (
          <p className="muted">No rooms yet. Create the first one above.</p>
        ) : (
          <ul className="list">
            {rooms.map((room) => (
              <li key={room.id} className="list-item">
                <Link to={`/rooms/${room.slug}`} className="list-link">
                  <span className="list-title">{room.name}</span>
                  <span className="list-meta">/{room.slug}</span>
                </Link>
                {room.description ? (
                  <p className="list-desc">{room.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
