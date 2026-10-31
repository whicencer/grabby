import { ShieldAlert } from "lucide-react";

// Shown when YouTube asks to "confirm you're not a bot": the block is on the network, not the video
export function BotCheckNotice() {
  return (
    <div role="alert" className="mt-4 rounded-xl border border-dashed border-fg p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <ShieldAlert className="size-4 shrink-0" />
        YouTube is temporarily blocking your network
      </p>
      <p className="mt-2 text-muted">
        It thinks the requests come from a bot. This happens after many downloads in a short time, or on
        a shared connection like mobile internet or VPN. Other videos will fail too until it's lifted.
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
        <li>Wait an hour or two and try again</li>
        <li>Turn off your VPN, or switch networks (restart the router, use a phone hotspot)</li>
      </ul>
    </div>
  );
}
