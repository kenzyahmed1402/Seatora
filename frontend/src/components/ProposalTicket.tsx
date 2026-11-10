import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Armchair,
  CalendarDays,
  Check,
  CircleAlert,
  Clock,
  LoaderCircle,
  MapPin,
  Ticket,
  TicketX,
} from "lucide-react";
import { api } from "../api";
import { money } from "../format";
import { href } from "../route";
import { clock, useSecondsLeft } from "../hooks";
import type { Booking, BookingCard, BookingDetail, ProposalCard, SeatMap } from "../types";
import { CinemaHall } from "./CinemaHall";
import { PayPalButton } from "./PayPalButton";
import { loadPayPal } from "../paypal";
import { Poster } from "./Poster";
import { TicketCard } from "./TicketCard";

// What the page knows about a card: the server's word on its status, and
// what happened when the customer pressed Confirm
export type CardState = {
  status: "loading" | "open" | "confirmed" | "expired";
  booking?: Booking;
  // The booking a confirmed card made or cancelled
  bookingId?: string;
  // Paid: the ticket, shown in place of the card
  ticket?: BookingDetail;
  // Paid on this visit, so the card turns over into the ticket
  justPaid?: boolean;
  busy?: boolean;
  error?: string;
};

type Props = {
  card: ProposalCard;
  state: CardState;
  onConfirm: (card: ProposalCard) => void;
  // PayPal accepted and the server confirmed the booking
  onPaid?: (card: ProposalCard, booking: Booking) => void;
  // compact: a short ticket in the conversation, opened in the side panel
  variant: "full" | "compact";
  selected?: boolean;
  onSelect?: () => void;
};

const cents = (value: number) => money(value / 100);

// The hall with the card's seats picked, from the showtime's live seat map
// The card brings the hall as it was when the card was made, so it draws at
// once; older cards without it ask the server, with the space kept free so
// nothing jumps when it arrives.
const TicketHall = ({ showtime, seats, hall }: { showtime: string; seats: string[]; hall?: BookingCard["hall"] }) => {
  const [fetched, setFetched] = useState<SeatMap | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (hall) return;
    api<{ seatMap: SeatMap }>("GET", `/showTimes/${showtime}/seats`)
      .then((data) => setFetched(data.seatMap))
      .catch(() => setFailed(true));
  }, [showtime, hall]);

  const map = hall ?? fetched;
  if (!map?.rows || !map.seatsPerRow) return failed ? null : <div className="ticket-hall-space" aria-hidden="true" />;
  const picked = new Set(seats);
  const taken = new Set(map.taken);
  return (
    <CinemaHall
      className="ticket-hall"
      rows={map.rows}
      seatsPerRow={map.seatsPerRow}
      stateOf={(row, seat) => (picked.has(`${row}${seat}`) ? "picked" : taken.has(`${row}${seat}`) ? "taken" : "free")}
      label={`Seats ${seats.join(", ")} in the hall`}
    />
  );
};

export const ProposalTicket = ({ card, state, onConfirm, onPaid, variant, selected, onSelect }: Props) => {
  const booking = card.type === "booking";
  const offerLeft = useSecondsLeft(state.status === "open" ? card.expiresAt : undefined);
  const holdLeft = useSecondsLeft(state.booking?.holdExpiresAt);
  const status = state.status === "open" && offerLeft === 0 ? "expired" : state.status;
  // Seats held and not paid yet: PayPal right on the card
  const bookingId = state.booking?._id ?? state.bookingId;
  const payable = booking && status === "confirmed" && !state.ticket && Boolean(state.booking?.holdExpiresAt && holdLeft > 0);
  // PayPal's buttons need one function for the card's whole life
  const paid = useRef(onPaid);
  paid.current = onPaid;
  const handlePaid = useRef((done: Booking) => paid.current?.(card, done)).current;

  // A booking card that may be paid soon: fetch PayPal's script now, so its
  // button is ready the moment the seats are held
  const mayPay = booking && (status === "open" || payable);
  useEffect(() => {
    if (mayPay) loadPayPal().catch(() => undefined);
  }, [mayPay]);

  const facts = (
    <ul className="ticket-facts">
      <li>
        <CalendarDays size={15} aria-hidden="true" /> {card.localTime}
      </li>
      {card.cinema && (
        <li>
          <MapPin size={15} aria-hidden="true" /> {card.cinema}
          {booking && card.screen ? ` · Screen ${card.screen}` : ""}
        </li>
      )}
      <li>
        <Armchair size={15} aria-hidden="true" />
        <span className="seat-tags">
          {card.seats.map((seat) => (
            <span key={seat} className="seat-tag">
              {seat}
            </span>
          ))}
        </span>
      </li>
    </ul>
  );

  const amount = booking ? (
    <div className="ticket-amount">
      <span>Total</span>
      <strong>{cents(card.totalCents)}</strong>
    </div>
  ) : (
    <div className="ticket-amount">
      <span>Refund · {card.refundPercent}%</span>
      <strong>{cents(card.refundCents)}</strong>
    </div>
  );

  const action = (() => {
    if (status === "loading") {
      return (
        <p className="ticket-status">
          <LoaderCircle className="spin" size={16} aria-hidden="true" /> Checking…
        </p>
      );
    }
    if (status === "expired") {
      return (
        <p className="ticket-status muted">
          <Clock size={16} aria-hidden="true" /> Expired · ask again
        </p>
      );
    }
    if (status === "confirmed") {
      return (
        <>
          <p className="ticket-status done">
            <Check size={16} aria-hidden="true" />
            {booking ? (payable ? `Seats held · ${clock(holdLeft)} left` : "Booked") : "Cancelled · refund on its way"}
          </p>
          {booking && bookingId && !payable && (
            <a className="button primary" href={href("booking", bookingId)}>
              View booking <ArrowRight size={16} aria-hidden="true" />
            </a>
          )}
        </>
      );
    }
    return (
      <button type="button" className="button primary" disabled={state.busy} onClick={() => onConfirm(card)}>
        {state.busy ? (
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
        ) : booking ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <TicketX size={16} aria-hidden="true" />
        )}
        {booking ? "Confirm seats" : "Confirm cancellation"}
      </button>
    );
  })();

  const kind = (
    <p className={booking ? "ticket-kind" : "ticket-kind cancel"}>
      {booking ? <Ticket size={14} aria-hidden="true" /> : <TicketX size={14} aria-hidden="true" />}
      {booking ? "Booking" : "Cancellation"}
    </p>
  );

  if (variant === "compact") {
    return (
      <article className={selected ? "ticket compact selected" : "ticket compact"}>
        <div className="ticket-main">
          <Poster title={card.movie ?? "Movie"} genre={card.genre} size="small" />
          <div className="ticket-body">
            {kind}
            <h3>{card.movie}</h3>
            <p className="muted ticket-line">
              {card.localTime} · {card.seats.join(", ")}
            </p>
          </div>
        </div>
        <button type="button" className="ticket-open" onClick={onSelect} aria-pressed={selected}>
          {state.ticket ? "Paid" : payable ? "Pay" : status === "confirmed" ? "Confirmed" : status === "expired" ? "Expired" : "View"}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </article>
    );
  }

  // Paid: the card turns over into the ticket, with the full ticket a tap away
  if (state.ticket) {
    return (
      <div className={state.justPaid ? "chat-ticket ticket-flip in" : "chat-ticket"}>
        <p className="booking-done">
          <Check size={18} aria-hidden="true" /> Paid · enjoy the film
        </p>
        <TicketCard booking={state.ticket} />
        <a className="button secondary wide" href={href("booking", state.ticket._id)}>
          Open full ticket <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <article className="ticket full">
      <div className="ticket-main">
        <Poster title={card.movie ?? "Movie"} genre={card.genre} size="small" />
        <div className="ticket-body">
          {kind}
          <h3>{card.movie}</h3>
          {facts}
        </div>
      </div>

      {booking && status !== "expired" && <TicketHall showtime={card.showtime} seats={card.seats} hall={card.hall} />}
      {!booking && <p className="ticket-policy muted">{card.policy}</p>}

      <div className="ticket-stub">
        {amount}
        <div className="ticket-action">
          {action}
          {status === "open" && !state.busy && (
            <p className="ticket-note">
              <Clock size={13} aria-hidden="true" /> Confirm within {clock(offerLeft)}
            </p>
          )}
        </div>
      </div>

      {payable && bookingId && (
        <div className="ticket-pay">
          <PayPalButton bookingId={bookingId} onPaid={handlePaid} />
        </div>
      )}

      {state.error && (
        <p className="ticket-error" role="alert">
          <CircleAlert size={15} aria-hidden="true" /> {state.error}
        </p>
      )}
    </article>
  );
};
