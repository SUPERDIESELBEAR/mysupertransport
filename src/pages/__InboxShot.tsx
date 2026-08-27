import RateConInboxPage from '@/pages/dispatch/RateConInboxPage';
import RateConInboxBadge from '@/components/dispatch/RateConInboxBadge';

export default function InboxShot() {
  return (
    <div className="p-8">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span>Rate Con Inbox nav item</span>
        <RateConInboxBadge />
      </div>
      <RateConInboxPage />
    </div>
  );
}
