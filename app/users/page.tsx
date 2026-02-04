import { redirect } from 'next/navigation';

// Redirect old /users URL to new /settings/users location
export default function UsersRedirectPage() {
  redirect('/settings/users');
}
