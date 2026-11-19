import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LifeBuoy, Mail, MessageCircle } from "lucide-react";
import type { SupportContact } from "@/lib/data/support";

/**
 * Direct contact details for the support team, from admin Settings
 * (supportEmail / supportWhatsApp). Shared by the student Help & Support
 * page and the student Profile. When the admin has not published any
 * details, it falls back to pointing at the ticket system itself instead
 * of rendering blanks.
 */
export function SupportContactCard({
  contact,
  showSupportLink = false,
}: {
  contact: SupportContact;
  /** Profile usage: add a button through to the Help & Support page. */
  showSupportLink?: boolean;
}) {
  const hasDetails = Boolean(contact.email) || Boolean(contact.whatsappLink);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5" /> Help &amp; Support
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {contact.email && (
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Email:</span>
            <a href={`mailto:${contact.email}`} className="font-medium text-primary hover:underline">
              {contact.email}
            </a>
          </p>
        )}
        {contact.whatsappLink && (
          <p className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">WhatsApp:</span>
            <a
              href={contact.whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              {contact.whatsapp}
            </a>
          </p>
        )}
        {!hasDetails && (
          <p className="text-muted-foreground">
            Direct contact details are not published yet — open a support ticket and the admin team will reply here.
          </p>
        )}
        {showSupportLink && (
          <Button asChild variant="outline" className="mt-1">
            <Link href="/student/support">Open Help &amp; Support</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
