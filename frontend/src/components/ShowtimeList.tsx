import { dayLabel, localDay } from "../format";
import type { ChatShowtime } from "../types";
import { TimeChip } from "./TimeChip";

// The showtimes the assistant found, under its reply: by day, then by movie,
// with the same time chips as the home page. A chip asks how many seats,
// then opens the showtime's seat picker. The list comes from the search result, not the model's text.
export const ShowtimeList = ({ showtimes }: { showtimes: ChatShowtime[] }) => {
  const days = new Map<string, Map<string, ChatShowtime[]>>();
  for (const showtime of showtimes) {
    const day = localDay(new Date(showtime.startTime));
    const movies = days.get(day) ?? new Map<string, ChatShowtime[]>();
    movies.set(showtime.movie, [...(movies.get(showtime.movie) ?? []), showtime]);
    days.set(day, movies);
  }

  return (
    <div className="chat-showtimes">
      {[...days].map(([day, movies]) => (
        <section key={day} aria-label={dayLabel(day)}>
          <h4 className="chat-showtimes-day">{dayLabel(day)}</h4>
          {[...movies].map(([movie, times]) => (
            <div key={movie} className="chat-showtimes-movie">
              <p className="chat-showtimes-title">
                <strong>{movie}</strong> · {times[0].genre}
              </p>
              <div className="times">
                {times.map((showtime) => (
                  <TimeChip
                    key={showtime.showtime}
                    id={showtime.showtime}
                    startTime={showtime.startTime}
                    cinema={showtime.cinema}
                    price={showtime.pricePerSeat}
                    seatsLeft={showtime.seatsAvailable}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
};
