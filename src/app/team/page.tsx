"use client";

import { useEffect, useState } from "react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Users, Link2, UserCircle2 } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  bio: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  displayOrder: number;
  active: boolean;
}

/**
 * PUBLIC "OUR TEAM" PAGE (/team)
 *
 * Rendered inside the shared PublicLayout so the header (About · Our Team ·
 * Partner Access) stays consistent with /, /about, /map. Reads from
 * /api/team which returns only active rows to anonymous callers.
 *
 * Layout contract per the feature brief:
 *   - Each team member is a two-column row: photo on the left, details
 *     on the right (stacked on mobile).
 *   - Missing photo renders an accessible placeholder icon; layout does
 *     NOT break.
 *   - Empty list → visible-but-non-alarming empty state.
 */
export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeam = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error("Failed to load team");
      const data = await res.json();
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (_err) {
      setError("Unable to load team members. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  return (
    <PublicLayout>
      <div data-design-id="team-page" className="min-h-[calc(100vh-4rem)]">
        {/* Hero */}
        <div
          data-design-id="team-hero"
          className="bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 py-20"
        >
          <div
            data-design-id="team-hero-container"
            className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
          >
            <div
              data-design-id="team-hero-icon"
              className="inline-flex items-center justify-center w-16 h-16 bg-sky-500/20 rounded-2xl mb-6"
            >
              <Users className="w-8 h-8 text-sky-400" />
            </div>
            <h1
              data-design-id="team-title"
              className="text-4xl sm:text-5xl font-bold text-white mb-4"
            >
              Our Team
            </h1>
            <p
              data-design-id="team-subtitle"
              className="text-lg text-slate-300 max-w-2xl mx-auto"
            >
              The people behind the Development Transparency Map.
            </p>
          </div>
        </div>

        <div
          data-design-id="team-body"
          className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14"
        >
          {loading && <LoadingState message="Loading team members..." />}
          {error && <ErrorState message={error} onRetry={fetchTeam} />}

          {!loading && !error && members && members.length === 0 && (
            <div
              data-design-id="team-empty"
              className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"
            >
              <Users className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Team profiles coming soon
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                We're preparing to introduce the people behind the platform.
                Check back shortly.
              </p>
            </div>
          )}

          {!loading && !error && members && members.length > 0 && (
            <ul
              data-design-id="team-list"
              className="space-y-8"
            >
              {members.map((m) => (
                <li
                  key={m.id}
                  data-design-id={`team-member-${m.id}`}
                  className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-0">
                    <div
                      data-design-id={`team-member-photo-${m.id}`}
                      className="bg-slate-100 flex items-center justify-center aspect-square md:aspect-auto md:h-full"
                    >
                      {m.photoUrl ? (
                        // Next.js Image is configured with
                        // `unoptimized: true` (see next.config.js), so a
                        // plain <img> works for any external URL without
                        // a remote-patterns entry.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.photoUrl}
                          alt={m.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            // Gracefully degrade if the URL breaks — hide
                            // the broken image so the placeholder below
                            // is seen instead.
                            (e.currentTarget as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <div
                          className="flex flex-col items-center justify-center text-slate-400 py-10"
                          aria-label={`${m.name} photo placeholder`}
                        >
                          <UserCircle2 className="w-16 h-16" />
                        </div>
                      )}
                    </div>
                    <div
                      data-design-id={`team-member-details-${m.id}`}
                      className="p-6 flex flex-col gap-3"
                    >
                      <div>
                        <h2 className="text-xl font-semibold text-slate-900">
                          {m.name}
                        </h2>
                        <p className="text-sm font-medium text-sky-700">
                          {m.role}
                        </p>
                      </div>
                      {m.bio && (
                        <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                          {m.bio}
                        </p>
                      )}
                      {m.linkedinUrl && (
                        <div>
                          <a
                            href={m.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-sky-600 hover:text-sky-700 font-medium rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                            aria-label={`${m.name} on LinkedIn`}
                          >
                            <Link2 className="w-4 h-4" />
                            LinkedIn
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}