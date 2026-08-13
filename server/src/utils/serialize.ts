export function publicUser(user: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  searchEnabled: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    searchEnabled: user.searchEnabled,
    createdAt: user.createdAt,
  };
}
