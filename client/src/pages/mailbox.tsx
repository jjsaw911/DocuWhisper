import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Search, Send } from "lucide-react";

interface MailboxRecipient {
  userId: string;
  email: string | null;
  displayName: string;
}

interface MailboxMessage {
  id: number;
  senderUserId: string;
  senderEmail?: string | null;
  recipientUserId: string;
  recipientEmail?: string | null;
  recipientDisplayName?: string | null;
  subject: string;
  message: string;
  createdAt: string;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default function Mailbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [recipientUserId, setRecipientUserId] = useState("");
  const [recipient, setRecipient] = useState<MailboxRecipient | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: inboxMessages = [], isLoading: inboxLoading } = useQuery<MailboxMessage[]>({
    queryKey: ["/api/mailbox/messages?folder=inbox"],
  });

  const { data: sentMessages = [], isLoading: sentLoading } = useQuery<MailboxMessage[]>({
    queryKey: ["/api/mailbox/messages?folder=sent"],
  });

  const lookupRecipientMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("GET", `/api/mailbox/users/${encodeURIComponent(userId)}`);
      return response.json();
    },
    onSuccess: (data: MailboxRecipient) => {
      setRecipient(data);
      toast({
        title: "Recipient found",
        description: `${data.displayName} (${data.userId})`,
      });
    },
    onError: (error: any) => {
      setRecipient(null);
      toast({
        title: "User not found",
        description: error?.message || "Check the User ID and try again",
        variant: "destructive",
      });
    },
  });

  const sendMailboxMessageMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/mailbox/messages", {
        recipientUserId: recipientUserId.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox/messages?folder=inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox/messages?folder=sent"] });
      setRecipientUserId("");
      setRecipient(null);
      setSubject("");
      setMessage("");
      toast({
        title: "Message sent",
        description: "Your message was delivered to the recipient inbox.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const canSend =
    !!recipient &&
    recipient.userId === recipientUserId.trim() &&
    subject.trim().length >= 3 &&
    message.trim().length > 0 &&
    !sendMailboxMessageMutation.isPending;

  return (
    <div className="flex flex-col h-full">
      <header className="border-b bg-background/95 backdrop-blur px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Mailbox</h1>
          <p className="text-muted-foreground">Send internal messages to users by User ID</p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <CardTitle>Compose Message</CardTitle>
              </div>
              <CardDescription>
                Enter a recipient User ID, confirm identity, then send.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recipient-user-id">Recipient User ID</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    id="recipient-user-id"
                    value={recipientUserId}
                    onChange={(e) => {
                      setRecipientUserId(e.target.value);
                      setRecipient(null);
                    }}
                    placeholder="Paste the recipient User ID"
                    data-testid="input-mailbox-recipient-user-id"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => lookupRecipientMutation.mutate(recipientUserId.trim())}
                    disabled={!recipientUserId.trim() || lookupRecipientMutation.isPending}
                    data-testid="button-mailbox-lookup-user"
                  >
                    {lookupRecipientMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Lookup
                  </Button>
                </div>
                {recipient && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Recipient confirmed</Badge>
                      <span className="font-medium">{recipient.displayName}</span>
                    </div>
                    <p className="text-muted-foreground">
                      ID: {recipient.userId}
                      {recipient.email ? ` · ${recipient.email}` : ""}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="mailbox-subject">Subject</Label>
                <Input
                  id="mailbox-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Message subject"
                  data-testid="input-mailbox-subject"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mailbox-message">Message</Label>
                <Textarea
                  id="mailbox-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your message..."
                  className="min-h-[140px]"
                  data-testid="textarea-mailbox-message"
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Your User ID: <code className="font-mono">{user?.id || "-"}</code>
                </p>
                <Button
                  onClick={() => sendMailboxMessageMutation.mutate()}
                  disabled={!canSend}
                  data-testid="button-mailbox-send"
                >
                  {sendMailboxMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send Message
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mailbox Folders</CardTitle>
              <CardDescription>Review incoming and sent internal messages.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="inbox" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="inbox" data-testid="tab-mailbox-inbox">
                    Inbox ({inboxMessages.length})
                  </TabsTrigger>
                  <TabsTrigger value="sent" data-testid="tab-mailbox-sent">
                    Sent ({sentMessages.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="inbox" className="space-y-3">
                  {inboxLoading ? (
                    <div className="text-sm text-muted-foreground">Loading inbox...</div>
                  ) : inboxMessages.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No inbox messages yet.
                    </div>
                  ) : (
                    inboxMessages.map((mail) => (
                      <div key={mail.id} className="rounded-lg border p-4 space-y-2" data-testid={`mailbox-inbox-message-${mail.id}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium">{mail.subject}</p>
                            <p className="text-xs text-muted-foreground">
                              From: {mail.senderEmail || mail.senderUserId}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(mail.createdAt)}</p>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{mail.message}</p>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="sent" className="space-y-3">
                  {sentLoading ? (
                    <div className="text-sm text-muted-foreground">Loading sent messages...</div>
                  ) : sentMessages.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No sent messages yet.
                    </div>
                  ) : (
                    sentMessages.map((mail) => (
                      <div key={mail.id} className="rounded-lg border p-4 space-y-2" data-testid={`mailbox-sent-message-${mail.id}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium">{mail.subject}</p>
                            <p className="text-xs text-muted-foreground">
                              To: {mail.recipientDisplayName || mail.recipientEmail || mail.recipientUserId}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(mail.createdAt)}</p>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{mail.message}</p>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
