import { CollaboratorInfo } from "@/hooks/use-collaboration";

interface CollaboratorAvatarsProps {
  collaborators: CollaboratorInfo[];
}

const colors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
];

export function CollaboratorAvatars({ collaborators }: CollaboratorAvatarsProps) {
  if (collaborators.length === 0) return null;

  return (
    <div className="flex items-center gap-1" data-testid="collaborator-avatars">
      <span className="text-xs text-muted-foreground mr-1">Editing with:</span>
      <div className="flex -space-x-2">
        {collaborators.slice(0, 5).map((c, index) => (
          <div
            key={c.userId}
            className={`w-6 h-6 rounded-full ${
              colors[index % colors.length]
            } flex items-center justify-center text-white text-xs font-medium ring-2 ring-background`}
            title={c.userName}
            data-testid={`collaborator-${c.userId}`}
          >
            {c.userName.charAt(0).toUpperCase()}
          </div>
        ))}
        {collaborators.length > 5 && (
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium ring-2 ring-background">
            +{collaborators.length - 5}
          </div>
        )}
      </div>
    </div>
  );
}
