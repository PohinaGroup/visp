import { defaultAuthLocale } from "@better-auth-ui/core";

export const agentFinnishLocale = {
	...defaultAuthLocale,
	languageTag: "fi-FI",
	plugins: { agentAuth: {
		approvalTitle: "Hyväksy agentin käyttöoikeudet",
		approvalDescription: "Tarkista, mitä agentti haluaa tehdä puolestasi.",
		requestedCapabilities: "Pyydetyt käyttöoikeudet",
		requestReason: "Perustelu", constraints: "Rajoitukset",
		delegatedAgent: "Tilin puolesta toimiva agentti", autonomousAgent: "Itsenäinen agentti",
		approvalNone: "Ei lisävahvistusta", approvalSession: "Äskettäinen kirjautuminen", approvalWebauthn: "Pääsyavain vaaditaan",
		allow: "Salli valitut", deny: "Estä",
		approvedTitle: "Käyttöoikeudet hyväksytty", approvedDescription: "Agentti voi nyt käyttää valitsemiasi oikeuksia.",
		deniedTitle: "Käyttö estetty", deniedDescription: "Agentti ei saanut käyttöoikeuksia.",
		noCapabilities: "Pyynnössä ei ole odottavia käyttöoikeuksia.",
		invalidRequest: "Hyväksymislinkistä puuttuu tarvittavia tietoja.",
		approvalError: "Pyyntö epäonnistui tai on vanhentunut. Yritä uudelleen tai pyydä agentilta uusi linkki.",
		agents: "Agenttien käyttöoikeudet", agentsDescription: "Tarkista agentit ja peru tarpeettomat käyttöoikeudet.",
		noAgents: "Yhdistettyjä agentteja ei ole.",
		active: "Voimassa", pending: "Odottaa", denied: "Estetty", revoked: "Peruttu",
		expires: "Vanhenee {date}", lastUsed: "Viimeksi käytetty {date}", neverUsed: "Ei vielä käytetty",
		revoke: "Peru", revokeTitle: "Perutaanko käyttöoikeus?",
		revokeDescription: "Agentti menettää tämän käyttöoikeuden heti.", confirmRevoke: "Peru käyttöoikeus",
	} },
};
