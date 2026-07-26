import { createAccessControl } from "better-auth/plugins/access";

export const adminStatements = {
	user: ["list", "set-role", "ban", "get"],
	session: ["list", "revoke"],
} as const;

export const adminAccess = createAccessControl(adminStatements);

export const adminRole = adminAccess.newRole({
	user: ["list", "set-role", "ban", "get"],
	session: ["list", "revoke"],
});

export const userRole = adminAccess.newRole({
	user: [],
	session: [],
});

export const adminRoles = {
	admin: adminRole,
	user: userRole,
};
