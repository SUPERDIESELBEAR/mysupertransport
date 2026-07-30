/**
 * Standalone entry for /roadside.
 *
 * Deliberately does NOT import App.tsx, AuthProvider, react-router, or the
 * Supabase client. main.tsx branches on the pathname before any of that loads,
 * so a cold launch renders the officer view from IndexedDB alone — no session,
 * no auth refresh, and nothing on the boot path that can hang when the network
 * is present but dead.
 */
import RoadsidePacket from '@/components/eld/RoadsidePacket';

export default function RoadsideEntry() {
  return <RoadsidePacket />;
}