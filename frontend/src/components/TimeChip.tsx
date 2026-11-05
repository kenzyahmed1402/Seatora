import { useState, type KeyboardEvent } from "react";
import { Armchair, ChevronRight, MapPin, Minus, Plus } from "lucide-react";
import { cinemaArea, money, time } from "../format";
import { go } from "../route";

// Most seats one customer can hold for a showtime (the server checks it too)
export const MAX_SEATS = 10;

type Props = {
  id: string;
  startTime: string;
  cinema: string;
  price: number;
  seatsLeft: number;
};

// A showtime's time chip (home page and the assistant's lists). Tapping it
// asks how many seats, in place; then the seat picker opens with that many
// of the best seats already chosen, to keep or change.
export const TimeChip = ({ id, startTime, cinema, price, seatsLeft }: Props) => {
  const max = Math.min(MAX_SEATS, seatsLeft);
  const soldOut = max < 1;
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(Math.min(2, Math.max(max, 1)));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") setOpen(false);
  };

  return (
    <div className={open ? "time-chip open" : "time-chip"} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="time-chip-main"
        aria-expanded={open}
        disabled={soldOut}
        onClick={() => setOpen((value) => !value)}
      >
        <strong>{time(startTime)}</strong>
        <span>
          <MapPin size={12} aria-hidden="true" />
          {cinemaArea(cinema)}
        </span>
        <span>
          <Armchair size={12} aria-hidden="true" />
          {soldOut ? "Sold out" : `${seatsLeft} left · ${money(price)}`}
        </span>
      </button>

      {open && (
        <div className="time-chip-seats">
          <p>How many seats?</p>
          <div className="time-chip-count">
            <button
              type="button"
              className="icon-button"
              onClick={() => setCount((value) => Math.max(1, value - 1))}
              disabled={count <= 1}
              aria-label="One seat less"
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <output aria-live="polite">{count}</output>
            <button
              type="button"
              className="icon-button"
              onClick={() => setCount((value) => Math.min(max, value + 1))}
              disabled={count >= max}
              aria-label="One seat more"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="button primary small" onClick={() => go("showtime", id, { seats: String(count) })}>
            Choose seats <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
