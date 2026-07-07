// Feature C — typed command composer.
//
// A minimal input for triggering the agent by text (the same entry point the
// voice trigger uses). Useful in the dashboard and for verifying the agent
// without a mic. Submitting routes the text through `run_agent_command`; the
// pill then shows the run.

import React, { useState } from "react";
import { useAgentStore } from "./useAgentStore";

export const AgentComposer: React.FC<{ placeholder?: string }> = ({
  placeholder = "Tell Floe what to do…",
}) => {
  const [text, setText] = useState("");
  const runCommand = useAgentStore((s) => s.runCommand);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await runCommand(t);
  };

  return (
    <form
      className="ag-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        className="ag-composer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      <button className="ag-composer-send" type="submit" disabled={!text.trim()}>
        Run
      </button>
    </form>
  );
};

export default AgentComposer;
