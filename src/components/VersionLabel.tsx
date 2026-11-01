import { useEffect, useState } from "react";
import { getAppInfo } from "../api/commands";

// App version in the corner: handy for bug reports and to see that an update has landed
export function VersionLabel() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getAppInfo()
      .then((info) => setVersion(info.version))
      .catch(() => {
        // Not critical: the label just stays hidden
      });
  }, []);

  if (version === null) return null;

  return (
    <span className="pointer-events-none fixed right-3 bottom-2 font-mono text-[10px] text-muted select-none">
      v{version}
    </span>
  );
}
