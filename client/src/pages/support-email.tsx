import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Archive,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
} from "lucide-react";

type AdminCheckData = {
  isAdmin: boolean;
};

type SupportMailboxFolder = "inbox" | "sent" | "archive" | "trash";
type SupportEmailTab = SupportMailboxFolder | "compose";

type SupportMailboxStatus = {
  configured: boolean;
  emailAddress: string | null;
  replyTo: string | null;
};

type SupportMailboxAttachment = {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  disposition: string;
};

type SupportMailboxMessageSummary = {
  uid: number;
  folder: SupportMailboxFolder;
  subject: string;
  normalizedSubject: string;
  from: string;
  to: string;
  date: string | null;
  isRead: boolean;
  messageId: string | null;
  inReplyTo: string | null;
  threadId: string | null;
};

type SupportMailboxMessageDetail = SupportMailboxMessageSummary & {
  cc: string;
  bodyText: string;
  fromAddress: string;
  replyToAddress: string;
  attachments: SupportMailboxAttachment[];
};

type SupportMailboxListResponse = SupportMailboxStatus & {
  messages: SupportMailboxMessageSummary[];
};

type SupportMailboxDetailResponse = SupportMailboxStatus & {
  message: SupportMailboxMessageDetail;
};

type SupportMailboxConversationResponse = SupportMailboxStatus & {
  messages: SupportMailboxMessageSummary[];
};

function formatDateTime(value: string | null): string {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getFolderLabel(folder: SupportMailboxFolder): string {
  switch (folder) {
    case "sent":
      return "Sent";
    case "archive":
      return "Archive";
    case "trash":
      return "Trash";
    default:
      return "Inbox";
  }
}

export default function SupportEmail() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<SupportEmailTab>("inbox");
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const activeFolder: SupportMailboxFolder | null = activeTab === "compose" ? null : activeTab;

  const invalidateMailboxQueries = () => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        typeof query.queryKey[0] === "string" &&
        query.queryKey[0].startsWith("/api/admin/support-email"),
    });
  };

  const { data: adminCheck, isLoading: adminLoading } = useQuery<AdminCheckData>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });

  const { data: statusData } = useQuery<SupportMailboxStatus>({
    queryKey: ["/api/admin/support-email/status"],
    enabled: !!user && adminCheck?.isAdmin === true,
  });

  const {
    data: listData,
    isLoading: listLoading,
    refetch: refetchMessages,
  } = useQuery<SupportMailboxListResponse>({
    queryKey: ["/api/admin/support-email/messages", activeFolder, searchQuery],
    enabled: !!user && adminCheck?.isAdmin === true && activeFolder !== null,
    queryFn: async () => {
      const params = new URLSearchParams({
        folder: activeFolder || "inbox",
        limit: "40",
      });
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }

      const response = await apiRequest("GET", `/api/admin/support-email/messages?${params.toString()}`);
      return response.json();
    },
  });

  const {
    data: selectedMessageResponse,
    isLoading: detailLoading,
  } = useQuery<SupportMailboxDetailResponse>({
    queryKey: ["/api/admin/support-email/message", activeFolder, selectedUid],
    enabled: !!user && adminCheck?.isAdmin === true && activeFolder !== null && selectedUid !== null,
    queryFn: async () => {
      const params = new URLSearchParams({
        folder: activeFolder || "inbox",
        markRead: activeFolder === "inbox" ? "true" : "false",
      });
      const response = await apiRequest(
        "GET",
        `/api/admin/support-email/messages/${selectedUid}?${params.toString()}`,
      );
      return response.json();
    },
  });

  const { data: conversationData, isLoading: conversationLoading } = useQuery<SupportMailboxConversationResponse>({
    queryKey: ["/api/admin/support-email/conversation", activeFolder, selectedUid],
    enabled: !!user && adminCheck?.isAdmin === true && activeFolder !== null && selectedUid !== null,
    queryFn: async () => {
      const params = new URLSearchParams({
        folder: activeFolder || "inbox",
      });
      const response = await apiRequest(
        "GET",
        `/api/admin/support-email/messages/${selectedUid}/conversation?${params.toString()}`,
      );
      return response.json();
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/support-email/send", {
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email sent",
        description: "The message was sent from your DocuWhisper mailbox.",
      });
      setTo("");
      setSubject("");
      setBody("");
      setActiveTab("sent");
      invalidateMailboxQueries();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send email",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async (params: { uid: number; folder: SupportMailboxFolder; destination: "inbox" | "archive" | "trash" }) => {
      const response = await apiRequest(
        "POST",
        `/api/admin/support-email/messages/${params.uid}/move?folder=${params.folder}`,
        { destination: params.destination },
      );
      return response.json();
    },
    onSuccess: (_data, variables) => {
      const destinationLabel = getFolderLabel(variables.destination);
      toast({
        title: `Moved to ${destinationLabel}`,
        description: "The mailbox view has been updated.",
      });
      setSelectedUid(null);
      setActiveTab(variables.destination);
      invalidateMailboxQueries();
    },
    onError: (error: any) => {
      toast({
        title: "Unable to move message",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const messages = useMemo(() => listData?.messages || [], [listData?.messages]);
  const selectedMessage = selectedMessageResponse?.message || null;
  const conversationMessages = useMemo(() => conversationData?.messages || [], [conversationData?.messages]);
  const status = statusData ?? listData ?? selectedMessageResponse ?? conversationData;
  const canSend =
    to.trim().length > 3 &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !sendMutation.isPending;

  useEffect(() => {
    if (!activeFolder) {
      return;
    }

    setSelectedUid((current) => {
      if (messages.length === 0) return null;
      if (current && messages.some((message) => message.uid === current)) return current;
      return messages[0]?.uid ?? null;
    });
  }, [messages, activeFolder]);

  useEffect(() => {
    if (selectedMessage && activeFolder === "inbox") {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-email/messages", "inbox", searchQuery] });
    }
  }, [selectedMessage, activeFolder, queryClient, searchQuery]);

  if (adminLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!adminCheck?.isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>This mailbox is only available to DocuWhisper admins.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const currentFolder = activeFolder || "inbox";
  const archiveDisabled = !selectedMessage || currentFolder === "archive" || moveMutation.isPending;
  const deleteDisabled = !selectedMessage || currentFolder === "trash" || moveMutation.isPending;
  const restoreDisabled =
    !selectedMessage || (currentFolder !== "archive" && currentFolder !== "trash") || moveMutation.isPending;

  const openReplyComposer = () => {
    if (!selectedMessage) return;
    setTo(selectedMessage.replyToAddress || selectedMessage.fromAddress);
    setSubject(
      selectedMessage.subject.toLowerCase().startsWith("re:")
        ? selectedMessage.subject
        : `Re: ${selectedMessage.subject}`,
    );
    setBody("");
    setActiveTab("compose");
  };

  const jumpToMessage = (message: SupportMailboxMessageSummary) => {
    setActiveTab(message.folder);
    setSelectedUid(message.uid);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="border-b bg-background/95 backdrop-blur px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Support Email</h1>
            <p className="text-muted-foreground">
              Read and send mail from {status?.emailAddress || "your support mailbox"} without leaving DocuWhisper.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => refetchMessages()}
              disabled={listLoading || activeFolder === null}
              data-testid="button-refresh-support-email"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {!status?.configured ? (
            <Card>
              <CardHeader>
                <CardTitle>Mailbox Not Configured</CardTitle>
                <CardDescription>
                  Add support mailbox credentials on the server before using this page.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                  <Badge variant="default">
                    <Mail className="mr-1 h-3 w-3" />
                    {status.emailAddress}
                  </Badge>
                  {status.replyTo ? <Badge variant="outline">Reply-To: {status.replyTo}</Badge> : null}
                </CardContent>
              </Card>

              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SupportEmailTab)}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <TabsList className="flex flex-wrap">
                    <TabsTrigger value="inbox" data-testid="tab-support-email-inbox">
                      <Inbox className="mr-2 h-4 w-4" />
                      Inbox
                    </TabsTrigger>
                    <TabsTrigger value="sent" data-testid="tab-support-email-sent">
                      Sent
                    </TabsTrigger>
                    <TabsTrigger value="archive" data-testid="tab-support-email-archive">
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </TabsTrigger>
                    <TabsTrigger value="trash" data-testid="tab-support-email-trash">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Trash
                    </TabsTrigger>
                    <TabsTrigger value="compose" data-testid="tab-support-email-compose">
                      <Send className="mr-2 h-4 w-4" />
                      Compose
                    </TabsTrigger>
                  </TabsList>

                  {activeFolder ? (
                    <div className="flex w-full max-w-xl items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={draftSearch}
                          onChange={(event) => setDraftSearch(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              setSearchQuery(draftSearch.trim());
                            }
                          }}
                          placeholder={`Search ${getFolderLabel(activeFolder).toLowerCase()} mail`}
                          className="pl-9"
                          data-testid="input-support-email-search"
                        />
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setSearchQuery(draftSearch.trim())}
                        data-testid="button-support-email-search"
                      >
                        Search
                      </Button>
                      {(draftSearch || searchQuery) && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setDraftSearch("");
                            setSearchQuery("");
                          }}
                          data-testid="button-support-email-clear-search"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>

                {(["inbox", "sent", "archive", "trash"] as SupportMailboxFolder[]).map((folder) => (
                  <TabsContent key={folder} value={folder} className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
                      <Card>
                        <CardHeader>
                          <CardTitle>{getFolderLabel(folder)}</CardTitle>
                          <CardDescription>
                            {searchQuery
                              ? `Search results for "${searchQuery}".`
                              : `Latest messages in ${getFolderLabel(folder).toLowerCase()}.`}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {listLoading && activeFolder === folder ? (
                            <Skeleton className="h-64 w-full" />
                          ) : messages.length === 0 ? (
                            <div className="text-sm text-muted-foreground">No messages found.</div>
                          ) : (
                            messages.map((message) => (
                              <button
                                key={`${message.folder}-${message.uid}`}
                                type="button"
                                onClick={() => setSelectedUid(message.uid)}
                                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                                  selectedUid === message.uid ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                                }`}
                                data-testid={`support-email-message-${message.uid}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">{message.subject}</div>
                                    <div className="truncate text-xs text-muted-foreground">
                                      {folder === "sent" ? message.to || "Unknown recipient" : message.from || "Unknown sender"}
                                    </div>
                                  </div>
                                  {!message.isRead && folder === "inbox" ? <Badge>Unread</Badge> : null}
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(message.date)}</div>
                              </button>
                            ))
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <CardTitle>{selectedMessage?.subject || "Message"}</CardTitle>
                              <CardDescription>
                                {selectedMessage
                                  ? `${folder === "sent" ? selectedMessage.to || "Unknown recipient" : selectedMessage.from || "Unknown sender"} • ${formatDateTime(selectedMessage.date)}`
                                  : "Select a message to read it."}
                              </CardDescription>
                            </div>
                            {selectedMessage ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  onClick={openReplyComposer}
                                  data-testid="button-support-email-reply"
                                >
                                  <Reply className="mr-2 h-4 w-4" />
                                  Reply
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    selectedMessage &&
                                    moveMutation.mutate({
                                      uid: selectedMessage.uid,
                                      folder: selectedMessage.folder,
                                      destination: "archive",
                                    })
                                  }
                                  disabled={archiveDisabled}
                                  data-testid="button-support-email-archive"
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  Archive
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    selectedMessage &&
                                    moveMutation.mutate({
                                      uid: selectedMessage.uid,
                                      folder: selectedMessage.folder,
                                      destination: "inbox",
                                    })
                                  }
                                  disabled={restoreDisabled}
                                  data-testid="button-support-email-restore"
                                >
                                  <Inbox className="mr-2 h-4 w-4" />
                                  Restore
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    selectedMessage &&
                                    moveMutation.mutate({
                                      uid: selectedMessage.uid,
                                      folder: selectedMessage.folder,
                                      destination: "trash",
                                    })
                                  }
                                  disabled={deleteDisabled}
                                  data-testid="button-support-email-delete"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {detailLoading && activeFolder === folder ? (
                            <Skeleton className="h-80 w-full" />
                          ) : selectedMessage ? (
                            <>
                              <div className="space-y-1 text-sm">
                                <div>
                                  <span className="font-medium">From:</span> {selectedMessage.from || "-"}
                                </div>
                                <div>
                                  <span className="font-medium">To:</span> {selectedMessage.to || "-"}
                                </div>
                                {selectedMessage.cc ? (
                                  <div>
                                    <span className="font-medium">CC:</span> {selectedMessage.cc}
                                  </div>
                                ) : null}
                                <div>
                                  <span className="font-medium">Folder:</span> {getFolderLabel(selectedMessage.folder)}
                                </div>
                              </div>

                              <div className="rounded-lg border bg-muted/20 p-4 whitespace-pre-wrap text-sm leading-6 min-h-[240px]">
                                {selectedMessage.bodyText || "(No text body available)"}
                              </div>

                              <div className="grid gap-4 xl:grid-cols-[1fr,320px]">
                                <div className="space-y-4">
                                  <Card>
                                    <CardHeader className="pb-3">
                                      <CardTitle className="text-base">Attachments</CardTitle>
                                      <CardDescription>
                                        Download files attached to this message.
                                      </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                      {selectedMessage.attachments.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No attachments.</div>
                                      ) : (
                                        selectedMessage.attachments.map((attachment) => (
                                          <a
                                            key={attachment.index}
                                            href={`/api/admin/support-email/messages/${selectedMessage.uid}/attachments/${attachment.index}?folder=${selectedMessage.folder}`}
                                            className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/40"
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <div className="min-w-0">
                                              <div className="truncate font-medium">
                                                <Paperclip className="mr-2 inline h-4 w-4" />
                                                {attachment.filename}
                                              </div>
                                              <div className="truncate text-xs text-muted-foreground">
                                                {attachment.contentType}
                                              </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              {formatAttachmentSize(attachment.size)}
                                            </div>
                                          </a>
                                        ))
                                      )}
                                    </CardContent>
                                  </Card>
                                </div>

                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Conversation</CardTitle>
                                    <CardDescription>Related messages across inbox, sent, archive, and trash.</CardDescription>
                                  </CardHeader>
                                  <CardContent className="space-y-2">
                                    {conversationLoading && activeFolder === folder ? (
                                      <Skeleton className="h-40 w-full" />
                                    ) : conversationMessages.length === 0 ? (
                                      <div className="text-sm text-muted-foreground">No related messages found.</div>
                                    ) : (
                                      conversationMessages.map((message) => (
                                        <button
                                          key={`${message.folder}-${message.uid}`}
                                          type="button"
                                          onClick={() => jumpToMessage(message)}
                                          className={`w-full rounded-lg border p-3 text-left transition-colors ${
                                            message.folder === selectedMessage.folder && message.uid === selectedMessage.uid
                                              ? "border-primary bg-primary/5"
                                              : "hover:bg-muted/50"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <Badge variant="outline">{getFolderLabel(message.folder)}</Badge>
                                            <span className="text-xs text-muted-foreground">{formatDateTime(message.date)}</span>
                                          </div>
                                          <div className="mt-2 truncate text-sm font-medium">{message.subject}</div>
                                          <div className="truncate text-xs text-muted-foreground">
                                            {message.folder === "sent" ? message.to || "Unknown recipient" : message.from || "Unknown sender"}
                                          </div>
                                        </button>
                                      ))
                                    )}
                                  </CardContent>
                                </Card>
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">Select a message from the left to view it.</div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                ))}

                <TabsContent value="compose" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Compose Email</CardTitle>
                      <CardDescription>Send mail from {status.emailAddress}.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="support-email-to">To</Label>
                        <Input
                          id="support-email-to"
                          value={to}
                          onChange={(event) => setTo(event.target.value)}
                          placeholder="recipient@example.com"
                          data-testid="input-support-email-to"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="support-email-subject">Subject</Label>
                        <Input
                          id="support-email-subject"
                          value={subject}
                          onChange={(event) => setSubject(event.target.value)}
                          placeholder="Subject"
                          data-testid="input-support-email-subject"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="support-email-body">Message</Label>
                        <Textarea
                          id="support-email-body"
                          value={body}
                          onChange={(event) => setBody(event.target.value)}
                          className="min-h-[280px]"
                          placeholder="Write your message..."
                          data-testid="textarea-support-email-body"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          onClick={() => sendMutation.mutate()}
                          disabled={!canSend}
                          data-testid="button-support-email-send"
                        >
                          {sendMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-4 w-4" />
                              Send Email
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setTo("");
                            setSubject("");
                            setBody("");
                          }}
                        >
                          Clear Draft
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
