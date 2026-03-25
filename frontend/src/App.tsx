import { useMemo, useState } from "react";
import { BuildingsPage } from "./pages/Buildings.tsx";
import { RoomsPage } from "./pages/Rooms.tsx";
import { BookingRequestsPage } from "./pages/BookingRequests.tsx";

type PageKey = "buildings" | "rooms" | "bookingRequests";

function App() {
	const [activePage, setActivePage] = useState<PageKey>("buildings");

	const pageContent = useMemo(() => {
		if (activePage === "buildings") {
			return <BuildingsPage />;
		}

		if (activePage === "rooms") {
			return <RoomsPage />;
		}

		return <BookingRequestsPage />;
	}, [activePage]);

	return (
		<div className="app-shell">
			<header className="app-header">
				<h1>Unified Room Allocation &amp; Booking System</h1>
				<p>Primary System Only</p>
			</header>

			<nav className="nav-tabs" aria-label="Primary navigation">
				<button
					type="button"
					className={activePage === "buildings" ? "active" : ""}
					onClick={() => setActivePage("buildings")}
				>
					Buildings
				</button>
				<button
					type="button"
					className={activePage === "rooms" ? "active" : ""}
					onClick={() => setActivePage("rooms")}
				>
					Rooms
				</button>
				<button
					type="button"
					className={activePage === "bookingRequests" ? "active" : ""}
					onClick={() => setActivePage("bookingRequests")}
				>
					Booking Requests
				</button>
			</nav>

			<main className="page-content">{pageContent}</main>
		</div>
	);
}

export default App;
