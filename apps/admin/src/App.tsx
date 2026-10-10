import { Toaster } from "@VISP/ui/components/sonner";
import { RouterProvider } from "@tanstack/react-router";
import { AuthGate } from "./app/auth-gate";
import { router } from "./app/router";
import { AdminSessionContext } from "./app/session";

function App() {
	return (
		<AuthGate>
			{(session) => (
				<AdminSessionContext.Provider value={session}>
					<RouterProvider router={router} />
					<Toaster />
				</AdminSessionContext.Provider>
			)}
		</AuthGate>
	);
}

export default App;
