import { useMemo, useState } from "react";
import { Bell, Smartphone, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PWA_REMINDER_IN_APP_TITLE,
  PWA_REMINDER_IN_APP_BODY,
  PWA_REMINDER_EMAIL_SUBJECT,
  buildPwaReminderEmailHtml,
} from "@/lib/pwaReminderContent";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Preview the exact in-app notification + email that gets sent when staff
 * trigger a SUPERDRIVE install reminder (manual per-driver or bulk).
 */
export function PwaReminderPreviewModal({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState<"in_app" | "email">("in_app");
  const emailHtml = useMemo(() => buildPwaReminderEmailHtml(), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>SUPERDRIVE install reminder — preview</DialogTitle>
          <DialogDescription>
            This is exactly what drivers will see when an install reminder is sent. Edit the
            content in the edge function to change it.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "in_app" | "email")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="in_app" className="gap-2">
              <Smartphone className="h-3.5 w-3.5" /> In-app notification
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-3.5 w-3.5" /> Email
            </TabsTrigger>
          </TabsList>

          <TabsContent value="in_app" className="flex-1 overflow-y-auto mt-4">
            <div className="bg-muted/40 rounded-lg p-6 flex justify-center">
              {/* Notification card mimicking NotificationBell row */}
              <div className="w-full max-w-md bg-white border border-border rounded-xl shadow-sm p-4 flex gap-3">
                <div className="h-9 w-9 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
                  <Bell className="h-4 w-4 text-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-foreground">{PWA_REMINDER_IN_APP_TITLE}</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{PWA_REMINDER_IN_APP_BODY}</p>
                  <p className="text-[11px] text-muted-foreground mt-2">just now · tap to open install instructions</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 px-1">
              Delivered to the in-app notification bell. Tapping the notification opens the operator portal.
            </p>
          </TabsContent>

          <TabsContent value="email" className="flex-1 overflow-hidden mt-4 flex flex-col min-h-0">
            <div className="text-xs text-muted-foreground mb-2 px-1">
              <span className="font-medium text-foreground">Subject:</span> {PWA_REMINDER_EMAIL_SUBJECT}
            </div>
            <div className="flex-1 min-h-0 border border-border rounded-lg overflow-hidden bg-[#f5f5f5]">
              <iframe
                title="SUPERDRIVE install reminder email preview"
                srcDoc={emailHtml}
                sandbox=""
                className="w-full h-full min-h-[480px]"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 px-1">
              Drivers without an email on file get the in-app notification only.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}