import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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

  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [recipient, setRecipient] = useState<MailboxRecipient | null>(null);
  const [searchResults, setSearchResults] = useState<MailboxRecipient[]>([]);
  const [recipientConfirmed, setRecipientConfirmed] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: inboxMessages = [], isLoading: inboxLoading } = useQuery<MailboxMessage[]>({
    queryKey: ["/api/mailbox/messages?folder=inbox"],
  });

  const { data: sentMessages = [], isLoading: sentLoading } = useQuery<MailboxMessage[]>({
    queryKey: ["/api/mailbox/messages?folder=sent"],
  });

  const searchRecipientsMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiRequest("GET", `/api/mailbox/users/search?q=${encodeURIComponent(query)}`);
      return response.json();
    },
    onSuccess: (data: MailboxRecipient[], query: string) => {
      setSearchResults(data);
      setRecipient(null);
      setRecipientUserId("");
      setRecipientConfirmed(false);
      if (data.length === 0 && query.trim().length > 0) {
        toast({
          title: "No users found",
          description: "No visible users matched your search.",
        });
      }
    },
    onError: (error: any) => {
      setSearchResults([]);
      setRecipient(null);
      setRecipientUserId("");
      setRecipientConfirmed(false);
      toast({
        title: "Search failed",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const selectRecipient = (candidate: MailboxRecipient) => {
    setRecipient(candidate);
    setRecipientUserId(candidate.userId);
    setRecipientConfirmed(false);
    toast({
      title: "Recipient selected",
      description: `${candidate.displayName} (${candidate.userId})`,
    });
  };

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
      setRecipientSearch("");
      setRecipientUserId("");
      setRecipient(null);
      setSearchResults([]);
      setRecipientConfirmed(false);
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
    recipientConfirmed &&
    subject.trim().length >= 3 &&
    message.trim().length > 0 &&
    !sendMailboxMessageMutation.isPending;

  useEffect(() => {
    if (!user) return;
    searchRecipientsMutation.mutate("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <div className="flex flex-col h-full">
      <header className="border-b bg-background/95 backdrop-blur px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Mailbox</h1>
          <p className="text-muted-foreground">Browse the user directory, confirm identity, and send internal messages</p>
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
                Lookup shows the full user directory alphabetically. Users who opt out are hidden.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recipient-search">Find Recipient</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    id="recipient-search"
                    value={recipientSearch}
                    onChange={(e) => {
                      setRecipientSearch(e.target.value);
                      setSearchResults([]);
                      setRecipient(null);
                      setRecipientUserId("");
                      setRecipientConfirmed(false);
                    }}
                    placeholder="Optional: filter by name, email, or User ID"
                    data-testid="input-mailbox-recipient-user-id"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => searchRecipientsMutation.mutate(recipientSearch.trim())}
                    disabled={searchRecipientsMutation.isPending}
                    data-testid="button-mailbox-lookup-user"
                  >
                    {searchRecipientsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Lookup
                  </Button>
                </div>
                {searchResults.length > 0 && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">Directory results</p>
                    <div className="space-y-2">
                      {searchResults.map((candidate) => (
                        <div
                          key={candidate.userId}
                          className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="text-sm">
                            <p className="font-medium">{candidate.displayName}</p>
                            <p className="text-muted-foreground">
                              ID: {candidate.userId}
                              {candidate.email ? ` · ${candidate.email}` : ""}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={recipient?.userId === candidate.userId ? "default" : "outline"}
                            onClick={() => selectRecipient(candidate)}
                            data-testid={`button-mailbox-select-${candidate.userId}`}
                          >
                            {recipient?.userId === candidate.userId ? "Selected" : "Select"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {recipient && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Recipient selected</Badge>
                      <span className="font-medium">{recipient.displayName}</span>
                    </div>
                    <p className="text-muted-foreground">
                      ID: {recipient.userId}
                      {recipient.email ? ` · ${recipient.email}` : ""}
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                      <Checkbox
                        id="confirm-mailbox-recipient"
                        checked={recipientConfirmed}
                        onCheckedChange={(checked) => setRecipientConfirmed(checked === true)}
                        data-testid="checkbox-mailbox-confirm-recipient"
                      />
                      <Label htmlFor="confirm-mailbox-recipient" className="text-xs text-muted-foreground">
                        I confirm this is the correct person.
                      </Label>
                    </div>
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
